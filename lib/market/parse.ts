import type { ItemMarketPrice, MarketOrder, MarketSnapshotData } from "./types";

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseMarketOrder(raw: unknown): MarketOrder | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const itemId = asNumber(record.itemId);
  const eachPrice = asNumber(record.eachPrice);
  const itemAmount = asNumber(record.itemAmount);
  const totalPrice = asNumber(record.totalPrice);
  const id = asString(record.id);

  if (itemId == null || eachPrice == null || itemAmount == null || totalPrice == null || !id) {
    return null;
  }

  return {
    id,
    itemId,
    tier: asNumber(record.tier) ?? 0,
    isOwnOrder: asBoolean(record.isOwnOrder),
    isBuyOrder: asBoolean(record.isBuyOrder),
    eachPrice,
    itemAmount,
    totalPrice,
    createdAt: asString(record.createdAt),
  };
}

export function isItemFilteredMarketSnapshot(snapshot: MarketSnapshotData): boolean {
  const sellOrders = snapshot.sellOrders ?? [];
  if (sellOrders.length) {
    // Item filter applies to the sell book. Buy orders often include the player's
    // own bids for unrelated items and must not be required to match.
    const uniqueSellIds = new Set(sellOrders.map((order) => order.itemId));
    return uniqueSellIds.size === 1;
  }

  const itemId = snapshot.requestedItemId;
  return itemId != null && itemId > 0;
}

/**
 * Browse binary snapshots encode sell-order chunk size in `totalPages` and the
 * real market pagination total in `selectedItemTradableAmount`.
 */
export function resolveMarketSnapshotTotalPages(
  snapshot: MarketSnapshotData
): number | undefined {
  if (isItemFilteredMarketSnapshot(snapshot)) {
    return snapshot.totalPages;
  }

  const sellCount = snapshot.sellOrders?.length ?? 0;
  const headerPages = snapshot.totalPages;
  const browsePages = snapshot.selectedItemTradableAmount;

  if (
    browsePages != null &&
    browsePages > 0 &&
    headerPages != null &&
    headerPages === sellCount &&
    browsePages > headerPages
  ) {
    return browsePages;
  }

  return snapshot.totalPages ?? undefined;
}

export function parseMarketSnapshot(data: MarketSnapshotData | Record<string, unknown> | undefined): MarketSnapshotData {
  const sellOrders = Array.isArray(data?.sellOrders)
    ? data!.sellOrders.map(parseMarketOrder).filter((order): order is MarketOrder => order != null)
    : [];
  const buyOrders = Array.isArray(data?.buyOrders)
    ? data!.buyOrders.map(parseMarketOrder).filter((order): order is MarketOrder => order != null)
    : [];

  const filters = data?.filters;
  const parsedFilters =
    filters && typeof filters === "object"
      ? {
          itemId: asNumber((filters as Record<string, unknown>).itemId),
          slot:
            typeof (filters as Record<string, unknown>).slot === "string"
              ? ((filters as Record<string, unknown>).slot as string)
              : null,
          vocation:
            typeof (filters as Record<string, unknown>).vocation === "string"
              ? ((filters as Record<string, unknown>).vocation as string)
              : null,
          rarity: asNumber((filters as Record<string, unknown>).rarity),
        }
      : undefined;

  return {
    page: asNumber(data?.page) ?? undefined,
    totalPages: asNumber(data?.totalPages) ?? undefined,
    filters: parsedFilters,
    requestedItemId: asNumber(data?.requestedItemId),
    selectedItemTradableAmount: asNumber(data?.selectedItemTradableAmount) ?? undefined,
    sellOrders,
    buyOrders,
  };
}

export function minEachPrice(orders: MarketOrder[]): number | null {
  if (!orders.length) {
    return null;
  }

  return Math.min(...orders.map((order) => order.eachPrice));
}

export function maxEachPrice(orders: MarketOrder[]): number | null {
  if (!orders.length) {
    return null;
  }

  return Math.max(...orders.map((order) => order.eachPrice));
}

export function ordersForItem(orders: MarketOrder[], itemId: number): MarketOrder[] {
  return orders.filter((order) => order.itemId === itemId);
}

export function summarizeItemMarketPrice(
  itemId: number,
  snapshot: MarketSnapshotData,
  updatedAt = Date.now()
): ItemMarketPrice {
  const allSells = ordersForItem(snapshot.sellOrders ?? [], itemId).filter(
    (order) => !order.isBuyOrder
  );
  const allBuys = ordersForItem(snapshot.buyOrders ?? [], itemId).filter(
    (order) => order.isBuyOrder
  );

  // Fill / undercut against others only — own orders are not a fillable venue.
  const sellOrders = allSells.filter((order) => !order.isOwnOrder);
  const buyOrders = allBuys.filter((order) => !order.isOwnOrder);

  // Own book can still price a new list (match price, no undercut).
  const ownSells = allSells.filter((order) => order.isOwnOrder);
  const ownBuys = allBuys.filter((order) => order.isOwnOrder);
  const ownOrderReferencePrice = minEachPrice(ownSells) ?? maxEachPrice(ownBuys);

  return {
    itemId,
    lowestSellPrice: minEachPrice(sellOrders),
    highestBuyPrice: maxEachPrice(buyOrders),
    ownOrderReferencePrice,
    sellOrderCount: sellOrders.length,
    buyOrderCount: buyOrders.length,
    tradableAmount:
      snapshot.requestedItemId === itemId || snapshot.filters?.itemId === itemId
        ? snapshot.selectedItemTradableAmount ?? null
        : null,
    updatedAt,
  };
}
