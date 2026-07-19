import type { BotState } from "@stonegy/helper/types";
import type { FeatureMasters } from "@stonegy/helper/core/services/types";
import type { Settings } from "@stonegy/helper/core/settings";
import { HELPER_EXTENSION_WS_URL } from "@stonegy/helper/helper-endpoint";
import type { BotResponse } from "@stonegy/ui/types/bot";
import {
  buildSettingsSyncPayload,
  type SettingsSyncPayload,
} from "./settings-sync";

export { HELPER_EXTENSION_WS_URL };

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;
const STATE_THROTTLE_MS = 150;

type BridgeState = {
  characterId: string;
  characterName: string;
};

export type HelperBridgeHandlers = {
  /** Full settings snapshot after a successful claim. */
  getSettingsPayload: () => SettingsSyncPayload | null;
  getBotState: () => BotState;
  /**
   * Must reflect a live game-tab WebSocket — not persisted UI state.
   * Used before claim / reconnect so a helper restart cannot ghost-claim.
   */
  isGameLive: () => boolean;
  onRemoteSettings: (payload: {
    characterId: string;
    settings: Record<string, unknown>;
    featureMasters: Partial<FeatureMasters>;
    rev?: number;
  }) => Promise<void>;
  onRemoteCommand: (
    channel: string,
    payload: Record<string, unknown>
  ) => Promise<BotResponse>;
};

/**
 * Control WS to the local helper. Claim only while the game tab WS is live;
 * release immediately when it drops. Never reclaim from a stale `desired` after
 * the helper restarts unless `isGameLive()` is still true.
 */
export class HelperExtensionBridge {
  private ws: WebSocket | null = null;
  private desired: BridgeState | null = null;
  private claimedKey: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private readonly url: string;
  private handlers: HelperBridgeHandlers | null = null;
  private settingsRev = 0;
  private lastOutboundSettingsKey: string | null = null;
  private suppressSettingsPushUntil = 0;
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingState: BotState | null = null;

  constructor(url: string = HELPER_EXTENSION_WS_URL) {
    this.url = url;
  }

  setHandlers(handlers: HelperBridgeHandlers): void {
    this.handlers = handlers;
  }

  isLinked(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.claimedKey != null;
  }

  /** Keep the helper link claimed for this character while the game WS is open. */
  syncLive(characterId: string | null, characterName: string | null, gameConnected: boolean): void {
    if (!gameConnected || !characterId?.trim() || !characterName?.trim()) {
      void this.releaseAndClose();
      return;
    }
    if (!this.isGameLive()) {
      // Caller thought we were connected, but the game tab is not — do not claim.
      void this.releaseAndClose();
      return;
    }
    const next: BridgeState = {
      characterId: characterId.trim(),
      characterName: characterName.trim(),
    };
    const key = claimKey(next);
    if (this.desired && claimKey(this.desired) === key && this.ws?.readyState === WebSocket.OPEN) {
      if (this.claimedKey !== key) {
        this.sendClaim(next);
      }
      return;
    }
    this.desired = next;
    this.ensureConnected();
  }

