import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./core/settings";
import { defaultSessionView } from "./core/projections/defaults";
import { patchSessionView } from "./core/projections/patch";
import { projectAfterEvent } from "./core/projections/project-events";
import { toBotState } from "./core/projections/to-bot-state";
import { inventoryAmountsFromItems, inventoryItemsFromAmounts } from "./inventory";
import { resolveSellVenueForItem, isMarketOpenOrderLimitError } from "./domain/loot-sell";
import { executeItemSell, executeLootSellsForItems } from "./loot-sell";
import { DEFAULT_MARKET_TAX_PERCENT } from "./market/constants";

const pricing = { taxPercent: DEFAULT_MARKET_TAX_PERCENT, undercutGold: 1 };

function stateWithItem(itemId: number, marketSynced = false) {
  const settings = defaultSettings();
  const view = patchSessionView(defaultSessionView(), {
    inventory: {
      ...defaultSessionView().inventory,
      items: inventoryItemsFromAmounts({ [itemId]: 1 }),
    },
    market: marketSynced
      ? {
          ...defaultSessionView().market,
          marketPrices: {
            [itemId]: {
              itemId,
              lowestSellPrice: 100,
              highestBuyPrice: 90,
              sellOrderCount: 1,
              buyOrderCount: 1,
              tradableAmount: 10,
              updatedAt: Date.now(),
            },
          },
        }
      : defaultSessionView().market,
  });

  return toBotState(settings, view);
}

describe("resolveSellVenueForItem", () => {
  it("returns npc for junk without rarity when market price is missing", () => {
    const state = stateWithItem(731, false);
    expect(resolveSellVenueForItem(state, 731, pricing)).toBe("npc");
  });

  it("holds rarity items when market price is missing", () => {
    const state = stateWithItem(14, false);
    expect(resolveSellVenueForItem(state, 14, pricing)).toBe("none");
  });

  it("holds Ring of Blue Plasma when market price is missing", () => {
    const state = stateWithItem(584, false);
    expect(resolveSellVenueForItem(state, 584, pricing)).toBe("none");
  });

  it("excludes never-sell quest items", () => {
    const state = stateWithItem(100, true);
    expect(resolveSellVenueForItem(state, 100, pricing)).toBe("exclude");
  });

  it("picks npc for junk even when buy order beats npc", () => {
    const state = stateWithItem(731, true);
    expect(resolveSellVenueForItem(state, 731, pricing)).toBe("npc");
  });

  it("picks npc for junk even when listing net beats npc", () => {
    const settings = defaultSettings();
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 595: 1 }),
      },
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

    expect(resolveSellVenueForItem(toBotState(settings, view), 595, pricing)).toBe("npc");
  });

  it("allows explicit npc mode without market price", () => {
    const settings = {
      ...defaultSettings(),
      lootSellModeByItemId: { 731: "npc" as const },
    };
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 731: 1 }),
      },
    });

    expect(resolveSellVenueForItem(toBotState(settings, view), 731, pricing)).toBe("npc");
  });

  it("requires market price for market mode", () => {
    const settings = {
      ...defaultSettings(),
      lootSellModeByItemId: { 731: "market" as const },
    };
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 731: 1 }),
      },
    });

    expect(resolveSellVenueForItem(toBotState(settings, view), 731, pricing)).toBe("none");
  });

  it("lists rarity items when a sell book exists", () => {
    const settings = defaultSettings();
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 14: 1 }),
      },
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          14: {
            itemId: 14,
            lowestSellPrice: 1000,
            highestBuyPrice: 999,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });

    expect(resolveSellVenueForItem(toBotState(settings, view), 14, pricing)).toBe("market");
  });

  it("keeps mounts by default and markets them when toggle is on", () => {
    const base = stateWithItem(246, true);
    expect(resolveSellVenueForItem(base, 246, pricing)).toBe("exclude");

    const withMounts = {
      ...base,
      settings: { ...base.settings, marketSellMountItems: true },
    };
    expect(resolveSellVenueForItem(withMounts, 246, pricing)).toBe("market");
  });

  it("uses min rarity tier for market rule", () => {
    const state = {
      ...stateWithItem(14, true),
      settings: { ...defaultSettings(), marketSellMinRarityTier: 2 },
    };
    // Small Ruby is tier 1 → NPC when min is 2
    expect(resolveSellVenueForItem(state, 14, pricing)).toBe("npc");
  });
});

describe("isMarketOpenOrderLimitError", () => {
  it("matches the Portuguese open-order cap message", () => {
    expect(
      isMarketOpenOrderLimitError("Você atingiu o limite de ordens abertas no market.")
    ).toBe(true);
  });

  it("matches English open-order limit phrasing", () => {
    expect(isMarketOpenOrderLimitError("You reached the open order limit")).toBe(true);
  });

  it("ignores unrelated market errors", () => {
    expect(isMarketOpenOrderLimitError("Insufficient gold")).toBe(false);
    expect(isMarketOpenOrderLimitError(undefined)).toBe(false);
  });
});

