import { getBossById, listBosses } from "./bosses";
import { HUNTS } from "@stonegy/game-data/hunts";
import { clampLureId, GLOBAL_LURE_ID_MIN } from "./domain/hunt/lure";
import {
  decodeBossHuntId,
  decodeQuestHuntId,
  encodeBossHuntId,
  encodeQuestHuntId,
} from "./hunt-ids";
import { getMonsterById } from "./monsters";
import { getQuestCombatMission, listQuestCombatMissions } from "./quests";
import type { HuntRecord, HuntSelectorOption, HuntSummary, TilePosition } from "./types";

const PARTY_X_MIN = -4;
const PARTY_X_MAX = 4;
const PARTY_Y_MIN = -1;
const PARTY_Y_MAX = 1;

export const PARTY_GRID_BOUNDS = {
  xMin: PARTY_X_MIN,
  xMax: PARTY_X_MAX,
  yMin: PARTY_Y_MIN,
  yMax: PARTY_Y_MAX,
};

/** Valid tiles before hunt-specific blockedTiles filtering. */
export const BASE_PARTY_POSITIONS: TilePosition[] = [
  { x: -4, y: -1 },
  { x: -3, y: -1 },
  { x: -2, y: -1 },
  { x: 2, y: -1 },
  { x: 3, y: -1 },
  { x: 4, y: -1 },
  { x: -4, y: 0 },
  { x: -3, y: 0 },
  { x: -2, y: 0 },
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 4, y: 0 },
  { x: -4, y: 1 },
  { x: -3, y: 1 },
  { x: -2, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 4, y: 1 },
];

export function isBasePartyPosition(x: number, y: number): boolean {
  return BASE_PARTY_POSITIONS.some((pos) => pos.x === x && pos.y === y);
}

function getRawHunt(huntId: number): HuntRecord | undefined {
  return (HUNTS as HuntRecord[]).find((hunt) => hunt.id === huntId);
}

function getBossTitle(bossId: number): string | null {
  const boss = getBossById(bossId);
  if (!boss) {
    return null;
  }
  return getMonsterById(boss.monsterId)?.name ?? `Boss #${boss.id}`;
}

export function isRealHuntId(huntId: number): boolean {
  return getRawHunt(huntId) != null;
}

/** Catalog hunts that can be started via START_HUNT (not boss/quest selector ids). */
export function isStartableHuntId(huntId: number): boolean {
  return isRealHuntId(huntId);
}

/** Battle selector ids: catalog hunts plus synthetic boss/quest entries. */
export function isSelectableHuntId(huntId: number): boolean {
  return getHuntById(huntId) != null;
}

export function listHunts(): HuntSummary[] {
  return HUNTS
    .map(({ id, title, recommendedLevel, levelMin }) => ({
      id,
      title,
      recommendedLevel,
      levelMin,
    }))
    .sort(
      (a, b) =>
        (a.recommendedLevel ?? 0) - (b.recommendedLevel ?? 0) ||
        a.title.localeCompare(b.title)
    );
}

/** Hunt + quest combat maps + boss maps for the Battle hunt selector. */
export function listHuntSelectorOptions(): HuntSelectorOption[] {
  const hunts: HuntSelectorOption[] = listHunts().map((hunt) => {
    const level = hunt.recommendedLevel ?? hunt.levelMin ?? "?";
    return {
      ...hunt,
      kind: "hunt",
      label: `#${hunt.id} · ${hunt.title} (lvl ${level})`,
    };
  });

  const bosses: HuntSelectorOption[] = listBosses().map((boss) => {
    const id = encodeBossHuntId(boss.id);
    const title = getBossTitle(boss.id) ?? `Boss #${boss.id}`;
    const level = boss.recommendedLevel ?? "?";
    return {
      id,
      title,
      recommendedLevel: boss.recommendedLevel,
      kind: "boss",
      label: `Boss · ${title} · ${boss.bossType} (lvl ${level})`,
    };
  });

  const quests: HuntSelectorOption[] = listQuestCombatMissions().map((mission) => {
    const id = encodeQuestHuntId(mission.questId, mission.missionId);
    const title = `${mission.questTitle} · ${mission.missionTitle}`;
    const level = mission.levelMin ?? "?";
    return {
      id,
      title,
      levelMin: mission.levelMin,
      kind: "quest",
      label: `Quest · ${title} (lvl ${level})`,
    };
  });

  return [...hunts, ...quests, ...bosses];
}

