import { marketSnapshotBodyToData } from "../../binary/market-snapshot";
import type { MarketSnapshotBody } from "../../binary/types";
import {
  DEFAULT_MARKET_TAX_PERCENT,
  MARKET_FULL_SCAN_SAVE_EVERY_PAGES,
  isItemFilteredMarketSnapshot,
  parseMarketSnapshot,
  resolveEffectiveScanIntervalSec,
  resolveMarketSnapshotTotalPages,
} from "../../domain/market";
import {
  executeMarketBuyForNpcProfit,
  type ProfitActionState,
} from "../../market/profit-actions";
import { SendMessageTypes, type SendMessageType } from "../../protocol";
import type { CommandOutcome } from "../commands/bus";
import { BURST_COOLDOWN, delay, featureCooldown } from "../commands/cooldown";
import type { GameEvent } from "../events/types";
import type { FlowTraceRecorder } from "../events/flow-trace";
import { marketScanTickEvent } from "./events";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { MarketState } from "./states/market.state";
import type { InventoryState } from "./states/inventory.state";
import type { SessionState } from "./states/session.state";
import type { PartyState } from "./states/party.state";
import type { HuntState } from "./states/hunt.state";
import type { MarketProjection } from "../projections/types";

export const MARKET_SCAN_ALARM = "market-scan";

type FullScanProgress = {
  page?: number | null;
  totalPages?: number | null;
  status: string;
};

export type MarketFetchPageOptions = {
  page?: number;
  /** When set, filters the market list to this item and waits for a matching snapshot. */
  itemId?: number | null;
  force?: boolean;
  timeoutMs?: number;
  cooldownMs?: number;
};

export type MarketFlowPhase =
  | "idle"
  | "interval_scan"
  | "syncing_prices"
  | "full_scan"
  | "autobuy"
  | "done"
  | "failed";

export interface MarketFlowState {
  phase: MarketFlowPhase;
  startedAt: number | null;
  lastError: string | null;
}

type MarketUiFields = Pick<
  MarketProjection,
  | "marketScanStatus"
  | "marketFullScanStatus"
  | "huntLootSyncStatus"
  | "marketBoughtItems"
  | "marketMissedOffers"
  | "marketFullScanPage"
  | "marketFullScanTotalPages"
  | "marketFullScanCheckpointOrderId"
  | "recentMarketListings"
>;

export class MarketService extends Service {
  readonly id: FeatureId = "market";

  private flow: MarketFlowState = {
    phase: "idle",
    startedAt: null,
    lastError: null,
  };
  private fullScanCancelRequested = false;
  /** Item id of the in-flight filtered fetch — used by session for price attribution. */
  private inFlightItemId: number | null = null;

  private ui: MarketUiFields = {
    marketScanStatus: "",
    marketFullScanStatus: "",
    huntLootSyncStatus: "",
    marketBoughtItems: [],
    marketMissedOffers: [],
    marketFullScanPage: null,
    marketFullScanTotalPages: null,
    marketFullScanCheckpointOrderId: null,
    recentMarketListings: {},
  };

  constructor(
    ctx: ServiceContext,
    private readonly marketState: MarketState,
    private readonly inventoryState: InventoryState,
    private readonly sessionState: SessionState,
    private readonly partyState: PartyState,
    private readonly huntState: HuntState
  ) {
    super(ctx);
  }

  /** Derived from flow phase — kept for snapshot / callers that expect a busy flag. */
  get fullScanBusy(): boolean {
    return this.flow.phase === "full_scan";
  }

  /** Scoped domain snapshot for profit/loot-sell decision helpers. */
  private profitActionState(): ProfitActionState {
    return {
      settings: this.ctx.settings.get(),
      inventory: this.inventoryState.projection(),
      market: { marketPrices: this.marketState.prices },
      party: { partyStatus: this.partyState.partyStatus },
      hunt: { activeHuntId: this.huntState.activeHuntId },
      character: { goldCoins: this.sessionState.goldCoins },
    };
  }

