import {
  emptyDebugTelemetry,
  sanitizeDebugTelemetry,
  type DebugTelemetrySnapshot,
} from "../events/debug-telemetry";
import { resolveBattlePreset } from "../../presets";
import type { BotState, LogEntry } from "../../types";
import { getHuntBattleSettings, type Settings } from "../settings";
import type { SessionView } from "./types";

export interface TelemetryState {
  logs: LogEntry[];
  debug: DebugTelemetrySnapshot;
}

export function toBotState(
  settings: Settings,
  view: SessionView,
  telemetry: TelemetryState = { logs: [], debug: emptyDebugTelemetry() }
): BotState {
  const huntId = settings.selectedHuntId ?? view.hunt.activeHuntId;
  const configured = getHuntBattleSettings(settings, huntId).battlePreset;
  return {
    connection: view.connection,
    character: {
      ...view.character,
      characterId: view.character.characterId ?? settings.characterId,
      characterName: view.character.characterName ?? settings.characterName,
    },
    party: view.party,
    hunt: view.hunt,
    training: view.training,
    inventory: view.inventory,
    market: view.market,
    quests: view.quests,
    playerState: view.playerState,
    playerStateDetail: view.playerStateDetail,
    battlePreset: resolveBattlePreset(configured, view.battlePreset),
    settings,
    logs: telemetry.logs,
    // Heal cyclic flow-trace results so Safari/Chrome message passing can serialize.
    debug: sanitizeDebugTelemetry(telemetry.debug ?? emptyDebugTelemetry()),
  };
}