describe("inventory projection + executeItemSell", () => {
  it("stores raw items on inventory_snapshot", async () => {
    const items = inventoryItemsFromAmounts({ 731: 2, 14: 1 });
    const view = await projectAfterEvent({
      kind: "inventory_snapshot",
      direction: "receive",
      data: {
        goldCoins: 500,
        reserved: 0,
        padding: 0,
        depotItemCount: 0,
        capacity: 40,
        usedSlots: 2,
        unknownByte: 0,
        items,
      },
      raw: "",
    });

    expect(view.inventory.items).toEqual(items);
    expect(view.character.goldCoins).toBe(500);
    expect(inventoryAmountsFromItems(view.inventory.items)).toEqual({ 731: 2, 14: 1 });
  });

  it("npc-sells junk and reports sold amounts", async () => {
    const settings = defaultSettings();
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 731: 5 }),
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
        },
      },
    });
    const state = toBotState(settings, view);
    expect(resolveSellVenueForItem(state, 731, pricing)).toBe("npc");

    const runCommand = vi.fn().mockResolvedValue({ sent: true, success: true });
    const onSold = vi.fn();

    await executeItemSell(731, pricing, {
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      runCommand,
      onSold,
    });

    expect(runCommand).toHaveBeenCalledWith(
      "quick_sell_items",
      expect.objectContaining({ itemIds: [731] })
    );
    expect(onSold).toHaveBeenCalledWith({ 731: 5 });
  });

  it("lists rarity items on the market", async () => {
    const settings = defaultSettings();
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 14: 1 }),
      },
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          14: {
            itemId: 14,
            lowestSellPrice: 1000,
            highestBuyPrice: 999,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });
    const state = toBotState(settings, view);
    const runCommand = vi.fn().mockResolvedValue({ sent: true, success: true });
    const onSold = vi.fn();

    await executeItemSell(14, pricing, {
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      runCommand,
      onSold,
    });

    expect(runCommand).toHaveBeenCalledWith("market_create_order", {
      itemId: 14,
      eachPrice: 999,
      itemAmount: 1,
      isBuyOrder: false,
    });
    expect(runCommand).not.toHaveBeenCalledWith(
      "market_resolve_order",
      expect.anything()
    );
    expect(onSold).toHaveBeenCalledWith({ 14: 1 });
  });

  it("still lists market items when party status is hunting", async () => {
    const settings = defaultSettings();
    const view = patchSessionView(defaultSessionView(), {
      party: { ...defaultSessionView().party, partyStatus: "hunting" },
      hunt: { ...defaultSessionView().hunt, activeHuntId: 12 },
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 14: 1 }),
      },
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          14: {
            itemId: 14,
            lowestSellPrice: 1000,
            highestBuyPrice: 999,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });
    const state = toBotState(settings, view);
    const runCommand = vi.fn().mockResolvedValue({ sent: true, success: true });

    await executeItemSell(14, pricing, {
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      runCommand,
    });

    expect(runCommand).toHaveBeenCalledWith(
      "market_create_order",
      expect.objectContaining({ itemId: 14, itemAmount: 1 })
    );
  });

  it("does not call onSold when quick-sell is not confirmed", async () => {
    const state = stateWithItem(731, false);
    const onSold = vi.fn();
    const runCommand = vi.fn().mockResolvedValue({ sent: true, success: false });

    await executeItemSell(731, pricing, {
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      runCommand,
      onSold,
    });

    expect(runCommand).toHaveBeenCalledWith(
      "quick_sell_items",
      expect.objectContaining({ itemIds: [731] })
    );
    expect(onSold).not.toHaveBeenCalled();
  });

  it("flags market open-order limit failures", async () => {
    const settings = defaultSettings();
    const view = patchSessionView(defaultSessionView(), {
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 14: 1 }),
      },
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          14: {
            itemId: 14,
            lowestSellPrice: 1000,
            highestBuyPrice: 999,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });
    const state = toBotState(settings, view);
    const runCommand = vi.fn().mockResolvedValue({
      sent: true,
      success: false,
      errorMessage: "Você atingiu o limite de ordens abertas no market.",
    });

    const result = await executeItemSell(14, pricing, {
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      runCommand,
    });

    expect(result).toEqual({
      sold: false,
      marketOrderLimitReached: true,
      errorMessage: "Você atingiu o limite de ordens abertas no market.",
    });
  });

  it("stops executeLootSellsForItems after open-order limit", async () => {
    const settings = {
      ...defaultSettings(),
      autoSellLoot: true,
      lootSellModeByItemId: {
        14: "market" as const,
        344: "market" as const,
      },
    };
    const view = patchSessionView(defaultSessionView(), {
      party: { ...defaultSessionView().party, partyStatus: "idle" },
      hunt: { ...defaultSessionView().hunt, activeHuntId: null },
      inventory: {
        ...defaultSessionView().inventory,
        items: inventoryItemsFromAmounts({ 14: 1, 344: 1 }),
      },
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          14: {
            itemId: 14,
            lowestSellPrice: 1000,
            highestBuyPrice: 999,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
          344: {
            itemId: 344,
            lowestSellPrice: 500,
            highestBuyPrice: 400,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });
    const state = toBotState(settings, view);
    const runCommand = vi.fn().mockResolvedValue({
      sent: true,
      success: false,
      errorMessage: "Você atingiu o limite de ordens abertas no market.",
    });
    const delay = vi.fn().mockResolvedValue(undefined);

    await executeLootSellsForItems([14, 344], pricing, {
      delay,
      getState: () => state,
      runCommand,
    });

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });
});
