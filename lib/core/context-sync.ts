import type { GameSession } from "./session";

/** TTL for manual refresh UX only — not used for automation gates. */
export const CONTEXT_STALE_MS = 5_000;
export const INTERACTIVE_COMMAND_TIMEOUT_MS = 4_000;
/** Default wait for party:action_result / hunt_bootstrap after start_hunt. */
export const START_HUNT_TIMEOUT_MS = 10_000;

export function resolveStartHuntTimeoutMs(_session: GameSession): number {
  return START_HUNT_TIMEOUT_MS;
}

export function isInActiveHunt(session: GameSession): boolean {
  const { services } = session;
  return (
    services.getPlayerState().playerState === "hunting" ||
    services.huntState.isActivelyHunting()
  );
}

export function isInActiveTraining(session: GameSession): boolean {
  const { services } = session;
  return (
    services.getPlayerState().playerState === "training" ||
    services.partyState.partyStatus === "training" ||
    services.trainingState.activeTrainingId != null
  );
}

export function isSessionBootstrapped(session: GameSession): boolean {
  return !!session.services.sessionState.characterId;
}

/** Party projection is complete enough for automation (no TTL). */
export function isPartyReady(session: GameSession): boolean {
  const { services } = session;
  return !!(
    session.connected &&
    services.sessionState.characterId &&
    services.partyState.partySnapshotSynced
  );
}

/** Recent party snapshot — for manual refresh hints only. */
export function isPartyContextFresh(session: GameSession, maxAgeMs = CONTEXT_STALE_MS): boolean {
  const lastAt = session.services.partyState.lastSnapshotAt;
  return !!(
    isPartyReady(session) &&
    lastAt != null &&
    Date.now() - lastAt < maxAgeMs
  );
}

export function isQuestContextFresh(session: GameSession, maxAgeMs = CONTEXT_STALE_MS): boolean {
  const lastAt = session.services.tasksState.lastQuestSnapshotAt;
  return lastAt != null && Date.now() - lastAt < maxAgeMs;
}

export function hasQuestContextData(session: GameSession): boolean {
  const { services } = session;
  return (
    services.tasksState.lastQuestSnapshotAt != null ||
    services.tasksState.tasks.length > 0 ||
    services.sessionState.finishedTasks.length > 0 ||
    services.sessionState.finishedQuests.length > 0
  );
}

/** Quest projection is complete enough for automation (no TTL). */
export function isQuestReady(session: GameSession): boolean {
  return hasQuestContextData(session);
}

/** Bless projection has been synced at least once. */
export function isBlessReady(session: GameSession): boolean {
  return session.services.blessState.blessSnapshotSynced;
}
