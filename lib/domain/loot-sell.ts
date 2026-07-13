import {
  getInventoryItemAmount,
  inventorySellableAmountsFromItems,
} from "../inventory";
import {
  getItemById,
  getItemName,
  getNpcSellPrice,
  isMountItem,
  matchesMarketSellRarity,
  shouldNeverAutoSell,
} from "../items";
import { DEFAULT_MARKET_TAX_PERCENT } from "../market/constants";
import {
  netPerItemAfterMarketSale,
  suggestedListPrice,
} from "../market/pricing";
import type { ItemMarketPrice, MarketPricingOptions, SellVenue } from "../market/types";
import type { Settings } from "../core/settings";
import type { BotState, LootSellMode, LootSellRule } from "../types";
import type { InventoryItemEntry } from "../binary/types";

export type { LootSellMode, LootSellRule };

const LOOT_SELL_OVERRIDE_MODES = new Set<LootSellMode>(["npc", "market", "keep"]);

const MAX_SELLABLE_INVENTORY_AMOUNT = 100_000;

/** Scoped domain data needed for loot-sell decisions — assemble from domain state services. */
export type LootSellState = Pick<BotState, "settings"> & {
  inventory: Pick<BotState["inventory"], "items" | "gameQuickSellDeselectedItemIds">;
  market: Pick<BotState["market"], "marketPrices">;
  party: Pick<BotState["party"], "partyStatus">;
  hunt: Pick<BotState["hunt"], "activeHuntId">;
};

/** Settings + inventory + market prices — enough for sell candidate checks. */
export type InventoryLootContext = Pick<BotState, "settings" | "inventory"> & {
  market: Pick<BotState["market"], "marketPrices">;
};

export interface InventoryLootSellEntry {
  itemId: number;
  name: string;
  amount: number;
  /** Resolved sell venue for this preview row. */
  venue: SellVenue;
  /** NPC proceeds for the sellable amount. */
  npcValue: number | null;
  /** After-tax market list proceeds for the sellable amount (null if no market cache). */
  netValue: number | null;
  /** Proceeds from the venue that will actually be used. */
  finalValue: number | null;
  /** True when market rule matched but prices are not cached yet. */
  needsMarketSync?: boolean;
}

type InventoryLike = {
  items?: InventoryItemEntry[] | null;
  gameQuickSellDeselectedItemIds?: number[] | null;
  gameLootFilterExcludedItemIds?: number[] | null;
};

export function normalizeLootSellModes(
  modes: Record<number, string> | undefined
): Record<number, LootSellMode> {
  if (!modes) {
    return {};
  }

  const normalized: Record<number, LootSellMode> = {};
  for (const [itemIdRaw, mode] of Object.entries(modes)) {
    const itemId = Number(itemIdRaw);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      continue;
    }

    if (LOOT_SELL_OVERRIDE_MODES.has(mode as LootSellMode)) {
      normalized[itemId] = mode as LootSellMode;
    }
  }

  return normalized;
}

/**
 * Resolve keep / market / npc for an item:
 * untradable/quest → keep; explicit override → that mode; mount toggle; else min rarity → market, else npc.
 */
export function resolveLootSellRule(
  state: Pick<BotState, "settings">,
  itemId: number
): LootSellRule {
  if (shouldNeverAutoSell(itemId)) {
    return "keep";
  }

  const override = state.settings.lootSellModeByItemId?.[itemId];
  if (override === "keep" || override === "npc" || override === "market") {
    return override;
  }

  if (isMountItem(itemId)) {
    return state.settings.marketSellMountItems ? "market" : "keep";
  }

  const minTier = state.settings.marketSellMinRarityTier ?? 1;
  if (matchesMarketSellRarity(itemId, minTier)) {
    return "market";
  }

  return "npc";
}

export function isLootSellEnabled(settings: Settings): boolean {
  return !!settings.autoSellLoot;
}

/** True when market_create_order failed because the account hit its open-order cap. */
export function isMarketOpenOrderLimitError(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("limite de ordens abertas")) {
    return true;
  }

  if (normalized.includes("open order") && normalized.includes("limit")) {
    return true;
  }

  if (normalized.includes("maximum") && normalized.includes("open order")) {
    return true;
  }

  return normalized.includes("order limit") && normalized.includes("market");
}

function marketListPriceFromCache(
  marketPrice: ItemMarketPrice | null | undefined,
  pricing: MarketPricingOptions
): number | null {
  if (marketPrice == null) {
    return null;
  }

  if (marketPrice.lowestSellPrice != null) {
    return suggestedListPrice(marketPrice.lowestSellPrice, pricing.undercutGold);
  }

  return suggestedListPrice(marketPrice.ownOrderReferencePrice ?? null, pricing.undercutGold, {
    undercut: false,
  });
}

