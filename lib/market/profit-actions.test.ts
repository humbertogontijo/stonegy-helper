import { describe, expect, it, vi } from "vitest";
import { withBotState } from "../state";
import { inventoryItemsFromAmounts } from "../inventory";
import {
  affordableMarketBuyAmount,
  executeMarketBuyForNpcProfit,
  missedMarketBuyAmount,
  resolveMarketBuyAmount,
} from "./profit-actions";
import { compareSellVenues } from "./pricing";
import { enqueueOrExecuteItemSell } from "../loot-sell";

const pricing = { taxPercent: 5, undercutGold: 1 };

describe("affordableMarketBuyAmount", () => {
  it("returns zero when gold is missing or zero", () => {
    expect(affordableMarketBuyAmount(null, 100, 50)).toBe(0);
    expect(affordableMarketBuyAmount(0, 100, 50)).toBe(0);
  });

  it("caps by order amount when gold can afford more", () => {
    expect(affordableMarketBuyAmount(10_000, 100, 25)).toBe(25);
  });

  it("caps by affordable amount when gold is the limiting factor", () => {
    expect(affordableMarketBuyAmount(550, 100, 25)).toBe(5);
  });

  it("returns zero when gold cannot afford a single item", () => {
    expect(affordableMarketBuyAmount(99, 100, 25)).toBe(0);
  });
});

describe("resolveMarketBuyAmount", () => {
  it("attempts a single item when gold is unknown during hunt sync", () => {
    expect(resolveMarketBuyAmount(null, 100, 25, { allowUnknownGold: true })).toBe(1);
  });

  it("still respects zero gold", () => {
    expect(resolveMarketBuyAmount(0, 100, 25, { allowUnknownGold: true })).toBe(0);
  });
});

describe("missedMarketBuyAmount", () => {
  it("returns zero when the full order is affordable", () => {
    expect(missedMarketBuyAmount(10_000, 100, 25)).toBe(0);
  });

  it("returns the unaffordable remainder on partial buys", () => {
    expect(missedMarketBuyAmount(550, 100, 25)).toBe(20);
  });

  it("returns the full order amount when gold is insufficient", () => {
    expect(missedMarketBuyAmount(99, 100, 25)).toBe(25);
  });
});

describe("deferred hunt profit sells", () => {
  it("buys from market while hunting when side is buy", async () => {
    const runCommand = vi.fn().mockResolvedValue({ sent: true });
    const state = withBotState({
      party: { partyStatus: "hunting" },
      hunt: { activeHuntId: 1 },
      character: { goldCoins: 10_000 },
      inventory: { items: inventoryItemsFromAmounts({ 4: 1 }) },
      market: {
        marketPrices: {
          4: {
            itemId: 4,
            lowestSellPrice: 100,
            highestBuyPrice: 50,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    const deps = {
      sendJson: vi.fn(),
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      appendBoughtItem: vi.fn(),
      runCommand,
    };

    await executeMarketBuyForNpcProfit(
      4,
      {
        sellOrders: [
          {
            id: "76663c30-f4d3-48ab-a702-985cb763981b",
            itemId: 4,
            tier: 0,
            eachPrice: 100,
            itemAmount: 1,
            totalPrice: 100,
            createdAt: "",
            isBuyOrder: false,
            isOwnOrder: false,
          },
        ],
      },
      pricing,
      deps,
      { forceNpcSell: true }
    );

    expect(runCommand).toHaveBeenCalledWith(
      "market_resolve_order",
      {
        orderId: "76663c30-f4d3-48ab-a702-985cb763981b",
        amount: 1,
        side: "buy",
      },
      {}
    );
  });

  it("defers market-bought items while hunting instead of selling immediately", async () => {
    const runCommand = vi.fn().mockResolvedValue({ sent: true });
    const state = withBotState({
      settings: { autoSellLoot: true },
      party: { partyStatus: "hunting" },
      hunt: { activeHuntId: 1 },
      character: { goldCoins: 10_000 },
      inventory: { items: [] },
      market: {
        marketPrices: {
          852: {
            itemId: 852,
            lowestSellPrice: 2,
            highestBuyPrice: 1,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    const deps = {
      sendJson: vi.fn(),
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      appendBoughtItem: vi.fn(),
      runCommand,
    };

    await executeMarketBuyForNpcProfit(
      852,
      {
        sellOrders: [
          {
            id: "sell-1",
            itemId: 852,
            tier: 0,
            eachPrice: 2,
            itemAmount: 5,
            totalPrice: 10,
            createdAt: "",
            isBuyOrder: false,
            isOwnOrder: false,
          },
        ],
      },
      pricing,
      deps
    );

    expect(runCommand).toHaveBeenCalledWith(
      "market_resolve_order",
      expect.any(Object),
      {}
    );
    expect(runCommand).not.toHaveBeenCalledWith(
      "quick_sell_items",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("defers npc profit sells while hunting", async () => {
    const runCommand = vi.fn().mockResolvedValue({ sent: true });
    const state = withBotState({
      settings: { autoSellLoot: true },
      party: { partyStatus: "hunting" },
      hunt: { activeHuntId: 1 },
      inventory: { items: inventoryItemsFromAmounts({ 852: 3 }) },
      market: {
        marketPrices: {
          852: {
            itemId: 852,
            lowestSellPrice: 6,
            highestBuyPrice: 3,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    const comparison = compareSellVenues({
      npcSellPrice: 5,
      marketPrice: state.market.marketPrices[852],
      excluded: false,
      pricing,
    });
    expect(comparison.bestVenue).toBe("npc");

    await enqueueOrExecuteItemSell(852, pricing, {
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      runCommand,
    });

    expect(runCommand).not.toHaveBeenCalled();
  });

  it("quick sells to npc after a profitable market buy when idle", async () => {
    const runCommand = vi.fn().mockResolvedValue({ sent: true });
    const state = withBotState({
      settings: { autoSellLoot: true },
      character: { goldCoins: 10_000 },
      inventory: { items: inventoryItemsFromAmounts({ 852: 5 }) },
      market: {
        marketPrices: {
          852: {
            itemId: 852,
            lowestSellPrice: 2,
            highestBuyPrice: 1,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    const deps = {
      sendJson: vi.fn(),
      delay: vi.fn().mockResolvedValue(undefined),
      getState: () => state,
      appendBoughtItem: vi.fn(),
      runCommand,
    };

    await executeMarketBuyForNpcProfit(
      852,
      {
        sellOrders: [
          {
            id: "sell-1",
            itemId: 852,
            tier: 0,
            eachPrice: 2,
            itemAmount: 5,
            totalPrice: 10,
            createdAt: "",
            isBuyOrder: false,
            isOwnOrder: false,
          },
        ],
      },
      pricing,
      deps
    );

    expect(runCommand).toHaveBeenCalledWith(
      "quick_sell_items",
      expect.objectContaining({
        itemIds: [852],
      })
    );
  });
});
