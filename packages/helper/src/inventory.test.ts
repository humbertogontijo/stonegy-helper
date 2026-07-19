import { describe, expect, it } from "vitest";
import {
  applyInventoryMonsterLootDrops,
  inventoryAmountsFromItems,
  inventorySellableAmountsFromItems,
  isInventoryItemInstanceSellable,
  getInventoryItemAmount,
  inventoryItemsFromAmounts,
  removeInventoryAmounts,
} from "./inventory";
import type { InventoryItemEntry } from "./binary/types";

function entry(
  itemId: number,
  remainingUnits: number,
  amount = 1
): InventoryItemEntry {
  return {
    uuid: "test",
    itemId,
    amount,
    flagsA: (remainingUnits << 16) | 2,
    flagsB: 0,
    remainingUnits,
  };
}

describe("inventory charge/timing sellability", () => {
  it("allows full-charge Glacier Amulet instances only", () => {
    expect(isInventoryItemInstanceSellable(entry(289, 200))).toBe(true);
    expect(isInventoryItemInstanceSellable(entry(289, 187))).toBe(false);
    expect(isInventoryItemInstanceSellable(entry(289, 0))).toBe(false);
  });

  it("treats unused timed rings (0 remaining) as full/sellable", () => {
    // Ring of Blue Plasma — timmingMinutes 30
    expect(isInventoryItemInstanceSellable(entry(584, 0))).toBe(true);
    expect(isInventoryItemInstanceSellable(entry(584, 30))).toBe(true);
    expect(isInventoryItemInstanceSellable(entry(584, 15))).toBe(false);
    // Prismatic Ring — timmingMinutes 60
    expect(isInventoryItemInstanceSellable(entry(346, 0))).toBe(true);
    expect(isInventoryItemInstanceSellable(entry(346, 60))).toBe(true);
    expect(isInventoryItemInstanceSellable(entry(346, 12))).toBe(false);
  });

  it("aggregates only sellable instances for auto-sell amounts", () => {
    const items = [
      entry(289, 200),
      entry(289, 150),
      entry(584, 0),
      entry(584, 10),
      entry(346, 45),
      entry(731, 0, 5), // Cheese — no charge/timing
    ];

    expect(inventoryAmountsFromItems(items)).toEqual({
      289: 2,
      584: 2,
      346: 1,
      731: 5,
    });
    expect(inventorySellableAmountsFromItems(items)).toEqual({
      289: 1,
      584: 1,
      731: 5,
    });
    expect(getInventoryItemAmount(inventorySellableAmountsFromItems(items), 289)).toBe(1);
  });
});

describe("removeInventoryAmounts", () => {
  it("removes sold amounts preferring sellable instances", () => {
    const items = [entry(289, 200), entry(289, 150), entry(731, 0, 5)];
    const next = removeInventoryAmounts(items, { 289: 1, 731: 2 });

    expect(inventoryAmountsFromItems(next)).toEqual({ 289: 1, 731: 3 });
    expect(inventorySellableAmountsFromItems(next)).toEqual({ 731: 3 });
    expect(next.find((item) => item.itemId === 289)?.remainingUnits).toBe(150);
  });

  it("builds items from amount maps for tests", () => {
    expect(inventoryItemsFromAmounts({ 731: 3, 14: 1 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 731, amount: 3 }),
        expect.objectContaining({ itemId: 14, amount: 1 }),
      ])
    );
  });
});

describe("applyInventoryMonsterLootDrops", () => {
  const uuidA = "019f5ea9-63a2-7bb3-81fb-b5a9a280ea27";
  const uuidB = "019f5ea9-63a2-7bb3-81fb-b5a9a280ea28";

  it("adds incremental amounts by itemId from monster_loot drops", () => {
    const next = applyInventoryMonsterLootDrops(inventoryItemsFromAmounts({ 582: 1 }), [
      { groundUuid: uuidA, itemId: 244, amount: 3 },
    ]);

    expect(inventoryAmountsFromItems(next)).toEqual({ 582: 1, 244: 3 });
    expect(next.find((item) => item.itemId === 244)).toEqual({
      uuid: uuidA,
      itemId: 244,
      amount: 3,
      flagsA: 2,
      flagsB: 0,
      remainingUnits: 0,
    });
  });

  it("preserves charge remainingUnits from decoded monster_loot drops", () => {
    // Ice Rapier (58) — charge 1 encoded in flagsA high word (0x10002).
    const next = applyInventoryMonsterLootDrops([], [
      {
        groundUuid: uuidA,
        itemId: 58,
        amount: 1,
        flagsA: 0x10002,
        flagsB: 0,
        remainingUnits: 1,
      },
    ]);

    expect(next).toEqual([
      {
        uuid: uuidA,
        itemId: 58,
        amount: 1,
        flagsA: 0x10002,
        flagsB: 0,
        remainingUnits: 1,
      },
    ]);
    expect(isInventoryItemInstanceSellable(next[0]!)).toBe(true);
  });

  it("accumulates amounts for the same itemId across drops", () => {
    const base = applyInventoryMonsterLootDrops([], [
      { groundUuid: uuidA, itemId: 244, amount: 2 },
    ]);
    const next = applyInventoryMonsterLootDrops(base, [
      { groundUuid: uuidB, itemId: 244, amount: 5 },
    ]);

    expect(inventoryAmountsFromItems(next)).toEqual({ 244: 7 });
    expect(next).toHaveLength(1);
    expect(next[0]?.uuid).toBe(uuidA);
  });

  it("keeps separate instances when remainingUnits differ", () => {
    const base = applyInventoryMonsterLootDrops([], [
      {
        groundUuid: uuidA,
        itemId: 289,
        amount: 1,
        flagsA: 0xc80002,
        flagsB: 0,
        remainingUnits: 200,
      },
    ]);
    const next = applyInventoryMonsterLootDrops(base, [
      {
        groundUuid: uuidB,
        itemId: 289,
        amount: 1,
        flagsA: 0x960002,
        flagsB: 0,
        remainingUnits: 150,
      },
    ]);

    expect(next).toHaveLength(2);
    expect(inventoryAmountsFromItems(next)).toEqual({ 289: 2 });
  });

  it("ignores zero-amount drops", () => {
    const base = applyInventoryMonsterLootDrops([], [
      { groundUuid: uuidA, itemId: 244, amount: 3 },
      { groundUuid: uuidB, itemId: 709, amount: 2 },
    ]);
    const next = applyInventoryMonsterLootDrops(base, [
      { groundUuid: uuidA, itemId: 244, amount: 0 },
    ]);

    expect(inventoryAmountsFromItems(next)).toEqual({ 244: 3, 709: 2 });
  });
});
