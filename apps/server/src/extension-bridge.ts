import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { BotState } from "@stonegy/helper/types";
import type { FeatureId } from "@stonegy/helper/core/services/types";
import { FEATURE_TAB_ORDER } from "@stonegy/helper/core/features/instances";
import type { SessionCommandResult, Supervisor } from "./supervisor";

export const EXTENSION_WS_PATH = "/v1/extension";

type ClientMessage =
  | { type: "claim"; characterId: string; characterName: string }
  | { type: "release" }
  | {
      type: "settings";
      characterId: string;
      settings: Record<string, unknown>;
      featureMasters: Partial<Record<FeatureId, boolean>>;
      rev?: number;
    }
  | { type: "state"; state: BotState }
  | { type: "commandResult"; id: string; result: SessionCommandResult }
  | { type: "ok"; rev?: number }
  | { type: "error"; error: string; rev?: number };

let nextSocketId = 1;

function parseFeatureMasters(
  raw: unknown
): Partial<Record<FeatureId, boolean>> {
  const patch: Partial<Record<FeatureId, boolean>> = {};
  if (!raw || typeof raw !== "object") {
    return patch;
  }
  const obj = raw as Record<string, unknown>;
  for (const id of FEATURE_TAB_ORDER) {
    if (typeof obj[id] === "boolean") {
      patch[id] = obj[id] as boolean;
    }
  }
  return patch;
}

function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const msg = parsed as Record<string, unknown>;
  if (msg.type === "claim") {
    if (typeof msg.characterId !== "string" || !msg.characterId.trim()) {
      return null;
    }
    if (typeof msg.characterName !== "string" || !msg.characterName.trim()) {
      return null;
    }
    return {
      type: "claim",
      characterId: msg.characterId.trim(),
      characterName: msg.characterName.trim(),
    };
  }
  if (msg.type === "release") {
    return { type: "release" };
  }
  if (msg.type === "settings") {
    if (typeof msg.characterId !== "string" || !msg.characterId.trim()) {
      return null;
    }
    return {
      type: "settings",
      characterId: msg.characterId.trim(),
      settings:
        msg.settings && typeof msg.settings === "object"
          ? (msg.settings as Record<string, unknown>)
          : {},
      featureMasters: parseFeatureMasters(msg.featureMasters),
      rev: typeof msg.rev === "number" ? msg.rev : undefined,
    };
  }
  if (msg.type === "state") {
    if (!msg.state || typeof msg.state !== "object") {
      return null;
    }
    return { type: "state", state: msg.state as BotState };
  }
  if (msg.type === "commandResult") {
    if (typeof msg.id !== "string") {
      return null;
    }
    return {
      type: "commandResult",
      id: msg.id,
      result:
        msg.result && typeof msg.result === "object"
          ? (msg.result as SessionCommandResult)
          : { ok: false, error: "Missing result" },
    };
  }
  if (msg.type === "ok") {
    return { type: "ok", rev: typeof msg.rev === "number" ? msg.rev : undefined };
  }
  if (msg.type === "error") {
    return {
      type: "error",
      error: typeof msg.error === "string" ? msg.error : "error",
      rev: typeof msg.rev === "number" ? msg.rev : undefined,
    };
  }
  return null;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== ws.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

export function createExtensionBridge(supervisor: Supervisor): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket) => {
    const socketId = `ext-${nextSocketId++}`;
    supervisor.registerExtensionSocket(socketId, (message) => {
      sendJson(ws, message as unknown as Record<string, unknown>);
    });

    ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf8");
      const message = parseClientMessage(raw);
      if (!message) {
        sendJson(ws, { type: "error", error: "Invalid message" });
        return;
      }

      if (message.type === "claim") {
        void supervisor
          .claimExtension(message.characterId, message.characterName, socketId)
          .then(() => sendJson(ws, { type: "ok" }))
          .catch((error) => {
            sendJson(ws, {
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      if (message.type === "release") {
        void supervisor
          .releaseExtension(socketId)
          .then(() => sendJson(ws, { type: "ok" }))
          .catch((error) => {
            sendJson(ws, {
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      if (message.type === "settings") {
        void supervisor
          .applyExtensionSettings(socketId, message)
          .then(() =>
            sendJson(ws, {
              type: "ok",
              rev: message.rev,
            })
          )
          .catch((error) => {
            sendJson(ws, {
              type: "error",
              error: error instanceof Error ? error.message : String(error),
              rev: message.rev,
            });
          });
        return;
      }

      if (message.type === "state") {
        supervisor.onExtensionState(socketId, message.state);
        return;
      }

      if (message.type === "commandResult") {
        supervisor.onExtensionCommandResult(message.id, message.result);
        return;
      }

      if (message.type === "ok" || message.type === "error") {
        if (typeof message.rev === "number") {
          supervisor.onExtensionSettingsAck(
            message.rev,
            message.type === "ok",
            message.type === "error" ? message.error : undefined
          );
        }
      }
    });

    ws.on("close", () => {
      void supervisor.onExtensionSocketClosed(socketId);
    });
  });

  return wss;
}

export function attachExtensionBridge(
  server: HttpServer,
  supervisor: Supervisor
): WebSocketServer {
  const wss = createExtensionBridge(supervisor);

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== EXTENSION_WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  return wss;
}
