import { ITEMS } from "./data/items";
import type { InventoryItemEntry } from "./binary/types";
import type { ItemRecord } from "./types";

const GAME_ORIGIN = "https://stonegy-online.com";

const itemsById = new Map<number, ItemRecord>(
  ITEMS.map((item) => [item.id, item])
);

const itemsByName = new Map<string, ItemRecord>(
  ITEMS.map((item) => [item.name.toLowerCase(), item])
);

export function getItemById(itemId: number): ItemRecord | undefined {
  return itemsById.get(itemId);
}

export function getItemByName(name: string): ItemRecord | undefined {
  if (!name) {
    return undefined;
  }
  return itemsByName.get(name.toLowerCase());
}

export function listItems(): ItemRecord[] {
  return [...itemsById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getItemName(itemId: number): string | null {
  return getItemById(itemId)?.name ?? null;
}

/** Absolute URL for an inventory item GIF/PNG on the game CDN. */
export function getItemImageUrl(itemId: number): string | null {
  const image = getItemById(itemId)?.image;
  if (!image) {
    return null;
  }
  const file = /\.(gif|png|webp)$/i.test(image) ? image : `${image}.gif`;
  return `${GAME_ORIGIN}/assets/inventory/${file}`;
}

export type EquipmentSlot = "RING" | "NECK";

export interface InventoryEquipOption {
  itemId: number;
  name: string;
  amount: number;
  imageUrl: string | null;
}

function parseItemId(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const itemId = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(itemId) && itemId > 0 ? itemId : null;
}

/** Unique RING/NECK items currently in the backpack inventory. */
export function listInventoryEquipOptions(
  items: InventoryItemEntry[] | undefined,
  slot: EquipmentSlot,
  selectedIds: Array<string | number | null | undefined> = []
): InventoryEquipOption[] {
  const amounts = new Map<number, number>();
  for (const entry of items ?? []) {
    const item = getItemById(entry.itemId);
    if (!item || item.slot !== slot) {
      continue;
    }
    amounts.set(entry.itemId, (amounts.get(entry.itemId) ?? 0) + entry.amount);
  }

  for (const raw of selectedIds) {
    const itemId = parseItemId(raw);
    if (itemId == null || amounts.has(itemId)) {
      continue;
    }
    const item = getItemById(itemId);
    if (item?.slot === slot) {
      amounts.set(itemId, 0);
    }
  }

  return [...amounts.entries()]
    .map(([itemId, amount]) => {
      const item = getItemById(itemId);
      return {
        itemId,
        name: item?.name ?? `Item #${itemId}`,
        amount,
        imageUrl: getItemImageUrl(itemId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getNpcSellPrice(itemId: number): number | null {
  const price = getItemById(itemId)?.npcSellPrice;
  return typeof price === "number" ? price : null;
}

export function hasNpcSellPrice(itemId: number): boolean {
  return getNpcSellPrice(itemId) != null;
}

export function isMountItem(itemId: number): boolean {
  return getItemById(itemId)?.mountItem === true;
}

/** Mount item IDs from the catalog, sorted by name. */
export function listMountItemIds(): number[] {
  return listItems()
    .filter((item) => item.mountItem === true)
    .map((item) => item.id);
}

/** Untradable and quest items must never be auto-sold (market or NPC). */
export function shouldNeverAutoSell(itemId: number): boolean {
  const item = getItemById(itemId);
  if (!item) {
    return false;
  }

  return item.untradable === true || item.questItem === true;
}

/** Game rarityBorderTier values (1–5) with display names. */
export const RARITY_BORDER_TIERS = [
  { tier: 1, name: "Common" },
  { tier: 2, name: "Uncommon" },
  { tier: 3, name: "Rare" },
  { tier: 4, name: "Epic" },
  { tier: 5, name: "Legendary" },
] as const;

export type RarityBorderTier = (typeof RARITY_BORDER_TIERS)[number]["tier"];

export function getRarityBorderTierName(tier: number): string {
  return RARITY_BORDER_TIERS.find((entry) => entry.tier === tier)?.name ?? `Tier ${tier}`;
}

export function normalizeRarityBorderTier(tier: number | null | undefined): RarityBorderTier {
  const value = Math.floor(Number(tier) || 1);
  if (value <= 1) {
    return 1;
  }
  if (value >= 5) {
    return 5;
  }
  return value as RarityBorderTier;
}

/** Prefer rarityBorderTier; fall back to classification when the border tier is missing. */
export function getItemMarketRarityTier(itemId: number): number | null {
  const item = getItemById(itemId);
  if (!item) {
    return null;
  }

  if (typeof item.rarityBorderTier === "number" && Number.isFinite(item.rarityBorderTier)) {
    return item.rarityBorderTier;
  }

  if (typeof item.classification === "number" && Number.isFinite(item.classification)) {
    return item.classification;
  }

  return null;
}

export function getItemRarityBorderTier(itemId: number): RarityBorderTier | null {
  const tier = getItemMarketRarityTier(itemId);
  if (tier == null) {
    return null;
  }
  return normalizeRarityBorderTier(tier);
}

/** True when rarityBorderTier (or classification fallback) is at or above the configured minimum. */
export function matchesMarketSellRarity(itemId: number, minTier: number): boolean {
  const tier = getItemMarketRarityTier(itemId);
  return tier != null && tier >= minTier;
}
