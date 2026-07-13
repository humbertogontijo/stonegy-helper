export type FlowGuard = { name: string; passed: boolean; detail?: string };

export type FlowCommandRecord = {
  type: string;
  success?: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
};

export type FlowTrace = {
  id: string;
  serviceId: string;
  flow: string;
  startedAt: number;
  finishedAt?: number;
  phase?: string;
  guards: FlowGuard[];
  commands: FlowCommandRecord[];
  settingsSnapshot?: Record<string, unknown>;
  stateSnapshot?: Record<string, unknown>;
  outcome?: "ok" | "skipped" | "failed" | "timeout";
  result?: unknown;
  error?: string;
};

let flowTraceCounter = 0;

function nextFlowTraceId(): string {
  flowTraceCounter += 1;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `flow-${flowTraceCounter}`;
}

export interface FlowTraceStartOptions {
  serviceId: string;
  flow: string;
  phase?: string;
  settingsSnapshot?: Record<string, unknown>;
  stateSnapshot?: Record<string, unknown>;
  startedAt?: number;
  /** Called whenever the in-progress trace mutates (for live debug copy). */
  onChange?: (trace: FlowTrace) => void;
}

/** Mutable recorder for a single service flow run. */
export class FlowTraceRecorder {
  private readonly trace: FlowTrace;
  private finished = false;
  private readonly onChange?: (trace: FlowTrace) => void;

  constructor(options: FlowTraceStartOptions) {
    this.onChange = options.onChange;
    this.trace = {
      id: nextFlowTraceId(),
      serviceId: options.serviceId,
      flow: options.flow,
      startedAt: options.startedAt ?? Date.now(),
      phase: options.phase,
      guards: [],
      commands: [],
      settingsSnapshot: options.settingsSnapshot,
      stateSnapshot: options.stateSnapshot,
    };
    this.emitChange();
  }

  get id(): string {
    return this.trace.id;
  }

  setPhase(phase: string): void {
    this.trace.phase = phase;
    this.emitChange();
  }

  guard(name: string, passed: boolean, detail?: string): void {
    this.trace.guards.push({ name, passed, detail });
    this.emitChange();
  }

  command(record: FlowCommandRecord): void {
    this.trace.commands.push(record);
    this.emitChange();
  }

  setStateSnapshot(stateSnapshot: Record<string, unknown>): void {
    this.trace.stateSnapshot = stateSnapshot;
    this.emitChange();
  }

  /** Immutable snapshot of the in-progress (or finished) trace. */
  snapshot(): FlowTrace {
    return {
      ...this.trace,
      guards: [...this.trace.guards],
      commands: [...this.trace.commands],
    };
  }

  finish(
    outcome: NonNullable<FlowTrace["outcome"]>,
    options?: { result?: unknown; error?: string; finishedAt?: number }
  ): FlowTrace {
    if (this.finished) {
      return this.snapshot();
    }
    this.finished = true;
    this.trace.outcome = outcome;
    this.trace.finishedAt = options?.finishedAt ?? Date.now();
    if (options?.result !== undefined) {
      this.trace.result = options.result;
    }
    if (options?.error !== undefined) {
      this.trace.error = options.error;
    }
    return this.snapshot();
  }

  private emitChange(): void {
    if (this.finished) {
      return;
    }
    this.onChange?.(this.snapshot());
  }
}

export function startFlowTrace(options: FlowTraceStartOptions): FlowTraceRecorder {
  return new FlowTraceRecorder(options);
}
