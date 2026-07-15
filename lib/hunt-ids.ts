/** Synthetic selectedHuntId namespace for boss maps (avoids colliding with hunt ids). */
export const BOSS_HUNT_ID_OFFSET = 1_000_000;
/** Synthetic selectedHuntId namespace for quest combat maps. */
export const QUEST_HUNT_ID_OFFSET = 2_000_000;

export function encodeBossHuntId(bossId: number): number {
  return BOSS_HUNT_ID_OFFSET + bossId;
}

export function encodeQuestHuntId(questId: number, missionId: number): number {
  return QUEST_HUNT_ID_OFFSET + questId * 1_000 + missionId;
}

export function decodeBossHuntId(huntId: number): number | null {
  if (huntId < BOSS_HUNT_ID_OFFSET || huntId >= QUEST_HUNT_ID_OFFSET) {
    return null;
  }
  return huntId - BOSS_HUNT_ID_OFFSET;
}

export function decodeQuestHuntId(
  huntId: number
): { questId: number; missionId: number } | null {
  if (huntId < QUEST_HUNT_ID_OFFSET) {
    return null;
  }
  const packed = huntId - QUEST_HUNT_ID_OFFSET;
  const questId = Math.floor(packed / 1_000);
  const missionId = packed % 1_000;
  return { questId, missionId };
}
