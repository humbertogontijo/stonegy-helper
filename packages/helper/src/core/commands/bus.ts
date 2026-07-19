import {
  remainingCooldownMs,
  resolveCommandCooldown,
  delay,
  RESPONSE_TIMEOUT_MS,
} from "./cooldown";
import {
  buildMessage,
  formatResponseTypesForSend,
  getResponseTypesForSend,
  matchResponse,
} from "../../protocol";
import type { SendMessageType, SendPayloadMap, StonegyMessage } from "../../protocol";
import type { SessionView } from "../projections/types";
import type { Transport } from "../transport";
import { isActionResultSuccess, readActionResultMessage } from "./registry";

/** Extra attempts after a response timeout (1 → 2 total tries). */
export const DEFAULT_COMMAND_TIMEOUT_RETRIES = 1;

export interface CommandOutcome {
  sent: boolean;
  skipped?: boolean;
  skipReason?: string;
  response?: StonegyMessage;
  success?: boolean;
  errorMessage?: string;
}

export interface CommandRunOptions {
  /** Bypass command cooldown wait (urgent / user-forced sends). */
  force?: boolean;
  waitForResponse?: boolean;
  timeoutMs?: number;
  /** Override the default COMMAND_COOLDOWNS entry for this send. */
  cooldownMs?: number;
  /**
   * Extra attempts after a response timeout.
   * Defaults to {@link DEFAULT_COMMAND_TIMEOUT_RETRIES}. Use `0` to disable.
   */
  retries?: number;
}

export type CommandDebugStatus = "ok" | "failed" | "timeout" | "sent" | "error";

/** Debug telemetry hook fired after each send attempt settles. */
export interface CommandDebugRecord {
  at: number;
  finishedAt: number;
  commandId: string;
  expectedResponseType?: string;
  sent: { type: string; data?: unknown };
  response?: StonegyMessage;
  status: CommandDebugStatus;
  success?: boolean;
  errorMessage?: string;
  attempt: number;
}

export interface CommandBusOptions {
  onCommandComplete?: (record: CommandDebugRecord) => void;
}

interface PendingWaiter {
  commandId: string;
  match: (message: StonegyMessage, view: SessionView) => boolean;
  resolve: (message: StonegyMessage) => void;
  reject: (error: Error) => void;
  disarm: () => void;
}

function isTimeoutErrorMessage(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("Timed out waiting for");
}

function statusForOutcome(
  outcome: CommandOutcome,
  waitedForResponse: boolean
): CommandDebugStatus {
  if (!outcome.sent) {
    return "error";
  }
  if (isTimeoutErrorMessage(outcome.errorMessage)) {
    return "timeout";
  }
  if (!waitedForResponse) {
    return "sent";
  }
  if (outcome.success === true) {
    return "ok";
  }
  return "failed";
}

export class CommandBus {
  /** Serializes wire sends only; response waits run independently. */
  private sendChain = Promise.resolve();
  private cooldowns = new Map<string, number>();
  private pending: PendingWaiter[] = [];
  private onCommandComplete?: (record: CommandDebugRecord) => void;

  constructor(
    private transport: Transport,
    private getView: () => SessionView,
    options: CommandBusOptions = {}
  ) {
    this.onCommandComplete = options.onCommandComplete;
  }

  notifyResponse(message: StonegyMessage, view: SessionView): void {
    // Oldest matching waiter only — concurrent waits must not all settle on one message.
    for (let index = 0; index < this.pending.length; index += 1) {
      const entry = this.pending[index];
      if (!entry.match(message, view)) {
        continue;
      }
      this.pending.splice(index, 1);
      entry.resolve(message);
      return;
    }
  }

  run<T extends SendMessageType>(
    type: T,
    data: SendPayloadMap[T],
    options: CommandRunOptions = {}
  ): Promise<CommandOutcome> {
    return this.executeRun(type, data, options);
  }

  sendRaw(json: string): Promise<void> {
    return this.enqueueSend(() => this.transport.send(1, json));
  }

  private enqueueSend<T>(send: () => Promise<T>): Promise<T> {
    const result = this.sendChain.then(send);
    this.sendChain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async executeRun<T extends SendMessageType>(
    type: T,
    data: SendPayloadMap[T],
    options: CommandRunOptions = {}
  ): Promise<CommandOutcome> {
    const retries = options.retries ?? DEFAULT_COMMAND_TIMEOUT_RETRIES;
    const maxAttempts = 1 + Math.max(0, retries);
    let last: CommandOutcome = {
      sent: false,
      success: false,
      errorMessage: "Command failed",
    };

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      last = await this.executeAttempt(type, data, {
        ...options,
        // Already waited on the first attempt; don't stack cooldowns between retries.
        force: options.force || attempt > 0,
      }, attempt + 1);
      if (!isTimeoutErrorMessage(last.errorMessage)) {
        return last;
      }
    }

    return last;
  }