  /** Game WS gone — release claim and close the helper control socket. */
  async releaseAndClose(): Promise<void> {
    this.desired = null;
    this.clearReconnect();
    this.clearStateThrottle();
    const ws = this.ws;
    if (!ws) {
      this.claimedKey = null;
      return;
    }
    this.intentionalClose = true;
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "release" }));
      } catch {
        // ignore
      }
    }
    this.claimedKey = null;
    try {
      ws.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }

  /** Debounced settings push while linked. */
  pushSettings(settings: Settings, featureMasters: FeatureMasters, characterId: string): void {
    if (!this.isLinked() || Date.now() < this.suppressSettingsPushUntil) {
      return;
    }
    const payload = buildSettingsSyncPayload(characterId, settings, featureMasters);
    const key = `${payload.characterId}\0${JSON.stringify(payload.settings)}\0${JSON.stringify(payload.featureMasters)}`;
    if (key === this.lastOutboundSettingsKey) {
      return;
    }
    this.lastOutboundSettingsKey = key;
    this.sendSettings(payload);
  }

  /** Throttled BotState push for the website SSE. */
  pushState(state: BotState): void {
    if (!this.isLinked()) {
      return;
    }
    this.pendingState = state;
    if (this.stateTimer) {
      return;
    }
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      const next = this.pendingState;
      this.pendingState = null;
      if (!next || !this.isLinked()) {
        return;
      }
      this.sendJson({ type: "state", state: next });
    }, STATE_THROTTLE_MS);
  }

  private isGameLive(): boolean {
    return this.handlers?.isGameLive() === true;
  }

  private ensureConnected(): void {
    if (!this.desired || !this.isGameLive()) {
      if (!this.isGameLive()) {
        this.desired = null;
      }
      return;
    }
    const state = this.ws?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
      if (state === WebSocket.OPEN) {
        this.sendClaim(this.desired);
      }
      return;
    }
    this.openSocket();
  }

  private openSocket(): void {
    this.clearReconnect();
    this.intentionalClose = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      if (this.desired && this.isGameLive()) {
        this.sendClaim(this.desired);
      } else {
        // Helper came back (or raced) without a live game session — never claim.
        this.desired = null;
        void this.releaseAndClose();
      }
    });

    ws.addEventListener("message", (event) => {
      void this.handleMessage(String(event.data));
    });

    ws.addEventListener("close", () => {
      if (this.ws === ws) {
        this.ws = null;
      }
      this.claimedKey = null;
      // Only reconnect while the game tab still holds the character.
      if (!this.intentionalClose && this.desired && this.isGameLive()) {
        this.scheduleReconnect();
      } else {
        this.desired = null;
        this.clearReconnect();
      }
    });

    ws.addEventListener("error", () => {
      // close handler will reconnect if still desired + game live
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    const msg = parsed as Record<string, unknown>;

    if (msg.type === "ok") {
      // Settings acks carry rev; claim ack does not — push full snapshot once claimed.
      if (typeof msg.rev === "number") {
        return;
      }
      if (this.claimedKey && this.handlers) {
        const payload = this.handlers.getSettingsPayload();
        if (payload) {
          this.lastOutboundSettingsKey = `${payload.characterId}\0${JSON.stringify(payload.settings)}\0${JSON.stringify(payload.featureMasters)}`;
          this.sendSettings(payload);
        }
        this.pushState(this.handlers.getBotState());
      }
      return;
    }

    if (msg.type === "settings") {
      if (!this.handlers || typeof msg.characterId !== "string") {
        return;
      }
      const rev = typeof msg.rev === "number" ? msg.rev : undefined;
      try {
        this.suppressSettingsPushUntil = Date.now() + 500;
        await this.handlers.onRemoteSettings({
          characterId: msg.characterId,
          settings:
            msg.settings && typeof msg.settings === "object"
              ? (msg.settings as Record<string, unknown>)
              : {},
          featureMasters:
            msg.featureMasters && typeof msg.featureMasters === "object"
              ? (msg.featureMasters as Partial<FeatureMasters>)
              : {},
          rev,
        });
        this.sendJson({ type: "ok", rev });
      } catch (error) {
        this.sendJson({
          type: "error",
          error: error instanceof Error ? error.message : String(error),
          rev,
        });
      }
      return;
    }

    if (msg.type === "command") {
      if (!this.handlers || typeof msg.id !== "string" || typeof msg.channel !== "string") {
        return;
      }
      const id = msg.id;
      const channel = msg.channel;
      const payload =
        msg.payload && typeof msg.payload === "object"
          ? (msg.payload as Record<string, unknown>)
          : {};
      try {
        const result = await this.handlers.onRemoteCommand(channel, payload);
        this.sendJson({ type: "commandResult", id, result });
      } catch (error) {
        this.sendJson({
          type: "commandResult",
          id,
          result: {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  private sendClaim(state: BridgeState): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!this.isGameLive()) {
      this.desired = null;
      void this.releaseAndClose();
      return;
    }
    const key = claimKey(state);
    try {
      ws.send(
        JSON.stringify({
          type: "claim",
          characterId: state.characterId,
          characterName: state.characterName,
        })
      );
      this.claimedKey = key;
    } catch {
      // close/reconnect will retry
    }
  }

  private sendSettings(payload: SettingsSyncPayload): void {
    const rev = ++this.settingsRev;
    this.sendJson({
      type: "settings",
      characterId: payload.characterId,
      settings: payload.settings,
      featureMasters: payload.featureMasters,
      rev,
    });
  }

  private sendJson(payload: Record<string, unknown>): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.desired || !this.isGameLive()) {
      return;
    }
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.desired && this.isGameLive()) {
        this.openSocket();
      } else {
        this.desired = null;
      }
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
  }

  private clearStateThrottle(): void {
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
    this.pendingState = null;
  }
}

function claimKey(state: BridgeState): string {
  return `${state.characterId}\0${state.characterName}`;
}
