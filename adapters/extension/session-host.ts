import { GameSession } from "../../lib/core/session";
import { PageBridgeTransport } from "../../lib/core/transports/page-bridge";
import { patchSessionView } from "../../lib/core/projections/patch";
import { defaultSessionView } from "../../lib/core/projections/defaults";
import { defaultSettings } from "../../lib/core/settings";
import { marketScanTickEvent } from "../../lib/core/services/events";
import type { TasksService } from "../../lib/core/services/tasks.service";
import { getHuntById } from "../../lib/hunts";
import { getItemName, normalizeRarityBorderTier } from "../../lib/items";
import {
  buildMessage,
  pingMessage,
  marketGetSnapshotMessage,
  marketResolveOrderMessage,
  questGetSnapshotMessage,
  SendMessageTypes,
} from "../../lib/protocol";
import {
  excludedItemIdsFromLootSellModes,
  isLootSellEnabled,
  normalizeCategorySellMode,
  normalizeLootSellModes,
} from "../../lib/domain/loot-sell";
import { GAME_TAB_URLS, isStonegyGameUrl, queryGameTabs } from "../../lib/game-tab";
import { BRIDGE_CHANNELS } from "../../lib/page-bridge/constants";
import { pageBridgeSecretStorageKey } from "../../lib/page-bridge/constants";
import { createAutoReconnectController } from "../../lib/page-bridge/auto-reconnect";
import {
  confirmPageBridgeDisconnect,
  connectionSnapshotFromWsEvent,
  isSocketOpen,
} from "../../lib/page-bridge/connection";
import { createReloadGrace } from "../../lib/page-bridge/reload-grace";
import { readPageBridgeStatus, sendPageBridgeCommand } from "../../lib/page-bridge/transport";
import type { BotState } from "../../lib/types";
import type { FeatureMasters, HostTimers } from "../../lib/core/services/types";
import type { BattleService } from "../../lib/core/services/battle.service";
import type { CombatState } from "../../lib/core/services/states/combat.state";
import type { HuntService } from "../../lib/core/services/hunt.service";
import type { LootService } from "../../lib/core/services/loot.service";
import type { MarketService } from "../../lib/core/services/market.service";
import { clearDebugTelemetry } from "../../lib/core/events/debug-telemetry";
import { canArmFeature } from "../../lib/core/features/feature-control";
import { isFeatureId } from "../../lib/core/services/types";
import { initKeepAlive, syncKeepAlive } from "../../background/keep-alive";
import {
  LAST_CHARACTER_ID_KEY,
  loadFeatureMasters,
  loadPersistedSettings,
  normalizeHuntBattleByHuntId,
  persistBotState,
  saveFeatureMasters,
  saveMarketCache,
} from "./storage";
import { resolveBoundTabAcceptance } from "./tab-binding";

function isPopupSender(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url ?? "";
  try {
    return url.startsWith(chrome.runtime.getURL("popup/"));
  } catch {
    return url.includes("/popup/");
  }
}

function isBridgeTabSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.tab?.id != null && isStonegyGameUrl(sender.tab.url);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** chrome.alarms-backed HostTimers for MV3 service worker. */
function createChromeHostTimers(): HostTimers {
  const handlers = new Map<string, () => void>();

  chrome.alarms.onAlarm.addListener((alarm) => {
    handlers.get(alarm.name)?.();
  });

  return {
    scheduleRepeating(name, intervalSec, tick) {
      handlers.set(name, tick);
      const periodMinutes = Math.max(0.5, intervalSec / 60);
      void chrome.alarms.create(name, {
        periodInMinutes: periodMinutes,
        delayInMinutes: 0.05,
      });
    },
    clear(name) {
      handlers.delete(name);
      void chrome.alarms.clear(name);
    },
  };
}

export class ExtensionSessionHost {
  session!: GameSession;
  private transport!: PageBridgeTransport;
  private reloadGrace = createReloadGrace();
  private settingsLoaded = false;
  private marketPersistenceDeferred = false;
  private fullScanChain = Promise.resolve();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readinessScheduled = false;
  private activeCharacterId: string | null = null;
  private characterSwitchChain = Promise.resolve();
  /** Only one game tab drives the session; other tabs' WS events are ignored. */
  private boundTabId: number | null = null;
  /** True after at least one successful open socket for the current bind. */
  private hadOpenSocket = false;
  private autoReconnect = createAutoReconnectController({
    delay,
    isEnabled: () => this.session.settings.autoReconnectEnabled === true,
    isConnected: () => this.session.view.connection.connected,
    reloadTab: () => this.reloadGameTab(),
  });

