/** Stonegy sells seven blessings (5 regular + 2 enhanced mountain). */
export const REQUIRED_BLESSING_COUNT = 7;

export type BlessingsOwnedInput = {
  ownedCount?: number | null;
  blessings?: Array<{ owned: boolean }>;
};

/** True when the player owns the full set of seven blessings. */
export function hasAllBlessings(input: BlessingsOwnedInput): boolean {
  if (typeof input.ownedCount === "number" && input.ownedCount >= REQUIRED_BLESSING_COUNT) {
    return true;
  }
  const blessings = input.blessings;
  if (!blessings || blessings.length < REQUIRED_BLESSING_COUNT) {
    return false;
  }
  return blessings.every((blessing) => blessing.owned);
}

/** Blessings still missing from the latest snapshot. */
export function unownedBlessings<T extends { owned: boolean }>(blessings: T[]): T[] {
  return blessings.filter((blessing) => !blessing.owned);
}

/** Next affordable unowned blessing, cheapest first. */
export function nextAffordableBlessing<T extends { owned: boolean; cost: number }>(
  blessings: T[],
  goldCoins: number | null | undefined
): T | null {
  const missing = unownedBlessings(blessings).slice().sort((a, b) => a.cost - b.cost);
  if (missing.length === 0) {
    return null;
  }
  if (goldCoins == null) {
    return missing[0] ?? null;
  }
  return missing.find((blessing) => goldCoins >= blessing.cost) ?? null;
}