export function resolveSellVenueForItem(
  state: Pick<BotState, "settings"> & { market: Pick<BotState["market"], "marketPrices"> },
  itemId: number,
  _pricing?: MarketPricingOptions
): SellVenue {
  const rule = resolveLootSellRule(state, itemId);
  if (rule === "keep") {
    return "exclude";
  }

  if (rule === "npc") {
    return getNpcSellPrice(itemId) != null ? "npc" : "none";
  }

  const marketPrice = state.market.marketPrices[itemId] ?? null;
  return marketPrice != null ? "market" : "none";
}

export function resolveMarketListPrice(
  state: Pick<BotState, "settings"> & { market: Pick<BotState["market"], "marketPrices"> },
  itemId: number,
  pricing: MarketPricingOptions
): number | null {
  if (resolveLootSellRule(state, itemId) !== "market") {
    return null;
  }

  return marketListPriceFromCache(state.market.marketPrices[itemId], pricing);
}

export function isActivelyHunting(state: Pick<LootSellState, "party" | "hunt">): boolean {
  return state.party.partyStatus === "hunting" || state.hunt.activeHuntId != null;
}

export function sellableAmount(state: Pick<LootSellState, "inventory">, itemId: number): number {
  return getInventoryItemAmount(
    inventorySellableAmountsFromItems(state.inventory.items ?? []),
    itemId
  );
}

export function excludedItemIdsFromLootSellModes(
  modes: Record<number, LootSellMode> | undefined
): number[] {
  if (!modes) {
    return [];
  }

  return Object.entries(modes)
    .filter(([, mode]) => mode === "keep")
    .map(([itemId]) => Number(itemId))
    .filter((itemId) => Number.isFinite(itemId) && itemId > 0);
}

function normalizeInventory(inventory: InventoryLike): {
  items: InventoryItemEntry[];
  gameQuickSellDeselectedItemIds: number[];
  gameLootFilterExcludedItemIds: number[];
} {
  return {
    items: inventory.items ?? [],
    gameQuickSellDeselectedItemIds: inventory.gameQuickSellDeselectedItemIds ?? [],
    gameLootFilterExcludedItemIds: inventory.gameLootFilterExcludedItemIds ?? [],
  };
}

function sellableInventory(inventory: InventoryLike): Record<number, number> {
  return inventorySellableAmountsFromItems(normalizeInventory(inventory).items);
}

function isSellableInventoryItem(itemId: number, amount = 1): boolean {
  return (
    Number.isFinite(itemId) &&
    itemId > 0 &&
    getItemById(itemId) != null &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= MAX_SELLABLE_INVENTORY_AMOUNT
  );
}

function resolvePricing(state: Pick<BotState, "settings">): MarketPricingOptions {
  return {
    taxPercent: DEFAULT_MARKET_TAX_PERCENT,
    undercutGold: state.settings.marketUndercutGold ?? 1,
  };
}

function scalePerItem(perItem: number | null | undefined, amount: number): number | null {
  if (perItem == null || !Number.isFinite(perItem)) {
    return null;
  }
  return perItem * amount;
}

function finalValueForVenue(
  venue: SellVenue,
  amount: number,
  values: {
    npcPerItem: number | null;
    marketNetPerItem: number | null;
  }
): number | null {
  switch (venue) {
    case "npc":
      return scalePerItem(values.npcPerItem, amount);
    case "market":
      return scalePerItem(values.marketNetPerItem, amount);
    default:
      return null;
  }
}

function buildInventoryLootSellEntry(
  state: InventoryLootContext,
  itemId: number,
  amount: number,
  pricing: MarketPricingOptions
): InventoryLootSellEntry {
  const rule = resolveLootSellRule(state, itemId);
  const venue = resolveSellVenueForItem(state, itemId, pricing);
  const npcPerItem = getNpcSellPrice(itemId);
  const listPrice = marketListPriceFromCache(state.market.marketPrices[itemId], pricing);
  const marketNetPerItem =
    listPrice != null ? netPerItemAfterMarketSale(listPrice, pricing.taxPercent) : null;
  const needsMarketSync = rule === "market" && state.market.marketPrices[itemId] == null;

  return {
    itemId,
    name: getItemName(itemId) ?? `Item #${itemId}`,
    amount,
    venue,
    npcValue: scalePerItem(npcPerItem, amount),
    netValue: scalePerItem(marketNetPerItem, amount),
    finalValue: finalValueForVenue(venue, amount, { npcPerItem, marketNetPerItem }),
    needsMarketSync,
  };
}

/** Quick-sell deselected ids synced from update_battle_config. */
export function getGameQuickSellDeselectedItemIds(state: InventoryLootContext): number[] {
  return normalizeInventory(state.inventory).gameQuickSellDeselectedItemIds.filter(
    (itemId) => Number.isFinite(itemId) && itemId > 0
  );
}

