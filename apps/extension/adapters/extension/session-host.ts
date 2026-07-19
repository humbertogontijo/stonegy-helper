import { GameSession } from "@stonegy/helper/core/session";
import { PageBridgeTransport } from "@stonegy/helper/core/transports/page-bridge";
import { patchSessionView } from "@stonegy/helper/core/projections/patch";
import { defaultSessionView } from "@stonegy/helper/core/projections/defaults";
import { defaultSettings } from "@stonegy/helper/core/settings";
import { applySettingsPatch } from "@stonegy/helper/core/settings-persist";
import { GAME_TAB_URLS, isStonegyGameUrl, queryGameTabs } from "@stonegy/helper/game-tab";
import { BRIDGE_CHANNELS } from "@stonegy/helper/page-bridge/constants";
import { pageBridgeSecretStorageKey } from "@stonegy/helper/page-bridge/constants";
import { createAutoReconnectController } from "@stonegy/helper/page-bridge/auto-reconnect";
import {
  confirmPageBridgeDisconnect,
  connectionSnapshotFromWsEvent,
  isSocketOpen,
} from "@stonegy/helper/page-bridge/connection";
import { createReloadGrace } from "@stonegy/helper/page-bridge/reload-grace";
import { readPageBridgeStatus, sendPageBridgeCommand } from "@stonegy/helper/page-bridge/transport";
import type { BotState } from "@stonegy/helper/types";
import type { HostTimers } from "@stonegy/helper/core/services/types";
import type { CombatState } from "@stonegy/helper/core/services/states/combat.state";
import type { MarketService } from "@stonegy/helper/core/services/market.service";
import { initKeepAlive, syncKeepAlive } from "../../background/keep-alive";
import {
  LAST_CHARACTER_ID_KEY,
  loadFeatureMasters,
  loadPersistedSettings,
  persistBotState,
  saveFeatureMasters,
} from "./storage";
import { resolveBoundTabAcceptance } from "./tab-binding";
import {
  type CapturedCredentials,
  credentialSyncKey,
  parseAuthCredentialsFromWire,
  probeHelperHealth,
  readJwtFromCookies,
  syncCredentialsToHelper,
} from "./credential-sync";
import {
  buildSettingsSyncPayload,
  settingsSyncKey,
} from "./settings-sync";
import { HelperExtensionBridge } from "./helper-bridge";
import {
  createExtensionSessionCommandHost,
  handleExtensionBotMessage,
} from "./session-host-commands";

