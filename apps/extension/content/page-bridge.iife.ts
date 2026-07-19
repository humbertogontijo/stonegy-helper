/**
 * MAIN-world WebSocket hook. Must stay self-contained (no imports) so CRXJS
 * can emit a single IIFE bundle for `<script>` and `executeScript` injection.
 *
 * Constants mirror `packages/helper/src/page-bridge/constants.ts`.
 *
 * Auth: reads a one-time secret from `data-stonegy-bridge-auth` (set by the
 * isolated content script), stores it in this closure, and requires it on every
 * postMessage command/event. Callers use a Symbol key derived from the secret.
 */
interface WsSerializedMessage {
  opcode: number;
  data: string;
}

const PAGE_BRIDGE_AUTH_ATTR = "data-stonegy-bridge-auth";
const MESSAGE_SOURCE_PAGE = "stonegy-helper-page";
const MESSAGE_SOURCE_EXTENSION = "stonegy-helper-extension";

(function () {
  const PATCHED_FLAG = "__stonegyHelperWebSocketPatched";

  if ((window.WebSocket as typeof WebSocket & { [PATCHED_FLAG]?: boolean })?.[PATCHED_FLAG]) {
    return;
  }

  const bridgeSecret = document.documentElement.getAttribute(PAGE_BRIDGE_AUTH_ATTR);
  try {
    document.documentElement.removeAttribute(PAGE_BRIDGE_AUTH_ATTR);
  } catch {
    // Ignore DOM write failures during early document load.
  }

  if (!bridgeSecret) {
    // Refuse to arm without a content-script-issued secret.
    return;
  }

  const WS_URL = "wss://server-game-01.api-stonegy.com/";
  const SOURCE = MESSAGE_SOURCE_PAGE;
  const EXT_SOURCE = MESSAGE_SOURCE_EXTENSION;
  const BRIDGE_SYMBOL = Symbol.for(`stonegy-helper-bridge:${bridgeSecret}`);

  let gameSocket: WebSocket | null = null;
  const NativeWebSocket = window.WebSocket;

  function getStatus() {
    return {
      connected: !!gameSocket,
      readyState: gameSocket?.readyState ?? NativeWebSocket.CLOSED,
      url: gameSocket?.url || (gameSocket ? WS_URL : null),
    };
  }

  function post(type: string, payload: Record<string, unknown>) {
    window.postMessage({ source: SOURCE, secret: bridgeSecret, type, payload }, "*");
  }

  function postSerialized(type: string, payload: WsSerializedMessage) {
    post(type, payload as unknown as Record<string, unknown>);
  }

  function serializeIncoming(data: unknown): WsSerializedMessage {
    if (typeof data === "string") {
      return { opcode: 1, data };
    }
    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return { opcode: 2, data: btoa(binary) };
    }
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      return serializeIncoming(
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
      );
    }
    return { opcode: 1, data: String(data) };
  }

  function deserializeOutgoing(message: unknown): string | ArrayBuffer {
    if (typeof message === "string") {
      return message;
    }
    if (
      message &&
      typeof message === "object" &&
      (message as WsSerializedMessage).opcode === 2 &&
      typeof (message as WsSerializedMessage).data === "string"
    ) {
      const binary = atob((message as WsSerializedMessage).data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    if (message && typeof message === "object" && "data" in message) {
      const data = (message as { data: unknown }).data;
      if (typeof data === "string") {
        return data;
      }
    }
    return JSON.stringify(message);
  }

  /** Stonegy disconnects after 5 min without these DOM events (code 4002). */
  const ACTIVITY_EVENT_TYPES = [
    "mousemove",
    "mousedown",
    "keydown",
    "wheel",
    "touchstart",
    "pointerdown",
  ] as const;

  const IDLE_DISCONNECT_CODES = new Set([4001, 4002]);
  const KEEP_ALIVE_ACTIVITY_MS = 180_000;

  let keepAliveEnabled = true;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  function simulateUserActivity() {
    for (const type of ACTIVITY_EVENT_TYPES) {
      const event =
        type === "keydown"
          ? new KeyboardEvent(type, { bubbles: true, cancelable: true, key: "Shift" })
          : type === "wheel"
            ? new WheelEvent(type, { bubbles: true, cancelable: true, deltaY: 0 })
            : new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 1, clientY: 1 });

      document.dispatchEvent(event);
    }
  }

  function syncKeepAliveTimer() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }

    if (!keepAliveEnabled) {
      return;
    }

    keepAliveTimer = setInterval(() => {
      simulateUserActivity();
    }, KEEP_ALIVE_ACTIVITY_MS);
  }

  function patchIdleDisconnectClose(ws: WebSocket) {
    const originalClose = ws.close.bind(ws);

    ws.close = function patchedClose(code?: number, reason?: string) {
      if (
        keepAliveEnabled &&
        code != null &&
        IDLE_DISCONNECT_CODES.has(code) &&
        (reason === "idle_timeout" || reason === "hidden_timeout")
      ) {
        simulateUserActivity();
        return;
      }

      return originalClose(code, reason);
    };
  }

  function attachSocket(ws: WebSocket) {
    gameSocket = ws;

    post("ws:connected", { url: ws.url || WS_URL, readyState: ws.readyState });

    patchIdleDisconnectClose(ws);

    ws.addEventListener("open", () => {
      post("ws:open", { readyState: ws.readyState });
    });

    ws.addEventListener("close", (event) => {
      if (gameSocket === ws) {
        gameSocket = null;
      }
      post("ws:close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    });

    ws.addEventListener("error", () => {
      post("ws:error", { readyState: ws.readyState });
    });

    const originalSend = ws.send.bind(ws);
    ws.send = function patchedSend(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      postSerialized("ws:send", serializeIncoming(data));
      return originalSend(data);
    };

    ws.addEventListener("message", (event) => {
      postSerialized("ws:receive", serializeIncoming(event.data));
    });
  }

  function StonegyWebSocket(url: string | URL, protocols?: string | string[]) {
    const ws =
      protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);

    if (String(url).includes("api-stonegy.com")) {
      attachSocket(ws);
    }

    return ws;
  }

  StonegyWebSocket.prototype = NativeWebSocket.prototype;
  StonegyWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
  StonegyWebSocket.OPEN = NativeWebSocket.OPEN;
  StonegyWebSocket.CLOSING = NativeWebSocket.CLOSING;
  StonegyWebSocket.CLOSED = NativeWebSocket.CLOSED;

  window.WebSocket = StonegyWebSocket as unknown as typeof WebSocket;
  (window.WebSocket as typeof WebSocket & { [PATCHED_FLAG]?: boolean })[PATCHED_FLAG] = true;

  function runCommand(type: string, payload: unknown) {
    if (type === "ws:status") {
      return { ok: true, ...getStatus() };
    }

    if (type === "ws:send") {
      if (!gameSocket || gameSocket.readyState !== NativeWebSocket.OPEN) {
        return { ok: false, error: "WebSocket not connected" };
      }

      try {
        gameSocket.send(deserializeOutgoing(payload));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    if (type === "page:keep-alive-config") {
      keepAliveEnabled =
        payload &&
        typeof payload === "object" &&
        "enabled" in payload &&
        (payload as { enabled?: boolean }).enabled === false
          ? false
          : true;
      syncKeepAliveTimer();
      return { ok: true };
    }

    if (type === "page:keep-alive") {
      simulateUserActivity();
      return { ok: true };
    }

    return { ok: false, error: `Unknown bridge command: ${type}` };
  }

  (
    window as unknown as Record<symbol, { getStatus: typeof getStatus; runCommand: typeof runCommand }>
  )[BRIDGE_SYMBOL] = {
    getStatus,
    runCommand,
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== EXT_SOURCE) {
      return;
    }

    if (event.data?.secret !== bridgeSecret) {
      return;
    }

    const { type, payload, requestId } = event.data;

    if (type === "ws:send") {
      if (!gameSocket || gameSocket.readyState !== NativeWebSocket.OPEN) {
        post("ws:send-result", {
          requestId,
          ok: false,
          error: "WebSocket not connected",
        });
        return;
      }

      try {
        gameSocket.send(deserializeOutgoing(payload));
        post("ws:send-result", { requestId, ok: true });
      } catch (error) {
        post("ws:send-result", {
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (type === "ws:status") {
      post("ws:status", {
        requestId,
        ...getStatus(),
      });
      return;
    }

    if (type === "page:keep-alive-config") {
      keepAliveEnabled = payload?.enabled !== false;
      syncKeepAliveTimer();
      post("page:keep-alive-config-result", { requestId, ok: true });
      return;
    }

    if (type === "page:keep-alive") {
      simulateUserActivity();
      post("page:keep-alive-result", { requestId, ok: true });
    }
  });

  syncKeepAliveTimer();
  post("bridge:ready", { url: WS_URL });
})();
