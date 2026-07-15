import { SHORT_COOLDOWN } from "./core/commands/cooldown";
import type { MarketPricingOptions } from "./market/types";
import type { CommandOutcome } from "./core/commands/bus";
import {
  isActivelyHunting,
  isLootSellEnabled,
  isMarketOpenOrderLimitError,
  resolveMarketListPrice,
  resolveSellVenueForItem,
  sellableAmount,
  type LootSellState,
} from "./domain/loot-sell";

export interface LootSellDeps {
  delay: (ms: number) => Promise<void>;
  getState: () => LootSellState;
  runCommand: (
    type: string,
    params: unknown,
    options?: { force?: boolean }
  ) => Promise<CommandOutcome | unknown>;
  /** Called after a sell command is confirmed successful. */
  onSold?: (soldByItemId: Record<number, number>) => void;
}

export interface ItemSellResult {
  sold: boolean;
  /** Market listing stopped because the account hit its open-order cap. */
  marketOrderLimitReached?: boolean;
  errorMessage?: string;
}

function isSuccessfulOutcome(outcome: unknown): boolean {
  if (!outcome || typeof outcome !== "object") {
    return false;
  }
  const result = outcome as CommandOutcome;
  return !!result.sent && result.success !== false;
}

function outcomeErrorMessage(outcome: unknown): string | undefined {
  if (!outcome || typeof outcome !== "object") {
    return undefined;
  }
  const message = (outcome as CommandOutcome).errorMessage;
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

export async function executeNpcQuickSell(itemId: number, deps: LootSellDeps): Promise<void> {
  await executeBatchNpcQuickSell([itemId], deps);
}

export async function executeBatchNpcQuickSell(
  itemIds: number[],
  deps: LootSellDeps
): Promise<void> {
  const state = deps.getState();
  const soldByItemId: Record<number, number> = {};
  const sellableIds: number[] = [];

  for (const itemId of itemIds) {
    const amount = sellableAmount(state, itemId);
    if (amount > 0) {
      sellableIds.push(itemId);
      soldByItemId[itemId] = amount;
    }
  }

  if (!sellableIds.length) {
    return;
  }

  const deselectedItemIds = state.inventory.gameQuickSellDeselectedItemIds ?? [];
  const outcome = await deps.runCommand("quick_sell_items", {
    itemIds: sellableIds,
    deselectedItemIds,
  });

  if (isSuccessfulOutcome(outcome)) {
    deps.onSold?.(soldByItemId);
  }
}

export async function enqueueOrExecuteNpcQuickSell(
  itemId: number,
  deps: LootSellDeps
): Promise<void> {
  const state = deps.getState();
  if (!isLootSellEnabled(state.settings)) {
    return;
  }

  if (isActivelyHunting(state)) {
    return;
  }

  await executeNpcQuickSell(itemId, deps);
}

export async function executeItemSell(
  itemId: number,
  pricing: MarketPricingOptions,
  deps: LootSellDeps
): Promise<ItemSellResult> {
  const state = deps.getState();
  const venue = resolveSellVenueForItem(state, itemId, pricing);
  if (venue === "exclude" || venue === "none") {
    return { sold: false };
  }

  const amount = sellableAmount(state, itemId);
  if (amount <= 0) {
    return { sold: false };
  }

  // Hunting is gated by enqueueOrExecute* / loot service — not here.
  // Manual "Sell now" and post-hunt sell call executeItemSell directly and must
  // still list market items even if partyStatus briefly flickers to "hunting".

  if (venue === "market") {
    const listPrice = resolveMarketListPrice(state, itemId, pricing);
    if (!listPrice) {
      // Market rule matched but no price reference — keep the item.
      return { sold: false };
    }

    const outcome = await deps.runCommand("market_create_order", {
      itemId,
      eachPrice: listPrice,
      itemAmount: amount,
      isBuyOrder: false,
    });
    if (isSuccessfulOutcome(outcome)) {
      deps.onSold?.({ [itemId]: amount });
      return { sold: true };
    }

    const errorMessage = outcomeErrorMessage(outcome);
    return {
      sold: false,
      marketOrderLimitReached: isMarketOpenOrderLimitError(errorMessage),
      errorMessage,
    };
  }

  if (venue !== "npc") {
    return { sold: false };
  }

  const outcome = await deps.runCommand("quick_sell_items", {
    itemIds: [itemId],
    deselectedItemIds: state.inventory.gameQuickSellDeselectedItemIds ?? [],
  });
  if (isSuccessfulOutcome(outcome)) {
    deps.onSold?.({ [itemId]: amount });
    return { sold: true };
  }

  return { sold: false, errorMessage: outcomeErrorMessage(outcome) };
}

export async function enqueueOrExecuteItemSell(
  itemId: number,
  pricing: MarketPricingOptions,
  deps: LootSellDeps
): Promise<ItemSellResult> {
  const state = deps.getState();
  if (!isLootSellEnabled(state.settings)) {
    return { sold: false };
  }

  const venue = resolveSellVenueForItem(state, itemId, pricing);
  if (venue === "exclude" || venue === "none") {
    return { sold: false };
  }

  if (isActivelyHunting(state)) {
    return { sold: false };
  }

  return executeItemSell(itemId, pricing, deps);
}

export async function executeLootSellsForItems(
  itemIds: number[],
  pricing: MarketPricingOptions,
  deps: LootSellDeps,
  syncDelayMs: number = SHORT_COOLDOWN
): Promise<void> {
  for (const itemId of itemIds) {
    const result = await enqueueOrExecuteItemSell(itemId, pricing, deps);
    if (result.marketOrderLimitReached) {
      return;
    }
    await deps.delay(syncDelayMs);
  }
}