  async init(): Promise<void> {
    const stored = await chrome.storage.local.get(LAST_CHARACTER_ID_KEY);
    const lastCharacterId =
      typeof stored[LAST_CHARACTER_ID_KEY] === "string"
        ? stored[LAST_CHARACTER_ID_KEY]
        : null;
    this.activeCharacterId = lastCharacterId;

    const { settings, viewPatch, logs } = await loadPersistedSettings(lastCharacterId);
    const featureMasters = await loadFeatureMasters(lastCharacterId);

    this.transport = new PageBridgeTransport({
      getTabId: async () => (await this.findGameTab())?.id ?? null,
    });

    this.session = new GameSession(this.transport, {
      settings,
      featureMasters,
      onChange: (state) => this.onStateChange(state),
      hostTimers: createChromeHostTimers(),
    });

    if (viewPatch) {
      this.session.view = patchSessionView(this.session.view, viewPatch);
    }
    this.session.telemetry.logs = logs;

    this.settingsLoaded = true;
    this.broadcast();

    initKeepAlive({
      sendKeepAliveActivity: () => this.sendKeepAliveActivity(),
      isConnected: () => this.session.view.connection.connected,
      isEnabled: () => this.session.settings.keepAliveEnabled !== false,
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.boundTabId) {
        this.boundTabId = null;
        this.hadOpenSocket = false;
        this.autoReconnect.cancel();
      }
    });

