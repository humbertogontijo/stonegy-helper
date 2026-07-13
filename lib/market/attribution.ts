import type { MarketSnapshotData } from "./types";

function readFilterItemId(data: MarketSnapshotData | Record<string, unknown>): number | null {
  const filters = data.filters;
  if (!filters || typeof filters !== "object") {
    return null;
  }
  const itemId = (filters as Record<string, unknown>).itemId;
  return typeof itemId === "number" && itemId > 0 ? itemId : null;
}

function orderItemIdsFrom(
  data: MarketSnapshotData | Record<string, unknown>,
  key: "sellOrders" | "buyOrders"
): Set<number> {
  const ids = new Set<number>();
  const orders = data[key];
  if (!Array.isArray(orders)) {
    return ids;
  }
  for (const order of orders) {
    if (order && typeof order === "object" && typeof (order as Record<string, unknown>).itemId === "number") {
      const itemId = (order as Record<string, unknown>).itemId as number;
      if (itemId > 0) {
        ids.add(itemId);
      }
    }
  }
  return ids;
}

function orderItemIds(data: MarketSnapshotData | Record<string, unknown>): Set<number> {
  const ids = new Set<number>();
  for (const itemId of orderItemIdsFrom(data, "sellOrders")) {
    ids.add(itemId);
  }
  for (const itemId of orderItemIdsFrom(data, "buyOrders")) {
    ids.add(itemId);
  }
  return ids;
}

export function snapshotItemIds(
  data: MarketSnapshotData | Record<string, unknown> | undefined
): number[] {
  if (!data) {
    return [];
  }

  const ids = new Set<number>();
  const requestedItemId = data.requestedItemId;

  if (typeof requestedItemId === "number" && requestedItemId > 0) {
    ids.add(requestedItemId);
  }

  const filterItemId = readFilterItemId(data);
  if (filterItemId != null) {
    ids.add(filterItemId);
  }

  for (const itemId of orderItemIds(data)) {
    ids.add(itemId);
  }

  return [...ids];
}

/**
 * Whether a snapshot should resolve/attribute an in-flight item-filtered fetch.
 *
 * Live traffic: `market_get_snapshot` with `filters.itemId=82` returns a binary
 * snapshot whose *sell* book is all item 82, but `requestedItemId` may be a stale
 * UI selection (e.g. 14) and *buy* orders list the player's own bids across many
 * items. Attribution must key off the sell book, not the header or buy side.
 */
export function shouldAttributeMarketSnapshotToItem(
  data: MarketSnapshotData | Record<string, unknown> | undefined,
  itemId: number
): boolean {
  if (!data || !Number.isFinite(itemId) || itemId <= 0) {
    return false;
  }

  const filterItemId = readFilterItemId(data);
  if (filterItemId != null) {
    return filterItemId === itemId;
  }

  const sellIds = orderItemIdsFrom(data, "sellOrders");
  // Filtered responses put a single item on the sell side. Own buy orders on the
  // same payload span many items and must not disqualify the match.
  if (sellIds.size === 1) {
    return sellIds.has(itemId);
  }
  if (sellIds.size > 1) {
    return false;
  }

  // Empty sell book: trust header / filters only — never attribute ambiguous empties.
  const requestedItemId = typeof data.requestedItemId === "number" ? data.requestedItemId : null;
  if (requestedItemId != null && requestedItemId > 0) {
    return requestedItemId === itemId;
  }

  return false;
}