  private setFlowPhase(
    phase: MarketFlowPhase,
    patch: Partial<Pick<MarketFlowState, "startedAt" | "lastError">> = {}
  ): void {
    this.flow = {
      phase,
      startedAt:
        patch.startedAt !== undefined
          ? patch.startedAt
          : phase === "idle"
            ? null
            : (this.flow.startedAt ?? Date.now()),
      lastError: patch.lastError !== undefined ? patch.lastError : this.flow.lastError,
    };
  }

  patchMarketUi(patch: Partial<MarketUiFields>): void {
    this.ui = { ...this.ui, ...patch };
  }

  sessionOverlay() {
    return {
      market: { ...this.ui },
    };
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.sessionOverlay(),
      marketFlow: { ...this.flow },
      fullScanBusy: this.fullScanBusy,
      fullScanCancelRequested: this.fullScanCancelRequested,
      inFlightItemId: this.inFlightItemId,
    };
  }

  start(): void {
    this.syncMarketScannerAlarm();
  }

  stop(): void {
    this.ctx.hostTimers?.clear(MARKET_SCAN_ALARM);
    this.cancelFullMarketScan();
  }

  getInFlightItemId(): number | null {
    return this.inFlightItemId;
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind === "market_scan_tick") {
      const settings = this.ctx.session.settings;
      if (!settings.marketScanEnabled && !event.manual) {
        return;
      }
      await this.sendIntervalMarketScan({ manual: event.manual });
      return;
    }

    if (event.kind === "market_snapshot_binary") {
      if (!this.ctx.session.settings.marketAutoBuyEnabled) {
        return;
      }
      const snapshot = parseMarketSnapshot(marketSnapshotBodyToData(event.data));
      await this.runAutoBuyOnMarketSnapshot(snapshot);
    }
  }

  /**
   * Fetch one market page, optionally filtered by itemId.
   * Serialized via `run("scan")` so interval scan, loot sync, and hunt-loot sync
   * never overlap market access.
   */
  async fetchPage(options: MarketFetchPageOptions = {}): Promise<CommandOutcome> {
    return this.run("scan", () => this.fetchPageExclusive(options));
  }

  /**
   * Fetch page 1 for each item id under a single scan lock (including inter-item delay).
   * Used by loot sell and per-hunt loot price sync.
   */
  async syncItemPrices(itemIds: number[], force = false): Promise<void> {
    const uniqueIds = [...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0))];
    if (!uniqueIds.length) {
      return;
    }

    return this.run("scan", () =>
      this.traceFlow(
        "sync-prices",
        async (trace) => {
          const connected = this.ctx.session.connected;
          trace.guard("connected", connected);
          trace.guard("forced", force, force ? "manual_or_sell" : "cache_ok");
          trace.guard("item_count", uniqueIds.length > 0, `${uniqueIds.length}`);
          if (!connected) {
            trace.finish("skipped", { error: "not connected" });
            return;
          }

          this.setFlowPhase("syncing_prices", { startedAt: Date.now(), lastError: null });
          trace.setPhase("syncing_prices");

          try {
            let fetched = 0;
            let skippedFresh = 0;
            for (const itemId of uniqueIds) {
              const prices = this.marketState.prices[itemId];
              const fresh =
                prices?.updatedAt != null && Date.now() - prices.updatedAt < 30_000;
              if (!force && fresh) {
                skippedFresh += 1;
                continue;
              }

              const outcome = await this.fetchPageExclusive({
                page: 1,
                itemId,
                force: !!force,
              });
              trace.command({
                type: "market_get_snapshot",
                success: outcome.success,
                skipped: outcome.skipped,
                skipReason: outcome.skipReason ?? (outcome.sent ? undefined : outcome.errorMessage),
                error: outcome.errorMessage,
              });
              fetched += 1;
              if (force) {
                await delay(BURST_COOLDOWN);
              }
            }
            this.setFlowPhase("done");
            this.setFlowPhase("idle");
            trace.finish("ok", {
              result: { itemCount: uniqueIds.length, fetched, skippedFresh, force },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setFlowPhase("failed", { lastError: message });
            this.setFlowPhase("idle");
            throw error;
          }
        },
        { stateSnapshot: { itemIds: uniqueIds.slice(0, 12), itemCount: uniqueIds.length, force } }
      )
    );
  }

  /** Trigger an immediate page-1 browse scan (manual). */
  scanNow(): Promise<void> {
    return this.sendIntervalMarketScan({ manual: true });
  }

  async sendIntervalMarketScan(options?: { manual?: boolean }): Promise<void> {
    return this.traceFlow("interval-scan", async (trace) => {
      const manual = !!options?.manual;
      const enabled = this.ctx.session.settings.marketScanEnabled;
      const connected = this.ctx.session.connected;
      const busy = this.fullScanBusy;

      trace.guard("enabled_or_manual", enabled || manual, manual ? "manual" : undefined);
      trace.guard("connected", connected);
      trace.guard("not_full_scan_busy", !busy);

      if (!enabled && !manual) {
        trace.finish("skipped", { error: "scanner disabled" });
        return;
      }
      if (!connected) {
        trace.finish("skipped", { error: "not connected" });
        return;
      }
      if (busy) {
        trace.finish("skipped", { error: "full scan busy" });
        return;
      }

      this.setFlowPhase("interval_scan", { startedAt: Date.now(), lastError: null });
      trace.setPhase("interval_scan");

      try {
        const outcome = await this.fetchPage({ page: 1 });
        if (!outcome.sent || outcome.skipped) {
          this.setIntervalScanStatus(
            outcome.skipReason
              ? `Interval scan skipped: ${outcome.skipReason}`
              : "Interval scan not sent"
          );
          trace.finish("skipped", {
            error: outcome.skipReason ?? "not sent",
            result: outcome,
          });
          this.setFlowPhase("idle");
          return;
        }
        const totalPages = this.totalPagesFromOutcome(outcome);
        this.setIntervalScanStatus(
          totalPages != null ? `Scanned page 1/${totalPages}` : "Scanned page 1"
        );
        this.setFlowPhase("done");
        this.setFlowPhase("idle");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.setIntervalScanStatus(`Interval scan error: ${message}`);
        this.setFlowPhase("failed", { lastError: message });
        this.setFlowPhase("idle");
        throw error;
      }
    });
  }

  /** Called synchronously by session.ts on binary market snapshots — updates interval scan status. */
  noteIntervalScanSnapshot(data: MarketSnapshotBody): void {
    if (!this.ctx.session.settings.marketScanEnabled) {
      return;
    }
    const snapshot = parseMarketSnapshot(marketSnapshotBodyToData(data));
    if (snapshot.page !== 1 || isItemFilteredMarketSnapshot(snapshot)) {
      return;
    }
    const totalPages = resolveMarketSnapshotTotalPages(snapshot) ?? null;
    this.setIntervalScanStatus(
      totalPages != null ? `Scanned page 1/${totalPages}` : "Scanned page 1"
    );
  }

  /** Called synchronously by session.ts on binary market snapshots — updates full scan progress. */
  noteFullScanSnapshot(data: MarketSnapshotBody): void {
    if (!this.fullScanBusy) {
      return;
    }
    const snapshot = parseMarketSnapshot(marketSnapshotBodyToData(data));
    if (isItemFilteredMarketSnapshot(snapshot)) {
      return;
    }
    const totalPages = resolveMarketSnapshotTotalPages(snapshot) ?? null;
    this.setFullScanProgress({
      page: snapshot.page,
      totalPages,
      status:
        totalPages != null
          ? `Scanned page ${snapshot.page}/${totalPages}`
          : `Scanned page ${snapshot.page}`,
    });
  }

  async runFullMarketScan(options?: { onFlush?: () => Promise<void> }): Promise<void> {
    return this.traceFlow("full-scan", async (trace) => {
      const connected = this.ctx.session.connected;
      const alreadyBusy = this.fullScanBusy;
      trace.guard("connected", connected);
      trace.guard("not_busy", !alreadyBusy);

      if (!connected) {
        trace.finish("skipped", { error: "not connected" });
        return;
      }
      if (alreadyBusy) {
        trace.finish("skipped", { error: "full scan already running" });
        return;
      }

      this.fullScanCancelRequested = false;
      this.setFlowPhase("full_scan", { startedAt: Date.now(), lastError: null });
      trace.setPhase("full_scan");

      try {
        this.setFullScanProgress({
          page: null,
          totalPages: null,
          status: "Requesting page 1…",
        });

        const first = await this.fetchPage({ page: 1, force: true });
        const totalPages = this.totalPagesFromOutcome(first);

        if (totalPages == null) {
          this.setFullScanProgress({
            page: null,
            totalPages: null,
            status: "Full scan paused — timed out waiting for page 1 snapshot",
          });
          this.setFlowPhase("failed", { lastError: "page 1 timeout" });
          this.setFlowPhase("idle");
          trace.finish("timeout", { error: "page 1 timeout" });
          return;
        }

        if (totalPages <= 1) {
          this.setFullScanProgress({
            page: null,
            totalPages,
            status: "Full scan complete — only page 1 exists",
          });
          this.setFlowPhase("done");
          this.setFlowPhase("idle");
          return;
        }

        for (let page = 2; page <= totalPages; page += 1) {
          if (this.fullScanCancelRequested) {
            trace.guard("cancel_requested", true);
            this.setFullScanProgress({ page: null, totalPages, status: "" });
            this.setFlowPhase("idle");
            trace.finish("skipped", { error: "cancelled" });
            return;
          }

          if (!this.ctx.session.connected) {
            this.setFullScanProgress({
              page,
              totalPages,
              status: `Full scan paused at page ${page}/${totalPages} — disconnected`,
            });
            this.setFlowPhase("failed", { lastError: "disconnected" });
            this.setFlowPhase("idle");
            trace.finish("skipped", { error: "disconnected" });
            return;
          }

          await delay(BURST_COOLDOWN);
          await this.fetchPage({ page, force: true });
          this.setFullScanProgress({
            page,
            totalPages,
            status: `Requested page ${page}/${totalPages}`,
          });

          if ((page - 1) % MARKET_FULL_SCAN_SAVE_EVERY_PAGES === 0) {
            await options?.onFlush?.();
          }
        }

        await delay(BURST_COOLDOWN);
        await options?.onFlush?.();

        const itemCount = Object.keys(this.marketState.prices).length;
        this.setFullScanProgress({
          page: null,
          totalPages,
          status: `Full scan complete — ${itemCount.toLocaleString()} items cached`,
        });
        this.setFlowPhase("done");
        this.setFlowPhase("idle");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.setFullScanProgress({
          page: this.ui.marketFullScanPage,
          totalPages: this.ui.marketFullScanTotalPages,
          status: `Full scan paused — error: ${message}`,
        });
        this.setFlowPhase("failed", { lastError: message });
        this.setFlowPhase("idle");
        throw error;
      }
    });
  }

  cancelFullMarketScan(): void {
    this.fullScanCancelRequested = true;
    this.setFullScanProgress({ page: null, status: "" });
  }

  async runAutoBuyOnMarketSnapshot(
    snapshot: ReturnType<typeof parseMarketSnapshot>
  ): Promise<void> {
    return this.run("autobuy", () =>
      this.traceFlow("autobuy", async (trace) => {
        await this.maybeAutoBuyProfitableOrders(snapshot, trace);
      })
    );
  }

  /** Schedule or clear the interval market scan via host timers. */
  syncMarketScannerAlarm(): void {
    const timers = this.ctx.hostTimers;
    if (!timers) {
      return;
    }

    const session = this.ctx.session;
    if (!session.settings.marketScanEnabled) {
      timers.clear(MARKET_SCAN_ALARM);
      this.cancelFullMarketScan();
      this.patchMarketUi({ marketScanStatus: "Scanner off" });
      this.refreshView();
      return;
    }

    const intervalSec = resolveEffectiveScanIntervalSec(this.ctx.settings.get());
    timers.scheduleRepeating(MARKET_SCAN_ALARM, intervalSec, () => {
      void this.ctx.session.dispatchFeatureEvent(marketScanTickEvent());
    });
    this.patchMarketUi({
      marketScanStatus: `Scanner scheduled — page 1 every ${session.settings.marketScanIntervalSec}s`,
    });
    this.refreshView();
  }

  private refreshView(): void {
    this.ctx.session.notifyChange();
  }

  private async fetchPageExclusive(options: MarketFetchPageOptions): Promise<CommandOutcome> {
    const page = options.page ?? 1;
    const itemId =
      options.itemId != null && options.itemId > 0 ? options.itemId : null;

    if (itemId != null) {
      this.inFlightItemId = itemId;
    }

    try {
      return await this.ctx.session.commands.run(
        SendMessageTypes.MARKET_GET_SNAPSHOT,
        {
          page,
          filters: {
            itemId,
            slot: null,
            vocation: null,
            rarity: null,
          },
        },
        {
          force: options.force === true,
          waitForResponse: true,
          timeoutMs: options.timeoutMs,
          cooldownMs: options.cooldownMs ?? featureCooldown("market.intervalScan"),
          marketContext: {
            page,
            itemId: itemId ?? undefined,
          },
        }
      );
    } finally {
      this.inFlightItemId = null;
    }
  }

  private totalPagesFromOutcome(outcome: CommandOutcome): number | null {
    if (!outcome.response?.data) {
      return null;
    }
    const snapshot = parseMarketSnapshot(outcome.response.data as never);
    return resolveMarketSnapshotTotalPages(snapshot) ?? null;
  }

  private setFullScanProgress(update: FullScanProgress): void {
    this.patchMarketUi({
      ...(update.page !== undefined ? { marketFullScanPage: update.page } : {}),
      ...(update.totalPages !== undefined ? { marketFullScanTotalPages: update.totalPages } : {}),
      marketFullScanStatus: update.status,
    });
    this.refreshView();
  }

  private setIntervalScanStatus(status: string): void {
    this.patchMarketUi({ marketScanStatus: status });
    this.refreshView();
  }

  private async maybeAutoBuyProfitableOrders(
    snapshot: ReturnType<typeof parseMarketSnapshot>,
    trace?: FlowTraceRecorder
  ): Promise<void> {
    const session = this.ctx.session;
    const enabled = session.settings.marketAutoBuyEnabled;
    trace?.guard("auto_buy_enabled", enabled);
    if (!enabled) {
      trace?.finish("skipped", { error: "auto-buy disabled" });
      return;
    }

    this.setFlowPhase("autobuy", { startedAt: Date.now(), lastError: null });
    trace?.setPhase("autobuy");

    try {
      const itemIds = [...new Set((snapshot.sellOrders ?? []).map((order) => order.itemId))];

      for (const itemId of itemIds) {
        const before = this.ui.marketBoughtItems.length;
        const pricing = {
          taxPercent: DEFAULT_MARKET_TAX_PERCENT,
          undercutGold: session.settings.marketUndercutGold ?? 1,
        };
        await executeMarketBuyForNpcProfit(itemId, snapshot, pricing, {
          sendJson: (json) => session.commands.sendRaw(json),
          delay,
          getState: () => this.profitActionState(),
          appendBoughtItem: (entry) => {
            this.patchMarketUi({
              marketBoughtItems: [entry, ...this.ui.marketBoughtItems].slice(0, 100),
            });
            this.refreshView();
          },
          appendMissedOffer: (entry) => {
            this.patchMarketUi({
              marketMissedOffers: [entry, ...this.ui.marketMissedOffers].slice(0, 100),
            });
            this.refreshView();
          },
          runCommand: async (type, params, options) => {
            const outcome = await session.commands.run(
              type as SendMessageType,
              params as never,
              {
                force: options?.force,
                cooldownMs: featureCooldown("market.autoBuy"),
              }
            );
            return {
              sent: outcome.sent,
              success: outcome.success,
              errorMessage: outcome.errorMessage,
            };
          },
        });
        const after = this.ui.marketBoughtItems.length;
        if (after > before) {
          break;
        }
      }
      this.setFlowPhase("done");
      this.setFlowPhase("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setFlowPhase("failed", { lastError: message });
      this.setFlowPhase("idle");
      throw error;
    }
  }
}
