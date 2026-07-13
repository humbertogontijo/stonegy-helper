import { describe, expect, it } from "vitest";
import { defaultSettings } from "../core/settings";
import { defaultSessionView } from "../core/projections/defaults";
import { patchSessionView } from "../core/projections/patch";
import { toBotState } from "../core/projections/to-bot-state";
import type { InventoryItemEntry } from "../binary/types";
import { inventoryItemsFromAmounts } from "../inventory";
import { DEFAULT_MARKET_TAX_PERCENT } from "../market/constants";
import {
  getCombinedLootSellExcludedItemIds,
  getGameQuickSellDeselectedItemIds,
  getInventoryLootSellEntries,
  getInventoryItemsToSellOnHuntFinish,
  hasInventoryLootCandidates,
  resolveSellVenueForItem,
  sumInventoryLootSellValues,
} from "./loot-sell";

const pricing = { taxPercent: DEFAULT_MARKET_TAX_PERCENT, undercutGold: 1 };

function entry(
  itemId: number,
  remainingUnits: number,
  amount = 1
): InventoryItemEntry {
  return {
    uuid: `item-${itemId}-${remainingUnits}`,
    itemId,
    amount,
    flagsA: (remainingUnits << 16) | 2,
    flagsB: 0,
    remainingUnits,
  };
}

function stateWithInventory(
  inventoryByItemId: Record<number, number>,
  settingsPatch: Partial<ReturnType<typeof defaultSettings>> = {},
  viewPatch: Parameters<typeof patchSessionView>[1] = {}
) {
  const settings = { ...defaultSettings(), ...settingsPatch };
  const view = patchSessionView(defaultSessionView(), {
    inventory: {
      ...defaultSessionView().inventory,
      items: inventoryItemsFromAmounts(inventoryByItemId),
      gameQuickSellDeselectedItemIds: [888],
    },
    market: {
      ...defaultSessionView().market,
      marketPrices: {
        731: {
          itemId: 731,
          lowestSellPrice: 100,
          highestBuyPrice: 90,
          sellOrderCount: 1,
          buyOrderCount: 1,
          tradableAmount: 10,
          updatedAt: Date.now(),
        },
        999: {
          itemId: 999,
          lowestSellPrice: 50,
          highestBuyPrice: 40,
          sellOrderCount: 1,
          buyOrderCount: 1,
          tradableAmount: 10,
          updatedAt: Date.now(),
        },
        14: {
          itemId: 14,
          lowestSellPrice: 400,
          highestBuyPrice: 200,
          sellOrderCount: 1,
          buyOrderCount: 1,
          tradableAmount: 10,
          updatedAt: Date.now(),
        },
      },
    },
    ...viewPatch,
  });

  return toBotState(settings, view);
}

