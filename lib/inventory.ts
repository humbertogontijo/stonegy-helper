import type { InventoryItemEntry } from "./binary/types";
import { getItemById } from "./items";

/** Remaining charge/duration units encoded in inventory item flagsA high word. */
export function getInventoryItemRemainingUnits(entry: Pick<InventoryItemEntry, "flagsA" | "remainingUnits">): number {
  if (typeof entry.remainingUnits === "number") {
    return entry.remainingUnits;
  }
  return (entry.flagsA >>> 16) & 0xffff;
}

/**
 * Chargeable / timed equipment can only be NPC- or market-sold when full.
 * - charge items: remaining units must equal max charge
 * - timed items: unused (0) counts as full; otherwise remaining must equal max minutes
 */
export function isInventoryItemInstanceSellable(entry: InventoryItemEntry): boolean {
  const item = getItemById(entry.itemId);
  if (!item) {
    return true;
  }

  const remaining = getInventoryItemRemainingUnits(entry);

  if (typeof item.charge === "number" && item.charge > 0) {
    return remaining === item.charge;
  }

  if (typeof item.timmingMinutes === "number" && item.timmingMinutes > 0) {
    return remaining === 0 || remaining === item.timmingMinutes;
  }

  if (typeof item.timmingMs === "number" && item.timmingMs > 0) {
    // Timed-ms items in backpack snapshots typically use 0 for unused/full.
    return remaining === 0;
  }

  return true;
}

export function inventoryAmountsFromItems(items: InventoryItemEntry[]): Record<number, number> {
  const amounts: Record<number, number> = {};

  for (const item of items) {
    amounts[item.itemId] = (amounts[item.itemId] ?? 0) + item.amount;
  }

  return amounts;
}

/** Only counts full charge/timing instances — used for auto-sell / preview. */
export function inventorySellableAmountsFromItems(
  items: InventoryItemEntry[]
): Record<number, number> {
  const amounts: Record<number, number> = {};

  for (const item of items) {
    if (!isInventoryItemInstanceSellable(item)) {
      continue;
    }
    amounts[item.itemId] = (amounts[item.itemId] ?? 0) + item.amount;
  }

  return amounts;
}

export function getInventoryItemAmount(
  inventoryByItemId: Record<number, number> | undefined,
  itemId: number
): number {
  const amount = inventoryByItemId?.[itemId];
  return typeof amount === "number" && amount > 0 ? amount : 0;
}

/** Test/helper: build simple inventory instances from itemId → amount. */
export function inventoryItemsFromAmounts(
  amounts: Record<number, number>
): InventoryItemEntry[] {
  const items: InventoryItemEntry[] = [];
  for (const [itemIdRaw, amount] of Object.entries(amounts)) {
    const itemId = Number(itemIdRaw);
    if (!Number.isFinite(itemId) || itemId <= 0 || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    items.push({
      uuid: `item-${itemId}`,
      itemId,
      amount,
      flagsA: 2,
      flagsB: 0,
      remainingUnits: 0,
    });
  }
  return items;
}

/**
 * Remove sold amounts from inventory instances.
 * Prefers sellable (full charge/timing) instances first, then any remaining stacks.
 */
export function removeInventoryAmounts(
  items: InventoryItemEntry[],
  soldByItemId: Record<number, number>
): InventoryItemEntry[] {
  const remainingToRemove: Record<number, number> = {};
  for (const [itemIdRaw, amount] of Object.entries(soldByItemId)) {
    const itemId = Number(itemIdRaw);
    if (Number.isFinite(itemId) && itemId > 0 && Number.isFinite(amount) && amount > 0) {
      remainingToRemove[itemId] = amount;
    }
  }

  if (!Object.keys(remainingToRemove).length) {
    return items;
  }

  const result = items.map((item) => ({ ...item }));

  const consume = (preferSellableOnly: boolean) => {
    for (const item of result) {
      let left = remainingToRemove[item.itemId] ?? 0;
      if (left <= 0 || item.amount <= 0) {
        continue;
      }
      if (preferSellableOnly && !isInventoryItemInstanceSellable(item)) {
        continue;
      }

      const take = Math.min(left, item.amount);
      item.amount -= take;
      left -= take;
      if (left > 0) {
        remainingToRemove[item.itemId] = left;
      } else {
        delete remainingToRemove[item.itemId];
      }
    }
  };

  consume(true);
  consume(false);

  return result.filter((item) => item.amount > 0);
}
