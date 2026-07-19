import { BOSSES } from "@stonegy/game-data/bosses";
import type { BossRecord } from "./types";

export function listBosses(): BossRecord[] {
  return [...(BOSSES as BossRecord[])].sort(
    (a, b) =>
      (a.recommendedLevel ?? 0) - (b.recommendedLevel ?? 0) ||
      a.id - b.id
  );
}

export function getBossById(bossId: number): BossRecord | undefined {
  return (BOSSES as BossRecord[]).find((boss) => boss.id === bossId);
}

export function getBossMonsterIds(bossId: number): number[] {
  const boss = getBossById(bossId);
  return boss ? [boss.monsterId] : [];
}
