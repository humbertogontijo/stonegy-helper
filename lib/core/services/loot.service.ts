import { DEFAULT_MARKET_TAX_PERCENT } from "../../market/constants";
import { executeItemSell, executeBatchNpcQuickSell } from "../../loot-sell";
import type { LootSellDeps } from "../../loot-sell";
import {
  getInventoryItemsToSellOnHuntFinish,
  getInventoryLootCandidateEntries,
  getInventoryMarketSyncCandidateIds,
  hasInventoryLootCandidates,
  isLootSellEnabled,
  resolveSellVenueForItem,
  type InventoryLootContext,
  type LootSellState,
} from "../../domain/loot-sell";
import { getHuntDroppedItemIds } from "../../monsters";
import { removeInventoryAmounts } from "../../inventory";
import type { SendMessageType } from "../../protocol";
import { ReceiveMessageTypes } from "../../protocol";
import { delay, featureCooldown, PIPELINE_COOLDOWNS } from "../commands/cooldown";
import { isPartyLeader, partyIdentity } from "../humanize";
import { updatePlayerState, isHandlingLoot, isSplittingLoot } from "../player-state";
import {
  executeLootSplit,
  shouldExecuteLootSplit,
  totalSplitTransferGold,
  type LootSplitResult,
} from "../features/hunt/loot-splitter";
import {
  getEffectiveLootSplitCompleted,
  getRemainingLeaderTransfers,
  hasPendingLootSplitReset,
} from "../features/hunt/loot-split-progress";
import type { GameEvent } from "../events/types";
import { lootPipelineFinishedEvent, lootSellFinishedEvent } from "./events";
import type { MarketService } from "./market.service";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { InventoryState } from "./states/inventory.state";
import type { MarketState } from "./states/market.state";
import type { HuntState } from "./states/hunt.state";
import type { PartyState } from "./states/party.state";
import type { SessionState } from "./states/session.state";
import type { BattleService } from "./battle.service";

const PENDING_HUNT_LOOT_SELL_TIMEOUT_MS = 30_000;

function formatGold(amount: number): string {
  return amount.toLocaleString();
}

export type LootFlowPhase =
  | "idle"
  | "awaiting_inventory"
  | "selling"
  | "splitting"
  | "done"
  | "failed";

export interface LootFlowState {
  phase: LootFlowPhase;
  startedAt: number | null;
  lastResult: HuntLootSellResult | null;
  lastError: string | null;
}

export interface HuntLootSellResult {
  itemCount: number;
  soldCount: number;
  failedCount: number;
  skippedCount: number;
  /** True when market listing stopped early due to the open-order cap. */
  marketOrderLimitReached?: boolean;
}

export interface SellLootOptions {
  /** When true, sell even if auto-sell settings are off (manual "Sell now"). */
  force?: boolean;
}

export interface SellLootNowResult {
  ok: boolean;
  error?: string;
  message?: string;
  result?: HuntLootSellResult;
}

export interface SplitLootNowResult {
  ok: boolean;
  error?: string;
  message?: string;
  result?: LootSplitResult;
}

