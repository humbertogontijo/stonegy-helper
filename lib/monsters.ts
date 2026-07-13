import { HUNTS } from "./data/hunts";
import { MONSTERS } from "./data/monsters";
import type { MonsterLootEntry, MonsterRecord } from "./types";

const monstersById = new Map<number, MonsterRecord>(
  (MONSTERS as MonsterRecord[]).map((monster) => [monster.id, monster])
);

export function getMonsterById(monsterId: number): MonsterRecord | undefined {
  return monstersById.get(monsterId);
}

export function listMonsters(): MonsterRecord[] {
  return [...monstersById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getMonsterLoot(monsterId: number): MonsterLootEntry[] {
  return getMonsterById(monsterId)?.loot ?? [];
}

export function getHuntMonsterIds(huntId: number): number[] {
  const hunt = (HUNTS as Array<{ id: number; monsters?: number[] }>).find((entry) => entry.id === huntId);
  return hunt?.monsters ?? [];
}

export function getHuntDroppedItems(huntId: number): MonsterLootEntry[] {
  const seen = new Set<number>();
  const drops: MonsterLootEntry[] = [];

  for (const monsterId of getHuntMonsterIds(huntId)) {
    for (const loot of getMonsterLoot(monsterId)) {
      if (seen.has(loot.itemId)) {
        continue;
      }

      seen.add(loot.itemId);
      drops.push(loot);
    }
  }

  return drops.sort((a, b) => a.itemId - b.itemId);
}

export function getHuntDroppedItemIds(huntId: number): number[] {
  return getHuntDroppedItems(huntId).map((loot) => loot.itemId);
}
