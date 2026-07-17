import { describe, expect, it } from "vitest";
import {
  attributeInFlightEmptyMarketSnapshot,
  matchesMarketSnapshotToRequest,
  snapshotItemIds,
  shouldAttributeMarketSnapshotToItem,
} from "./attribution";

describe("market snapshot attribution", () => {
  it("extracts item ids from snapshot payloads", () => {
    expect(
      snapshotItemIds({
        requestedItemId: 1346,
        sellOrders: [{ itemId: 1346, eachPrice: 90 }],
        buyOrders: [{ itemId: 1251, eachPrice: 75 }],
      })
    ).toEqual([1346, 1251]);
  });

  it("does not attribute empty snapshots that name a different requested item", () => {
    expect(
      shouldAttributeMarketSnapshotToItem(
        { requestedItemId: 999, sellOrders: [], buyOrders: [] },
        169
      )
    ).toBe(false);
    expect(shouldAttributeMarketSnapshotToItem({ sellOrders: [], buyOrders: [] }, 169)).toBe(false);
  });

  it("does not attribute multi-item sell browse snapshots to a filtered item", () => {
    expect(
      shouldAttributeMarketSnapshotToItem(
        {
          requestedItemId: 3235,
          sellOrders: [
            { itemId: 13, eachPrice: 1 },
            { itemId: 31, eachPrice: 2 },
          ],
          buyOrders: [],
        },
        3235
      )
    ).toBe(false);
    expect(
      shouldAttributeMarketSnapshotToItem(
        {
          requestedItemId: null,
          sellOrders: [
            { itemId: 10, eachPrice: 1 },
            { itemId: 20, eachPrice: 2 },
          ],
          buyOrders: [],
        },
        169
      )
    ).toBe(false);
  });

  it("attributes single-item sell books even when own buy orders span other items", () => {
    // Live capture: market_get_snapshot filters.itemId=82 → binary reply with
    // requestedItemId=14 (stale UI selection) and own buy orders for many items,
    // but every sell order is for 82.
    expect(
      shouldAttributeMarketSnapshotToItem(
        {
          requestedItemId: 14,
          sellOrders: [
            { itemId: 82, eachPrice: 4299 },
            { itemId: 82, eachPrice: 4400 },
            { itemId: 82, eachPrice: 4500 },
          ],
          buyOrders: [
            { itemId: 14, eachPrice: 449 },
            { itemId: 657, eachPrice: 349 },
            { itemId: 82, eachPrice: 4299 },
          ],
        },
        82
      )
    ).toBe(true);
    expect(
      shouldAttributeMarketSnapshotToItem(
        {
          requestedItemId: 14,
          sellOrders: [
            { itemId: 82, eachPrice: 4299 },
            { itemId: 82, eachPrice: 4400 },
          ],
          buyOrders: [{ itemId: 14, eachPrice: 449 }],
        },
        14
      )
    ).toBe(false);
  });

  it("attributes single-item sell books to that item", () => {
    expect(
      shouldAttributeMarketSnapshotToItem(
        {
          sellOrders: [{ itemId: 169, eachPrice: 10 }],
          buyOrders: [],
        },
        169
      )
    ).toBe(true);
  });

  it("attributes header-consistent single-item books via requestedItemId", () => {
    expect(
      shouldAttributeMarketSnapshotToItem(
        {
          requestedItemId: 169,
          sellOrders: [{ itemId: 169, eachPrice: 10 }],
          buyOrders: [],
        },
        169
      )
    ).toBe(true);
  });

  it("attributes empty sell books to the in-flight filtered item despite stale requestedItemId", () => {
    expect(
      attributeInFlightEmptyMarketSnapshot(
        {
          requestedItemId: 14,
          sellOrders: [],
          buyOrders: [
            { itemId: 14, eachPrice: 449 },
            { itemId: 657, eachPrice: 349 },
          ],
        },
        169
      )
    ).toBe(169);
    expect(
      attributeInFlightEmptyMarketSnapshot({ sellOrders: [], buyOrders: [] }, 169)
    ).toBe(169);
  });

  it("matches filtered requests to empty sell-book snapshots", () => {
    expect(
      matchesMarketSnapshotToRequest(
        {
          type: "market_get_snapshot",
          data: { page: 1, filters: { itemId: 169 } },
        },
        {
          type: "market:snapshot",
          data: {
            requestedItemId: 14,
            sellOrders: [],
            buyOrders: [{ itemId: 14, eachPrice: 100 }],
          },
        }
      )
    ).toBe(true);
  });

  it("does not match filtered requests to multi-item sell browse snapshots", () => {
    expect(
      matchesMarketSnapshotToRequest(
        {
          type: "market_get_snapshot",
          data: { page: 1, filters: { itemId: 169 } },
        },
        {
          type: "market:snapshot",
          data: {
            requestedItemId: 14,
            sellOrders: [
              { itemId: 10, eachPrice: 1 },
              { itemId: 20, eachPrice: 2 },
            ],
            buyOrders: [],
          },
        }
      )
    ).toBe(false);
  });
});