  private async executeAttempt<T extends SendMessageType>(
    type: T,
    data: SendPayloadMap[T],
    options: CommandRunOptions,
    attempt: number
  ): Promise<CommandOutcome> {
    const cooldownMs = options.cooldownMs ?? resolveCommandCooldown(type);
    const expectedResponseType = formatResponseTypesForSend(type) ?? undefined;
    const shouldWait =
      options.waitForResponse !== false && getResponseTypesForSend(type).length > 0;
    const sent = { type, data };
    const at = Date.now();
    let outcome: CommandOutcome;

    type WaiterHandle = {
      promise: Promise<StonegyMessage>;
      cancel: (error: Error) => void;
    };

    try {
      const json = buildMessage(type, data);
      // Cooldown + send share the chain so concurrent same-type runs can't both skip the wait.
      const waiter = await this.enqueueSend(async (): Promise<WaiterHandle | null> => {
        if (!options.force && cooldownMs != null) {
          const remaining = remainingCooldownMs(this.cooldowns.get(type), cooldownMs, Date.now());
          if (remaining > 0) {
            await delay(remaining);
          }
        }
        const armed = shouldWait
          ? this.armResponseWaiter(sent, options.timeoutMs ?? RESPONSE_TIMEOUT_MS)
          : null;
        await this.transport.send(1, json);
        this.cooldowns.set(type, Date.now());
        return armed;
      });

      if (!waiter) {
        outcome = { sent: true };
      } else {
        try {
          const response = await waiter.promise;
          const success = isActionResultSuccess(response);
          outcome = {
            sent: true,
            response,
            success,
            errorMessage: success
              ? undefined
              : readActionResultMessage(response) ?? "Command failed",
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          outcome = { sent: true, success: false, errorMessage: message };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome = { sent: false, success: false, errorMessage: message };
    }

    this.onCommandComplete?.({
      at,
      finishedAt: Date.now(),
      commandId: type,
      expectedResponseType,
      sent,
      response: outcome.response,
      status: statusForOutcome(outcome, shouldWait),
      success: outcome.success,
      errorMessage: outcome.errorMessage,
      attempt,
    });

    return outcome;
  }

  private armResponseWaiter(
    request: { type: string; data?: unknown },
    timeoutMs: number
  ): {
    promise: Promise<StonegyMessage>;
    cancel: (error: Error) => void;
  } {
    const commandId = request.type;
    const viewAtSend = this.getView();
    const partyBaseline = viewAtSend.party.lastSnapshotAt ?? 0;
    const questBaseline = viewAtSend.market.lastQuestSnapshotAt ?? 0;

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let entry: PendingWaiter;
    let rejectRef: ((error: Error) => void) | null = null;

    const settleReject = (reason: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const index = this.pending.indexOf(entry);
      if (index !== -1) {
        this.pending.splice(index, 1);
      }
      rejectRef?.(reason);
    };

    const promise = new Promise<StonegyMessage>((resolve, reject) => {
      rejectRef = reject;
      entry = {
        commandId,
        match: (message, view) => {
          if (!matchResponse(request, message)) {
            return false;
          }

          // View freshness gates — not request/response correlation.
          if (commandId === "party_get_snapshot") {
            return (
              view.party.partySnapshotSynced &&
              (view.party.lastSnapshotAt ?? 0) > partyBaseline
            );
          }

          if (commandId === "quest_get_snapshot") {
            return (view.market.lastQuestSnapshotAt ?? 0) > questBaseline;
          }

          return true;
        },
        resolve: (message) => {
          if (settled) {
            return;
          }
          settled = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          resolve(message);
        },
        reject: (error) => {
          settleReject(error);
        },
        disarm: () => settleReject(new Error("Command bus cleared")),
      };

      timeoutId = setTimeout(() => {
        settleReject(
          new Error(
            `Timed out waiting for ${formatResponseTypesForSend(commandId) ?? "response"} (${commandId})`
          )
        );
      }, timeoutMs);

      this.pending.push(entry);
    });

    return {
      promise,
      cancel: (error: Error) => settleReject(error),
    };
  }

  clear(): void {
    const pending = [...this.pending];
    this.pending.length = 0;
    for (const entry of pending) {
      entry.reject(new Error("Command bus cleared"));
    }
    this.cooldowns.clear();
    this.sendChain = Promise.resolve();
  }
}
