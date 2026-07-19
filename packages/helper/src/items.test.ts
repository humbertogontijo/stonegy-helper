import { describe, expect, it } from "vitest";
import {
  getRarityBorderTierName,
  isMountItem,
  matchesMarketSellRarity,
  normalizeRarityBorderTier,
  shouldNeverAutoSell,
} from "./items";

describe("item sell heuristics", () => {
  it("does not treat Ham as never-sell (NPC via rules)", () => {
    expect(shouldNeverAutoSell(595)).toBe(false);
    expect(matchesMarketSellRarity(595, 1)).toBe(false);
  });

  it("matches rarity-border items like Small Ruby at min tier 1", () => {
    expect(matchesMarketSellRarity(14, 1)).toBe(true);
    expect(shouldNeverAutoSell(14)).toBe(false);
  });

  it("treats mounts as mount items but not hard never-sell", () => {
    expect(isMountItem(246)).toBe(true);
    expect(shouldNeverAutoSell(246)).toBe(false);
  });

  it("never sells untradable items", () => {
    expect(shouldNeverAutoSell(938)).toBe(true);
  });

  it("never sells quest items", () => {
    expect(shouldNeverAutoSell(100)).toBe(true);
  });

  it("respects min rarity tier", () => {
    // Small Ruby is tier 1
    expect(matchesMarketSellRarity(14, 1)).toBe(true);
    expect(matchesMarketSellRarity(14, 2)).toBe(false);
  });

  it("falls back to classification when rarityBorderTier is missing", () => {
    // Club: classification 1, no rarityBorderTier
    expect(matchesMarketSellRarity(1, 1)).toBe(true);
    expect(matchesMarketSellRarity(1, 2)).toBe(false);
    // Umbral Blade: classification 3, no rarityBorderTier
    expect(matchesMarketSellRarity(413, 3)).toBe(true);
    expect(matchesMarketSellRarity(413, 4)).toBe(false);
  });

  it("prefers rarityBorderTier over classification when both exist", () => {
    // Spiritthorn Armor: classification 4, rarityBorderTier 5
    expect(matchesMarketSellRarity(8, 5)).toBe(true);
    expect(matchesMarketSellRarity(8, 6)).toBe(false);
  });

  it("maps rarity tiers to names", () => {
    expect(getRarityBorderTierName(1)).toBe("Common");
    expect(getRarityBorderTierName(3)).toBe("Rare");
    expect(getRarityBorderTierName(5)).toBe("Legendary");
    expect(normalizeRarityBorderTier(0)).toBe(1);
    expect(normalizeRarityBorderTier(9)).toBe(5);
  });
});