export function getHuntById(huntId: number): HuntSummary | undefined {
  const hunt = getRawHunt(huntId);
  if (hunt) {
    return {
      id: hunt.id,
      title: hunt.title,
      recommendedLevel: hunt.recommendedLevel,
      levelMin: hunt.levelMin,
    };
  }

  const bossId = decodeBossHuntId(huntId);
  if (bossId != null) {
    const title = getBossTitle(bossId);
    if (!title) {
      return undefined;
    }
    const boss = getBossById(bossId);
    return {
      id: huntId,
      title,
      recommendedLevel: boss?.recommendedLevel,
    };
  }

  const questRef = decodeQuestHuntId(huntId);
  if (questRef) {
    const mission = getQuestCombatMission(questRef.questId, questRef.missionId);
    if (!mission) {
      return undefined;
    }
    return {
      id: huntId,
      title: `${mission.questTitle} · ${mission.missionTitle}`,
      levelMin: mission.levelMin,
    };
  }

  return undefined;
}

/**
 * Maps a live hunt_bootstrap payload to a Battle-selector id.
 * Quest/boss rooms reuse game hunt ids that can collide with catalog hunts
 * (e.g. boss id 43 vs "Lava Lurker"); prefer synthetic selector ids whenever
 * questFight/bossFight metadata is present so settings stay on catalog entries.
 */
export function resolveSelectorHuntIdFromBootstrap(
  hunt:
    | {
        id?: number;
        mode?: string;
        questFight?: { questId?: number; missionId?: number } | null;
        bossFight?: { bossId?: number; id?: number } | null;
      }
    | null
    | undefined
): number | null {
  if (!hunt || typeof hunt.id !== "number" || !Number.isFinite(hunt.id)) {
    return null;
  }

  const questFight = hunt.questFight;
  if (
    questFight &&
    typeof questFight.questId === "number" &&
    typeof questFight.missionId === "number"
  ) {
    return encodeQuestHuntId(questFight.questId, questFight.missionId);
  }

  const bossFight = hunt.bossFight;
  if (bossFight) {
    const bossId =
      typeof bossFight.bossId === "number"
        ? bossFight.bossId
        : typeof bossFight.id === "number"
          ? bossFight.id
          : null;
    if (bossId != null && getBossById(bossId)) {
      return encodeBossHuntId(bossId);
    }
  }

  if (isRealHuntId(hunt.id)) {
    return hunt.id;
  }

  return null;
}

/** Label for an active (possibly non-catalog) hunt in the Battle selector. */
export function formatActiveHuntSelectorLabel(
  huntId: number,
  title: string | null | undefined
): string {
  if (title && title.length > 0) {
    return `#${huntId} · ${title}`;
  }
  const known = getHuntById(huntId);
  if (known) {
    const level = known.recommendedLevel ?? known.levelMin ?? "?";
    return `#${huntId} · ${known.title} (lvl ${level})`;
  }
  return `#${huntId} · Current hunt`;
}

export function getPartyPositions(huntId: number): TilePosition[] {
  const hunt = getRawHunt(huntId);
  if (!hunt) {
    return [...BASE_PARTY_POSITIONS];
  }

  const blocked = new Set((hunt.blockedTiles ?? []).map((tile) => `${tile.x},${tile.y}`));
  return BASE_PARTY_POSITIONS.filter((pos) => !blocked.has(`${pos.x},${pos.y}`));
}

export function isPartyPositionSelectable(
  huntId: number | null | undefined,
  x: number,
  y: number
): boolean {
  if (!isBasePartyPosition(x, y)) {
    return false;
  }

  if (huntId == null) {
    return true;
  }

  return isPartyPositionAvailable(huntId, x, y);
}

