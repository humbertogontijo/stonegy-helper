import type { GameEvent } from "../events/types";
import {
  startFlowTrace,
  type FlowTrace,
  type FlowTraceRecorder,
  type FlowTraceStartOptions,
} from "../events/flow-trace";
import { recordFlowTrace, upsertActiveFlow } from "../events/debug-telemetry";
import type { GameSession } from "../session";
import type { SessionViewPatch } from "../projections/patch";
import type { KeyedLocks } from "./locks";
import type { SettingsStore } from "./stores";
import type { FeatureId, HostTimers, ServiceId } from "./types";

export interface ServiceContext {
  session: GameSession;
  settings: SettingsStore;
  locks: KeyedLocks;
  /** Re-enters registry dispatch (async, queued after current dispatch). */
  emit(event: GameEvent): void;
  isMasterEnabled(id: FeatureId): boolean;
  /** Optional host timers (extension alarms / CLI intervals). */
  hostTimers?: HostTimers;
}

type TraceOptions = Omit<FlowTraceStartOptions, "serviceId" | "flow" | "onChange">;

export abstract class Service {
  abstract readonly id: ServiceId;

  constructor(protected readonly ctx: ServiceContext) {}

  /** Master gating is applied by the registry for FeatureId cores; domain states always run. */
  abstract onEvent(event: GameEvent): Promise<void>;

  /** Optional lifecycle for timers/alarms. */
  start(): void {}

  stop(): void {}

  /**
   * Bot-only SessionView fields owned by this service (merged in projectSessionView).
   * Domain *State classes use projection() instead.
   */
  sessionOverlay(): SessionViewPatch {
    return {};
  }

  /** Serializable snapshot for UI / debug (includes sessionOverlay by default). */
  snapshot(): Record<string, unknown> {
    return { ...this.sessionOverlay() };
  }

  protected run<T>(lock: string, fn: () => Promise<T>): Promise<T> {
    return this.ctx.locks.runExclusive(`${this.id}:${lock}`, fn);
  }

  protected beginTrace(flow: string, options?: TraceOptions): FlowTraceRecorder {
    const debug = this.ctx.session.telemetry.debug;
    let lastNotifyAt = 0;
    return startFlowTrace({
      serviceId: this.id,
      flow,
      ...options,
      onChange: (trace) => {
        upsertActiveFlow(debug, trace);
        const now = Date.now();
        if (now - lastNotifyAt >= 250) {
          lastNotifyAt = now;
          this.ctx.session.notifyChange();
        }
      },
    });
  }

  protected recordTrace(trace: FlowTrace): void {
    recordFlowTrace(this.ctx.session.telemetry.debug, trace);
  }

  /**
   * Runs `fn` under a flow trace and records it when finished.
   * Call `trace.finish("skipped"|"timeout"|"failed"|"ok")` yourself when not default ok.
   * In-progress snapshots are published to `debug.activeFlows` for copy-while-stuck.
   */
  protected async traceFlow<T>(
    flow: string,
    fn: (trace: FlowTraceRecorder) => Promise<T>,
    options?: TraceOptions
  ): Promise<T> {
    const trace = this.beginTrace(flow, options);
    try {
      const result = await fn(trace);
      this.recordTrace(
        trace.snapshot().outcome != null ? trace.snapshot() : trace.finish("ok", { result })
      );
      this.ctx.session.notifyChange();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordTrace(
        trace.snapshot().outcome != null
          ? trace.snapshot()
          : trace.finish("failed", { error: message })
      );
      this.ctx.session.notifyChange();
      throw error;
    }
  }
}

/** Marker base for domain projection services (always dispatched). */
export abstract class DomainState extends Service {
  abstract readonly id: import("./types").DomainStateId;
}