const HELPER_CREDENTIAL_PROBE_MS = 5_000;
const HELPER_CREDENTIAL_ALARM = "stonegy-helper-credential-sync";
const HELPER_SETTINGS_SYNC_DEBOUNCE_MS = 400;

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
  /**
   * True only while the bound game tab reports an open game WebSocket.
   * Distinct from persisted/view connection flags — drives helper claim/release.
   */
  private gameWsLive = false;
  private autoReconnect = createAutoReconnectController({
    delay,
    isEnabled: () => this.session.settings.autoReconnectEnabled === true,
    isConnected: () => this.session.view.connection.connected,
    reloadTab: () => this.reloadGameTab(),
  });
  /** Game JWT from outbound auth — memory only; never persisted to chrome.storage. */
  private capturedCredentials: CapturedCredentials | null = null;
  private lastSyncedCredentialKey: string | null = null;
  private credentialSyncInFlight = false;
  private credentialSyncQueued = false;
  private helperCredentialAlarmBound = false;
  private lastSyncedSettingsKey: string | null = null;
  private settingsSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly helperBridge = new HelperExtensionBridge();
  /** Skip outbound settings sync while applying a server → extension settings frame. */
  private applyingRemoteSettings = false;

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
        this.gameWsLive = false;
        this.autoReconnect.cancel();
        this.applyConnection(false, 3);
      }
    });

    await syncKeepAlive();
    this.session.services.startAll();
    this.startHelperCredentialProbe();
    this.wireHelperBridge();
    // Align helper claim with the real game tab (clears ghost claims after SW wake).
    void this.checkConnection();
  }

  private wireHelperBridge(): void {
    this.helperBridge.setHandlers({
      getSettingsPayload: () => {
        const characterId =
          this.activeCharacterId ?? this.session.view.character.characterId ?? null;
        if (!characterId || !this.settingsLoaded) {
          return null;
        }
        return buildSettingsSyncPayload(
          characterId,
          this.session.settings,
          this.session.services.getMasters()
        );
      },
      getBotState: () => this.state,
      isGameLive: () => this.gameWsLive && this.boundTabId != null,
      onRemoteSettings: async ({ settings, featureMasters }) => {
        this.applyingRemoteSettings = true;
        try {
          if (settings && Object.keys(settings).length > 0) {
            applySettingsPatch(this.session, settings);
            await persistBotState(this.state, this.activeCharacterId);
            await this.session.services.get<MarketService>("market").syncMarketScannerAlarm();
            await syncKeepAlive();
            await this.syncPageKeepAliveConfig();
            if (this.session.settings.autoReconnectEnabled !== true) {
              this.autoReconnect.cancel();
            }
          }
          if (featureMasters && Object.keys(featureMasters).length > 0) {
            await this.session.services.setMasters(featureMasters);
            await saveFeatureMasters(
              this.activeCharacterId ?? this.session.view.character.characterId,
              this.session.services.getMasters()
            );
          }
          this.broadcast();
        } finally {
          this.applyingRemoteSettings = false;
        }
      },
      onRemoteCommand: async (channel, payload) => {
        const result = await this.handleBotMessage({ channel, ...payload });
        return result as {
          ok?: boolean;
          error?: string;
          state?: BotState;
          message?: string;
        };
      },
    });
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
    void this.maybeSyncCredentialsToHelper();
    this.syncHelperBridge();
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
    // Character switch must re-push credentials even if the JWT string matches
    // a previously synced sibling (dedupe key includes characterId, but cookie
    // fallback can leave a stale captured characterId).
    if (previousCharacterId !== nextCharacterId) {
      this.lastSyncedCredentialKey = null;
      if (
        this.capturedCredentials &&
        this.capturedCredentials.characterId &&
        this.capturedCredentials.characterId !== nextCharacterId
      ) {
        this.capturedCredentials = {
          token: this.capturedCredentials.token,
          worldId: this.capturedCredentials.worldId,
        };
      }
    }

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
    void this.maybeSyncCredentialsToHelper();
    this.syncHelperBridge();
  }

  private startHelperCredentialProbe(): void {
    if (!this.helperCredentialAlarmBound) {
      this.helperCredentialAlarmBound = true;
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === HELPER_CREDENTIAL_ALARM) {
          void this.maybeSyncCredentialsToHelper();
        }
      });
      chrome.cookies?.onChanged?.addListener((changeInfo) => {
        if (
          changeInfo.cookie.name === "jwtToken" &&
          !changeInfo.removed &&
          changeInfo.cookie.value?.trim()
        ) {
          this.noteCapturedCredentials({ token: changeInfo.cookie.value.trim() });
        }
      });
    }
    void chrome.alarms.create(HELPER_CREDENTIAL_ALARM, {
      periodInMinutes: Math.max(0.5, HELPER_CREDENTIAL_PROBE_MS / 60_000),
      delayInMinutes: 0.05,
    });
    void this.maybeSyncCredentialsToHelper();
  }

  private noteCapturedCredentials(credentials: CapturedCredentials): void {
    // Prefer an explicit auth-frame characterId; cookie-only updates must not
    // keep a previous character's id glued to a new token.
    const next: CapturedCredentials = {
      token: credentials.token,
      characterId:
        credentials.characterId ??
        this.activeCharacterId ??
        this.state.character.characterId ??
        undefined,
      worldId: credentials.worldId ?? this.capturedCredentials?.worldId,
    };
    const prev = this.capturedCredentials;
    this.capturedCredentials = next;
    if (
      !prev ||
      prev.token !== next.token ||
      prev.characterId !== next.characterId ||
      prev.worldId !== next.worldId
    ) {
      this.lastSyncedCredentialKey = null;
    }
    void this.maybeSyncCredentialsToHelper();
  }

  private async resolveCredentialToken(): Promise<string | null> {
    if (this.capturedCredentials?.token) {
      return this.capturedCredentials.token;
    }
    const fromCookie = await readJwtFromCookies();
    if (fromCookie) {
      this.capturedCredentials = {
        token: fromCookie,
        characterId:
          this.activeCharacterId ?? this.state.character.characterId ?? undefined,
        worldId: this.capturedCredentials?.worldId,
      };
      return fromCookie;
    }
    return null;
  }

  private async maybeSyncCredentialsToHelper(): Promise<void> {
    // Reserve immediately so concurrent auth/cookie/state triggers cannot race
    // past the dedupe key during await probeHelperHealth().
    if (this.credentialSyncInFlight) {
      this.credentialSyncQueued = true;
      return;
    }
    this.credentialSyncInFlight = true;

    try {
      do {
        this.credentialSyncQueued = false;

        const characterId =
          this.capturedCredentials?.characterId ??
          this.state.character.characterId ??
          this.session.settings.characterId ??
          this.activeCharacterId;
        const characterName =
          this.state.character.characterName ?? this.session.settings.characterName ?? null;
        if (!characterId || !characterName) {
          continue;
        }

        const token = await this.resolveCredentialToken();
        if (!token) {
          continue;
        }

        const payload = {
          token,
          characterId,
          characterName,
          worldId: this.capturedCredentials?.worldId,
        };
        const key = credentialSyncKey(payload);
        if (key === this.lastSyncedCredentialKey) {
          continue;
        }

        const helperUp = await probeHelperHealth();
        if (!helperUp) {
          console.warn("[credential-sync] helper not reachable at 127.0.0.1:17865");
          continue;
        }

        const result = await syncCredentialsToHelper(payload);
        if (result.ok) {
          this.lastSyncedCredentialKey = key;
        } else {
          console.warn(
            "[credential-sync] helper sync failed:",
            result.error ?? "unknown"
          );
        }
      } while (this.credentialSyncQueued);
    } finally {
      this.credentialSyncInFlight = false;
    }
  }

  private schedulePersist(): void {
    if (!this.settingsLoaded || this.marketPersistenceDeferred || !this.activeCharacterId) {
      return;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      void persistBotState(this.state, this.activeCharacterId).then(() => {
        this.scheduleSettingsSync();
      });
    }, 100);
  }

  /** Debounced extension → helper settings push over /v1/extension (no-op when not claimed). */
  private scheduleSettingsSync(): void {
    if (this.applyingRemoteSettings || !this.settingsLoaded || !this.activeCharacterId) {
      return;
    }
    if (this.settingsSyncTimer) {
      clearTimeout(this.settingsSyncTimer);
    }
    this.settingsSyncTimer = setTimeout(() => {
      this.settingsSyncTimer = null;
      this.pushSettingsToHelper();
    }, HELPER_SETTINGS_SYNC_DEBOUNCE_MS);
  }

  private pushSettingsToHelper(): void {
    const characterId =
      this.activeCharacterId ?? this.session.view.character.characterId ?? null;
    if (!characterId || !this.helperBridge.isLinked()) {
      return;
    }

    const payload = buildSettingsSyncPayload(
      characterId,
      this.session.settings,
      this.session.services.getMasters()
    );
    const key = settingsSyncKey(payload);
    if (key === this.lastSyncedSettingsKey) {
      return;
    }

    this.helperBridge.pushSettings(
      this.session.settings,
      this.session.services.getMasters(),
      characterId
    );
    this.lastSyncedSettingsKey = key;
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
    this.helperBridge.pushState(state);
  }

  private bindTab(tabId: number): void {
    if (this.boundTabId !== tabId) {
      this.hadOpenSocket = false;
      this.gameWsLive = false;
      this.autoReconnect.cancel();
      // Drop any helper claim tied to the previous tab immediately.
      void this.helperBridge.releaseAndClose();
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
    this.gameWsLive = connected;
    if (connected) {
      this.hadOpenSocket = true;
      this.autoReconnect.cancel();
    }
    this.transport.setConnection(connected, readyState);
    this.session.view = patchSessionView(this.session.view, {
      connection: { connected, readyState },
    });
    this.broadcast();
    this.syncHelperBridge();
  }

  /** Claim/release the helper WS while the game tab holds (or drops) the character. */
  private syncHelperBridge(): void {
    if (this.reloadGrace.isActive()) {
      return;
    }
    // Claim only from the live game WS flag — never from persisted view state.
    const connected = this.gameWsLive;
    const characterId =
      this.state.character.characterId ??
      this.session.settings.characterId ??
      this.activeCharacterId;
    const characterName =
      this.state.character.characterName ?? this.session.settings.characterName ?? null;
    this.helperBridge.syncLive(characterId, characterName, connected);
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
        const socketOpen = !!message.connected && readyState === 1;
        // Status is a heartbeat only. Live transitions come from ws:open /
        // ws:connected — never resurrect a claim from a late status frame.
        if (!socketOpen) {
          this.applyConnection(false, readyState);
        } else if (this.gameWsLive) {
          this.applyConnection(true, readyState);
        }
        return { ok: true };
      }

      case BRIDGE_CHANNELS.wsEvent:
        if (!isBridgeTabSender(sender)) {
          return { ok: false, error: "Bridge events require a Stonegy game tab" };
        }
        return this.handleWsBridgeEvent(message, sender);

      case "damage-analyzer:get-state": {
        if (!isBridgeTabSender(sender) || !this.isBoundTab(sender.tab?.id)) {
          return { ok: false, error: "Damage analyzer state is restricted to the bound game tab" };
        }
        return { ok: true, state: this.state };
      }

      case "damage-analyzer:reset": {
        if (!isBridgeTabSender(sender) || !this.isBoundTab(sender.tab?.id)) {
          return { ok: false, error: "Damage analyzer reset is restricted to the bound game tab" };
        }
        this.session.services.getDomain<CombatState>("combatState").reset();
        this.session.invalidateProjection();
        this.broadcast();
        return { ok: true, state: this.state };
      }

      case "popup:bind": {
        if (!isBridgeTabSender(sender) || sender.tab?.id == null) {
          return { ok: false, error: "Popup bind is restricted to Stonegy game tabs" };
        }
        this.bindTab(sender.tab.id);
        return { ok: true };
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
      if (message.type === "ws:send" && typeof payload.data === "string") {
        const credentials = parseAuthCredentialsFromWire(payload.data);
        if (credentials) {
          this.noteCapturedCredentials(credentials);
        }
      }
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
    const host = createExtensionSessionCommandHost({
      session: this.session,
      getState: () => this.state,
      getActiveCharacterId: () => this.activeCharacterId,
      findGameTab: (options) => this.findGameTab(options),
      reloadGameTab: () => this.reloadGameTab(),
      checkConnection: () => this.checkConnection(),
      scheduleSettingsSync: () => this.scheduleSettingsSync(),
      broadcast: () => this.broadcast(),
      syncPageKeepAliveConfig: () => this.syncPageKeepAliveConfig(),
      cancelAutoReconnect: () => this.autoReconnect.cancel(),
      setMarketPersistenceDeferred: (value) => {
        this.marketPersistenceDeferred = value;
      },
      chainFullScan: (work) => {
        this.fullScanChain = this.fullScanChain.then(() => work);
        void this.fullScanChain;
      },
    });
    return handleExtensionBotMessage(this.session, message, host);
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
