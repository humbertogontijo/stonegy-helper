import { describe, expect, it, vi } from "vitest";

vi.mock("../items", () => ({
  getNpcSellPrice: (itemId: number) => {
    const prices: Record<number, number> = {
      1: 100,
      2: 50,
      3: 0,
      4: 200,
    };
    return prices[itemId] ?? null;
  },
}));

import {
  findArbitrageOpportunities,
  findBuyMarketSellNpcOpportunities,
  findSellBuyOrderVsNpcOpportunities,
} from "./arbitrage";
import type { ItemMarketPrice } from "./types";

function price(
  itemId: number,
  patch: Partial<ItemMarketPrice> = {}
): ItemMarketPrice {
  return {
    itemId,
    lowestSellPrice: null,
    highestBuyPrice: null,
    sellOrderCount: 0,
    buyOrderCount: 0,
    tradableAmount: null,
    updatedAt: Date.now(),
    ...patch,
  };
}

describe("findBuyMarketSellNpcOpportunities", () => {
  it("finds profitable buy-market-sell-npc flips", () => {
    const opportunities = findBuyMarketSellNpcOpportunities(
      [1, 2, 4],
      {
        1: price(1, { lowestSellPrice: 80 }),
        2: price(2, { lowestSellPrice: 50 }),
        4: price(4, { lowestSellPrice: 150 }),
      }
    );

    expect(opportunities.map((o) => o.itemId)).toEqual([4, 1]);
    expect(opportunities[0]?.profitPerItem).toBe(50);
    expect(opportunities[1]?.profitPerItem).toBe(20);
  });

  it("skips zero npc price and missing market sells", () => {
    expect(
      findBuyMarketSellNpcOpportunities([3, 99], {
        3: price(3, { lowestSellPrice: 1 }),
      })
    ).toEqual([]);
  });

  it("skips equal prices (no profit)", () => {
    expect(
      findBuyMarketSellNpcOpportunities([1], {
        1: price(1, { lowestSellPrice: 100 }),
      })
    ).toEqual([]);
  });
});

describe("findSellBuyOrderVsNpcOpportunities", () => {
  it("finds when buy orders beat npc sell", () => {
    const opportunities = findSellBuyOrderVsNpcOpportunities([1], {
      1: price(1, { highestBuyPrice: 120 }),
    });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]?.kind).toBe("sell_buy_order_vs_npc");
    expect(opportunities[0]?.profitPerItem).toBe(20);
  });
});

describe("findArbitrageOpportunities", () => {
  it("merges both opportunity kinds sorted by profit", () => {
    const opportunities = findArbitrageOpportunities([1], {
      1: price(1, { lowestSellPrice: 70, highestBuyPrice: 130 }),
    });
    expect(opportunities.map((o) => o.kind)).toEqual([
      "buy_market_sell_npc",
      "sell_buy_order_vs_npc",
    ]);
  });
});