export function getCombinedLootSellExcludedItemIds(state: InventoryLootContext): Set<number> {
  const excluded = new Set(getGameQuickSellDeselectedItemIds(state));
  const sellable = sellableInventory(state.inventory);

  for (const itemIdRaw of Object.keys(sellable)) {
    const itemId = Number(itemIdRaw);
    if (Number.isFinite(itemId) && itemId > 0 && resolveLootSellRule(state, itemId) === "keep") {
      excluded.add(itemId);
    }
  }

  for (const [itemIdRaw, mode] of Object.entries(state.settings.lootSellModeByItemId ?? {})) {
    if (mode !== "keep") {
      continue;
    }

    const itemId = Number(itemIdRaw);
    if (Number.isFinite(itemId) && itemId > 0) {
      excluded.add(itemId);
    }
  }

  return excluded;
}

export function getInventoryLootCandidateEntries(
  state: InventoryLootContext
): InventoryLootSellEntry[] {
  const excluded = getCombinedLootSellExcludedItemIds(state);
  const sellable = sellableInventory(state.inventory);
  const pricing = resolvePricing(state);

  return Object.entries(sellable)
    .map(([itemIdRaw, amount]) => [Number(itemIdRaw), amount] as const)
    .filter(([itemId, amount]) => isSellableInventoryItem(itemId, amount) && amount > 0)
    .filter(([itemId]) => !excluded.has(itemId))
    .filter(([itemId]) => getItemById(itemId) != null)
    .filter(([itemId]) => resolveLootSellRule(state, itemId) !== "keep")
    .map(([itemId, amount]) =>
      buildInventoryLootSellEntry(
        state,
        itemId,
        getInventoryItemAmount(sellable, itemId) || amount,
        pricing
      )
    )
    .sort((left, right) => left.itemId - right.itemId);
}

/** Item IDs among candidates whose rule is market (need price sync before listing). */
export function getInventoryMarketSyncCandidateIds(state: InventoryLootContext): number[] {
  return getInventoryLootCandidateEntries(state)
    .filter((entry) => resolveLootSellRule(state, entry.itemId) === "market")
    .map((entry) => entry.itemId);
}

export function getInventoryLootSellEntries(
  state: InventoryLootContext,
  pricing: MarketPricingOptions = resolvePricing(state),
  options: { includeHeldForMarketSync?: boolean } = {}
): InventoryLootSellEntry[] {
  const excluded = getCombinedLootSellExcludedItemIds(state);
  const sellable = sellableInventory(state.inventory);
  const includeHeld = options.includeHeldForMarketSync === true;

  return Object.entries(sellable)
    .map(([itemIdRaw, amount]) => [Number(itemIdRaw), amount] as const)
    .filter(([itemId, amount]) => isSellableInventoryItem(itemId, amount) && amount > 0)
    .filter(([itemId]) => !excluded.has(itemId))
    .filter(([itemId]) => getItemById(itemId) != null)
    .filter(([itemId]) => {
      const rule = resolveLootSellRule(state, itemId);
      if (rule === "keep") {
        return false;
      }

      const venue = resolveSellVenueForItem(state, itemId, pricing);
      if (venue === "exclude") {
        return false;
      }
      if (venue !== "none") {
        return true;
      }

      // Hold market-rule items with no price so the UI can show them.
      return includeHeld && rule === "market";
    })
    .map(([itemId, amount]) =>
      buildInventoryLootSellEntry(
        state,
        itemId,
        getInventoryItemAmount(sellable, itemId) || amount,
        pricing
      )
    )
    .sort((left, right) => left.itemId - right.itemId);
}

export function sumInventoryLootSellValues(entries: InventoryLootSellEntry[]): {
  npcValue: number;
  netValue: number;
  finalValue: number;
} {
  return entries.reduce(
    (totals, entry) => ({
      npcValue: totals.npcValue + (entry.npcValue ?? 0),
      netValue: totals.netValue + (entry.netValue ?? 0),
      finalValue: totals.finalValue + (entry.finalValue ?? 0),
    }),
    { npcValue: 0, netValue: 0, finalValue: 0 }
  );
}

export function getInventoryItemsToSellOnHuntFinish(
  state: InventoryLootContext,
  pricing: MarketPricingOptions = resolvePricing(state)
): number[] {
  return getInventoryLootSellEntries(state, pricing)
    .filter((entry) => entry.venue !== "none")
    .map((entry) => entry.itemId);
}

export function hasInventoryLootToSell(
  state: InventoryLootContext,
  pricing: MarketPricingOptions = resolvePricing(state)
): boolean {
  return getInventoryLootSellEntries(state, pricing).length > 0;
}

export function hasInventoryLootCandidates(state: InventoryLootContext): boolean {
  return getInventoryLootCandidateEntries(state).length > 0;
}
