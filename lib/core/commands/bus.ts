import {
  remainingCooldownMs,
  resolveCommandCooldown,
  delay,
  RESPONSE_TIMEOUT_MS,
} from "./cooldown";
import { buildMessage, getResponseTypeForSend } from "../../protocol";
import type { SendMessageType, SendPayloadMap, StonegyMessage } from "../../protocol";
import type { SessionView } from "../projections/types";
import type { Transport } from "../transport";
import {
  isActionResultSuccess,
  matchesCommandResponse,
  matchesGoldTransferResponse,
  matchesMarketSnapshot,
  readActionResultMessage,
  type MarketCommandContext,
} from "./registry";

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
  marketContext?: MarketCommandContext;
  goldTransferRequestId?: string;
  /** Override the default COMMAND_COOLDOWNS entry for this send. */
  cooldownMs?: number;
  /**
   * Extra attempts after a response timeout.
   * Defaults to {@link DEFAULT_COMMAND_TIMEOUT_RETRIES}. Use `0` to disable.
   */
  retries?: number;
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

export class CommandBus {
  /** Serializes wire sends only; response waits run independently. */
  private sendChain = Promise.resolve();
  private cooldowns = new Map<string, number>();
  private pending: PendingWaiter[] = [];

  constructor(
    private transport: Transport,
    private getView: () => SessionView
  ) {}

  notifyResponse(message: StonegyMessage, view: SessionView): void {
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const entry = this.pending[index];
      if (!entry.match(message, view)) {
        continue;
      }
      this.pending.splice(index, 1);
      entry.resolve(message);
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

  private enqueueSend(send: () => Promise<void>): Promise<void> {
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
      });
      if (!isTimeoutErrorMessage(last.errorMessage)) {
        return last;
      }
    }

    return last;
  }

  private async executeAttempt<T extends SendMessageType>(
    type: T,
    data: SendPayloadMap[T],
    options: CommandRunOptions
  ): Promise<CommandOutcome> {
    const cooldownMs = options.cooldownMs ?? resolveCommandCooldown(type);

    if (!options.force && cooldownMs != null) {
      const remaining = remainingCooldownMs(this.cooldowns.get(type), cooldownMs, Date.now());
      if (remaining > 0) {
        await delay(remaining);
      }
    }

    const shouldWait =
      options.waitForResponse !== false && getResponseTypeForSend(type) != null;
    const waiter = shouldWait
      ? this.armResponseWaiter(
          type,
          options.timeoutMs ?? RESPONSE_TIMEOUT_MS,
          options.marketContext,
          options.goldTransferRequestId
        )
      : null;

    try {
      const json = buildMessage(type, data);
      await this.enqueueSend(() => this.transport.send(1, json));
      this.cooldowns.set(type, Date.now());

      if (!waiter) {
        return { sent: true };
      }

      try {
        const response = await waiter.promise;
        const success = isActionResultSuccess(response);
        return {
          sent: true,
          response,
          success,
          errorMessage: success ? undefined : readActionResultMessage(response) ?? "Command failed",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { sent: true, success: false, errorMessage: message };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (waiter) {
        // Nobody awaits waiter.promise on this path — attach a sink before rejecting.
        void waiter.promise.catch(() => undefined);
        waiter.cancel(error instanceof Error ? error : new Error(message));
      }
      return { sent: false, success: false, errorMessage: message };
    }
  }

  private armResponseWaiter(
    commandId: string,
    timeoutMs: number,
    marketContext?: MarketCommandContext,
    goldTransferRequestId?: string
  ): {
    promise: Promise<StonegyMessage>;
    cancel: (error: Error) => void;
  } {
    const viewAtSend = this.getView();
    const partyBaseline = viewAtSend.party.lastSnapshotAt ?? 0;
    const questBaseline = viewAtSend.market.lastQuestSnapshotAt ?? 0;
    const huntBaseline = viewAtSend.hunt.activeHuntId;

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
          if (commandId === "market_get_snapshot" && marketContext) {
            return matchesMarketSnapshot(message, marketContext);
          }

          if (commandId === "gold_transfer" && goldTransferRequestId) {
            return matchesGoldTransferResponse(message, goldTransferRequestId);
          }

          if (!matchesCommandResponse(commandId, message)) {
            return false;
          }

          if (commandId === "party_get_snapshot") {
            return (
              view.party.partySnapshotSynced &&
              (view.party.lastSnapshotAt ?? 0) > partyBaseline
            );
          }

          if (commandId === "quest_get_snapshot") {
            return (view.market.lastQuestSnapshotAt ?? 0) > questBaseline;
          }

          if (commandId === "start_hunt") {
            return view.hunt.activeHuntId != null && view.hunt.activeHuntId !== huntBaseline;
          }

          // Response type is already gold_balance; don't also require a gold delta —
          // some sells only refresh gold via inventory_snapshot and would time out.
          if (commandId === "quick_sell_items") {
            return true;
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
            `Timed out waiting for ${getResponseTypeForSend(commandId) ?? "response"} (${commandId})`
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
