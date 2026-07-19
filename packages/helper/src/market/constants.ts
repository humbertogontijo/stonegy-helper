/** Fixed in-game market fee (20%). */
export const DEFAULT_MARKET_TAX_PERCENT = 20;

export const DEFAULT_MARKET_UNDERCUT_GOLD = 1;

export const MARKET_PRICES_STORAGE_KEY = "marketPricesCache";

/** How long cached prices are considered fresh for UI hints. */
export const MARKET_PRICES_TTL_MS = 30 * 60 * 1000;

/** Flush price cache to storage every N pages during a full scan. */
export const MARKET_FULL_SCAN_SAVE_EVERY_PAGES = 10;

/** Default interval-scan period when settings omit marketScanIntervalSec. */
export const DEFAULT_MARKET_SCAN_INTERVAL_SEC = 30;

/** Burst delay between market buy/sell command bursts (ms). */
export const MARKET_ACTION_BURST_MS = 500;

export function resolveEffectiveScanIntervalSec(settings: {
  marketScanIntervalSec?: number | null;
}): number {
  return settings.marketScanIntervalSec ?? DEFAULT_MARKET_SCAN_INTERVAL_SEC;
}