describe("inventory loot sell", () => {
  it("excludes quickSellDeselectedItemIds from update_battle_config", () => {
    const state = stateWithInventory({ 731: 2, 888: 1, 999: 1 });

    expect(getGameQuickSellDeselectedItemIds(state)).toEqual([888]);
    expect(getCombinedLootSellExcludedItemIds(state).has(888)).toBe(true);
    expect(getCombinedLootSellExcludedItemIds(state).has(999)).toBe(false);
    expect(getCombinedLootSellExcludedItemIds(state).has(731)).toBe(false);
  });

  it("excludes keep overrides", () => {
    const state = stateWithInventory(
      { 731: 2 },
      {
        lootSellModeByItemId: { 731: "keep" },
      }
    );

    expect(getCombinedLootSellExcludedItemIds(state).has(731)).toBe(true);
    expect(getInventoryItemsToSellOnHuntFinish(state)).toEqual([]);
  });

  it("returns sellable inventory entries with amounts", () => {
    const state = stateWithInventory({ 731: 3, 888: 1, 999: 2 });

    expect(getInventoryLootSellEntries(state)).toEqual([
      expect.objectContaining({ itemId: 731, amount: 3 }),
      expect.objectContaining({ itemId: 999, amount: 2 }),
    ]);
    expect(getInventoryItemsToSellOnHuntFinish(state)).toEqual([731, 999]);
  });

  it("lists loot candidates before market prices are synced", () => {
    const settings = defaultSettings();
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 731: 2 }),
      },
    });

    expect(hasInventoryLootCandidates(toBotState(settings, view))).toBe(true);
    // Junk without rarity falls back to NPC even without market cache.
    expect(getInventoryItemsToSellOnHuntFinish(toBotState(settings, view))).toEqual([731]);
  });

  it("includes rarity items without market cache as held (not sold)", () => {
    const state = stateWithInventory({ 584: 1 }, {}, {
      market: {
        ...defaultSessionView().market,
        marketPrices: {},
      },
    });

    expect(getInventoryLootSellEntries(state)).toEqual([]);
    expect(
      getInventoryLootSellEntries(state, pricing, { includeHeldForMarketSync: true })
    ).toEqual([
      expect.objectContaining({
        itemId: 584,
        amount: 1,
        venue: "none",
        needsMarketSync: true,
      }),
    ]);
    expect(getInventoryItemsToSellOnHuntFinish(state)).toEqual([]);
  });

  it("omits never-sell items from auto sell preview", () => {
    const state = stateWithInventory({
      14: 1,
      100: 2,
      246: 1,
      938: 1,
    });

    const entries = getInventoryLootSellEntries(state);
    expect(entries.map((entry) => entry.itemId)).toEqual([14]);
    expect(getCombinedLootSellExcludedItemIds(state).has(100)).toBe(true);
    expect(getCombinedLootSellExcludedItemIds(state).has(246)).toBe(true);
    expect(getCombinedLootSellExcludedItemIds(state).has(938)).toBe(true);
  });

  it("resolves Ham to npc despite profitable market list price", () => {
    const state = stateWithInventory({ 595: 5 }, {}, {
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          595: {
            itemId: 595,
            lowestSellPrice: 20,
            highestBuyPrice: 1,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    expect(resolveSellVenueForItem(state, 595, pricing)).toBe("npc");
    expect(getInventoryLootSellEntries(state)).toEqual([
      expect.objectContaining({
        itemId: 595,
        amount: 5,
        venue: "npc",
        npcValue: 20,
        finalValue: 20,
      }),
    ]);
  });

  it("includes npc, net, and final values with totals", () => {
    const state = stateWithInventory({ 731: 3 });
    const entries = getInventoryLootSellEntries(state);

    // Cheese npc 2; list net 80/item; junk prefers NPC → final 6
    expect(entries).toEqual([
      expect.objectContaining({
        itemId: 731,
        amount: 3,
        venue: "npc",
        npcValue: 6,
        netValue: 240,
        finalValue: 6,
      }),
    ]);
    expect(sumInventoryLootSellValues(entries)).toEqual({
      npcValue: 6,
      netValue: 240,
      finalValue: 6,
    });
  });

  it("uses sellable amounts so partial charge/timing items are omitted from preview", () => {
    const state = stateWithInventory(
      {},
      {},
      {
        inventory: {
          ...defaultSessionView().inventory,
          items: [
            entry(289, 200), // full Glacier — sellable
            entry(289, 150), // partial — not sellable
            entry(346, 12), // partial Prismatic Ring — not sellable
            entry(731, 0, 3), // Cheese
          ],
          gameQuickSellDeselectedItemIds: [888],
        },
        market: {
          ...defaultSessionView().market,
          marketPrices: {
            289: {
              itemId: 289,
              lowestSellPrice: 2000,
              highestBuyPrice: 1800,
              sellOrderCount: 1,
              buyOrderCount: 1,
              tradableAmount: 10,
              updatedAt: Date.now(),
            },
            731: {
              itemId: 731,
              lowestSellPrice: 100,
              highestBuyPrice: 90,
              sellOrderCount: 1,
              buyOrderCount: 1,
              tradableAmount: 10,
              updatedAt: Date.now(),
            },
          },
        },
      }
    );

    expect(getInventoryLootSellEntries(state)).toEqual([
      expect.objectContaining({ itemId: 289, amount: 1 }),
      expect.objectContaining({ itemId: 731, amount: 3 }),
    ]);
  });
});
