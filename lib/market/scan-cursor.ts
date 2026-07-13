import type { MarketSnapshotData } from "./types";

export function marketOrderIds(snapshot: MarketSnapshotData): string[] {
  const ids: string[] = [];
  for (const order of snapshot.sellOrders ?? []) {
    ids.push(order.id);
  }
  for (const order of snapshot.buyOrders ?? []) {
    ids.push(order.id);
  }
  return ids;
}

/** Oldest listing on this snapshot page — used as the cursor for the next chunk. */
export function oldestReferenceOrderId(snapshot: MarketSnapshotData): string | null {
  const ids = marketOrderIds(snapshot);
  return ids.length ? ids[ids.length - 1]! : null;
}

export function snapshotContainsOrderId(snapshot: MarketSnapshotData, orderId: string): boolean {
  return marketOrderIds(snapshot).includes(orderId);
}

/** Pages to visit when scanning last → 2. */
export function backwardScanPageOrder(totalPages: number, startPage?: number): number[] {
  const first = Math.min(startPage ?? totalPages, totalPages);
  if (first < 2 || totalPages < 2) {
    return [];
  }

  const pages: number[] = [];
  for (let page = first; page >= 2; page -= 1) {
    pages.push(page);
  }
  return pages;
}

/**
 * Resume helper for full-market scans that checkpoint an order id.
 * Callers supply `pageContainsReference` (typically by fetching each mid page).
 * Not wired into MarketService yet — kept for resume UX / tests.
 */
export function binarySearchResumePage(
  totalPages: number,
  _resumeReferenceOrderId: string,
  pageContainsReference: (page: number) => boolean
): number {
  let lo = 2;
  let hi = totalPages;
  let result = totalPages;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pageContainsReference(mid)) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}
