import type { ItemMarketPrice } from "../types";

export interface MarketPricesCache {
  prices: Record<number, ItemMarketPrice>;
  updatedAt: number;
}

export type SellVenue = "npc" | "market" | "exclude" | "none";

export interface SellVenueComparison {
  bestVenue: SellVenue;
  npcPerItem: number | null;
  marketListPrice: number | null;
  marketNetPerItem: number | null;
  buyOrderPrice: number | null;
  profitVsNpc: number | null;
}

export interface ArbitrageOpportunity {
  itemId: number;
  kind: "buy_market_sell_npc" | "sell_buy_order_vs_npc";
  buyPrice: number;
  sellPrice: number;
  profitPerItem: number;
  profitPercent: number | null;
}

export interface HuntLootProfile {
  itemId: number;
  itemName: string;
  dropChance: number;
  maxCount?: number;
  npcSellPrice: number | null;
  marketPrice: ItemMarketPrice | null;
  sellComparison: SellVenueComparison;
  sellMode?: string;
  /** Mount / untradable / quest — locked Keep in UI, never auto-sold. */
  neverSell?: boolean;
}

export interface MarketPricingOptions {
  taxPercent: number;
  undercutGold: number;
}
