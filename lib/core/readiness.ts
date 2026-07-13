import { ReceiveMessageTypes } from "../protocol";
import type { GameEvent } from "./events/types";
import type { GameSession } from "./session";
import {
  INTERACTIVE_COMMAND_TIMEOUT_MS,
  hasQuestContextData,
  isInActiveHunt,
  isPartyReady,
  isSessionBootstrapped,
} from "./context-sync";

export const PARTY_PUSH_WAIT_MS = 4_000;
export const QUEST_PUSH_WAIT_MS = 4_000;
export const SESSION_BOOTSTRAP_WAIT_MS = 15_000;

export function isBootstrapEvent(event: GameEvent): boolean {
  return event.kind === "json" && event.message.type === ReceiveMessageTypes.SESSION_BOOTSTRAP;
}

export function isPartySnapshotEvent(event: GameEvent): boolean {
  return event.kind === "json" && event.message.type === ReceiveMessageTypes.PARTY_SNAPSHOT;
}

export function isTasksSnapshotEvent(event: GameEvent): boolean {
  return event.kind === "json" && event.message.type === ReceiveMessageTypes.TASKS_SNAPSHOT;
}

export async function awaitSessionReady(session: GameSession): Promise<void> {
  if (!isSessionBootstrapped(session)) {
    try {
      await session.waitFor(isBootstrapEvent, SESSION_BOOTSTRAP_WAIT_MS);
    } catch {
      // Extension may already have bootstrap from relayed traffic before connect().
    }
  }

  if (!session.services.partyState.partySnapshotSynced) {
    const partyWait = session.waitFor(isPartySnapshotEvent, PARTY_PUSH_WAIT_MS);
    const timer = new Promise<void>((resolve) => setTimeout(resolve, PARTY_PUSH_WAIT_MS));
    await Promise.race([partyWait, timer]).catch(() => {});

    if (!session.services.partyState.partySnapshotSynced) {
      await session.syncPartyContext({
        force: true,
        timeoutMs: INTERACTIVE_COMMAND_TIMEOUT_MS,
      });
    }
  }
}

export async function waitForPartySnapshot(
  session: GameSession,
  options: { timeoutMs?: number } = {}
): Promise<void> {
  if (isPartyReady(session)) {
    return;
  }

  const timeoutMs = options.timeoutMs ?? PARTY_PUSH_WAIT_MS;

  try {
    await session.waitFor(isPartySnapshotEvent, timeoutMs);
  } catch {
    const result = await session.syncPartyContext({ force: true, timeoutMs });
    if (result.success === false) {
      throw new Error(result.errorMessage ?? "Could not sync party context");
    }
  }
}

export async function waitForQuestSnapshot(
  session: GameSession,
  options: { timeoutMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? QUEST_PUSH_WAIT_MS;

  try {
    await session.waitFor(isTasksSnapshotEvent, timeoutMs);
  } catch {
    if (hasQuestContextData(session)) {
      return;
    }

    const result = await session.syncQuestContext({ force: true, timeoutMs });
    if (result.success === false) {
      throw new Error(result.errorMessage ?? "Could not sync quest context");
    }
  }
}

/** Fire-and-forget quest snapshot request for event-driven automation. */
export function requestQuestSnapshot(session: GameSession): void {
  if (hasQuestContextData(session) || isInActiveHunt(session)) {
    return;
  }

  void session.syncQuestContext({ force: true, waitForResponse: false });
}

/** Fire-and-forget party snapshot request for event-driven automation. */
export function requestPartySnapshot(session: GameSession): void {
  if (isPartyReady(session)) {
    return;
  }

  void session.syncPartyContext({ force: true, waitForResponse: false });
}