    await syncKeepAlive();
    this.session.services.startAll();
  }

  get state(): BotState {
    return this.session.botState;
  }

  private onStateChange(state: BotState): void {
    const nextCharacterId = state.character.characterId ?? null;
    if (nextCharacterId !== this.activeCharacterId) {
      this.characterSwitchChain = this.characterSwitchChain.then(() =>
        this.switchCharacterConfig(this.activeCharacterId, nextCharacterId, state)
      );
      return;
    }

    this.schedulePersist();
    this.broadcast(state);
  }

  private async switchCharacterConfig(
    previousCharacterId: string | null,
    nextCharacterId: string | null,
    state: BotState
  ): Promise<void> {
    if (previousCharacterId && previousCharacterId !== nextCharacterId) {
      await persistBotState(
        {
          ...state,
          character: { ...state.character, characterId: previousCharacterId },
        },
        previousCharacterId
      );
    }

    this.activeCharacterId = nextCharacterId;

    if (!nextCharacterId) {
      this.schedulePersist();
      this.broadcast(state);
      return;
    }

    this.settingsLoaded = false;
    const { settings, viewPatch, logs } = await loadPersistedSettings(nextCharacterId);
    const featureMasters = await loadFeatureMasters(nextCharacterId);
    await this.session.services.setMasters(featureMasters);

    this.session.updateSettings({
      ...defaultSettings(),
      ...settings,
      characterId: nextCharacterId,
      characterName: state.character.characterName ?? settings.characterName ?? null,
    });

    const isCharacterChange =
      previousCharacterId != null &&
      nextCharacterId != null &&
      previousCharacterId !== nextCharacterId;

    if (isCharacterChange) {
      this.session.view = patchSessionView(
        patchSessionView(defaultSessionView(), {
          connection: state.connection,
          character: state.character,
          quests: state.quests,
        }),
        viewPatch
      );
    } else {
      this.session.view = patchSessionView(this.session.view, {
        ...viewPatch,
        connection: state.connection,
        character: state.character,
        quests: state.quests,
      });
    }
    this.session.telemetry.logs = logs;

    await this.session.services.get<MarketService>("market").syncMarketScannerAlarm();
    await syncKeepAlive();
    this.settingsLoaded = true;
    this.schedulePersist();
    this.broadcast(this.state);
  }

  private schedulePersist(): void {
    if (!this.settingsLoaded || this.marketPersistenceDeferred || !this.activeCharacterId) {
      return;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      void persistBotState(this.state, this.activeCharacterId);
    }, 100);
  }

  private broadcast(state: BotState = this.state): void {
    chrome.runtime.sendMessage({ channel: "state-updated", state }).catch(() => {});
    // Content scripts are not recipients of runtime.sendMessage from the SW —
    // push live state to the bound game tab for the in-page overlay.
    if (this.boundTabId != null) {
      chrome.tabs
        .sendMessage(this.boundTabId, { channel: "state-updated", state })
        .catch(() => {});
    }
  }

  private bindTab(tabId: number): void {
    if (this.boundTabId !== tabId) {
      this.hadOpenSocket = false;
      this.autoReconnect.cancel();
    }
    this.boundTabId = tabId;
  }

  private async reloadGameTab(): Promise<boolean> {
    const tab = await this.findGameTab();
    if (!tab?.id) {
      return false;
    }
    this.reloadGrace.begin();
    await chrome.tabs.reload(tab.id);
    return true;
  }

  private isBoundTab(tabId: number | null | undefined): boolean {
    const result = resolveBoundTabAcceptance(this.boundTabId, tabId);
    this.boundTabId = result.nextBoundTabId;
    return result.accept;
  }

  /**
   * Resolve the game tab that owns this session.
   * When `rebind` is true (popup / connection check), prefer the caller's window
   * so opening the popup on another character's window switches the session.
   */
  async findGameTab(options: { rebind?: boolean } = {}) {
    const rebind = options.rebind === true;

    if (this.boundTabId != null && !rebind) {
      try {
        const bound = await chrome.tabs.get(this.boundTabId);
        if (bound?.id != null && isStonegyGameUrl(bound.url)) {
          return bound;
        }
      } catch {
        // Tab was closed or is inaccessible.
      }
      this.boundTabId = null;
    }

    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: GAME_TAB_URLS,
    });
    if (activeTab?.id != null && isStonegyGameUrl(activeTab.url)) {
      const status = await readPageBridgeStatus(activeTab.id, { delay, retries: 1 });
      if (status && isSocketOpen(status)) {
        this.bindTab(activeTab.id);
        return activeTab;
      }
      // Active tab is Stonegy but has no open socket — prefer a WS-open tab below.
    }

    const tabs = await queryGameTabs();
    for (const tab of tabs) {
      if (tab.id == null) {
        continue;
      }
      const status = await readPageBridgeStatus(tab.id, { delay, retries: 1 });
      if (status && isSocketOpen(status)) {
        this.bindTab(tab.id);
        return tab;
      }
    }

    // Last resort: active Stonegy tab (login/landing) or first matching tab.
    if (activeTab?.id != null && isStonegyGameUrl(activeTab.url)) {
      this.bindTab(activeTab.id);
      return activeTab;
    }

    const fallback = tabs[0] ?? null;
    if (fallback?.id != null) {
      this.bindTab(fallback.id);
    }
    return fallback;
  }

  private scheduleSessionReady(): void {
    if (this.readinessScheduled) {
      return;
    }
    this.readinessScheduled = true;
    void this.session.ensureSessionReady().finally(() => {
      this.readinessScheduled = false;
    });
  }

  private applyConnection(connected: boolean, readyState: number): void {
    if (connected) {
      this.hadOpenSocket = true;
      this.autoReconnect.cancel();
    }
    this.transport.setConnection(connected, readyState);
    this.session.view = patchSessionView(this.session.view, {
      connection: { connected, readyState },
    });
    this.broadcast();
  }

  private scheduleAutoReconnect(): void {
    if (!this.hadOpenSocket || this.session.settings.autoReconnectEnabled !== true) {
      return;
    }
    void this.autoReconnect.scheduleAfterDisconnect();
  }

  private async sendKeepAliveActivity(): Promise<void> {
    await this.transport.sendKeepAlive();
  }

  async syncPageKeepAliveConfig(): Promise<void> {
    const tab = await this.findGameTab();
    if (!tab?.id) {
      return;
    }
    try {
      await sendPageBridgeCommand(tab.id, "page:configure-keep-alive", {
        enabled: this.session.settings.keepAliveEnabled !== false,
      });
    } catch {
      // Game tab may not be ready yet.
    }
  }

  async handleBridgeMessage(
    message: Record<string, unknown>,
    sender: chrome.runtime.MessageSender
  ): Promise<Record<string, unknown>> {
    if (message.channel === "bridge:store-secret") {
      const tabId = sender.tab?.id;
      const secret = message.secret;
      if (tabId == null || !isStonegyGameUrl(sender.tab?.url) || typeof secret !== "string") {
        return { ok: false, error: "Invalid bridge secret registration" };
      }
      try {
        await chrome.storage.session.set({ [pageBridgeSecretStorageKey(tabId)]: secret });
      } catch {
        // session storage may be unavailable
      }
      return { ok: true, tabId };
    }

    switch (message.channel) {
      case BRIDGE_CHANNELS.status: {
        if (!isBridgeTabSender(sender) || !this.isBoundTab(sender.tab?.id)) {
          return { ok: true, ignored: true };
        }
        if (this.reloadGrace.isActive()) {
          return { ok: true };
        }
        const readyState = Number(message.readyState ?? 3);
        this.applyConnection(!!message.connected && readyState === 1, readyState);
        return { ok: true };
      }

      case BRIDGE_CHANNELS.wsEvent:
        if (!isBridgeTabSender(sender)) {
          return { ok: false, error: "Bridge events require a Stonegy game tab" };
        }
        return this.handleWsBridgeEvent(message, sender);

      case "overlay:get-state": {
        if (!isBridgeTabSender(sender) || !this.isBoundTab(sender.tab?.id)) {
          return { ok: false, error: "Overlay state is restricted to the bound game tab" };
        }
        return { ok: true, state: this.state };
      }

      case "overlay:reset-damage": {
        if (!isBridgeTabSender(sender) || !this.isBoundTab(sender.tab?.id)) {
          return { ok: false, error: "Overlay reset is restricted to the bound game tab" };
        }
        this.session.services.getDomain<CombatState>("combatState").reset();
        this.session.invalidateProjection();
        this.broadcast();
        return { ok: true, state: this.state };
      }

      default:
        // Bot RPC is for the popup / extension pages only — not content scripts.
        if (sender.tab != null && !isPopupSender(sender)) {
          return { ok: false, error: "Bot RPC is restricted to the extension popup" };
        }
        return this.handleBotMessage(message);
    }
  }

  private async handleWsBridgeEvent(
    message: Record<string, unknown>,
    sender: chrome.runtime.MessageSender
  ): Promise<Record<string, unknown>> {
    const senderTabId = sender.tab?.id;

    // First claim wins; other game tabs must not drive this session (avoids
    // two characters thrashing shared in-memory settings).
    if (message.type === "bridge:ready") {
      if (!this.isBoundTab(senderTabId)) {
        return { ok: true, ignored: true };
      }
      void this.syncPageKeepAliveConfig();
      return { ok: true };
    }

    if (!this.isBoundTab(senderTabId)) {
      return { ok: true, ignored: true };
    }

    if (message.type === "ws:connected" || message.type === "ws:open") {
      const snapshot = connectionSnapshotFromWsEvent(
        message.type as string,
        message.payload as Record<string, unknown> | undefined
      );
      if (snapshot) {
        this.applyConnection(snapshot.connected, snapshot.readyState ?? 3);
        if (snapshot.connected) {
          void syncKeepAlive();
          void this.syncPageKeepAliveConfig();
          this.scheduleSessionReady();
        }
      }
      return { ok: true };
    }

    if (message.type === "ws:close") {
      if (this.reloadGrace.isActive()) {
        return { ok: true };
      }
      await confirmPageBridgeDisconnect({
        tabId: senderTabId,
        resolveTabId: async () => (await this.findGameTab())?.id,
        delay,
        onConnected: () => this.applyConnection(true, 1),
        onDisconnected: () => {
          this.applyConnection(false, 3);
          this.scheduleAutoReconnect();
        },
      });
      return { ok: true };
    }

    if (message.type === "ws:send" || message.type === "ws:receive") {
      const payload = message.payload as { data: string; opcode: number };
      this.transport.relayWsEvent({
        raw: payload.data,
        direction: message.type === "ws:send" ? "send" : "receive",
        opcode: payload.opcode,
      });
      return { ok: true };
    }

    return { ok: true };
  }

  private async handleBotMessage(message: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (message.channel) {
      case "bot:get-state":
        // Prefer the window the popup was opened from when multiple game tabs exist.
        await this.findGameTab({ rebind: true });
        return { ok: true, state: this.state };

      case "bot:check-connection":
        return this.checkConnection();

      case "bot:reload-game-tab": {
        await this.findGameTab({ rebind: true });
        const reloaded = await this.reloadGameTab();
        if (!reloaded) {
          return { ok: false, error: "No Stonegy tab found" };
        }
        return { ok: true };
      }

      case "bot:refresh-hunt":
        await this.session.commands.run(SendMessageTypes.PARTY_GET_SNAPSHOT, {}, { force: true });
        return { ok: true, state: this.state };

      case "bot:sell-loot-now": {
        const result = await this.session.services.get<LootService>("loot").sellLootNow();
        if (!result.ok) {
          return { ok: false, error: result.error ?? "Loot sell failed.", state: this.state };
        }
        return {
          ok: true,
          message: result.message ?? "Loot sell complete.",
          state: this.state,
        };
      }

      case "bot:split-loot-now": {
        const result = await this.session.services.get<LootService>("loot").splitLootNow();
        if (!result.ok) {
          return { ok: false, error: result.error ?? "Loot split failed.", state: this.state };
        }
        return {
          ok: true,
          message: result.message ?? "Loot split complete.",
          state: this.state,
        };
      }

      case "bot:send-raw":
        await this.session.commands.sendRaw(String(message.payload));
        return { ok: true };

      case "bot:send-type":
        await this.session.commands.sendRaw(
          buildMessage(message.messageType as never, (message.data as never) ?? {})
        );
        return { ok: true };

      case "bot:ping":
        await this.session.commands.sendRaw(pingMessage());
        return { ok: true };

      case "bot:start-hunt": {
        const huntId = Number(message.huntId);
        const result = await this.session.services.get<HuntService>("hunt").startHunt(huntId, {
          force: true,
        });
        if (!result.ok) {
          return { ok: false, error: result.error ?? "Failed to start hunt." };
        }
        return { ok: true, state: this.state };
      }

      case "bot:start-auto-hunt": {
        const huntId = Number(message.huntId ?? this.session.settings.selectedHuntId);
        const result = await this.session.services.get<HuntService>("hunt").enableAutoHunt(huntId);
        if (!result.ok) {
          return { ok: false, error: result.error, state: this.state };
        }
        void persistBotState(this.state, this.activeCharacterId);
        return { ok: true, message: result.message, state: result.state ?? this.state };
      }

      case "bot:stop-auto-hunt": {
        const result = await this.session.services.get<HuntService>("hunt").disableAutoHunt();
        if (!result.ok) {
          return { ok: false, error: result.error, state: this.state };
        }
        void persistBotState(this.state, this.activeCharacterId);
        return { ok: true, message: result.message, state: result.state ?? this.state };
      }

      case "bot:start-auto-tasker": {
        const questId = Number(message.questId ?? this.session.settings.selectedTaskQuestId ?? 6);
        const result = await this.session.services
          .get<TasksService>("tasks")
          .enableAutoTasker(questId);
        if (!result.ok) {
          return { ok: false, error: result.error, state: result.state ?? this.state };
        }
        void persistBotState(this.state, this.activeCharacterId);
        return { ok: true, message: result.message, state: result.state ?? this.state };
      }

      case "bot:task-now": {
        const questId = Number(message.questId ?? this.session.settings.selectedTaskQuestId ?? 6);
        const result = await this.session.services.get<TasksService>("tasks").runTaskNow(questId);
        if (!result.ok) {
          return { ok: false, error: result.error, state: result.state ?? this.state };
        }
        return { ok: true, message: result.message, state: result.state ?? this.state };
      }

      case "bot:stop-auto-tasker": {
        const result = await this.session.services.get<TasksService>("tasks").disableAutoTasker();
        if (!result.ok) {
          return { ok: false, error: result.error, state: this.state };
        }
        return { ok: true, message: result.message, state: result.state ?? this.state };
      }

      case "bot:refresh-tasks":
        await this.session.commands.sendRaw(questGetSnapshotMessage());
        return { ok: true, state: this.state };

      case "bot:market-snapshot":
        await this.session.commands.sendRaw(
          marketGetSnapshotMessage(
            Number(message.page ?? 1),
            (message.filters as never) ?? {}
          )
        );
        return { ok: true };

      case "bot:market-sync-item": {
        const itemId = Number(message.itemId);
        if (!Number.isFinite(itemId) || itemId <= 0) {
          return { ok: false, error: "Invalid item ID" };
        }
        await this.session.services.get<LootService>("loot").syncMarketItemIds([itemId], true);
        const price = this.state.market.marketPrices[itemId];
        const name = getItemName(itemId) ?? `Item #${itemId}`;
        const hasListing =
          price?.lowestSellPrice != null || price?.ownOrderReferencePrice != null;
        return {
          ok: true,
          state: this.state,
          message: hasListing
            ? `Fetched market price for ${name}`
            : `No market listings for ${name}`,
        };
      }

      case "bot:market-sync-items": {
        const itemIds = Array.isArray(message.itemIds)
          ? message.itemIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
          : [];
        if (!itemIds.length) {
          return { ok: false, error: "No item IDs provided" };
        }
        await this.session.services.get<LootService>("loot").syncMarketItemIds(itemIds, true);
        return { ok: true, state: this.state };
      }

      case "bot:market-sync-hunt-loot": {
        const huntId = Number(
          message.huntId ?? this.session.settings.selectedHuntId ?? this.session.view.hunt.activeHuntId
        );
        if (!Number.isFinite(huntId) || !getHuntById(huntId)) {
          return { ok: false, error: "Select a hunt first" };
        }
        void this.session.services.get<LootService>("loot").syncHuntLootMarketPrices(huntId);
        return { ok: true, state: this.state };
      }

      case "bot:market-scan-now":
        await this.session.dispatchFeatureEvent(marketScanTickEvent({ manual: true }));
        return { ok: true, state: this.state };

      case "bot:market-scan-full": {
        if (!this.state.connection.connected) {
          return { ok: false, error: "Not connected to the game tab" };
        }
        this.marketPersistenceDeferred = true;
        this.fullScanChain = this.fullScanChain
          .then(() =>
            this.session.services.get<MarketService>("market").runFullMarketScan({
              onFlush: async () => {
                await saveMarketCache(this.state);
                await persistBotState(this.state, this.activeCharacterId);
              },
            })
          )
          .finally(() => {
            this.marketPersistenceDeferred = false;
            void saveMarketCache(this.state);
            void persistBotState(this.state, this.activeCharacterId);
          });
        void this.fullScanChain;
        return { ok: true, state: this.state, message: "Full scan started" };
      }

      case "bot:market-scan-stop":
        this.session.services.get<MarketService>("market").cancelFullMarketScan();
        return { ok: true, state: this.state, message: "Full scan stopped" };

      case "bot:market-create": {
        const outcome = await this.session.commands.run(SendMessageTypes.MARKET_CREATE_ORDER, {
          itemId: Number(message.itemId),
          eachPrice: Number(message.eachPrice),
          itemAmount: Number(message.itemAmount ?? 1),
          tier: Number(message.tier ?? 0),
          isBuyOrder: !!message.isBuyOrder,
        });
        if (!outcome.sent || outcome.success === false) {
          return {
            ok: false,
            error: outcome.errorMessage ?? "Failed to create market order",
            state: this.state,
          };
        }
        return { ok: true, state: this.state };
      }

      case "bot:market-buy":
        await this.session.commands.sendRaw(
          marketResolveOrderMessage(
            String(message.orderId),
            Number(message.amount ?? 1),
            "buy"
          )
        );
        return { ok: true };

      case "bot:place-party-position": {
        const huntId =
          this.session.view.hunt.activeHuntId ?? this.session.settings.selectedHuntId;
        if (huntId != null) {
          await this.session.services.get<BattleService>("battle").attemptAutoPlacePartyPosition(huntId);
        }
        return { ok: true };
      }

      case "bot:lock-lure": {
        const huntId =
          this.session.view.hunt.activeHuntId ??
          this.session.settings.selectedHuntId ??
          this.session.settings.taskerTargetHuntId;
        if (huntId != null) {
          await this.session.services.get<BattleService>("battle").lockLureForHunt(huntId);
        }
        return { ok: true };
      }

      case "bot:apply-presets": {
        const huntId =
          this.session.view.hunt.activeHuntId ?? this.session.settings.selectedHuntId;
        if (huntId != null) {
          await this.session.services.get<BattleService>("battle").applyPresets(huntId);
        }
        return { ok: true };
      }

      case "bot:set-feature-masters": {
        const patch = message.patch as Partial<FeatureMasters>;
        if (patch && typeof patch === "object") {
          const current = this.session.services.getMasters();
          const next: FeatureMasters = { ...current, ...patch };
          for (const key of Object.keys(patch) as Array<keyof FeatureMasters>) {
            if (!isFeatureId(key) || !patch[key]) {
              continue;
            }
            const check = canArmFeature(key, next);
            if (!check.ok) {
              return { ok: false, error: check.error };
            }
          }
          await this.session.services.setMasters(patch);
          await saveFeatureMasters(
            this.activeCharacterId ?? this.session.view.character.characterId,
            this.session.services.getMasters()
          );
          this.broadcast();
        }
        return { ok: true, state: this.state };
      }

      case "bot:set-settings":
        return this.applySettings(message);

      case "bot:clear-logs":
        this.session.telemetry.logs = [];
        this.broadcast();
        return { ok: true, state: this.state };

      case "bot:clear-debug":
        clearDebugTelemetry(this.session.telemetry.debug);
        this.broadcast();
        return { ok: true, state: this.state };

      default:
        return { ok: false, error: "Unknown channel" };
    }
  }

  private async applySettings(message: Record<string, unknown>): Promise<Record<string, unknown>> {
    const state = this.state;
    const resolvedAutoSellLoot =
      message.autoSellLoot === undefined
        ? isLootSellEnabled(state.settings)
        : !!message.autoSellLoot;

    const lootSellModeByItemId = normalizeLootSellModes(
      message.lootSellModeByItemId && typeof message.lootSellModeByItemId === "object"
        ? (message.lootSellModeByItemId as Record<number, string>)
        : state.settings.lootSellModeByItemId
    );

    this.session.updateSettings({
      autoConfirmPartyHunt:
        message.autoConfirmPartyHunt === undefined
          ? state.settings.autoConfirmPartyHunt
          : !!message.autoConfirmPartyHunt,
      autoBuyBless:
        message.autoBuyBless === undefined
          ? state.settings.autoBuyBless
          : !!message.autoBuyBless,
      autoDisbandSoloParty:
        message.autoDisbandSoloParty === undefined
          ? state.settings.autoDisbandSoloParty
          : !!message.autoDisbandSoloParty,
      autoAcceptPartyInvite:
        message.autoAcceptPartyInvite === undefined
          ? state.settings.autoAcceptPartyInvite
          : !!message.autoAcceptPartyInvite,
      partyInviteAcceptMode:
        message.partyInviteAcceptMode === "allowlist"
          ? "allowlist"
          : message.partyInviteAcceptMode === "anyone"
            ? "anyone"
            : state.settings.partyInviteAcceptMode,
      partyInviteAllowlistNames:
        message.partyInviteAllowlistNames === undefined
          ? state.settings.partyInviteAllowlistNames
          : Array.isArray(message.partyInviteAllowlistNames)
            ? message.partyInviteAllowlistNames.filter(
                (name): name is string => typeof name === "string"
              )
            : state.settings.partyInviteAllowlistNames,
      autoSplitLootOnHuntFinished:
        message.autoSplitLootOnHuntFinished === undefined
          ? state.settings.autoSplitLootOnHuntFinished
          : !!message.autoSplitLootOnHuntFinished,
      autoSellLoot: resolvedAutoSellLoot,
      lootSellModeByItemId: lootSellModeByItemId as never,
      lootSellExcludedItemIds: excludedItemIdsFromLootSellModes(lootSellModeByItemId),
      marketSellMinRarityTier:
        message.marketSellMinRarityTier === undefined
          ? state.settings.marketSellMinRarityTier ?? 1
          : normalizeRarityBorderTier(Number(message.marketSellMinRarityTier)),
      minRaritySellMode:
        message.minRaritySellMode === undefined
          ? state.settings.minRaritySellMode ?? "market"
          : normalizeCategorySellMode(message.minRaritySellMode, true),
      mountSellMode:
        message.mountSellMode === undefined
          ? state.settings.mountSellMode ?? "keep"
          : normalizeCategorySellMode(message.mountSellMode),
      imbuementSellMode:
        message.imbuementSellMode === undefined
          ? state.settings.imbuementSellMode ?? "keep"
          : normalizeCategorySellMode(message.imbuementSellMode),
      craftSellMode:
        message.craftSellMode === undefined
          ? state.settings.craftSellMode ?? "keep"
          : normalizeCategorySellMode(message.craftSellMode),
      enchantSellMode:
        message.enchantSellMode === undefined
          ? state.settings.enchantSellMode ?? "keep"
          : normalizeCategorySellMode(message.enchantSellMode),
      marketUndercutGold:
        message.marketUndercutGold === undefined
          ? state.settings.marketUndercutGold
          : Math.max(0, Number(message.marketUndercutGold) || 0),
      marketScanEnabled:
        message.marketScanEnabled === undefined
          ? state.settings.marketScanEnabled
          : !!message.marketScanEnabled,
      marketScanIntervalSec:
        message.marketScanIntervalSec === undefined
          ? state.settings.marketScanIntervalSec
          : Math.max(10, Number(message.marketScanIntervalSec) || 30),
      marketAutoBuyEnabled:
        message.marketAutoBuyEnabled === undefined
          ? state.settings.marketAutoBuyEnabled
          : !!message.marketAutoBuyEnabled,
      selectedHuntId:
        message.selectedHuntId === undefined
          ? state.settings.selectedHuntId
          : message.selectedHuntId === null
            ? null
            : Number(message.selectedHuntId) || null,
      autoPlacePartyPosition:
        message.autoPlacePartyPosition === undefined
          ? state.settings.autoPlacePartyPosition
          : !!message.autoPlacePartyPosition,
      autoLockLure:
        message.autoLockLure === undefined ? state.settings.autoLockLure : !!message.autoLockLure,
      autoApplyPresets:
        message.autoApplyPresets === undefined
          ? state.settings.autoApplyPresets
          : !!message.autoApplyPresets,
      huntBattleByHuntId:
        message.huntBattleByHuntId !== undefined && typeof message.huntBattleByHuntId === "object"
          ? normalizeHuntBattleByHuntId(message.huntBattleByHuntId)
          : state.settings.huntBattleByHuntId,
      loggingEnabled:
        message.loggingEnabled === undefined ? state.settings.loggingEnabled : !!message.loggingEnabled,
      keepAliveEnabled:
        message.keepAliveEnabled === undefined
          ? state.settings.keepAliveEnabled
          : !!message.keepAliveEnabled,
      autoReconnectEnabled:
        message.autoReconnectEnabled === undefined
          ? state.settings.autoReconnectEnabled
          : !!message.autoReconnectEnabled,
      selectedTaskQuestId:
        message.selectedTaskQuestId === undefined
          ? state.settings.selectedTaskQuestId
          : Number(message.selectedTaskQuestId) || null,
      taskerMaxLure:
        message.taskerMaxLure === undefined ? state.settings.taskerMaxLure : !!message.taskerMaxLure,
      autoTrainingEnabled:
        message.autoTrainingEnabled === undefined
          ? state.settings.autoTrainingEnabled
          : !!message.autoTrainingEnabled,
      autoTrainingSkillToTrain:
        message.autoTrainingSkillToTrain === undefined
          ? state.settings.autoTrainingSkillToTrain
          : String(message.autoTrainingSkillToTrain),
      autoTrainingIdleDelaySec:
        message.autoTrainingIdleDelaySec === undefined
          ? state.settings.autoTrainingIdleDelaySec
          : Math.max(1, Number(message.autoTrainingIdleDelaySec) || 5),
    });

    await persistBotState(this.state, this.activeCharacterId);
    await this.session.services.get<MarketService>("market").syncMarketScannerAlarm();
    await syncKeepAlive();
    await this.syncPageKeepAliveConfig();
    if (this.session.settings.autoReconnectEnabled !== true) {
      this.autoReconnect.cancel();
    }
    return { ok: true, state: this.state };
  }

  private async checkConnection(): Promise<Record<string, unknown>> {
    const tabs = await queryGameTabs();
    if (tabs.length === 0) {
      this.boundTabId = null;
      this.applyConnection(false, 3);
      return {
        ok: true,
        connected: false,
        hasGameTab: false,
        connectionHint: "no-tab",
        message: "Open stonegy-online.com in a browser tab.",
        state: this.state,
      };
    }

    const tab = await this.findGameTab({ rebind: true });
    if (!tab?.id) {
      this.applyConnection(false, 3);
      return {
        ok: true,
        connected: false,
        hasGameTab: true,
        connectionHint: "no-game-session",
        message: "Log in to Stonegy and enter the game with a character.",
        state: this.state,
      };
    }

    const status = await readPageBridgeStatus(tab.id, { delay, retries: 4 });
    if (!status) {
      this.applyConnection(false, 3);
      return {
        ok: true,
        connected: false,
        hasGameTab: true,
        connectionHint: "no-game-session",
        message: "Reload the Stonegy tab, then log in and enter the game.",
        state: this.state,
      };
    }

    const connected = isSocketOpen(status);
    this.applyConnection(connected, connected ? 1 : status.readyState ?? 3);

    if (connected) {
      await this.session.ensureSessionReady();
      return {
        ok: true,
        connected: true,
        hasGameTab: true,
        connectionHint: "connected",
        message: "",
        state: this.state,
      };
    }

    return {
      ok: true,
      connected: false,
      hasGameTab: true,
      connectionHint: "connecting",
      message: "Waiting for game WebSocket…",
      state: this.state,
    };
  }
}

export const extensionHost = new ExtensionSessionHost();
