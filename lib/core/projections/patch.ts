import type { SessionView } from "./types";

export type SessionViewPatch = {
  [K in keyof SessionView]?: SessionView[K] extends object
    ? Partial<SessionView[K]>
    : SessionView[K];
};

/** Shallow-merge a partial SessionView onto an existing view (tests + persistence). */
export function patchSessionView(view: SessionView, patch: SessionViewPatch): SessionView {
  return {
    ...view,
    playerState: patch.playerState ?? view.playerState,
    playerStateDetail: patch.playerStateDetail ?? view.playerStateDetail,
    connection: patch.connection ? { ...view.connection, ...patch.connection } : view.connection,
    character: patch.character ? { ...view.character, ...patch.character } : view.character,
    party: patch.party ? { ...view.party, ...patch.party } : view.party,
    hunt: patch.hunt ? { ...view.hunt, ...patch.hunt } : view.hunt,
    training: patch.training ? { ...view.training, ...patch.training } : view.training,
    inventory: patch.inventory ? { ...view.inventory, ...patch.inventory } : view.inventory,
    market: patch.market ? { ...view.market, ...patch.market } : view.market,
    quests: patch.quests ? { ...view.quests, ...patch.quests } : view.quests,
    bless: patch.bless
      ? {
          ...view.bless,
          ...patch.bless,
          blessings: patch.bless.blessings ?? view.bless.blessings,
        }
      : view.bless,
    battlePreset: patch.battlePreset
      ? { ...view.battlePreset, ...patch.battlePreset }
      : view.battlePreset,
  };
}
