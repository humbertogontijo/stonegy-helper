import type { BotState } from "@stonegy/helper/types";
import type { BotResponse } from "../types/bot";
import type { BotTransport } from "./types";

type StateListener = (characterId: string, state: BotState) => void;
type PartiesListener = (data: unknown) => void;
export type HelperSseStatus = "open" | "error";
type StatusListener = (status: HelperSseStatus) => void;

interface SharedSse {
  source: EventSource;
  stateListeners: Set<StateListener>;
  partiesListeners: Set<PartiesListener>;
  statusListeners: Set<StatusListener>;
  refCount: number;
}

const sharedByBaseUrl = new Map<string, SharedSse>();

function acquireSse(baseUrl: string): SharedSse {
  const key = baseUrl.replace(/\/$/, "");
  let shared = sharedByBaseUrl.get(key);
  if (shared) {
    shared.refCount += 1;
    return shared;
  }

  const source = new EventSource(`${key}/v1/events`);
  const stateListeners = new Set<StateListener>();
  const partiesListeners = new Set<PartiesListener>();
  const statusListeners = new Set<StatusListener>();

  source.addEventListener("open", () => {
    for (const listener of statusListeners) {
      listener("open");
    }
  });

  source.addEventListener("error", () => {
    for (const listener of statusListeners) {
      listener("error");
    }
  });

  source.addEventListener("state", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as {
        characterId?: string;
        state?: BotState;
      };
      if (typeof data.characterId === "string" && data.state) {
        for (const listener of stateListeners) {
          listener(data.characterId, data.state);
        }
      }
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("parties", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as unknown;
      for (const listener of partiesListeners) {
        listener(data);
      }
    } catch {
      // ignore malformed events
    }
  });

  shared = { source, stateListeners, partiesListeners, statusListeners, refCount: 1 };
  sharedByBaseUrl.set(key, shared);
  return shared;
}

function releaseSse(baseUrl: string): void {
  const key = baseUrl.replace(/\/$/, "");
  const shared = sharedByBaseUrl.get(key);
  if (!shared) {
    return;
  }
  shared.refCount -= 1;
  if (shared.refCount <= 0) {
    shared.source.close();
    sharedByBaseUrl.delete(key);
  }
}

/** Subscribe to the shared helper SSE stream (parties / state / connection status). */
export function subscribeHelperSse(
  baseUrl: string,
  handlers: {
    onParties?: PartiesListener;
    onState?: StateListener;
    onStatus?: StatusListener;
  }
): () => void {
  const shared = acquireSse(baseUrl);
  if (handlers.onParties) {
    shared.partiesListeners.add(handlers.onParties);
  }
  if (handlers.onState) {
    shared.stateListeners.add(handlers.onState);
  }
  if (handlers.onStatus) {
    shared.statusListeners.add(handlers.onStatus);
    if (shared.source.readyState === EventSource.OPEN) {
      handlers.onStatus("open");
    }
  }

  return () => {
    if (handlers.onParties) {
      shared.partiesListeners.delete(handlers.onParties);
    }
    if (handlers.onState) {
      shared.stateListeners.delete(handlers.onState);
    }
    if (handlers.onStatus) {
      shared.statusListeners.delete(handlers.onStatus);
    }
    releaseSse(baseUrl);
  };
}

/** Subscribe to party-list SSE updates (shared connection). */
export function subscribeHelperParties(
  baseUrl: string,
  onParties: (data: unknown) => void
): () => void {
  return subscribeHelperSse(baseUrl, { onParties });
}

export function createHttpBotTransport(baseUrl: string, characterId: string): BotTransport {
  const root = baseUrl.replace(/\/$/, "");

  return {
    async send(channel, payload = {}): Promise<BotResponse> {
      if (channel === "bot:get-state" || channel === "bot:check-connection") {
        const res = await fetch(`${root}/v1/sessions/${encodeURIComponent(characterId)}/state`);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, error: text || `HTTP ${res.status}` };
        }
        const state = (await res.json()) as BotState;
        return {
          ok: true,
          state,
          connected: state.connection?.connected ?? false,
          connectionHint: state.connection?.connected ? "connected" : "no-game-session",
        };
      }

      const res = await fetch(
        `${root}/v1/sessions/${encodeURIComponent(characterId)}/command`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, payload }),
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: text || `HTTP ${res.status}` };
      }
      const body = (await res.json()) as BotResponse;
      if (
        channel === "bot:reload-game-tab" &&
        body.ok === false &&
        typeof body.error === "string" &&
        /not connected|not extension|unknown channel/i.test(body.error)
      ) {
        return {
          ok: false,
          error: body.error || "Reload is only available for the live game tab",
        };
      }
      return body;
    },

    subscribe(onState) {
      return subscribeHelperSse(root, {
        onState: (id, state) => {
          if (id === characterId) {
            onState(state);
          }
        },
      });
    },
  };
}

export { HELPER_BASE_URL } from "@stonegy/helper/helper-endpoint";
