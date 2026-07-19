import type { MarketSnapshotData } from "../protocol-messages";

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
  // Callers with a known in-flight filtered fetch should use
  // `matchesMarketSnapshotToRequest` / `attributeInFlightEmptyMarketSnapshot`.
  const requestedItemId = typeof data.requestedItemId === "number" ? data.requestedItemId : null;
  if (requestedItemId != null && requestedItemId > 0) {
    return requestedItemId === itemId;
  }

  return false;
}

/** True when the sell side has no orders (item fetch with no listings). */
export function hasEmptyMarketSellBook(
  data: MarketSnapshotData | Record<string, unknown> | undefined
): boolean {
  if (!data) {
    return false;
  }
  return orderItemIdsFrom(data, "sellOrders").size === 0;
}

/**
 * Attribute an empty sell-book snapshot to an in-flight filtered item fetch.
 * Live traffic often omits filters and keeps a stale requestedItemId when the book is empty.
 */
export function attributeInFlightEmptyMarketSnapshot(
  data: MarketSnapshotData | Record<string, unknown> | undefined,
  inFlightItemId: number
): number | null {
  if (!Number.isFinite(inFlightItemId) || inFlightItemId <= 0) {
    return null;
  }
  if (shouldAttributeMarketSnapshotToItem(data, inFlightItemId)) {
    return inFlightItemId;
  }
  if (hasEmptyMarketSellBook(data)) {
    return inFlightItemId;
  }
  return null;
}

/** Correlate a market:snapshot response to the outbound market_get_snapshot request. */
export function matchesMarketSnapshotToRequest(
  request: { type: string; data?: unknown },
  response: { type: string; data?: unknown }
): boolean {
  if (response.type !== "market:snapshot") {
    return false;
  }

  const requestData =
    request.data && typeof request.data === "object"
      ? (request.data as Record<string, unknown>)
      : {};
  const responseData =
    (response.data as MarketSnapshotData | Record<string, unknown> | undefined) ?? {};

  const filters =
    requestData.filters && typeof requestData.filters === "object"
      ? (requestData.filters as Record<string, unknown>)
      : {};
  const itemId = typeof filters.itemId === "number" ? filters.itemId : null;
  if (itemId != null && itemId > 0) {
    // Filtered fetch: empty sell book means "no listings" even when the game
    // leaves a stale requestedItemId and omits filters on the reply.
    return attributeInFlightEmptyMarketSnapshot(responseData, itemId) === itemId;
  }

  const referenceOrderId = requestData.referenceOrderId;
  if (typeof referenceOrderId === "string" && referenceOrderId.length > 0) {
    return true;
  }

  const requestPage = typeof requestData.page === "number" ? requestData.page : 1;
  const responsePage =
    typeof responseData.page === "number" ? responseData.page : null;
  return responsePage === requestPage;
}
