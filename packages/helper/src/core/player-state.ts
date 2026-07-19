import type { PlayerState } from "../types";
import type { GameSession } from "./session";

export function updatePlayerState(
  session: GameSession,
  state: PlayerState,
  detail = ""
): void {
  session.services.setPlayerState(state, detail);
  session.notifyChange();
}

export function getPlayerState(session: GameSession): PlayerState {
  return session.services.getPlayerState().playerState;
}

export function isHandlingLoot(session: GameSession): boolean {
  const state = getPlayerState(session);
  return state === "selling_loot" || state === "splitting_loot";
}

export function isSplittingLoot(session: GameSession): boolean {
  return getPlayerState(session) === "splitting_loot";
}

export function isPlayerIdling(session: GameSession): boolean {
  return getPlayerState(session) === "idling";
}

export function canRunIdleAutomation(session: GameSession): boolean {
  return isPlayerIdling(session);
}
