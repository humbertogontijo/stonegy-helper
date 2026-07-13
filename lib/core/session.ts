import type { BotState } from "../types";
import { appendLog } from "./projections/logs";
import { parseMessage, ReceiveMessageTypes, SendMessageTypes } from "../protocol";
import { shouldAttributeMarketSnapshotToItem } from "../market/attribution";
import { MarketService } from "./services/market.service";
import { recordDebugWireMessage, emptyDebugTelemetry } from "./events/debug-telemetry";
import { asStonegyMessage, normalizeWireMessage } from "./events/normalize";
import type { GameEvent } from "./events/types";
import { CommandBus, type CommandOutcome } from "./commands/bus";
import { toBotState, type TelemetryState } from "./projections/to-bot-state";
import type { ConnectionProjection, SessionView } from "./projections/types";
import { defaultSettings, type Settings } from "./settings";
import type { Transport, WireMessage } from "./transport";
import { ServiceRegistry } from "./services/registry";
import { registerDefaultServices } from "./services/register";
import { applyViewPatchToServices } from "./services/view-patch";
import type { FeatureMasters, HostTimers } from "./services/types";
import type { MarketState } from "./services/states/market.state";
import type { SessionViewPatch } from "./projections/patch";
import {
  INTERACTIVE_COMMAND_TIMEOUT_MS,
  isInActiveHunt,
  isPartyReady,
  isQuestReady,
} from "./context-sync";
import { awaitSessionReady } from "./readiness";

export interface GameSessionOptions {
  settings?: Partial<Settings>;
  onChange?: (state: ReturnType<typeof toBotState>) => void;
  /** Test override for market snapshot attribution; defaults to MarketService in-flight id. */
  marketSnapshotRequestedItemId?: () => number | null;
  /** Feature master toggles; defaults to all enabled. */
  featureMasters?: FeatureMasters;
  /** Host timers for repeating alarms (extension chrome.alarms, CLI setInterval, or omit). */
  hostTimers?: HostTimers;
}

interface EventWaiter {
  matcher: (event: GameEvent, view: SessionView) => boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Process owner: transport, settings, commands, service registry.
 * Domain game data lives on *State services; `view` is a projected snapshot for
 * CommandBus / tests / toBotState — not a store of domain fields.
 */
export class GameSession {
  settings: Settings;
  readonly commands: CommandBus;
  readonly telemetry: TelemetryState = { logs: [], debug: emptyDebugTelemetry() };
  readonly services: ServiceRegistry;

  private connection: ConnectionProjection = { connected: false, readyState: 3 };
  /** Cached projection; invalidated when domain/core state changes. */
  private projectionCache: SessionView | null = null;

  private transport: Transport;
  private messageChain = Promise.resolve();
  /** Work scheduled via deferFromWire — drained after the wire chain. */
  private deferredChain = Promise.resolve();
  private eventWaiters: EventWaiter[] = [];
  private marketSnapshotRequestedItemId?: () => number | null;
  private onChange?: (state: ReturnType<typeof toBotState>) => void;
  private stopped = false;
  private readinessChain = Promise.resolve();

  constructor(transport: Transport, options: GameSessionOptions = {}) {
    this.transport = transport;
    this.settings = { ...defaultSettings(), ...options.settings };
    this.onChange = options.onChange;
    this.marketSnapshotRequestedItemId = options.marketSnapshotRequestedItemId;
    this.commands = new CommandBus(transport, () => this.view);
    this.services = new ServiceRegistry({
      session: this,
      masters: options.featureMasters,
      hostTimers: options.hostTimers,
    });
    registerDefaultServices(this.services);

    transport.onConnectionChange((connected, readyState) => {
      this.connection = {
        connected,
        readyState: readyState ?? (connected ? 1 : 3),
      };
      this.invalidateProjection();
      this.emitChange();
      if (!connected) {
        this.services.onDisconnected();
      }
    });

    transport.onMessage((wire) => {
      this.messageChain = this.messageChain
        .then(() => this.handleWireMessage(wire))
        .catch((error) => {
          console.error(
            `[session] message handler error: ${error instanceof Error ? error.message : error}`
          );
        });
    });
  }

  /**
   * Assembled game projection from domain *State + core bot fields.
   * Assigning replaces domain state (for tests). Prefer updateView for patches.
   */
  get view(): SessionView {
    if (!this.projectionCache) {
      this.projectionCache = this.services.projectSessionView(this.connection);
    }
    return this.projectionCache;
  }

