import { pingMessage, ReceiveMessageTypes } from "@stonegy/helper/protocol";
import type { BotState } from "@stonegy/helper/types";
import { GameSession } from "@stonegy/helper/core/session";
import { DirectWsTransport } from "@stonegy/helper/core/transports/direct-ws";
import { loadCharacterConfig, saveCharacterConfig } from "./config";
import { collectPersistedSettings } from "./feature-control";
import type { HelperProfile } from "./profile-store";
import {
  handleSessionCommand,
  type SessionCommandResponse,
} from "@stonegy/helper/core/session-commands";

const PING_INTERVAL_MS = 30_000;

export type ManagedSessionCloseReason = "closed" | "replaced" | "stopped";

export interface ManagedSessionOptions {
  profile: HelperProfile;
  verbose?: boolean;
  onChange?: (state: BotState) => void;
  onClosed?: (reason: ManagedSessionCloseReason) => void;
}

export class ManagedSession {
  readonly characterId: string;
  readonly characterName: string;
  private readonly transport: DirectWsTransport;
  private readonly session: GameSession;
  private readonly verbose: boolean;
  private shuttingDown = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private replaced = false;

  constructor(options: ManagedSessionOptions) {
    const { profile } = options;
    this.characterId = profile.characterId;
    this.characterName = profile.characterName;
    this.verbose = options.verbose ?? false;

    this.transport = new DirectWsTransport({
      token: profile.token,
      characterId: profile.characterId,
      worldId: profile.worldId,
      onMessage: (raw) => {
        try {
          const parsed = JSON.parse(raw) as { type?: string };
          if (parsed.type === ReceiveMessageTypes.ACCOUNT_SESSION_REPLACED) {
            this.replaced = true;
            if (this.verbose) {
              console.log(`[helper] ${profile.characterName}: account_session_replaced`);
            }
          }
        } catch {
          // ignore non-json
        }
      },
      onClose: () => {
        if (this.shuttingDown) {
          return;
        }
        const reason: ManagedSessionCloseReason = this.replaced ? "replaced" : "closed";
        this.stop();
        options.onClosed?.(reason);
      },
      onError: (error: Error) => {
        if (this.verbose) {
          console.error(`[helper] ${profile.characterName}: ${error.message}`);
        }
      },
    });

    this.session = new GameSession(this.transport, {
      settings: {
        characterId: profile.characterId,
        characterName: profile.characterName,
      },
      onChange: (state) => {
        this.schedulePersist();
        options.onChange?.(state);
      },
    });
  }

  get state(): BotState {
    return this.session.botState;
  }

  async connect(): Promise<void> {
    const config = await loadCharacterConfig(this.characterId);
    this.session.updateSettings({
      ...config.settings,
      characterId: this.characterId,
      characterName: this.characterName,
    });
    await this.session.services.setMasters(config.featureMasters);

    await this.session.start();
    console.log(`[helper] Connected as ${this.characterName} (${this.characterId})`);

    this.pingTimer = setInterval(() => {
      try {
        this.transport.sendPing(pingMessage(Date.now()));
      } catch {
        // socket may have closed
      }
    }, PING_INTERVAL_MS);
  }

  async handleCommand(
    channel: string,
    payload: Record<string, unknown> = {}
  ): Promise<SessionCommandResponse> {
    const response = await handleSessionCommand(this.session, channel, payload);
    if (
      channel === "bot:set-settings" ||
      channel === "bot:set-feature-masters" ||
      channel === "bot:start-auto-hunt" ||
      channel === "bot:stop-auto-hunt" ||
      channel === "bot:start-auto-tasker" ||
      channel === "bot:stop-auto-tasker"
    ) {
      await this.persistNow();
    }
    return response;
  }

  async syncPartyContext(): Promise<void> {
    await this.session.syncPartyContext();
  }

  stop(): void {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    void this.persistNow();
    this.session.stop();
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 2000);
  }

  private async persistNow(): Promise<void> {
    try {
      const masters = this.session.services.getMasters();
      const settings = collectPersistedSettings({
        session: this.session,
        featureMasters: masters,
        getState: () => this.state,
      });
      await saveCharacterConfig(this.characterId, {
        featureMasters: masters,
        settings,
      });
    } catch (error) {
      console.error(
        `[helper] Failed to persist config for ${this.characterName}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}
