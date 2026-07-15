import { describe, expect, it } from "vitest";
import {
  REQUIRED_BLESSING_COUNT,
  hasAllBlessings,
  nextAffordableBlessing,
  unownedBlessings,
} from "./bless";

describe("bless domain", () => {
  it("requires seven blessings", () => {
    expect(REQUIRED_BLESSING_COUNT).toBe(7);
  });

  it("treats ownedCount >= 7 as complete", () => {
    expect(hasAllBlessings({ ownedCount: 7 })).toBe(true);
    expect(hasAllBlessings({ ownedCount: 6 })).toBe(false);
    expect(hasAllBlessings({ ownedCount: null })).toBe(false);
  });

  it("treats every blessing owned as complete when the catalog has 7", () => {
    const blessings = Array.from({ length: 7 }, (_, i) => ({ owned: true, id: i + 2 }));
    expect(hasAllBlessings({ blessings, ownedCount: 0 })).toBe(true);
    blessings[0]!.owned = false;
    expect(hasAllBlessings({ blessings, ownedCount: 6 })).toBe(false);
  });

  it("lists unowned blessings and picks the cheapest affordable next", () => {
    const blessings = [
      { id: 2, owned: true, cost: 100 },
      { id: 3, owned: false, cost: 300 },
      { id: 4, owned: false, cost: 200 },
    ];
    expect(unownedBlessings(blessings).map((b) => b.id)).toEqual([3, 4]);
    expect(nextAffordableBlessing(blessings, 250)?.id).toBe(4);
    expect(nextAffordableBlessing(blessings, 150)).toBeNull();
    expect(nextAffordableBlessing(blessings, null)?.id).toBe(4);
  });
});
