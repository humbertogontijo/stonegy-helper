import { HELPER_BASE_URL, subscribeHelperSse } from "../transport/http";
import { fetchHelperHealth } from "./probe";
import type { HelperConnectionSnapshot, PartySummary } from "./types";

const DEFAULT_OFFLINE_POLL_MS = 5000;

export type HelperConnectionListener = (snapshot: HelperConnectionSnapshot) => void;

/**
 * Shared helper reachability + party roster subscription for extension and web UI.
 *
 * - While offline: poll `/v1/health` until the helper is up.
 * - Once online: attach to shared `/v1/events` SSE for `parties` (and connection liveness).
 * - On SSE drop: detach, clear parties, resume health polling.
 * - No periodic `/v1/parties` polling.
 */
export function subscribeHelperConnection(
  onChange: HelperConnectionListener,
  options?: {
    baseUrl?: string;
    offlinePollMs?: number;
  }
): () => void {
  const root = (options?.baseUrl ?? HELPER_BASE_URL).replace(/\/$/, "");
  const offlinePollMs = options?.offlinePollMs ?? DEFAULT_OFFLINE_POLL_MS;

  let disposed = false;
  let snapshot: HelperConnectionSnapshot = {
    online: false,
    version: null,
    parties: [],
  };
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let attachTimeout: ReturnType<typeof setTimeout> | null = null;
  let unsubSse: (() => void) | null = null;
  /** True after the stream has opened at least once in this attach cycle. */
  let sseOpened = false;

  const emit = () => {
    if (!disposed) {
      onChange(snapshot);
    }
  };

  const patch = (next: Partial<HelperConnectionSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    emit();
  };

  const stopPoll = () => {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const clearAttachTimeout = () => {
    if (attachTimeout != null) {
      clearTimeout(attachTimeout);
      attachTimeout = null;
    }
  };

  const startPoll = () => {
    if (disposed || pollTimer != null) {
      return;
    }
    pollTimer = setInterval(() => {
      if (!snapshot.online && !unsubSse) {
        void probe();
      }
    }, offlinePollMs);
  };

  const detachSse = () => {
    clearAttachTimeout();
    if (!unsubSse) {
      return;
    }
    const unsub = unsubSse;
    unsubSse = null;
    sseOpened = false;
    unsub();
  };

  const goOffline = () => {
    patch({ online: false, version: null, parties: [] });
    detachSse();
    startPoll();
  };

  const attachSse = () => {
    if (unsubSse || disposed) {
      return;
    }
    unsubSse = subscribeHelperSse(root, {
      onParties: (data) => {
        if (!Array.isArray(data)) {
          return;
        }
        clearAttachTimeout();
        patch({
          online: true,
          parties: data as PartySummary[],
        });
        stopPoll();
      },
      onStatus: (status) => {
        if (status === "open") {
          sseOpened = true;
          clearAttachTimeout();
          patch({ online: true });
          stopPoll();
          return;
        }
        // Ignore connect-time errors; after open, fall back to health polling.
        // Defer so we don't unsubscribe while EventSource is dispatching.
        if (sseOpened) {
          queueMicrotask(() => {
            if (!disposed && unsubSse) {
              goOffline();
            }
          });
        }
      },
    });
    // If SSE never opens (helper died between health and events), resume polling.
    attachTimeout = setTimeout(() => {
      if (!disposed && unsubSse && !sseOpened) {
        goOffline();
      }
    }, offlinePollMs);
  };

  const probe = async () => {
    if (disposed || unsubSse) {
      return;
    }
    const health = await fetchHelperHealth(root);
    if (disposed || unsubSse) {
      return;
    }
    if (health?.ok) {
      patch({
        online: true,
        version: health.version,
      });
      stopPoll();
      attachSse();
      return;
    }
    patch({ online: false, version: null, parties: [] });
  };

  emit();
  void probe();
  startPoll();

  return () => {
    disposed = true;
    stopPoll();
    detachSse();
  };
}
