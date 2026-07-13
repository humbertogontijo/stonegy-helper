import { pingMessage } from "../lib/protocol";
import type { BotState } from "../lib/types";
import { GameSession } from "../lib/core/session";
import { toBotState } from "../lib/core/projections/to-bot-state";
import type { Settings } from "../lib/core/settings";
import type { FeatureMasters } from "../lib/core/services/types";
import { DirectWsTransport } from "../lib/core/transports/direct-ws";

export interface CliSessionOptions {
  token: string;
  characterId: string;
  characterName: string;
  worldId?: number;
  verbose?: boolean;
  initialSettings?: Partial<Settings>;
  featureMasters?: FeatureMasters;
  onStatusChange?: (state: BotState) => void;
}

const PING_INTERVAL_MS = 30_000;

export class CliSession {
  readonly session: GameSession;
  private readonly transport: DirectWsTransport;
  private readonly verbose: boolean;
  private shuttingDown = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastStatusLine = "";
  private sigintHandler: (() => void) | null = null;

  constructor(private readonly options: CliSessionOptions) {
    this.verbose = options.verbose ?? false;

    this.transport = new DirectWsTransport({
      token: options.token,
      characterId: options.characterId,
      worldId: options.worldId,
      onOpen: () => {
        if (this.verbose) {
          console.log("WebSocket connected, authenticating…");
        }
      },
      onClose: (code: number, reason: string) => {
        if (this.shuttingDown) {
          return;
        }
        console.error(`[bot] WebSocket closed (${code}${reason ? ` ${reason}` : ""})`);
        this.stop();
      },
      onError: (error: Error) => {
        if (this.verbose) {
          console.error(`[bot] WebSocket error: ${error.message}`);
        }
      },
    });

    this.session = new GameSession(this.transport, {
      settings: {
        characterId: options.characterId,
        characterName: options.characterName,
        ...options.initialSettings,
      },
      featureMasters: options.featureMasters,
      onChange: (state: BotState) => {
        this.emitStatus(state);
        options.onStatusChange?.(state);
      },
    });
  }

  private emitStatus(state: BotState) {
    const parts = [
      state.character.characterName ?? state.character.characterId,
      state.party.partyStatus ?? "unknown",
    ];
    if (state.hunt.activeHuntId != null) {
      parts.push(`hunt ${state.hunt.activeHuntId}`);
    }
    if (state.settings.autoTaskerEnabled) {
      parts.push(`tasker:${state.settings.taskerPhase}`);
      if (state.settings.taskerStatus) {
        parts.push(state.settings.taskerStatus);
      }
    } else if (state.settings.autoHuntEnabled && state.settings.selectedHuntId != null) {
      parts.push(`auto-hunt ${state.settings.selectedHuntId}`);
    }
    const line = parts.filter(Boolean).join(" · ");
    if (line !== this.lastStatusLine) {
      this.lastStatusLine = line;
      console.log(`[bot] ${line}`);
    }
  }

  getState(): BotState {
    return toBotState(this.session.settings, this.session.view);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.session.updateSettings(patch);
  }

  async connect(): Promise<void> {
    this.sigintHandler = () => {
      console.log("\n[bot] Shutting down…");
      this.stop();
      process.exit(0);
    };
    process.on("SIGINT", this.sigintHandler);

    await this.session.start();
    console.log(`[bot] Connected as ${this.options.characterName}`);

    if (!this.session.view.character.characterId && !this.session.settings.characterId) {
      throw new Error("Character not synced after connect — try again.");
    }

    this.pingTimer = setInterval(() => {
      try {
        this.transport.sendPing(pingMessage(Date.now()));
      } catch {
        // Socket may have closed between ticks.
      }
    }, PING_INTERVAL_MS);
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

    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = null;
    }

    this.session.stop();
  }
}
