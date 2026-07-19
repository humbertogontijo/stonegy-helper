import {
  getInventoryItemAmount,
  inventoryAmountsFromItems,
} from "../inventory";
import {
  enqueueOrExecuteNpcQuickSell,
  enqueueOrExecuteItemSell,
  executeNpcQuickSell,
  type LootSellDeps,
} from "../loot-sell";
import type { LootSellState } from "../domain/loot-sell";
import { findBuyMarketSellNpcOpportunities } from "./arbitrage";
import { MARKET_ACTION_BURST_MS } from "./constants";
import type { BotState, MarketBoughtItem, MarketMissedOffer } from "../types";
import type { MarketOrder, MarketSnapshotData } from "../protocol-messages";
import type { MarketPricingOptions } from "./types";

/** Loot-sell scope plus gold balance for buy sizing. */
export type ProfitActionState = LootSellState & {
  character: Pick<BotState["character"], "goldCoins">;
};

export interface ProfitActionDeps extends Omit<LootSellDeps, "getState"> {
  getState: () => ProfitActionState;
  sendJson: (json: string) => Promise<unknown>;
  appendBoughtItem: (entry: MarketBoughtItem) => void;
  appendMissedOffer?: (entry: MarketMissedOffer) => void;
}

export function affordableMarketBuyAmount(
  goldCoins: number | null | undefined,
  eachPrice: number,
  orderAmount: number
): number {
  if (eachPrice <= 0 || orderAmount <= 0) {
    return 0;
  }

  const gold = goldCoins ?? 0;
  if (gold <= 0) {
    return 0;
  }

  return Math.min(orderAmount, Math.floor(gold / eachPrice));
}

export function resolveMarketBuyAmount(
  goldCoins: number | null | undefined,
  eachPrice: number,
  orderAmount: number,
  options?: { allowUnknownGold?: boolean }
): number {
  if (eachPrice <= 0 || orderAmount <= 0) {
    return 0;
  }

  if (goldCoins == null && options?.allowUnknownGold) {
    return Math.min(orderAmount, 1);
  }

  return affordableMarketBuyAmount(goldCoins, eachPrice, orderAmount);
}

export function missedMarketBuyAmount(
  goldCoins: number | null | undefined,
  eachPrice: number,
  orderAmount: number
): number {
  const affordable = affordableMarketBuyAmount(goldCoins, eachPrice, orderAmount);
  return Math.max(0, orderAmount - affordable);
}

function isActivelyHunting(state: ProfitActionState): boolean {
  return state.party.partyStatus === "hunting" || state.hunt.activeHuntId != null;
}

function cheapestSellOrders(snapshot: MarketSnapshotData | undefined, itemId: number): MarketOrder[] {
  return (snapshot?.sellOrders ?? [])
    .filter(
      (order) =>
        !order.isOwnOrder && !order.isBuyOrder && order.itemId === itemId && order.itemAmount > 0
    )
    .sort((a, b) => a.eachPrice - b.eachPrice);
}

function recordMissedOfferForOrder(
  deps: ProfitActionDeps,
  itemId: number,
  order: MarketOrder,
  sellPrice: number,
  missedAmount: number
) {
  if (missedAmount <= 0) {
    return;
  }

  deps.appendMissedOffer?.({
    itemId,
    buyPrice: order.eachPrice,
    sellPrice,
    profitPerItem: sellPrice - order.eachPrice,
    missedAmount,
    missedAt: Date.now(),
  });
}

export interface MarketBuyForNpcProfitOptions {
  /** Bypass command cooldown during hunt-loot sync bursts. */
  forceCommand?: boolean;
  /** Try one item when gold balance is not synced yet. */
  allowUnknownGold?: boolean;
  /** Sell to NPC after buying even when auto-sell loot is disabled. */
  forceNpcSell?: boolean;
}

export type MarketBuyForNpcProfitResult = {
  bought: boolean;
  reason?: "no_opportunity" | "no_orders" | "no_gold" | "command_blocked" | "bought";
  amount?: number;
};

