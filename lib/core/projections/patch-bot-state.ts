import type { BotState } from "../../types";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type BotStatePatch = DeepPartial<BotState>;

export function patchBotState(state: BotState, patch: BotStatePatch): BotState {
  return {
    ...state,
    ...patch,
    connection: patch.connection ? { ...state.connection, ...patch.connection } : state.connection,
    character: patch.character ? { ...state.character, ...patch.character } : state.character,
    party: patch.party ? { ...state.party, ...patch.party } : state.party,
    hunt: patch.hunt ? { ...state.hunt, ...patch.hunt } : state.hunt,
    training: patch.training ? { ...state.training, ...patch.training } : state.training,
    inventory: patch.inventory ? { ...state.inventory, ...patch.inventory } : state.inventory,
    market: patch.market ? { ...state.market, ...patch.market } : state.market,
    quests: patch.quests ? { ...state.quests, ...patch.quests } : state.quests,
    settings: patch.settings ? { ...state.settings, ...patch.settings } : state.settings,
    battlePreset: patch.battlePreset
      ? { ...state.battlePreset, ...patch.battlePreset }
      : state.battlePreset,
    characterBattlePreset: patch.characterBattlePreset
      ? { ...state.characterBattlePreset, ...patch.characterBattlePreset }
      : state.characterBattlePreset,
    logs: patch.logs ?? state.logs,
  } as BotState;
}
