import { describe, expect, it } from "vitest";
import {
  sampleMarketSnapshotBrowse,
  sampleMarketSnapshotItem1346,
} from "./fixtures/snapshots";
import { mergeMarketSnapshot, replaceMarketPricesCache, getMarketPricesCache, getLastMarketSnapshot, getLastBrowseMarketSnapshotMeta, resetLastBrowseMarketSnapshotMeta } from "./store";
import { isItemFilteredMarketSnapshot, parseMarketSnapshot, resolveMarketSnapshotTotalPages, summarizeItemMarketPrice } from "./parse";
import {
  binaryMarketSnapshotBrowse436Pages,
  expectedBinaryMarketSnapshotBrowse,
} from "../binary/fixtures/market-traffic";
import { marketSnapshotBodyToData } from "../binary/market-snapshot";
import { decodeBinaryMessage } from "../binary/decode";

describe("market parse/store", () => {
  it("summarizes lowest sell and highest buy for an item", () => {
    const summary = summarizeItemMarketPrice(1346, sampleMarketSnapshotItem1346, 1_000);

    expect(summary.lowestSellPrice).toBe(90);
    expect(summary.highestBuyPrice).toBe(75);
    expect(summary.tradableAmount).toBe(5);
    expect(summary.sellOrderCount).toBe(2);
    expect(summary.buyOrderCount).toBe(1);
  });

  it("keeps own orders as list reference but not as fillable buy/sell book", () => {
    const summary = summarizeItemMarketPrice(
      817,
      {
        buyOrders: [
          {
            id: "own-buy",
            itemId: 817,
            tier: 0,
            isOwnOrder: true,
            isBuyOrder: true,
            eachPrice: 999,
            itemAmount: 1,
            totalPrice: 999,
            createdAt: "",
          },
          {
            id: "other-buy",
            itemId: 817,
            tier: 0,
            isOwnOrder: false,
            isBuyOrder: true,
            eachPrice: 500,
            itemAmount: 1,
            totalPrice: 500,
            createdAt: "",
          },
        ],
        sellOrders: [
          {
            id: "own-sell",
            itemId: 817,
            tier: 0,
            isOwnOrder: true,
            isBuyOrder: false,
            eachPrice: 800,
            itemAmount: 1,
            totalPrice: 800,
            createdAt: "",
          },
          {
            id: "other-sell",
            itemId: 817,
            tier: 0,
            isOwnOrder: false,
            isBuyOrder: false,
            eachPrice: 1000,
            itemAmount: 1,
            totalPrice: 1000,
            createdAt: "",
          },
        ],
      },
      1_000
    );

    expect(summary.highestBuyPrice).toBe(500);
    expect(summary.lowestSellPrice).toBe(1000);
    expect(summary.ownOrderReferencePrice).toBe(800);
    expect(summary.buyOrderCount).toBe(1);
    expect(summary.sellOrderCount).toBe(1);
  });

  it("merges browse snapshots for multiple item ids", () => {
    replaceMarketPricesCache({ prices: {}, updatedAt: 0 });

    const updated = mergeMarketSnapshot(sampleMarketSnapshotBrowse as unknown as Record<string, unknown>);

    expect(updated.map((entry) => entry.itemId).sort((a, b) => a - b)).toEqual([1251, 1346]);
    expect(updated.find((entry) => entry.itemId === 1251)?.lowestSellPrice).toBe(248);
  });

  it("replaces focused item prices instead of merging with stale cache", () => {
    replaceMarketPricesCache({
      prices: {
        1346: {
          itemId: 1346,
          lowestSellPrice: 50,
          highestBuyPrice: 40,
          sellOrderCount: 1,
          buyOrderCount: 1,
          tradableAmount: null,
          updatedAt: 0,
        },
      },
      updatedAt: 0,
    });

    mergeMarketSnapshot({
      requestedItemId: 1346,
      selectedItemTradableAmount: 5,
      sellOrders: [
        {
          id: "sell-current",
          itemId: 1346,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: false,
          eachPrice: 90,
          itemAmount: 1,
          totalPrice: 90,
          createdAt: "",
        },
      ],
      buyOrders: [
        {
          id: "buy-current",
          itemId: 1346,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: true,
          eachPrice: 75,
          itemAmount: 1,
          totalPrice: 75,
          createdAt: "",
        },
      ],
    });

    const entry = getMarketPricesCache().prices[1346];
    expect(entry?.lowestSellPrice).toBe(90);
    expect(entry?.highestBuyPrice).toBe(75);
  });

  it("attributes item-filtered snapshots to the in-flight requested item id", () => {
    replaceMarketPricesCache({
      prices: {
        4: {
          itemId: 4,
          lowestSellPrice: 375,
          highestBuyPrice: null,
          sellOrderCount: 1,
          buyOrderCount: 0,
          tradableAmount: null,
          updatedAt: 0,
        },
      },
      updatedAt: 0,
    });

    mergeMarketSnapshot(
      {
        requestedItemId: 4,
        sellOrders: [
          {
            id: "sell-other",
            itemId: 177,
            tier: 0,
            isOwnOrder: false,
            isBuyOrder: false,
            eachPrice: 100,
            itemAmount: 1,
            totalPrice: 100,
            createdAt: "",
          },
        ],
        buyOrders: [],
      },
      { requestedItemId: 48 }
    );

    expect(getMarketPricesCache().prices[4]?.lowestSellPrice).toBe(375);
    expect(getMarketPricesCache().prices[177]?.lowestSellPrice).toBe(100);
  });

  it("uses homogeneous order item ids when the snapshot header disagrees", () => {
    replaceMarketPricesCache({ prices: {}, updatedAt: 0 });

    mergeMarketSnapshot({
      requestedItemId: 8,
      sellOrders: [
        {
          id: "sell-bow",
          itemId: 4,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: false,
          eachPrice: 375,
          itemAmount: 1,
          totalPrice: 375,
          createdAt: "",
        },
      ],
      buyOrders: [],
    });

    expect(getMarketPricesCache().prices[4]?.lowestSellPrice).toBe(375);
  });

  it("stores the latest snapshot under the dominant order item id", () => {
    replaceMarketPricesCache({ prices: {}, updatedAt: 0 });

    const snapshot = {
      requestedItemId: 8,
      sellOrders: [
        {
          id: "sell-bow",
          itemId: 4,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: false,
          eachPrice: 375,
          itemAmount: 1,
          totalPrice: 375,
          createdAt: "",
        },
      ],
      buyOrders: [],
    };

    mergeMarketSnapshot(snapshot, { requestedItemId: 4 });

    expect(getLastMarketSnapshot(4)?.sellOrders?.[0]?.eachPrice).toBe(375);
  });

  it("preserves cached prices when a focused replace snapshot has no orders for that item", () => {
    replaceMarketPricesCache({
      prices: {
        4: {
          itemId: 4,
          lowestSellPrice: 375,
          highestBuyPrice: 50,
          sellOrderCount: 1,
          buyOrderCount: 1,
          tradableAmount: null,
          updatedAt: 0,
        },
      },
      updatedAt: 0,
    });

    mergeMarketSnapshot(
      {
        requestedItemId: 4,
        sellOrders: [],
        buyOrders: [],
      },
      { requestedItemId: 4 }
    );

    const entry = getMarketPricesCache().prices[4];
    expect(entry?.lowestSellPrice).toBe(375);
    expect(entry?.highestBuyPrice).toBe(50);
  });

  it("keeps the best buy/sell prices when merging repeated item snapshots", () => {
    replaceMarketPricesCache({ prices: {}, updatedAt: 0 });

    mergeMarketSnapshot({
      sellOrders: [
        {
          id: "sell-high",
          itemId: 1346,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: false,
          eachPrice: 120,
          itemAmount: 1,
          totalPrice: 120,
          createdAt: "",
        },
      ],
      buyOrders: [
        {
          id: "buy-low",
          itemId: 1346,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: true,
          eachPrice: 70,
          itemAmount: 1,
          totalPrice: 70,
          createdAt: "",
        },
      ],
    });
    mergeMarketSnapshot({
      sellOrders: [
        {
          id: "sell-low",
          itemId: 1346,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: false,
          eachPrice: 90,
          itemAmount: 1,
          totalPrice: 90,
          createdAt: "",
        },
      ],
      buyOrders: [
        {
          id: "buy-high",
          itemId: 1346,
          tier: 0,
          isOwnOrder: false,
          isBuyOrder: true,
          eachPrice: 80,
          itemAmount: 1,
          totalPrice: 80,
          createdAt: "",
        },
      ],
    });

    const entry = getMarketPricesCache().prices[1346];
    expect(entry?.lowestSellPrice).toBe(90);
    expect(entry?.highestBuyPrice).toBe(80);
  });

  it("treats browse snapshots with requestedItemId as unfiltered when orders span items", () => {
    expect(
      isItemFilteredMarketSnapshot(
        expectedBinaryMarketSnapshotBrowse as unknown as Parameters<
          typeof isItemFilteredMarketSnapshot
        >[0]
      )
    ).toBe(false);
  });

  it("tracks browse totalPages from merged snapshots", () => {
    resetLastBrowseMarketSnapshotMeta();
    mergeMarketSnapshot(sampleMarketSnapshotBrowse as unknown as Record<string, unknown>);

    expect(getLastBrowseMarketSnapshotMeta()).toEqual({
      page: 1,
      totalPages: 12,
    });
  });

  it("resolves browse binary pagination from selectedItemTradableAmount", () => {
    const browse = parseMarketSnapshot({
      page: 1,
      totalPages: expectedBinaryMarketSnapshotBrowse.totalPages,
      requestedItemId: expectedBinaryMarketSnapshotBrowse.requestedItemId,
      selectedItemTradableAmount: expectedBinaryMarketSnapshotBrowse.selectedItemTradableAmount,
      sellOrders: expectedBinaryMarketSnapshotBrowse.sellOrders.map((order) => ({
        ...order,
        tier: 0,
        isOwnOrder: false,
        isBuyOrder: false,
        createdAt: "",
      })),
      buyOrders: [],
    });

    expect(resolveMarketSnapshotTotalPages(browse)).toBe(463);
  });

  it("resolves live browse traffic with 436 market pages", () => {
    const message = decodeBinaryMessage(binaryMarketSnapshotBrowse436Pages);
    if (message.body.kind !== "market_snapshot") {
      throw new Error("expected market snapshot");
    }

    const snapshot = parseMarketSnapshot(marketSnapshotBodyToData(message.body.data));
    expect(resolveMarketSnapshotTotalPages(snapshot)).toBe(436);
  });
});
