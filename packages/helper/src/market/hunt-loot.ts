import { shouldNeverAutoSell } from "../items";
import { getHuntDroppedItemIds } from "../monsters";
import { resolveLootSellRule } from "../domain/loot-sell";
import type { Settings } from "../core/settings";
import type { BotState } from "../types";

type QuickSellSettings = Pick<
  Settings,
  | "lootSellModeByItemId"
  | "lootSellExcludedItemIds"
  | "marketSellMinRarityTier"
  | "minRaritySellMode"
  | "mountSellMode"
  | "imbuementSellMode"
  | "craftSellMode"
  | "enchantSellMode"
>;

/**
 * Item IDs to deselect from in-hunt quick sell so they are held for post-hunt
 * market listing (or kept). NPC-rule items stay selected for quick sell.
 */
export function getQuickSellDeselectedItemIds(
  huntId: number | null,
  options: {
    settings: QuickSellSettings;
    autoSellLootEnabled: boolean;
  }
): number[] {
  const deselected = new Set<number>(options.settings.lootSellExcludedItemIds ?? []);

  for (const [itemIdRaw, mode] of Object.entries(options.settings.lootSellModeByItemId ?? {})) {
    if (mode === "keep") {
      deselected.add(Number(itemIdRaw));
    }
  }

  if (!huntId) {
    return [...deselected];
  }

  const stateLike = { settings: options.settings } as Pick<BotState, "settings">;

  if (!options.autoSellLootEnabled) {
    for (const itemId of getHuntDroppedItemIds(huntId)) {
      if (shouldNeverAutoSell(itemId) || resolveLootSellRule(stateLike, itemId) === "keep") {
        deselected.add(itemId);
      }
    }
    return [...deselected];
  }

  for (const itemId of getHuntDroppedItemIds(huntId)) {
    const rule = resolveLootSellRule(stateLike, itemId);
    if (rule === "keep" || rule === "market") {
      deselected.add(itemId);
    }
  }

  return [...deselected];
}