  set view(next: SessionView) {
    this.connection = next.connection;
    this.services.seedFromProjection(next);
    this.projectionCache = this.services.projectSessionView(this.connection);
  }

  invalidateProjection(): void {
    this.projectionCache = null;
  }

  /** Transport-level connection status (not domain data — owned by the session). */
  get connected(): boolean {
    return this.connection.connected;
  }

  get botState(): BotState {
    return {
      ...toBotState(this.settings, this.view, this.telemetry),
      serviceState: this.services.serviceState(),
      featureMasters: this.services.getMasters(),
    };
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.emitChange();
  }

  updateView(patch: SessionViewPatch): void {
    const next = applyViewPatchToServices(this.services, this.view, patch);
    if (patch.connection) {
      this.connection = next.connection;
    }
    this.projectionCache = next;
    this.emitChange();
  }

  /** Notify onChange listeners after service-scoped field updates. */
  notifyChange(): void {
    this.invalidateProjection();
    this.emitChange();
  }

  async syncPartyContext(options: {
    force?: boolean;
    timeoutMs?: number;
    waitForResponse?: boolean;
  } = {}): Promise<CommandOutcome> {
    if (!options.force && isPartyReady(this)) {
      return { sent: false, skipped: true, skipReason: "ready" };
    }

    return this.commands.run(SendMessageTypes.PARTY_GET_SNAPSHOT, {}, {
      force: true,
      timeoutMs: options.timeoutMs ?? INTERACTIVE_COMMAND_TIMEOUT_MS,
      waitForResponse: options.waitForResponse,
    });
  }

  async syncQuestContext(options: {
    force?: boolean;
    timeoutMs?: number;
    waitForResponse?: boolean;
  } = {}): Promise<CommandOutcome> {
    if (!options.force && isQuestReady(this)) {
      return { sent: false, skipped: true, skipReason: "ready" };
    }

    if (isInActiveHunt(this)) {
      return { sent: false, skipped: true, skipReason: "during_hunt" };
    }

    const timeoutMs = options.timeoutMs ?? INTERACTIVE_COMMAND_TIMEOUT_MS;

    return this.commands.run(
      SendMessageTypes.QUEST_GET_SNAPSHOT,
      {},
      {
        force: true,
        timeoutMs,
        waitForResponse: options.waitForResponse,
      }
    );
  }

  async ensureSessionReady(): Promise<void> {
    this.readinessChain = this.readinessChain
      .then(() => awaitSessionReady(this))
      .catch((error) => {
        console.error(
          `[session] readiness error: ${error instanceof Error ? error.message : error}`
        );
      });
    return this.readinessChain;
  }

  async drainMessages(): Promise<void> {
    await this.messageChain;
    await this.deferredChain;
  }

  /**
   * Run `fn` after the current wire handler finishes, without appending `fn` onto
   * the message chain. Command waits inside `fn` can then be resolved by later
   * wire messages (awaiting on the chain itself deadlocks notifyResponse).
   */
  deferFromWire(fn: () => Promise<void>): void {
    const task = this.messageChain.then(() => fn());
    this.deferredChain = this.deferredChain.then(() => task).then(
      () => undefined,
      () => undefined
    );
    void task.catch((error) => {
      console.error(
        `[session] deferred task error: ${error instanceof Error ? error.message : error}`
      );
    });
  }

  async dispatchFeatureEvent(event: GameEvent): Promise<void> {
    await this.services.dispatch(event);
  }

  async start(): Promise<void> {
    await this.transport.connect();
    // Connection state comes from transport.onConnectionChange (page-bridge must
    // not be marked connected until the game socket is actually open).
    this.invalidateProjection();
    this.emitChange();
    this.services.startAll();
    await awaitSessionReady(this);
  }

  stop(): void {
    this.stopped = true;
    this.services.stopAll();
    this.commands.clear();
    const waiters = [...this.eventWaiters];
    this.eventWaiters.length = 0;
    for (const entry of waiters) {
      entry.reject(new Error("Session stopped"));
    }
    this.transport.close();
  }

