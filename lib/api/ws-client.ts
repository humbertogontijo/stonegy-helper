import WebSocket from "ws";
import { STONEGY_WS_URL } from "./constants";
import { buildMessage, parseMessage, SendMessageTypes } from "../protocol";
import { getScrapingHttpsAgent, primeScrapingSession, wsConnectHeaders } from "./scraping-session";

export interface WsClientOptions {
  token: string;
  characterId: string;
  worldId?: number;
  onMessage?: (raw: string, parsed: ReturnType<typeof parseMessage>, opcode: 1 | 2) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Error) => void;
}

export class StonegyWsClient {
  private socket: WebSocket | null = null;
  private readonly options: WsClientOptions;

  constructor(options: WsClientOptions) {
    this.options = options;
  }

  async connect(timeoutMs = 15_000): Promise<void> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.openSocket(timeoutMs);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const retryable =
          lastError.message.includes("403") ||
          lastError.message.includes("blocked") ||
          lastError.message.includes("before auth");
        if (!retryable || attempt === maxAttempts - 1) {
          throw lastError;
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }

    throw lastError ?? new Error("WebSocket connection failed");
  }

  private openSocket(timeoutMs: number): Promise<void> {
    return new Promise(async (resolve, reject) => {
      await primeScrapingSession();
      const agent = getScrapingHttpsAgent();
      if (!agent) {
        reject(new Error("Failed to initialize browser-like TLS session"));
        return;
      }

      const socket = new WebSocket(STONEGY_WS_URL, {
        agent,
        headers: wsConnectHeaders(),
      });
      this.socket = socket;

      let authenticated = false;
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.close();
        reject(new Error(`WebSocket connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handleOpen = () => {
        this.options.onOpen?.();
        const authPayload: {
          tokenKey: string;
          characterId: string;
          worldId?: number;
          clientDeviceType: string;
        } = {
          tokenKey: this.options.token,
          characterId: this.options.characterId,
          clientDeviceType: "web",
        };
        if (this.options.worldId != null && this.options.worldId > 0) {
          authPayload.worldId = this.options.worldId;
        }
        socket.send(buildMessage(SendMessageTypes.AUTH, authPayload));
      };

      const handleMessage = (data: WebSocket.RawData) => {
        const buffer = Buffer.isBuffer(data)
          ? data
          : typeof data === "string"
            ? Buffer.from(data)
            : Buffer.from(data as ArrayBuffer);

        const isBinary =
          buffer.length >= 2 && buffer[0] === 0x53 && buffer[1] === 0x47;

        if (isBinary) {
          this.options.onMessage?.(buffer.toString("base64"), null, 2);
          return;
        }

        const raw = buffer.toString("utf8");
        const parsed = parseMessage(raw);
        this.options.onMessage?.(raw, parsed, 1);

        if (authenticated || settled) {
          return;
        }

        const authParsed = parsed as { type?: string; data?: Record<string, unknown>; message?: unknown } | null;
        if (authParsed?.type === "error") {
          settled = true;
          clearTimeout(timeout);
          const message =
            typeof authParsed.data?.message === "string"
              ? authParsed.data.message
              : typeof authParsed.message === "string"
                ? authParsed.message
                : "WebSocket auth failed";
          reject(new Error(message));
          return;
        }

        if (parsed?.type === "session_bootstrap") {
          authenticated = true;
          clearTimeout(timeout);
          settled = true;
          resolve();
        }
      };

      const handleError = (error: Error) => {
        if (settled) {
          this.options.onError?.(error);
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const wrapped = new Error(error.message || "WebSocket connection failed");
        this.options.onError?.(wrapped);
        reject(wrapped);
      };

      const handleClose = (code: number, reason: Buffer) => {
        const reasonText = reason.toString();
        this.options.onClose?.(code, reasonText);
        if (!authenticated && !settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`WebSocket closed before auth (${code} ${reasonText || ""})`.trim()));
        }
      };

      socket.on("open", handleOpen);
      socket.on("message", handleMessage);
      socket.on("error", handleError);
      socket.on("close", handleClose);
      socket.on("unexpected-response", (_request, response) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`WebSocket blocked by server (${response.statusCode})`));
      });
    });
  }

  sendJson(json: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.socket.send(json);
  }

  close(code = 1000, reason = "cli shutdown"): void {
    this.socket?.close(code, reason);
    this.socket = null;
  }

  get readyState(): number {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }
}
