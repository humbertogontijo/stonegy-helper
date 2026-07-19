import { getNpcSellPrice } from "../items";
import type { ItemMarketPrice } from "../types";
import type { ArbitrageOpportunity } from "./types";

export function findBuyMarketSellNpcOpportunities(
  itemIds: number[],
  prices: Record<number, ItemMarketPrice>
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const itemId of itemIds) {
    const npcSellPrice = getNpcSellPrice(itemId);
    const marketPrice = prices[itemId];
    const buyPrice = marketPrice?.lowestSellPrice;

    if (npcSellPrice == null || buyPrice == null || buyPrice <= 0) {
      continue;
    }

    const profitPerItem = npcSellPrice - buyPrice;
    if (profitPerItem <= 0) {
      continue;
    }

    opportunities.push({
      itemId,
      kind: "buy_market_sell_npc",
      buyPrice,
      sellPrice: npcSellPrice,
      profitPerItem,
      profitPercent: Math.round((profitPerItem / buyPrice) * 1000) / 10,
    });
  }

  return opportunities.sort((a, b) => b.profitPerItem - a.profitPerItem);
}

export function findSellBuyOrderVsNpcOpportunities(
  itemIds: number[],
  prices: Record<number, ItemMarketPrice>
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const itemId of itemIds) {
    const npcSellPrice = getNpcSellPrice(itemId);
    const marketPrice = prices[itemId];
    const buyOrderPrice = marketPrice?.highestBuyPrice;

    if (npcSellPrice == null || buyOrderPrice == null || buyOrderPrice <= npcSellPrice) {
      continue;
    }

    const profitPerItem = buyOrderPrice - npcSellPrice;
    opportunities.push({
      itemId,
      kind: "sell_buy_order_vs_npc",
      buyPrice: buyOrderPrice,
      sellPrice: npcSellPrice,
      profitPerItem,
      profitPercent: Math.round((profitPerItem / npcSellPrice) * 1000) / 10,
    });
  }

  return opportunities.sort((a, b) => b.profitPerItem - a.profitPerItem);
}

export function findArbitrageOpportunities(
  itemIds: number[],
  prices: Record<number, ItemMarketPrice>
): ArbitrageOpportunity[] {
  return [
    ...findBuyMarketSellNpcOpportunities(itemIds, prices),
    ...findSellBuyOrderVsNpcOpportunities(itemIds, prices),
  ].sort((a, b) => b.profitPerItem - a.profitPerItem);
}