export function formatSellStatus(result: HuntLootSellResult): string {
  const parts: string[] = [];
  if (result.soldCount > 0) {
    parts.push(`${result.soldCount} sold`);
  }
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} skipped`);
  }
  if (result.failedCount > 0) {
    parts.push(`${result.failedCount} failed`);
  }
  if (!parts.length) {
    return "No loot items to sell";
  }
  const suffix = result.marketOrderLimitReached ? " (market order limit)" : "";
  return `Sell complete — ${parts.join(", ")}${suffix}`;
}

export class LootService extends Service {
  readonly id: FeatureId = "loot";

  private flow: LootFlowState = {
    phase: "idle",
    startedAt: null,
    lastResult: null,
    lastError: null,
  };

  /** Soft timeout while awaiting inventory — must not depend on inventory_snapshot arriving. */
  private pendingSellTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    ctx: ServiceContext,
    private readonly inventoryState: InventoryState,
    private readonly marketState: MarketState,
    private readonly huntState: HuntState,
    private readonly partyState: PartyState,
    private readonly sessionState: SessionState,
    private readonly market: MarketService,
    private readonly battle: BattleService
  ) {
    super(ctx);
  }

  stop(): void {
    this.clearPendingSellTimeout();
  }

  private identity() {
    return partyIdentity(this.sessionState.characterId, this.partyState);
  }

  private inventoryLootContext(): InventoryLootContext {
    return {
      settings: this.ctx.settings.get(),
      inventory: this.inventoryState.projection(),
      market: this.marketState.projection(),
    };
  }

  private lootSellState(): LootSellState & InventoryLootContext {
    return {
      settings: this.ctx.settings.get(),
      inventory: this.inventoryState.projection(),
      market: { marketPrices: this.marketState.prices },
      party: { partyStatus: this.partyState.partyStatus },
      hunt: { activeHuntId: this.huntState.activeHuntId },
    };
  }

  private lootSellDeps(hooks: {
    onCommandOutcome?: (
      outcome: Awaited<ReturnType<ServiceContext["session"]["commands"]["run"]>>
    ) => void;
  } = {}): LootSellDeps {
    const session = this.ctx.session;
    return {
      delay,
      getState: () => this.lootSellState(),
      runCommand: async (type, params, options) => {
        const outcome = await session.commands.run(
          type as SendMessageType,
          params as never,
          {
            force: options?.force,
            cooldownMs: featureCooldown("loot.autoSell"),
          }
        );
        hooks.onCommandOutcome?.(outcome);
        return outcome;
      },
      onSold: (soldByItemId) => {
        this.inventoryState.applyInventoryPatch({
          items: removeInventoryAmounts(this.inventoryState.inventoryItems ?? [], soldByItemId),
        });
        session.notifyChange();
      },
    };
  }

  private isPendingSellPhase(): boolean {
    return this.flow.phase === "awaiting_inventory" || this.flow.phase === "selling";
  }

  /** True while post-hunt sell/split flow owns the idle transition (blocks auto-hunt restart). */
  isBusyWithPostHuntLoot(): boolean {
    return (
      this.flow.phase === "awaiting_inventory" ||
      this.flow.phase === "selling" ||
      this.flow.phase === "splitting"
    );
  }

  sessionOverlay() {
    const pending = this.isPendingSellPhase();
    return {
      hunt: {
        pendingHuntLootSell: pending,
        pendingHuntLootSellAt: pending ? this.flow.startedAt : null,
      },
    };
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.sessionOverlay(),
      lootFlow: { ...this.flow },
    };
  }

  applyPendingHuntLootPatch(patch: {
    pendingHuntLootSell?: boolean;
    pendingHuntLootSellAt?: number | null;
  }): void {
    if (patch.pendingHuntLootSell === true) {
      this.flow = {
        phase: "awaiting_inventory",
        startedAt: patch.pendingHuntLootSellAt ?? this.flow.startedAt ?? Date.now(),
        lastResult: this.flow.lastResult,
        lastError: this.flow.lastError,
      };
      this.schedulePendingSellTimeout();
    } else if (patch.pendingHuntLootSell === false) {
      this.clearPendingSellTimeout();
      this.flow = {
        phase: "idle",
        startedAt: null,
        lastResult: this.flow.lastResult,
        lastError: this.flow.lastError,
      };
    } else if (patch.pendingHuntLootSellAt !== undefined && this.isPendingSellPhase()) {
      this.flow = { ...this.flow, startedAt: patch.pendingHuntLootSellAt };
    }
  }

  async onEvent(event: GameEvent): Promise<void> {
    const settings = this.ctx.settings.get();

    const isHuntFinished =
      event.kind === "json" && event.message.type === ReceiveMessageTypes.HUNT_FINISHED;

    if (isHuntFinished || event.kind === "inventory_snapshot") {
      if (isLootSellEnabled(settings)) {
        if (isHuntFinished && !isHandlingLoot(this.ctx.session)) {
          // Claim ownership synchronously so hunt auto-restart cannot race, then
          // run the wait-heavy sell work off the wire chain (avoids notifyResponse deadlock).
          this.markPendingHuntLootSell();
          updatePlayerState(this.ctx.session, "selling_loot", "Refreshing party…");
        }
        this.ctx.session.deferFromWire(() => this.handleLootSellOnHuntFinished(event));
      }
    }

    if (event.kind === "loot_sell_finished") {
      if (settings.autoSplitLootOnHuntFinished) {
        this.ctx.session.deferFromWire(() => this.handleLootSplitAfterSell(event));
      }
    } else if (
      isHuntFinished &&
      !isLootSellEnabled(settings) &&
      settings.autoSplitLootOnHuntFinished
    ) {
      this.ctx.session.deferFromWire(() => this.handleLootSplitAfterSell(event));
    }
  }

  // ---------------------------------------------------------------------------
  // Public interface (session-host / popup actions)
  // ---------------------------------------------------------------------------

  /** Manual "Sell now" from the popup — always force-sells regardless of auto-sell setting. */
  async sellLootNow(): Promise<SellLootNowResult> {
    return this.traceFlow("sell-now", async (trace) => {
      const session = this.ctx.session;
      const busy = isHandlingLoot(session);
      trace.guard("not_busy", !busy);
      if (busy) {
        trace.finish("skipped", { error: "Already selling or splitting loot." });
        return { ok: false, error: "Already selling or splitting loot." };
      }

      updatePlayerState(session, "selling_loot", "Selling hunt loot…");
      trace.setPhase("selling");

      try {
        const result = await this.sellLootOnHuntFinished({ force: true });
        const message = formatSellStatus(result);
        updatePlayerState(session, "idling", message);
        trace.finish(result.itemCount > 0 || result.soldCount > 0 ? "ok" : "skipped", {
          result,
        });
        return { ok: true, message, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updatePlayerState(session, "idling", `Loot sell failed: ${message}`);
        trace.finish("failed", { error: message });
        return { ok: false, error: `Loot sell failed: ${message}` };
      }
    });
  }

  /** Manual "Split now" from the popup — updates player state around the split. */
  async splitLootNow(): Promise<SplitLootNowResult> {
    return this.traceFlow("split-now", async (trace) => {
      const session = this.ctx.session;
      const busy = isHandlingLoot(session);
      trace.guard("not_busy", !busy);
      if (busy) {
        trace.finish("skipped", { error: "Already selling or splitting loot." });
        return { ok: false, error: "Already selling or splitting loot." };
      }

      const party = this.partyState.projection();
      const splitter = party.partyLootSplitter;
      const completedByPlayerId = getEffectiveLootSplitCompleted(party);
      const skipReason = shouldExecuteLootSplit(
        this.identity(),
        this.sessionState.goldCoins,
        splitter,
        party
      );

      if (skipReason === "insufficient_gold" && splitter) {
        const requiredGold = totalSplitTransferGold(
          getRemainingLeaderTransfers(splitter.splitter.members, completedByPlayerId)
        );
        const availableGold = this.sessionState.goldCoins ?? 0;
        const message = `Not enough gold to split — need ${formatGold(requiredGold)} gp, have ${formatGold(availableGold)} gp`;
        updatePlayerState(session, "idling", message);
        trace.guard("sufficient_gold", false, message);
        trace.finish("skipped", { error: message });
        return { ok: false, error: message };
      }

      if (skipReason && skipReason !== "nothing_to_split" && skipReason !== "insufficient_gold") {
        const errorByReason: Record<string, string> = {
          not_leader: "Only the party leader can split loot.",
          solo_party: "Loot split requires a party with 2+ members.",
          no_splitter: "No loot split data in party state.",
          members_owe_leader:
            "Loot split skipped — members still owe the leader (only leader transfers are automated).",
        };
        const error = errorByReason[skipReason] ?? "Loot split skipped.";
        updatePlayerState(session, "idling", error);
        trace.guard("can_split", false, skipReason);
        trace.finish("skipped", { error });
        return { ok: false, error };
      }

      const transfers = splitter
        ? getRemainingLeaderTransfers(splitter.splitter.members, completedByPlayerId)
        : [];
      if (!transfers.length && !hasPendingLootSplitReset(party)) {
        updatePlayerState(session, "idling", "Nothing to split");
        trace.guard("has_work", false);
        trace.finish("skipped", { error: "Nothing to split." });
        return { ok: false, error: "Nothing to split." };
      }

      trace.guard("can_split", true, transfers.length ? `${transfers.length} transfers` : "reset");
      updatePlayerState(
        session,
        "splitting_loot",
        transfers.length
          ? `Splitting loot to ${transfers.length} member(s)…`
          : "Resetting loot splitter…"
      );
      trace.setPhase("splitting");

      try {
        const result = await executeLootSplit(session);

        if (!result.ok) {
          if (result.reason === "insufficient_gold") {
            const message = `Not enough gold to split — need ${formatGold(result.requiredGold ?? 0)} gp, have ${formatGold(result.availableGold ?? 0)} gp`;
            updatePlayerState(session, "idling", message);
            trace.finish("skipped", { error: message, result });
            return { ok: false, error: message, result };
          }
          const message =
            result.reason === "nothing_to_split" ? "Nothing to split." : "Loot split failed.";
          updatePlayerState(session, "idling", message);
          trace.finish(result.reason === "nothing_to_split" ? "skipped" : "failed", {
            error: message,
            result,
          });
          return { ok: false, error: message, result };
        }

        const message =
          result.transferCount && result.transferCount > 0
            ? `Split sent to ${result.transferCount} member(s) and reset.`
            : "Loot splitter reset.";
        updatePlayerState(session, "idling", message);
        trace.finish("ok", { result });
        return { ok: true, message, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updatePlayerState(session, "idling", `Loot split failed: ${message}`);
        trace.finish("failed", { error: message });
        return { ok: false, error: `Loot split failed: ${message}` };
      }
    });
  }

  /** Sync market prices for specific item IDs. Used by session-host and loot sell flow. */
  async syncMarketItemIds(itemIds: number[], force = false): Promise<void> {
    await this.market.syncItemPrices(itemIds, force);
  }

  /** Sync market prices for all items that drop in a given hunt. */
  async syncHuntLootMarketPrices(huntId?: number | null): Promise<void> {
    return this.traceFlow("sync-hunt-loot", async (trace) => {
      const session = this.ctx.session;
      const resolved = huntId ?? this.battle.resolveHuntId();
      trace.guard("hunt_selected", resolved != null, resolved != null ? `${resolved}` : undefined);

      if (resolved == null) {
        this.market.patchMarketUi({ huntLootSyncStatus: "No hunt selected" });
        session.notifyChange();
        trace.finish("skipped", { error: "No hunt selected" });
        return;
      }

      const itemIds = getHuntDroppedItemIds(resolved);
      trace.guard("has_loot_items", itemIds.length > 0, `${itemIds.length}`);
      if (!itemIds.length) {
        this.market.patchMarketUi({ huntLootSyncStatus: "No loot items for this hunt" });
        session.notifyChange();
        trace.finish("skipped", { error: "No loot items for this hunt" });
        return;
      }

      this.market.patchMarketUi({
        huntLootSyncStatus: `Syncing ${itemIds.length} item(s)…`,
      });
      session.notifyChange();
      trace.setPhase("syncing_prices");

      try {
        await this.syncMarketItemIds(itemIds, true);
        this.market.patchMarketUi({
          huntLootSyncStatus: `Done — ${itemIds.length} item(s) synced`,
        });
        trace.finish("ok", { result: { huntId: resolved, itemCount: itemIds.length } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.market.patchMarketUi({
          huntLootSyncStatus: `Sync failed: ${message}`,
        });
        trace.finish("failed", { error: message });
      }
      session.notifyChange();
    });
  }

  /**
   * Execute inventory loot sell (NPC batch + market items).
   * Used by hunt-finish flow and manual sellLootNow.
   */
  async sellLootOnHuntFinished(options: SellLootOptions = {}): Promise<HuntLootSellResult> {
    return this.traceFlow(
      "sell-loot",
      async (trace) => {
        let state = this.lootSellState();

        if (!options.force && !isLootSellEnabled(state.settings)) {
          trace.guard("sell_enabled", false);
          trace.finish("skipped", { result: this.lootFlowDebugSnapshot() });
          return { itemCount: 0, soldCount: 0, failedCount: 0, skippedCount: 0 };
        }
        trace.guard("sell_enabled_or_forced", true, options.force ? "forced" : undefined);

        const pricing = {
          taxPercent: DEFAULT_MARKET_TAX_PERCENT,
          undercutGold: this.ctx.settings.get().marketUndercutGold ?? 1,
        };

        const candidateIds = getInventoryLootCandidateEntries(state).map((entry) => entry.itemId);
        trace.guard("has_candidates", candidateIds.length > 0, `${candidateIds.length}`);
        if (!candidateIds.length) {
          trace.finish("skipped", { result: this.lootFlowDebugSnapshot() });
          return { itemCount: 0, soldCount: 0, failedCount: 0, skippedCount: 0 };
        }

        const marketSyncIds = getInventoryMarketSyncCandidateIds(state);
        if (marketSyncIds.length) {
          trace.setPhase("syncing_prices");
          updatePlayerState(
            this.ctx.session,
            "selling_loot",
            `Syncing market prices (${marketSyncIds.length} item types)…`
          );
          await this.syncMarketItemIds(marketSyncIds, true);
          trace.guard("prices_synced", true, `${marketSyncIds.length}`);
          state = this.lootSellState();
        } else {
          trace.guard("prices_synced", true, "skipped_no_market_candidates");
        }

        const itemIds = getInventoryItemsToSellOnHuntFinish(state, pricing);
        trace.guard("has_sellable", itemIds.length > 0, `${itemIds.length}/${candidateIds.length}`);
        if (!itemIds.length) {
          trace.finish("ok", {
            result: {
              itemCount: 0,
              soldCount: 0,
              failedCount: 0,
              skippedCount: candidateIds.length,
              ...this.lootFlowDebugSnapshot(),
            },
          });
          return { itemCount: 0, soldCount: 0, failedCount: 0, skippedCount: candidateIds.length };
        }

        const npcItemIds: number[] = [];
        const marketItemIds: number[] = [];

        for (const itemId of itemIds) {
          const venue = resolveSellVenueForItem(state, itemId, pricing);
          if (venue === "npc") {
            npcItemIds.push(itemId);
          } else if (venue === "market") {
            marketItemIds.push(itemId);
          }
        }
        trace.guard("venues", true, `npc=${npcItemIds.length} market=${marketItemIds.length}`);
        trace.setStateSnapshot(this.lootFlowDebugSnapshot());

        await delay(PIPELINE_COOLDOWNS.beforeSell);
        updatePlayerState(this.ctx.session, "selling_loot", "Preparing to sell…");

        trace.setPhase("selling");
        updatePlayerState(
          this.ctx.session,
          "selling_loot",
          `Selling loot (NPC ${npcItemIds.length}, market ${marketItemIds.length})…`
        );
        let soldCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        if (npcItemIds.length) {
          let commandsSent = 0;
          let commandsFailed = 0;
          const deps = this.lootSellDeps({
            onCommandOutcome: (outcome) => {
              commandsSent += 1;
              if (outcome.success === false) {
                commandsFailed += 1;
              }
              trace.command({
                type: "quick_sell_items",
                success: outcome.success,
                skipped: outcome.skipped,
                skipReason: outcome.skipReason,
                error: outcome.errorMessage,
              });
            },
          });

          await executeBatchNpcQuickSell(npcItemIds, deps);

          if (commandsSent === 0) {
            skippedCount += npcItemIds.length;
          } else if (commandsFailed > 0) {
            failedCount += npcItemIds.length;
          } else {
            soldCount += npcItemIds.length;
          }

          if (marketItemIds.length) {
            await delay(featureCooldown("loot.autoSell"));
          }
        }

        state = this.lootSellState();
        let marketOrderLimitReached = false;

        for (let index = 0; index < marketItemIds.length; index += 1) {
          const itemId = marketItemIds[index];
          updatePlayerState(
            this.ctx.session,
            "selling_loot",
            `Listing market ${index + 1}/${marketItemIds.length}…`
          );
          let commandsSent = 0;
          const deps = this.lootSellDeps({
            onCommandOutcome: (outcome) => {
              commandsSent += 1;
              trace.command({
                type: "market_create_order",
                success: outcome.success,
                skipped: outcome.skipped,
                skipReason: outcome.skipReason,
                error: outcome.errorMessage,
              });
            },
          });
          const sellResult = await executeItemSell(itemId, pricing, deps);

          if (sellResult.marketOrderLimitReached) {
            failedCount += 1;
            const remaining = marketItemIds.length - index - 1;
            skippedCount += remaining;
            marketOrderLimitReached = true;
            trace.guard("market_order_limit", true, `skipped_remaining=${remaining}`);
            updatePlayerState(
              this.ctx.session,
              "selling_loot",
              remaining > 0
                ? `Market order limit — skipped ${remaining} listing(s)`
                : "Market order limit reached"
            );
            break;
          }

          if (sellResult.sold) {
            soldCount += 1;
          } else if (commandsSent === 0) {
            skippedCount += 1;
          } else {
            failedCount += 1;
          }

          if (index < marketItemIds.length - 1) {
            await delay(featureCooldown("loot.autoSell"));
          }
        }

        const result = {
          itemCount: itemIds.length,
          soldCount,
          failedCount,
          skippedCount,
          ...(marketOrderLimitReached ? { marketOrderLimitReached: true } : {}),
        };
        trace.finish("ok", {
          result: {
            ...result,
            npcCount: npcItemIds.length,
            marketCount: marketItemIds.length,
          },
        });
        return result;
      },
      { stateSnapshot: this.lootFlowDebugSnapshot() }
    );
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** Handles sell orchestration on HUNT_FINISHED and inventory_snapshot events. */
  async handleLootSellOnHuntFinished(event: GameEvent): Promise<void> {
    await this.run("hunt-finish-sell", () => this.handleLootSellOnHuntFinishedLocked(event));
  }

  private async handleLootSellOnHuntFinishedLocked(event: GameEvent): Promise<void> {
    const session = this.ctx.session;
    if (!session.connected) {
      return;
    }

    if (event.kind === "inventory_snapshot") {
      if (this.flow.phase !== "awaiting_inventory" || isSplittingLoot(session)) {
        return;
      }

      try {
        const sold = await this.tryRunPendingHuntLootSell();
        if (!sold && this.flow.phase === "awaiting_inventory") {
          if (this.isPendingHuntLootSellTimedOut()) {
            await this.timeoutPendingHuntLootSell("inventory_snapshot");
          } else {
            updatePlayerState(session, "selling_loot", "Waiting for inventory…");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.failHuntLootSell(message);
        updatePlayerState(session, "idling", `Loot sell failed: ${message}`);
        this.emitAfterHuntLootSell({
          itemCount: 0,
          soldCount: 0,
          failedCount: 1,
          skippedCount: 0,
        });
      }
      return;
    }

    if (event.kind !== "json" || event.message.type !== ReceiveMessageTypes.HUNT_FINISHED) {
      return;
    }

    if (isHandlingLoot(session) && this.flow.phase === "idle") {
      await this.traceFlow(
        "hunt-finish-sell",
        async (trace) => {
          trace.guard("flow_consistent", false, "handling_loot with idle phase");
          trace.finish("skipped", {
            error: "stale handling_loot with idle loot phase",
            result: this.lootFlowDebugSnapshot(),
          });
        },
        { phase: "idle", stateSnapshot: this.lootFlowDebugSnapshot() }
      );
      return;
    }

    try {
      if (this.flow.phase !== "awaiting_inventory" && this.flow.phase !== "selling") {
        this.markPendingHuntLootSell();
        updatePlayerState(session, "selling_loot", "Refreshing party…");
      }
      await session.syncPartyContext({ force: true, waitForResponse: true });

      const sold = await this.tryRunPendingHuntLootSell();
      if (!sold && this.flow.phase === "awaiting_inventory") {
        if (this.isPendingHuntLootSellTimedOut()) {
          await this.timeoutPendingHuntLootSell("hunt_finished");
        } else {
          updatePlayerState(session, "selling_loot", "Waiting for inventory…");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failHuntLootSell(message);
      updatePlayerState(session, "idling", `Loot sell failed: ${message}`);
      this.emitAfterHuntLootSell({
        itemCount: 0,
        soldCount: 0,
        failedCount: 1,
        skippedCount: 0,
      });
    }
  }

  /** Handles split orchestration on loot_sell_finished and HUNT_FINISHED (when sell disabled). */
  async handleLootSplitAfterSell(event: GameEvent): Promise<void> {
    await this.traceFlow("hunt-finish-split", async (trace) => {
      const session = this.ctx.session;

      const wantsSplit = this.wantsHuntLootSplit();
      trace.guard("wants_split", wantsSplit);
      if (!wantsSplit) {
        trace.finish("skipped");
        return;
      }

      const isHuntFinished =
        event.kind === "json" && event.message.type === ReceiveMessageTypes.HUNT_FINISHED;

      if (event.kind === "loot_sell_finished") {
        // proceed
      } else if (isHuntFinished && !isLootSellEnabled(this.ctx.settings.get())) {
        // proceed
      } else {
        trace.finish("skipped");
        return;
      }

      if (isHuntFinished && isHandlingLoot(session)) {
        trace.guard("not_handling_loot", false);
        trace.finish("skipped");
        return;
      }

      if (event.kind === "loot_sell_finished" && isSplittingLoot(session)) {
        trace.guard("not_already_splitting", false);
        trace.finish("skipped");
        return;
      }

      await delay(PIPELINE_COOLDOWNS.beforeSplit);
      updatePlayerState(session, "selling_loot", "Preparing loot split…");

      if (isHuntFinished) {
        updatePlayerState(session, "selling_loot", "Refreshing party…");
        await session.syncPartyContext({ force: true, waitForResponse: true });
      }

      const party = this.partyState.projection();
      const splitter = party.partyLootSplitter;
      const completedByPlayerId = getEffectiveLootSplitCompleted(party);
      const splitSkip = shouldExecuteLootSplit(
        this.identity(),
        this.sessionState.goldCoins,
        splitter,
        party
      );

      if (splitSkip === "insufficient_gold" && splitter) {
        const requiredGold = totalSplitTransferGold(
          getRemainingLeaderTransfers(splitter.splitter.members, completedByPlayerId)
        );
        const availableGold = this.sessionState.goldCoins ?? 0;
        updatePlayerState(
          session,
          "idling",
          `Not enough gold to split — need ${formatGold(requiredGold)} gp, have ${formatGold(availableGold)} gp`
        );
        trace.guard("sufficient_gold", false);
        trace.finish("skipped", { result: "insufficient_gold" });
        this.ctx.emit(lootPipelineFinishedEvent());
        return;
      }

      if (splitSkip && splitSkip !== "nothing_to_split" && splitSkip !== "insufficient_gold") {
        const statusByReason: Record<string, string> = {
          not_leader: "Only the party leader can split loot",
          solo_party: "Loot split requires a party with 2+ members",
          no_splitter: "No loot split data in party state",
          members_owe_leader:
            "Loot split skipped — members still owe the leader (only leader transfers are automated)",
        };
        updatePlayerState(session, "idling", statusByReason[splitSkip] ?? "Loot split skipped");
        trace.guard("split_eligible", false, splitSkip);
        trace.finish("skipped", { result: splitSkip });
        this.ctx.emit(lootPipelineFinishedEvent());
        return;
      }

      const transfers = splitter
        ? getRemainingLeaderTransfers(splitter.splitter.members, completedByPlayerId)
        : [];
      if (!transfers.length) {
        updatePlayerState(session, "idling", "Nothing to split");
        trace.guard("has_transfers", false);
        trace.finish("skipped", { result: "nothing_to_split" });
        this.ctx.emit(lootPipelineFinishedEvent());
        return;
      }

      this.setFlowPhase("splitting");
      trace.setPhase("splitting");
      updatePlayerState(
        session,
        "splitting_loot",
        `Splitting loot to ${transfers.length} member(s)…`
      );

      try {
        const splitResult = await executeLootSplit(session);

        if (!splitResult.ok) {
          if (splitResult.reason === "insufficient_gold") {
            updatePlayerState(
              session,
              "idling",
              `Not enough gold to split — need ${formatGold(splitResult.requiredGold ?? 0)} gp, have ${formatGold(splitResult.availableGold ?? 0)} gp`
            );
            this.setFlowPhase("idle");
            trace.finish("skipped", { result: "insufficient_gold" });
            this.ctx.emit(lootPipelineFinishedEvent());
            return;
          }
          updatePlayerState(session, "idling", "Loot split failed");
          this.setFlowPhase("failed", { lastError: "Loot split failed" });
          this.setFlowPhase("idle");
          trace.finish("failed", { error: "Loot split failed" });
          this.ctx.emit(lootPipelineFinishedEvent());
          return;
        }

        updatePlayerState(
          session,
          "idling",
          splitResult.transferCount && splitResult.transferCount > 0
            ? `Split sent to ${splitResult.transferCount} member(s) and reset`
            : "Loot splitter reset"
        );
        this.setFlowPhase("done");
        this.setFlowPhase("idle");
        trace.finish("ok", { result: splitResult });
        this.ctx.emit(lootPipelineFinishedEvent());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updatePlayerState(session, "idling", `Loot split failed: ${message}`);
        this.setFlowPhase("failed", { lastError: message });
        this.setFlowPhase("idle");
        this.ctx.emit(lootPipelineFinishedEvent());
        throw error;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private setFlowPhase(
    phase: LootFlowPhase,
    patch: Partial<Pick<LootFlowState, "startedAt" | "lastResult" | "lastError">> = {}
  ): void {
    this.flow = {
      phase,
      startedAt: patch.startedAt !== undefined ? patch.startedAt : this.flow.startedAt,
      lastResult: patch.lastResult !== undefined ? patch.lastResult : this.flow.lastResult,
      lastError: patch.lastError !== undefined ? patch.lastError : this.flow.lastError,
    };
    this.ctx.session.notifyChange();
  }

  private lootFlowDebugSnapshot(): Record<string, unknown> {
    const player = this.ctx.session.services.getPlayerState();
    const candidates = getInventoryLootCandidateEntries(this.inventoryLootContext());
    return {
      phase: this.flow.phase,
      startedAt: this.flow.startedAt,
      pendingAgeMs: this.flow.startedAt != null ? Date.now() - this.flow.startedAt : null,
      playerState: player.playerState,
      playerStateDetail: player.playerStateDetail,
      activelyHunting: this.huntState.isActivelyHunting(),
      activeHuntId: this.huntState.activeHuntId,
      partyStatus: this.partyState.partyStatus,
      inventoryItemTypes: this.inventoryState.inventoryItems.length,
      candidateCount: candidates.length,
      candidateItemIds: candidates.slice(0, 12).map((entry) => entry.itemId),
    };
  }

  private wantsHuntLootSplit(): boolean {
    if (!this.ctx.session.settings.autoSplitLootOnHuntFinished) {
      return false;
    }
    return isPartyLeader(this.identity());
  }

  private shouldSellLootOnHuntFinish(): boolean {
    return isLootSellEnabled(this.ctx.settings.get());
  }

  private hasInventoryLootToSell(): boolean {
    return hasInventoryLootCandidates(this.inventoryLootContext());
  }

  private schedulePendingSellTimeout(): void {
    this.clearPendingSellTimeout();
    this.pendingSellTimeout = setTimeout(() => {
      this.pendingSellTimeout = null;
      void this.run("hunt-finish-sell", () => this.onPendingSellTimeout());
    }, PENDING_HUNT_LOOT_SELL_TIMEOUT_MS);
  }

  private clearPendingSellTimeout(): void {
    if (this.pendingSellTimeout == null) {
      return;
    }
    clearTimeout(this.pendingSellTimeout);
    this.pendingSellTimeout = null;
  }

  private async onPendingSellTimeout(): Promise<void> {
    if (this.flow.phase !== "awaiting_inventory") {
      return;
    }

    try {
      const sold = await this.tryRunPendingHuntLootSell();
      if (sold || this.flow.phase !== "awaiting_inventory") {
        return;
      }
      await this.timeoutPendingHuntLootSell("timer");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failHuntLootSell(message);
      updatePlayerState(this.ctx.session, "idling", `Loot sell failed: ${message}`);
      this.emitAfterHuntLootSell({
        itemCount: 0,
        soldCount: 0,
        failedCount: 1,
        skippedCount: 0,
      });
    }
  }

  private async timeoutPendingHuntLootSell(source: string): Promise<void> {
    const timeoutTrace = this.beginTrace("hunt-finish-sell", {
      phase: "awaiting_inventory",
      stateSnapshot: this.lootFlowDebugSnapshot(),
    });
    timeoutTrace.guard("pending", true);
    timeoutTrace.guard("timeout", true, source);
    this.recordTrace(
      timeoutTrace.finish("timeout", {
        error: `Timed out waiting for inventory (${source})`,
        result: this.lootFlowDebugSnapshot(),
      })
    );
    await this.finishHuntLootSell({
      itemCount: 0,
      soldCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });
  }

  private markPendingHuntLootSell(): void {
    this.flow = {
      phase: "awaiting_inventory",
      startedAt: Date.now(),
      lastResult: this.flow.lastResult,
      lastError: null,
    };
    this.schedulePendingSellTimeout();
    this.ctx.session.notifyChange();
  }

  private clearPendingHuntLootSell(): void {
    this.clearPendingSellTimeout();
    if (this.flow.phase === "idle" && this.flow.startedAt == null) {
      return;
    }
    this.flow = {
      phase: "idle",
      startedAt: null,
      lastResult: this.flow.lastResult,
      lastError: this.flow.lastError,
    };
    this.ctx.session.notifyChange();
  }

  private failHuntLootSell(message: string): void {
    this.clearPendingSellTimeout();
    this.flow = {
      phase: "failed",
      startedAt: null,
      lastResult: this.flow.lastResult,
      lastError: message,
    };
    this.ctx.session.notifyChange();
    this.flow = {
      phase: "idle",
      startedAt: null,
      lastResult: this.flow.lastResult,
      lastError: message,
    };
  }

  private isPendingHuntLootSellTimedOut(): boolean {
    if (this.flow.startedAt == null) {
      return false;
    }
    return Date.now() - this.flow.startedAt >= PENDING_HUNT_LOOT_SELL_TIMEOUT_MS;
  }

  private emitAfterHuntLootSell(result: HuntLootSellResult): void {
    this.ctx.emit(lootSellFinishedEvent(result));
    if (!this.wantsHuntLootSplit()) {
      this.ctx.emit(lootPipelineFinishedEvent());
    }
  }

  private async finishHuntLootSell(result: HuntLootSellResult): Promise<void> {
    this.clearPendingSellTimeout();
    this.flow = {
      phase: "done",
      startedAt: null,
      lastResult: result,
      lastError: null,
    };
    this.ctx.session.notifyChange();

    const wantsSplit = this.wantsHuntLootSplit();
    if (!wantsSplit) {
      updatePlayerState(
        this.ctx.session,
        "idling",
        result.itemCount > 0 ? formatSellStatus(result) : "Hunt loot complete"
      );
    }

    this.emitAfterHuntLootSell(result);

    this.flow = {
      phase: "idle",
      startedAt: null,
      lastResult: result,
      lastError: null,
    };
  }

  private async tryRunPendingHuntLootSell(): Promise<boolean> {
    return this.traceFlow(
      "hunt-finish-sell",
      async (trace) => {
        const session = this.ctx.session;

        const pending = this.flow.phase === "awaiting_inventory";
        trace.guard("pending", pending, this.flow.phase);
        if (!pending) {
          trace.finish("skipped", { result: this.lootFlowDebugSnapshot() });
          return false;
        }

        const activelyHunting = this.huntState.isActivelyHunting();
        trace.guard(
          "actively_hunting",
          !activelyHunting,
          activelyHunting
            ? `hunt=${this.huntState.activeHuntId} party=${this.partyState.partyStatus}`
            : undefined
        );
        if (activelyHunting) {
          trace.finish("skipped", {
            error: "still hunting",
            result: this.lootFlowDebugSnapshot(),
          });
          return false;
        }

        const sellEnabled = this.shouldSellLootOnHuntFinish();
        trace.guard("sell_enabled", sellEnabled);
        if (!sellEnabled) {
          this.clearPendingHuntLootSell();
          if (isHandlingLoot(session)) {
            updatePlayerState(session, "idling", "Loot sell disabled");
          }
          trace.finish("skipped", { result: this.lootFlowDebugSnapshot() });
          return false;
        }

        const hasCandidates = this.hasInventoryLootToSell();
        const inventoryCount = this.inventoryState.inventoryItems.length;
        trace.guard(
          "has_candidates",
          hasCandidates,
          `candidates=${getInventoryLootCandidateEntries(this.inventoryLootContext()).length} inventoryTypes=${inventoryCount}`
        );
        if (!hasCandidates) {
          trace.finish("skipped", {
            error: "waiting for inventory candidates",
            result: this.lootFlowDebugSnapshot(),
          });
          return false;
        }

        this.clearPendingSellTimeout();
        this.setFlowPhase("selling");
        trace.setPhase("selling");
        updatePlayerState(session, "selling_loot", "Selling hunt loot…");
        const result = await this.sellLootOnHuntFinished();
        updatePlayerState(session, "selling_loot", formatSellStatus(result));
        await this.finishHuntLootSell(result);
        trace.finish("ok", { result });
        return true;
      },
      { stateSnapshot: this.lootFlowDebugSnapshot() }
    );
  }
}
