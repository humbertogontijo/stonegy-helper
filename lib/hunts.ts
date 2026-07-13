import { HUNTS } from "./data/hunts";
import type { HuntRecord, HuntSummary, TilePosition } from "./types";

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

export const DEFAULT_PARTY_POSITION: TilePosition = { x: 2, y: 0 };

export function isBasePartyPosition(x: number, y: number): boolean {
  return BASE_PARTY_POSITIONS.some((pos) => pos.x === x && pos.y === y);
}

function getRawHunt(huntId: number): HuntRecord | undefined {
  return (HUNTS as HuntRecord[]).find((hunt) => hunt.id === huntId);
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

export function getHuntById(huntId: number): HuntSummary | undefined {
  const hunt = getRawHunt(huntId);
  if (!hunt) {
    return undefined;
  }

  return {
    id: hunt.id,
    title: hunt.title,
    recommendedLevel: hunt.recommendedLevel,
    levelMin: hunt.levelMin,
  };
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

export function resolvePartyPosition(
  huntId: number | null | undefined,
  preferred: TilePosition | null | undefined
): TilePosition | null {
  const positions = huntId == null ? [...BASE_PARTY_POSITIONS] : getPartyPositions(huntId);
  if (!positions.length) {
    return null;
  }

  if (preferred && positions.some((pos) => pos.x === preferred.x && pos.y === preferred.y)) {
    return preferred;
  }

  return positions[0];
}

export function getHuntLureRange(huntId: number): { min: number; max: number } {
  const hunt = getRawHunt(huntId);
  if (!hunt) {
    return { min: 1, max: 1 };
  }

  const max = hunt.maxLure ?? 1;
  const min = hunt.minLure ?? 1;
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

export function resolveLureId(huntId: number, preferred: number | null | undefined): number {
  const { min, max } = getHuntLureRange(huntId);

  if (preferred != null && preferred >= min && preferred <= max) {
    return preferred;
  }

  return max;
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
