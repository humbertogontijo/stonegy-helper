import type { ItemMarketPrice, MarketPricingOptions, SellVenueComparison } from "./types";

export function marketTaxAmount(gross: number, taxPercent: number): number {
  if (gross <= 0 || taxPercent <= 0) {
    return 0;
  }

  return Math.floor((gross * taxPercent) / 100);
}

export function netMarketProceeds(eachPrice: number, amount: number, taxPercent: number): number {
  const gross = eachPrice * amount;
  return gross - marketTaxAmount(gross, taxPercent);
}

export function netPerItemAfterMarketSale(listPrice: number, taxPercent: number): number {
  return listPrice - Math.floor((listPrice * taxPercent) / 100);
}

export function suggestedListPrice(
  referencePrice: number | null,
  undercutGold: number,
  options?: { undercut?: boolean }
): number | null {
  if (referencePrice == null) {
    return null;
  }

  if (options?.undercut === false) {
    return Math.max(1, referencePrice);
  }

  if (referencePrice <= undercutGold) {
    return Math.max(1, referencePrice);
  }

  return referencePrice - undercutGold;
}

export function compareSellVenues(options: {
  npcSellPrice: number | null;
  marketPrice: ItemMarketPrice | null;
  excluded: boolean;
  pricing: MarketPricingOptions;
  preferNpcOverMarketList?: boolean;
}): SellVenueComparison {
  const { npcSellPrice, marketPrice, excluded, pricing, preferNpcOverMarketList } = options;

  if (excluded) {
    return {
      bestVenue: "exclude",
      npcPerItem: npcSellPrice,
      marketListPrice: null,
      marketNetPerItem: null,
      buyOrderPrice: marketPrice?.highestBuyPrice ?? null,
      profitVsNpc: null,
    };
  }

  if (marketPrice == null) {
    // Junk (prefer NPC): sell to NPC without waiting for market cache.
    // Market-eligible / rare items: hold — do not NPC-dump without a price check.
    if (
      preferNpcOverMarketList &&
      npcSellPrice != null &&
      npcSellPrice > 0
    ) {
      return {
        bestVenue: "npc",
        npcPerItem: npcSellPrice,
        marketListPrice: null,
        marketNetPerItem: null,
        buyOrderPrice: null,
        profitVsNpc: 0,
      };
    }

    return {
      bestVenue: "none",
      npcPerItem: npcSellPrice,
      marketListPrice: null,
      marketNetPerItem: null,
      buyOrderPrice: null,
      profitVsNpc: null,
    };
  }

  // Competing sells → undercut. Own-only book → match own reference (no undercut).
  const marketListPrice =
    marketPrice.lowestSellPrice != null
      ? suggestedListPrice(marketPrice.lowestSellPrice, pricing.undercutGold)
      : suggestedListPrice(marketPrice.ownOrderReferencePrice ?? null, pricing.undercutGold, {
          undercut: false,
        });
  const marketNetPerItem =
    marketListPrice != null
      ? netPerItemAfterMarketSale(marketListPrice, pricing.taxPercent)
      : null;
  const buyOrderPrice = marketPrice.highestBuyPrice ?? null;

  let bestVenue: SellVenueComparison["bestVenue"] = "none";
  let profitVsNpc: number | null = null;

  const npc = npcSellPrice ?? 0;
  const marketNet = marketNetPerItem ?? 0;

  if (preferNpcOverMarketList) {
    if (npcSellPrice != null && npcSellPrice > 0) {
      bestVenue = "npc";
      profitVsNpc = 0;
    }
  } else if (marketNetPerItem != null && (npcSellPrice == null || marketNet > npc)) {
    bestVenue = "market";
    profitVsNpc = npcSellPrice != null ? marketNetPerItem - npcSellPrice : marketNetPerItem;
  } else if (npcSellPrice != null && npcSellPrice > 0) {
    bestVenue = "npc";
    profitVsNpc = 0;
  }

  return {
    bestVenue,
    npcPerItem: npcSellPrice,
    marketListPrice,
    marketNetPerItem,
    buyOrderPrice,
    profitVsNpc,
  };
}

export function shouldSellOnMarket(comparison: SellVenueComparison): boolean {
  return comparison.bestVenue === "market";
}

export function shouldQuickSellToNpc(comparison: SellVenueComparison): boolean {
  return comparison.bestVenue === "npc";
}
