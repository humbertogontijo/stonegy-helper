import { ENCHANT } from "@stonegy/game-data/enchant";

export interface EnchantCost {
  itemId: number;
  amount: number;
}

export interface EnchantRecipe {
  id: number;
  label: string;
  sourceItemId: number;
  resultItemId: number;
  costs: EnchantCost[];
  goldCost?: number;
  blocksMarketResult?: boolean;
}

const recipes = ENCHANT as EnchantRecipe[];

/** Cost materials only — excludes source/result equipment. */
const enchantResourceItemIds = (() => {
  const productIds = new Set<number>();
  for (const recipe of recipes) {
    productIds.add(recipe.sourceItemId);
    productIds.add(recipe.resultItemId);
  }

  const resourceIds = new Set<number>();
  for (const recipe of recipes) {
    for (const cost of recipe.costs) {
      if (!productIds.has(cost.itemId)) {
        resourceIds.add(cost.itemId);
      }
    }
  }
  return resourceIds;
})();

export function listEnchantRecipes(): EnchantRecipe[] {
  return recipes;
}

export function getEnchantRecipeById(recipeId: number): EnchantRecipe | undefined {
  return recipes.find((recipe) => recipe.id === recipeId);
}

export function listEnchantResourceItemIds(): number[] {
  return [...enchantResourceItemIds].sort((a, b) => a - b);
}

export function isEnchantResourceItem(itemId: number): boolean {
  return enchantResourceItemIds.has(itemId);
}