  waitFor(
    matcher: (event: GameEvent, view: SessionView) => boolean,
    timeoutMs = 10_000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const entry: EventWaiter = { matcher, resolve, reject };
      const timeout = setTimeout(() => {
        const index = this.eventWaiters.indexOf(entry);
        if (index !== -1) {
          this.eventWaiters.splice(index, 1);
        }
        reject(new Error("Timed out waiting for event"));
      }, timeoutMs);

      entry.resolve = () => {
        clearTimeout(timeout);
        resolve();
      };
      entry.reject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };

      this.eventWaiters.push(entry);
    });
  }

  private emitChange(): void {
    this.onChange?.(this.botState);
  }

  private notifyEventWaiters(event: GameEvent): void {
    const view = this.view;
    for (let index = this.eventWaiters.length - 1; index >= 0; index -= 1) {
      const entry = this.eventWaiters[index];
      if (!entry.matcher(event, view)) {
        continue;
      }
      this.eventWaiters.splice(index, 1);
      entry.resolve();
    }
  }

  private resolveMarketSnapshotRequestedItemId(
    data: Record<string, unknown> | undefined
  ): number | null {
    const inFlight =
      this.marketSnapshotRequestedItemId?.() ??
      this.services.tryGet<MarketService>("market")?.getInFlightItemId() ??
      null;
    if (inFlight == null || inFlight <= 0) {
      return null;
    }
    return shouldAttributeMarketSnapshotToItem(data, inFlight) ? inFlight : null;
  }

  private async handleWireMessage(wire: WireMessage): Promise<void> {
    if (this.stopped) {
      return;
    }

    recordDebugWireMessage(wire, this.telemetry.debug);

    const events = normalizeWireMessage(wire);
    const parsed =
      wire.opcode === 1
        ? parseMessage(wire.data)
        : asStonegyMessage(
            events[0] ?? { kind: "connection", connected: false, readyState: 3 }
          );

    if (this.settings.loggingEnabled && wire.opcode === 1 && parsed) {
      const botState = toBotState(this.settings, this.view, this.telemetry);
      const withLog = appendLog(
        botState,
        { direction: wire.direction, opcode: wire.opcode, data: wire.data },
        parsed
      );
      this.telemetry.logs = withLog.logs;
    }

    for (const event of events) {
      if (event.kind === "connection") {
        this.connection = {
          connected: event.connected,
          readyState: event.readyState,
        };
        this.invalidateProjection();
        continue;
      }

      if (wire.direction === "receive") {
        const stonegyMessage = asStonegyMessage(event);
        if (stonegyMessage?.type === ReceiveMessageTypes.MARKET_SNAPSHOT) {
          const marketState = this.services.tryGetDomain<MarketState>("marketState");
          if (marketState) {
            marketState.requestedItemId = this.resolveMarketSnapshotRequestedItemId(
              stonegyMessage.data
            );
          }
        }

        await this.services.applyDomains(event);

        if (stonegyMessage) {
          this.commands.notifyResponse(stonegyMessage, this.view);
          this.notifyEventWaiters(event);
        } else if (event.kind === "inventory_snapshot") {
          this.notifyEventWaiters(event);
          // Quick-sell waiters listen for gold_balance; inventory snapshots also carry gold.
          if (typeof event.data.goldCoins === "number") {
            this.commands.notifyResponse(
              {
                type: ReceiveMessageTypes.GOLD_BALANCE,
                data: { goldCoins: event.data.goldCoins },
              },
              this.view
            );
          }
        }
      } else if (event.kind === "json") {
        await this.services.applyDomains(event);
      }
    }

    this.emitChange();

    if (wire.direction !== "receive") {
      return;
    }

    const deferredSnapshotEvents: GameEvent[] = [];

    for (const event of events) {
      if (event.kind === "market_snapshot_binary") {
        const market = this.services.tryGet<MarketService>("market");
        market?.noteIntervalScanSnapshot(event.data);
        market?.noteFullScanSnapshot(event.data);
        deferredSnapshotEvents.push(event);
        continue;
      }

      await this.services.applyCores(event);
    }

    if (deferredSnapshotEvents.length) {
      void Promise.resolve()
        .then(async () => {
          for (const event of deferredSnapshotEvents) {
            await this.dispatchFeatureEvent(event);
          }
        })
        .catch((error) => {
          console.error(
            `[session] deferred snapshot error: ${error instanceof Error ? error.message : error}`
          );
        });
    }
  }
}