async function waitForInventoryItem(
  itemId: number,
  minAmount: number,
  deps: Pick<ProfitActionDeps, "getState" | "delay">,
  timeoutMs = 8000
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (
      getInventoryItemAmount(
        inventoryAmountsFromItems(deps.getState().inventory.items ?? []),
        itemId
      ) >= minAmount
    ) {
      return true;
    }

    await deps.delay(MARKET_ACTION_BURST_MS);
  }

  return false;
}

export async function executeMarketBuyForNpcProfit(
  itemId: number,
  snapshot: MarketSnapshotData | undefined,
  _pricing: MarketPricingOptions,
  deps: ProfitActionDeps,
  options?: MarketBuyForNpcProfitOptions
): Promise<MarketBuyForNpcProfitResult> {
  const state = deps.getState();
  const opportunities = findBuyMarketSellNpcOpportunities([itemId], state.market.marketPrices ?? {});
  const opportunity = opportunities.find((entry) => entry.itemId === itemId);
  if (!opportunity || opportunity.profitPerItem <= 0) {
    return { bought: false, reason: "no_opportunity" };
  }

  const sellOrders = cheapestSellOrders(snapshot, itemId);
  if (!sellOrders.length) {
    return { bought: false, reason: "no_orders" };
  }

  const commandOptions = options?.forceCommand ? { force: true as const } : {};

  let boughtAny = false;
  let boughtAmount = 0;

  for (const order of sellOrders) {
    if (order.eachPrice > opportunity.buyPrice) {
      continue;
    }

    const buyAmount = resolveMarketBuyAmount(
      deps.getState().character.goldCoins,
      order.eachPrice,
      order.itemAmount,
      { allowUnknownGold: options?.allowUnknownGold }
    );
    const missedAmount = missedMarketBuyAmount(
      deps.getState().character.goldCoins,
      order.eachPrice,
      order.itemAmount
    );

    if (buyAmount <= 0) {
      recordMissedOfferForOrder(deps, itemId, order, opportunity.sellPrice, missedAmount);
      return { bought: false, reason: "no_gold" };
    }

    if (missedAmount > 0) {
      recordMissedOfferForOrder(deps, itemId, order, opportunity.sellPrice, missedAmount);
    }

    const result = await deps.runCommand(
      "market_resolve_order",
      { orderId: order.id, amount: buyAmount, side: "buy" },
      commandOptions
    ) as { sent: boolean } | undefined;

    if (!result?.sent) {
      return { bought: false, reason: "command_blocked" };
    }

    deps.appendBoughtItem({
      itemId,
      buyPrice: order.eachPrice,
      sellPrice: opportunity.sellPrice,
      profitPerItem: opportunity.sellPrice - order.eachPrice,
      amount: buyAmount,
      boughtAt: Date.now(),
    });
    boughtAny = true;
    boughtAmount = buyAmount;
    await deps.delay(MARKET_ACTION_BURST_MS);
    break;
  }

  if (!boughtAny) {
    return { bought: false, reason: "no_orders" };
  }

  // Flip path: bought below NPC price — sell to NPC (no listing tax).
  if (options?.forceNpcSell) {
    await waitForInventoryItem(itemId, boughtAmount, deps);

    if (isActivelyHunting(deps.getState())) {
      return { bought: true, reason: "bought", amount: boughtAmount };
    }

    await executeNpcQuickSell(itemId, deps);
    return { bought: true, reason: "bought", amount: boughtAmount };
  }

  if (isActivelyHunting(deps.getState())) {
    return { bought: true, reason: "bought", amount: boughtAmount };
  }

  await enqueueOrExecuteNpcQuickSell(itemId, deps);
  return { bought: true, reason: "bought", amount: boughtAmount };
}

export async function runLootSellChecksForItem(
  itemId: number,
  pricing: MarketPricingOptions,
  deps: ProfitActionDeps
): Promise<void> {
  await enqueueOrExecuteItemSell(itemId, pricing, deps);
}

export async function executeInventorySellForProfit(
  itemId: number,
  pricing: MarketPricingOptions,
  deps: ProfitActionDeps
): Promise<void> {
  await enqueueOrExecuteItemSell(itemId, pricing, deps);
}

export async function runLootProfitChecksForItem(
  itemId: number,
  pricing: MarketPricingOptions,
  deps: ProfitActionDeps
): Promise<void> {
  await runLootSellChecksForItem(itemId, pricing, deps);
}
