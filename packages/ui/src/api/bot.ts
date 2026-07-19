import type { BotResponse } from "../types/bot";

const DEFAULT_TIMEOUT_MS = 15_000;

export class BotRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotRpcError";
  }
}

/**
 * Send a message to the extension service worker with lastError / timeout handling.
 */
export async function sendBot(
  channel: string,
  payload: Record<string, unknown> = {},
  options: { timeoutMs?: number } = {}
): Promise<BotResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<BotResponse>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new BotRpcError("Background timed out — try reopening the popup"));
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage({ channel, ...payload }, (response) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(
            new BotRpcError(
              lastError.message || "Background unreachable — reload the extension"
            )
          );
          return;
        }

        if (response == null) {
          reject(new BotRpcError("No response from background — reload the extension"));
          return;
        }

        resolve(response as BotResponse);
      });
    } catch (error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(
        error instanceof Error
          ? error
          : new BotRpcError("Failed to reach the extension background")
      );
    }
  });
}
