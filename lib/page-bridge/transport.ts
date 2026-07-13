import {
  BRIDGE_CHANNELS,
  MESSAGE_SOURCES,
  pageBridgeSecretStorageKey,
  pageBridgeSymbolKey,
} from "./constants";
import type { PageBridgeCommandResult, PageBridgeStatus } from "./types";

function unwrapInjectionResult<T>(
  results: chrome.scripting.InjectionResult[] | null | undefined
): T | undefined {
  if (!results?.length) {
    return undefined;
  }

  const value = results[0]?.result;
  if (value === null || value === undefined) {
    return undefined;
  }

  return value as T;
}

async function loadTabBridgeSecret(tabId: number): Promise<string | null> {
  try {
    const key = pageBridgeSecretStorageKey(tabId);
    const stored = await chrome.storage.session.get(key);
    const secret = stored[key];
    return typeof secret === "string" && secret.length > 0 ? secret : null;
  } catch {
    return null;
  }
}

/** Read WebSocket status directly from the page MAIN world (secret-keyed Symbol). */
export async function queryPageBridgeStatus(
  tabId: number
): Promise<PageBridgeStatus | undefined> {
  const secret = await loadTabBridgeSecret(tabId);
  if (!secret) {
    return undefined;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (symbolKey: string) => {
        const bridge = (
          window as unknown as Record<symbol, { getStatus?: () => PageBridgeStatus }>
        )[Symbol.for(symbolKey)];
        return bridge?.getStatus?.() ?? null;
      },
      args: [pageBridgeSymbolKey(secret)],
    });

    const status = unwrapInjectionResult<PageBridgeStatus | null>(results);
    return status ?? undefined;
  } catch {
    return undefined;
  }
}

/** Run a page-bridge command directly in the tab's MAIN world. */
export async function runPageBridgeCommand(
  tabId: number,
  type: string,
  payload?: unknown
): Promise<PageBridgeCommandResult | undefined> {
  const secret = await loadTabBridgeSecret(tabId);
  if (!secret) {
    return undefined;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (symbolKey: string, commandType: string, commandPayload: unknown) => {
        const bridge = (
          window as unknown as Record<
            symbol,
            {
              runCommand?: (type: string, payload: unknown) => PageBridgeCommandResult;
            }
          >
        )[Symbol.for(symbolKey)];

        if (!bridge?.runCommand) {
          return { ok: false, error: "Page bridge not loaded" };
        }

        return bridge.runCommand(commandType, commandPayload);
      },
      args: [pageBridgeSymbolKey(secret), type, payload ?? null],
    });

    return unwrapInjectionResult<PageBridgeCommandResult>(results);
  } catch {
    return undefined;
  }
}

/** Relay a command through the isolated content script. */
export async function sendPageBridgeCommandViaContentScript(
  tabId: number,
  type: string,
  payload?: unknown
): Promise<PageBridgeCommandResult> {
  return (await chrome.tabs.sendMessage(tabId, {
    channel: BRIDGE_CHANNELS.wsCommand,
    type,
    payload,
    requestId: crypto.randomUUID(),
  })) as PageBridgeCommandResult;
}

/**
 * Command dispatch: content-script relay first, MAIN-world scripting fallback.
 */
export async function sendPageBridgeCommand(
  tabId: number,
  type: string,
  payload?: unknown
): Promise<PageBridgeCommandResult> {
  try {
    const relayed = await sendPageBridgeCommandViaContentScript(tabId, type, payload);
    if (relayed) {
      if (relayed.ok === false) {
        throw new Error(
          typeof relayed.error === "string" ? relayed.error : "Page bridge command failed"
        );
      }
      return relayed;
    }
  } catch {
    // Fall through to MAIN-world scripting.
  }

  const direct = await runPageBridgeCommand(tabId, type, payload);
  if (direct) {
    if (direct.ok === false) {
      throw new Error(
        typeof direct.error === "string" ? direct.error : "Page bridge command failed"
      );
    }
    return direct;
  }

  throw new Error("Could not reach the game tab — refresh https://stonegy-online.com/");
}

/** Status read with optional retries. */
export async function readPageBridgeStatus(
  tabId: number,
  options: { retries?: number; retryDelayMs?: number; delay?: (ms: number) => Promise<void> } = {}
): Promise<PageBridgeStatus | undefined> {
  const retries = options.retries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 400;
  const delay = options.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const relayed = await sendPageBridgeCommandViaContentScript(tabId, "ws:status");
      if (relayed && typeof relayed.readyState === "number") {
        return {
          connected: !!relayed.connected,
          readyState: Number(relayed.readyState),
          url: typeof relayed.url === "string" ? relayed.url : null,
        };
      }
    } catch {
      // Relay unavailable — try MAIN-world read below.
    }

    const direct = await queryPageBridgeStatus(tabId);
    if (direct) {
      return direct;
    }

    if (attempt < retries) {
      await delay(retryDelayMs);
    }
  }

  return undefined;
}

// Re-export for callers that post authenticated messages (unused currently, kept for tests).
export { MESSAGE_SOURCES };
