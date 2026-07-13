import {
  BRIDGE_CHANNELS,
  MESSAGE_SOURCES,
  STATUS_PUBLISH_INTERVAL_MS,
  WS_COMMAND_TIMEOUT_MS,
} from "./constants";
import type { PageBridgeStatus } from "./types";

type BridgeRelayState = {
  secret: string;
  /** Last status received over the authenticated postMessage channel. */
  lastStatus: PageBridgeStatus | null;
  statusIntervalId: number | null;
};

/**
 * Wire up the isolated content-script relay with a per-injection auth secret:
 * - authenticated status pushes (ignores page-writable DOM alone)
 * - page WebSocket event forwarding (secret required)
 * - postMessage command fallback when scripting replies fail
 */
export function setupPageBridgeContentRelay(secret: string) {
  const state: BridgeRelayState = {
    secret,
    lastStatus: null,
    statusIntervalId: null,
  };

  // Persist secret in the service worker (keyed by sender.tab.id) for MAIN-world fallbacks.
  safeSendRuntimeMessage({
    channel: "bridge:store-secret",
    secret,
  });

  function isExtensionContextValid(): boolean {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function safeSendRuntimeMessage(message: Record<string, unknown>): void {
    if (!isExtensionContextValid()) {
      return;
    }

    try {
      chrome.runtime.sendMessage(message, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // Extension reloaded while the game tab stayed open.
    }
  }

  function publishStatus(status: PageBridgeStatus) {
    state.lastStatus = status;
    safeSendRuntimeMessage({
      channel: BRIDGE_CHANNELS.status,
      connected: status.connected,
      readyState: status.readyState,
      url: status.url,
    });
  }

  function publishCachedStatus() {
    if (!state.lastStatus) {
      return;
    }
    publishStatus(state.lastStatus);
  }

  state.statusIntervalId = window.setInterval(publishCachedStatus, STATUS_PUBLISH_INTERVAL_MS);

  window.addEventListener("pagehide", () => {
    if (state.statusIntervalId != null) {
      clearInterval(state.statusIntervalId);
      state.statusIntervalId = null;
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCES.page) {
      return;
    }

    if (event.data?.secret !== state.secret) {
      return;
    }

    if (
      event.data.type === "bridge:ready" ||
      event.data.type === "ws:connected" ||
      event.data.type === "ws:open" ||
      event.data.type === "ws:close" ||
      event.data.type === "ws:status"
    ) {
      const payload = (event.data.payload ?? {}) as Record<string, unknown>;
      if (event.data.type === "ws:status" || event.data.type === "bridge:ready") {
        publishStatus({
          connected: !!payload.connected,
          readyState: Number(payload.readyState ?? 3),
          url: typeof payload.url === "string" ? payload.url : null,
        });
      } else if (event.data.type === "ws:close") {
        publishStatus({ connected: false, readyState: 3, url: null });
      } else if (event.data.type === "ws:open" || event.data.type === "ws:connected") {
        publishStatus({
          connected: true,
          readyState: Number(payload.readyState ?? 1),
          url: typeof payload.url === "string" ? payload.url : null,
        });
      }
    }

    const { secret: _secret, ...rest } = event.data as Record<string, unknown> & {
      secret?: string;
    };
    safeSendRuntimeMessage({
      channel: BRIDGE_CHANNELS.wsEvent,
      ...rest,
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.channel !== BRIDGE_CHANNELS.wsCommand) {
      return;
    }

    const requestId = message.requestId ?? crypto.randomUUID();
    let settled = false;

    const finish = (response: Record<string, unknown>) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("message", onResult);
      sendResponse(response);
    };

    const onResult = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== MESSAGE_SOURCES.page) {
        return;
      }

      if (event.data?.secret !== state.secret) {
        return;
      }

      const isReply =
        event.data.type === "ws:status" ||
        event.data.type === "ws:send-result" ||
        event.data.type === "page:keep-alive-result" ||
        event.data.type === "page:keep-alive-config-result";

      if (!isReply || event.data.payload?.requestId !== requestId) {
        return;
      }

      if (event.data.type === "ws:status") {
        const status = {
          connected: !!event.data.payload?.connected,
          readyState: Number(event.data.payload?.readyState ?? 3),
          url: typeof event.data.payload?.url === "string" ? event.data.payload.url : null,
        };
        state.lastStatus = status;
        finish({ ok: true, ...event.data.payload });
      } else if (
        event.data.type === "page:keep-alive-result" ||
        event.data.type === "page:keep-alive-config-result"
      ) {
        finish({ ok: true, ...event.data.payload });
      } else {
        finish(event.data.payload);
      }
    };

    window.addEventListener("message", onResult);

    const timeoutId = setTimeout(() => {
      finish({
        ok: false,
        error: "Page bridge timed out — refresh the Stonegy game tab",
      });
    }, WS_COMMAND_TIMEOUT_MS);

    window.postMessage(
      {
        source: MESSAGE_SOURCES.extension,
        secret: state.secret,
        type: message.type,
        payload: message.payload,
        requestId,
      },
      "*"
    );

    return true;
  });
}
