import { QUESTS } from "@stonegy/game-data/quests";
import type { QuestMission, QuestRecord } from "./types";

export interface QuestRoomWave {
  minMonsters?: number;
  maxMonsters?: number;
  monsterIds?: number[];
  waveAmount?: number;
}

export interface QuestRoom {
  id: number;
  title: string;
  mapId: number;
  ambientLight?: number;
  waves?: QuestRoomWave[];
}

export interface QuestCombatMission {
  questId: number;
  questTitle: string;
  levelMin?: number;
  missionId: number;
  missionTitle: string;
  rooms: QuestRoom[];
}

function isQuestRoom(value: unknown): value is QuestRoom {
  if (!value || typeof value !== "object") {
    return false;
  }
  const room = value as Record<string, unknown>;
  return (
    typeof room.id === "number" &&
    typeof room.title === "string" &&
    typeof room.mapId === "number"
  );
}

function readQuestRooms(mission: QuestMission): QuestRoom[] {
  const rooms = mission.rooms;
  if (!Array.isArray(rooms)) {
    return [];
  }
  return rooms.filter(isQuestRoom);
}

/** Combat (`current_hunt`) missions — each is a selectable quest map. */
export function listQuestCombatMissions(): QuestCombatMission[] {
  const missions: QuestCombatMission[] = [];

  for (const quest of QUESTS as QuestRecord[]) {
    for (const mission of quest.missions ?? []) {
      if (mission.type !== "current_hunt") {
        continue;
      }
      const rooms = readQuestRooms(mission);
      if (!rooms.length) {
        continue;
      }
      missions.push({
        questId: quest.id,
        questTitle: quest.title,
        levelMin: quest.levelMin,
        missionId: mission.id,
        missionTitle: mission.title,
        rooms,
      });
    }
  }

  return missions.sort(
    (a, b) =>
      (a.levelMin ?? 0) - (b.levelMin ?? 0) ||
      a.questTitle.localeCompare(b.questTitle) ||
      a.missionTitle.localeCompare(b.missionTitle)
  );
}

export function getQuestCombatMission(
  questId: number,
  missionId: number
): QuestCombatMission | undefined {
  return listQuestCombatMissions().find(
    (entry) => entry.questId === questId && entry.missionId === missionId
  );
}

export function getQuestCombatMonsterIds(questId: number, missionId: number): number[] {
  const mission = getQuestCombatMission(questId, missionId);
  if (!mission) {
    return [];
  }

  const seen = new Set<number>();
  const monsterIds: number[] = [];

  for (const room of mission.rooms) {
    for (const wave of room.waves ?? []) {
      for (const monsterId of wave.monsterIds ?? []) {
        if (seen.has(monsterId)) {
          continue;
        }
        seen.add(monsterId);
        monsterIds.push(monsterId);
      }
    }
  }

  return monsterIds;
}
