import { describe, expect, it } from "vitest";
import {
  compareSellVenues,
  marketTaxAmount,
  netMarketProceeds,
  netPerItemAfterMarketSale,
  suggestedListPrice,
} from "./pricing";

describe("market pricing", () => {
  it("undercuts the lowest sell order by 1 gold by default", () => {
    expect(suggestedListPrice(5000, 1)).toBe(4999);
  });

  it("prefers market when net proceeds beat npc price after tax", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 80,
      marketPrice: {
        itemId: 1346,
        lowestSellPrice: 90,
        highestBuyPrice: 75,
        sellOrderCount: 1,
        buyOrderCount: 1,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 2, undercutGold: 1 },
    });

    expect(comparison.marketListPrice).toBe(89);
    expect(netPerItemAfterMarketSale(89, 2)).toBe(88);
    expect(comparison.bestVenue).toBe("market");
    expect(comparison.profitVsNpc).toBe(8);
  });

  it("falls back to npc when listing price beats npc before tax but not after 20% tax", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 100,
      marketPrice: {
        itemId: 1,
        lowestSellPrice: 110,
        highestBuyPrice: 50,
        sellOrderCount: 1,
        buyOrderCount: 1,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 20, undercutGold: 1 },
    });

    expect(comparison.marketListPrice).toBe(109);
    expect(netPerItemAfterMarketSale(109, 20)).toBe(88);
    expect(comparison.bestVenue).toBe("npc");
  });

  it("prefers market listing over npc when net proceeds beat npc (buy orders ignored)", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 100,
      marketPrice: {
        itemId: 1,
        lowestSellPrice: 130,
        highestBuyPrice: 105,
        sellOrderCount: 1,
        buyOrderCount: 1,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 20, undercutGold: 1 },
    });

    // undercut 129 → net 104 after 20% tax; buy order 105 is ignored
    expect(comparison.bestVenue).toBe("market");
    expect(comparison.profitVsNpc).toBe(4);
  });

  it("holds market-eligible items when there is no market price (do not NPC-dump rares)", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 100,
      marketPrice: null,
      excluded: false,
      pricing: { taxPercent: 2, undercutGold: 1 },
    });

    expect(comparison.bestVenue).toBe("none");
  });

  it("falls back to npc with null market when preferNpcOverMarketList (junk)", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 100,
      marketPrice: null,
      excluded: false,
      pricing: { taxPercent: 2, undercutGold: 1 },
      preferNpcOverMarketList: true,
    });

    expect(comparison.bestVenue).toBe("npc");
  });

  it("does not sell when there is no market price and no npc price", () => {
    const comparison = compareSellVenues({
      npcSellPrice: null,
      marketPrice: null,
      excluded: false,
      pricing: { taxPercent: 2, undercutGold: 1 },
    });

    expect(comparison.bestVenue).toBe("none");
  });

  it("falls back to npc when market is not profitable", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 100,
      marketPrice: {
        itemId: 1,
        lowestSellPrice: 50,
        highestBuyPrice: 40,
        sellOrderCount: 1,
        buyOrderCount: 1,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 2, undercutGold: 1 },
    });

    expect(comparison.bestVenue).toBe("npc");
  });

  it("skips market when preferNpcOverMarketList even if net beats npc", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 4,
      marketPrice: {
        itemId: 595,
        lowestSellPrice: 20,
        highestBuyPrice: 1,
        sellOrderCount: 1,
        buyOrderCount: 1,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 20, undercutGold: 1 },
      preferNpcOverMarketList: true,
    });

    expect(comparison.marketListPrice).toBe(19);
    expect(netPerItemAfterMarketSale(19, 20)).toBe(16);
    expect(comparison.bestVenue).toBe("npc");
  });

  it("still prefers npc when preferNpcOverMarketList even if buy order beats npc", () => {
    const comparison = compareSellVenues({
      npcSellPrice: 4,
      marketPrice: {
        itemId: 595,
        lowestSellPrice: 20,
        highestBuyPrice: 10,
        sellOrderCount: 1,
        buyOrderCount: 1,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 20, undercutGold: 1 },
      preferNpcOverMarketList: true,
    });

    expect(comparison.bestVenue).toBe("npc");
    expect(comparison.profitVsNpc).toBe(0);
  });

  it("lists when there is no npc price but a sell book to undercut", () => {
    const comparison = compareSellVenues({
      npcSellPrice: null,
      marketPrice: {
        itemId: 817,
        lowestSellPrice: 1000,
        highestBuyPrice: null,
        sellOrderCount: 1,
        buyOrderCount: 0,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 20, undercutGold: 1 },
    });

    expect(comparison.marketListPrice).toBe(999);
    expect(comparison.bestVenue).toBe("market");
  });

  it("matches own order reference without undercut when no competing sell book", () => {
    const comparison = compareSellVenues({
      npcSellPrice: null,
      marketPrice: {
        itemId: 817,
        lowestSellPrice: null,
        highestBuyPrice: null,
        ownOrderReferencePrice: 999,
        sellOrderCount: 0,
        buyOrderCount: 0,
        tradableAmount: null,
        updatedAt: Date.now(),
      },
      excluded: false,
      pricing: { taxPercent: 20, undercutGold: 1 },
    });

    expect(comparison.marketListPrice).toBe(999);
    expect(comparison.bestVenue).toBe("market");
  });
});

describe("market tax stack math", () => {
  it("floors tax on total gross (authoritative for multi-quantity listings)", () => {
    // 5 × 33g @ 20%: floor(165*0.2)=33, not 5*floor(33*0.2)=5*6=30
    expect(marketTaxAmount(5 * 33, 20)).toBe(33);
    expect(netMarketProceeds(33, 5, 20)).toBe(5 * 33 - 33);
  });

  it("documents per-item floor vs total-floor divergence", () => {
    const perItemNet = netPerItemAfterMarketSale(33, 20);
    expect(perItemNet).toBe(27);
    expect(perItemNet * 5).toBe(135);
    expect(netMarketProceeds(33, 5, 20)).toBe(132);
  });
});
