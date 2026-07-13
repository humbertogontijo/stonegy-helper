import type { ItemMarketPrice, MarketPricesCache, MarketSnapshotData } from "./types";
import { MARKET_PRICES_STORAGE_KEY } from "./constants";
import {
  isItemFilteredMarketSnapshot,
  parseMarketSnapshot,
  resolveMarketSnapshotTotalPages,
  summarizeItemMarketPrice,
} from "./parse";

let cache: MarketPricesCache = {
  prices: {},
  updatedAt: 0,
};

const lastSnapshotsByItemId = new Map<number, MarketSnapshotData>();

let lastBrowseSnapshotMeta: { page?: number; totalPages: number } | null = null;

export function getLastBrowseMarketSnapshotMeta(): typeof lastBrowseSnapshotMeta {
  return lastBrowseSnapshotMeta;
}

export function resetLastBrowseMarketSnapshotMeta(): void {
  lastBrowseSnapshotMeta = null;
}

export function getLastMarketSnapshot(itemId: number): MarketSnapshotData | undefined {
  return lastSnapshotsByItemId.get(itemId);
}

export function getMarketPricesCache(): MarketPricesCache {
  return cache;
}

export function getMarketPrice(itemId: number): ItemMarketPrice | undefined {
  return cache.prices[itemId];
}

function minPrice(a: number | null, b: number | null): number | null {
  if (a == null) {
    return b;
  }
  if (b == null) {
    return a;
  }
  return Math.min(a, b);
}

function maxPrice(a: number | null, b: number | null): number | null {
  if (a == null) {
    return b;
  }
  if (b == null) {
    return a;
  }
  return Math.max(a, b);
}

export function setMarketPrice(
  entry: ItemMarketPrice,
  options?: { replace?: boolean }
): ItemMarketPrice {
  const existing = cache.prices[entry.itemId];
  let merged =
    existing && !options?.replace
      ? {
          ...entry,
          lowestSellPrice: minPrice(existing.lowestSellPrice, entry.lowestSellPrice),
          highestBuyPrice: maxPrice(existing.highestBuyPrice, entry.highestBuyPrice),
          ownOrderReferencePrice: maxPrice(
            existing.ownOrderReferencePrice ?? null,
            entry.ownOrderReferencePrice ?? null
          ),
        }
      : entry;

  if (options?.replace && existing) {
    merged = {
      ...merged,
      lowestSellPrice: merged.lowestSellPrice ?? existing.lowestSellPrice,
      highestBuyPrice: merged.highestBuyPrice ?? existing.highestBuyPrice,
      ownOrderReferencePrice:
        merged.ownOrderReferencePrice ?? existing.ownOrderReferencePrice ?? null,
    };
  }

  cache.prices[entry.itemId] = merged;
  cache.updatedAt = Date.now();
  return merged;
}

function dominantOrderItemId(snapshot: MarketSnapshotData): number | undefined {
  const ids = new Set<number>();
  for (const order of [...(snapshot.sellOrders ?? []), ...(snapshot.buyOrders ?? [])]) {
    ids.add(order.itemId);
  }

  if (ids.size === 1) {
    return [...ids][0];
  }

  return undefined;
}

export interface MergeMarketSnapshotOptions {
  /** Prefer the serialized item fetch id over snapshot header fields when attributing prices. */
  requestedItemId?: number | null;
}

function resolveFocusedItemId(
  snapshot: MarketSnapshotData,
  options?: MergeMarketSnapshotOptions
): number | undefined {
  if (options?.requestedItemId != null && options.requestedItemId > 0) {
    return options.requestedItemId;
  }

  const fromSnapshot = snapshot.requestedItemId ?? snapshot.filters?.itemId ?? undefined;
  if (fromSnapshot == null || fromSnapshot <= 0) {
    return dominantOrderItemId(snapshot);
  }

  const dominant = dominantOrderItemId(snapshot);
  if (dominant != null && dominant !== fromSnapshot) {
    return dominant;
  }

  return fromSnapshot;
}

function rememberSnapshotForItem(itemId: number, snapshot: MarketSnapshotData): void {
  lastSnapshotsByItemId.set(itemId, snapshot);
}

export function snapshotToStateRecord(): Record<number, ItemMarketPrice> {
  return { ...cache.prices };
}

export function mergeMarketSnapshot(
  data: MarketSnapshotData | Record<string, unknown> | undefined,
  options?: MergeMarketSnapshotOptions
): ItemMarketPrice[] {
  const snapshot = parseMarketSnapshot(data);
  const browseTotalPages = resolveMarketSnapshotTotalPages(snapshot);
  if (!isItemFilteredMarketSnapshot(snapshot) && browseTotalPages != null) {
    lastBrowseSnapshotMeta = {
      page: snapshot.page,
      totalPages: browseTotalPages,
    };
  }

  const updated: ItemMarketPrice[] = [];
  const itemIds = new Set<number>();

  const focusedItemId = resolveFocusedItemId(snapshot, options);
  if (typeof focusedItemId === "number") {
    itemIds.add(focusedItemId);
    rememberSnapshotForItem(focusedItemId, snapshot);
  }

  const dominantItemId = dominantOrderItemId(snapshot);
  if (dominantItemId != null && dominantItemId !== focusedItemId) {
    itemIds.add(dominantItemId);
    rememberSnapshotForItem(dominantItemId, snapshot);
  }

  for (const order of [...(snapshot.sellOrders ?? []), ...(snapshot.buyOrders ?? [])]) {
    itemIds.add(order.itemId);
  }

  if (!itemIds.size && typeof focusedItemId === "number") {
    itemIds.add(focusedItemId);
  }

  for (const itemId of itemIds) {
    const replace = typeof focusedItemId === "number" && itemId === focusedItemId;
    updated.push(setMarketPrice(summarizeItemMarketPrice(itemId, snapshot), { replace }));
  }

  return updated;
}

export function replaceMarketPricesCache(next: MarketPricesCache): void {
  cache = {
    prices: { ...next.prices },
    updatedAt: next.updatedAt,
  };
}

export async function loadMarketPricesFromStorage(
  storage: Pick<typeof chrome.storage.local, "get"> = chrome.storage.local,
  storageKey: string = MARKET_PRICES_STORAGE_KEY
): Promise<MarketPricesCache> {
  const stored = await storage.get(storageKey);
  const raw = stored[storageKey] as MarketPricesCache | undefined;

  if (raw?.prices && typeof raw.updatedAt === "number") {
    replaceMarketPricesCache(raw);
  } else {
    replaceMarketPricesCache({ prices: {}, updatedAt: 0 });
  }

  return getMarketPricesCache();
}

export async function saveMarketPricesToStorage(
  storage: Pick<typeof chrome.storage.local, "set"> = chrome.storage.local,
  storageKey: string = MARKET_PRICES_STORAGE_KEY
): Promise<void> {
  await storage.set({
    [storageKey]: getMarketPricesCache(),
  });
}

export function isMarketPriceFresh(
  entry: ItemMarketPrice | undefined,
  ttlMs: number,
  now = Date.now()
): boolean {
  if (!entry) {
    return false;
  }

  return now - entry.updatedAt <= ttlMs;
}

export type { MarketSnapshotData };