export function isPartyPositionAvailable(huntId: number, x: number, y: number): boolean {
  return getPartyPositions(huntId).some((pos) => pos.x === x && pos.y === y);
}

export function formatPartyPosition(position: TilePosition): string {
  return `(${position.x}, ${position.y})`;
}

export function partyPositionKey(position: TilePosition): string {
  return `${position.x},${position.y}`;
}

export function isValidPartyPosition(huntId: number, x: number, y: number): boolean {
  return getPartyPositions(huntId).some((pos) => pos.x === x && pos.y === y);
}

/**
 * Returns `preferred` when it is walkable for the hunt; otherwise null.
 * Does not invent a tile — callers must skip placement when unset/invalid.
 */
export function resolvePartyPosition(
  huntId: number | null | undefined,
  preferred: TilePosition | null | undefined
): TilePosition | null {
  if (!preferred) {
    return null;
  }

  const positions = huntId == null ? [...BASE_PARTY_POSITIONS] : getPartyPositions(huntId);
  if (!positions.some((pos) => pos.x === preferred.x && pos.y === preferred.y)) {
    return null;
  }

  return preferred;
}

export function getHuntLureRange(huntId: number): { min: number; max: number } {
  const hunt = getRawHunt(huntId);
  if (!hunt) {
    return { min: GLOBAL_LURE_ID_MIN, max: GLOBAL_LURE_ID_MIN };
  }

  // Hunt data sometimes lists maxLure above the global catalog (ids 1–7).
  // The game only offers catalog entries, so clamp before sending hunt_lure_id.
  let min = clampLureId(hunt.minLure ?? GLOBAL_LURE_ID_MIN);
  let max = clampLureId(hunt.maxLure ?? GLOBAL_LURE_ID_MIN);
  if (min > max) {
    min = max;
  }
  return { min, max };
}

export function getHuntLureOptions(huntId: number): number[] {
  const { min, max } = getHuntLureRange(huntId);
  const options: number[] = [];

  for (let lureId = min; lureId <= max; lureId++) {
    options.push(lureId);
  }

  return options;
}

export function isValidLureId(huntId: number, lureId: number): boolean {
  const { min, max } = getHuntLureRange(huntId);
  return lureId >= min && lureId <= max;
}

/**
 * Returns `preferred` when it is valid for the hunt; otherwise null.
 * Does not invent a lure — callers must skip lock when unset/invalid.
 */
export function resolveLureId(
  huntId: number,
  preferred: number | null | undefined
): number | null {
  if (preferred == null) {
    return null;
  }

  const { min, max } = getHuntLureRange(huntId);
  if (preferred < min || preferred > max) {
    return null;
  }

  return preferred;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function parsePartyPositionFromHuntUpdate(
  data: Record<string, unknown> | undefined,
  characterId: string | null
): TilePosition | null {
  if (!data || !characterId) {
    return null;
  }

  const meId = readId(data.meId);
  if (meId === characterId) {
    const topLevelPosition = readTilePosition(data);
    if (topLevelPosition) {
      return topLevelPosition;
    }
  }

  const players = data.players;
  if (!Array.isArray(players)) {
    return null;
  }

  const me = players.find((player) => {
    if (!player || typeof player !== "object") {
      return false;
    }
    const record = player as Record<string, unknown>;
    const id = readId(record.id ?? record.characterId);
    return id === characterId;
  }) as Record<string, unknown> | undefined;

  if (!me) {
    return null;
  }

  return readTilePosition(me);
}

function readTilePosition(record: Record<string, unknown>): TilePosition | null {
  const position = record.position ?? record.partyPosition ?? record.tile;
  if (position && typeof position === "object") {
    const pos = position as Record<string, unknown>;
    const x = readNumber(pos.x);
    const y = readNumber(pos.y);
    if (x != null && y != null) {
      return { x, y };
    }
  }

  const x = readNumber(record.x ?? record.partyPositionX);
  const y = readNumber(record.y ?? record.partyPositionY);
  if (x != null && y != null) {
    return { x, y };
  }

  return null;
}
