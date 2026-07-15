import { CRAFT } from "./data/craft";
import { getItemById } from "./items";

export type CraftAction = "create" | "improve" | "transform" | "exchange" | string;

export interface CraftCost {
  itemId: number;
  amount: number;
}

export interface CraftTypeInfo {
  craftType: number;
  label: string;
}

export interface UmbralFamily {
  key: string;
  crudeItemId: number;
  umbralItemId: number;
  masterItemId: number;
}

export interface CraftRecipe {
  id: number;
  craftType: number;
  action: CraftAction;
  label: string;
  successChancePercent: number;
  costs: CraftCost[];
  resultItemId?: number;
  resultAmount?: number;
  resultItems?: CraftCost[];
  sourceItemId?: number;
  downgradeItemId?: number;
}

export interface CraftCatalog {
  types: CraftTypeInfo[];
  umbralFamilies: UmbralFamily[];
  recipes: CraftRecipe[];
}

const catalog = CRAFT as CraftCatalog;

export function listCraftTypes(): CraftTypeInfo[] {
  return catalog.types;
}

export function listUmbralFamilies(): UmbralFamily[] {
  return catalog.umbralFamilies;
}

export function listCraftRecipes(): CraftRecipe[] {
  return catalog.recipes;
}

export function getCraftRecipeById(recipeId: number): CraftRecipe | undefined {
  return catalog.recipes.find((recipe) => recipe.id === recipeId);
}

export function listCraftRecipesByType(craftType: number): CraftRecipe[] {
  return catalog.recipes.filter((recipe) => recipe.craftType === craftType);
}

/** Recipes that spend the given item as a cost. */
export function listCraftRecipesCostingItem(itemId: number): CraftRecipe[] {
  return catalog.recipes.filter((recipe) =>
    recipe.costs.some((cost) => cost.itemId === itemId)
  );
}

/** Cost materials only — excludes gear that is also a craft source/result. */
const craftResourceItemIds = (() => {
  const productIds = new Set<number>();
  for (const family of catalog.umbralFamilies) {
    productIds.add(family.crudeItemId);
    productIds.add(family.umbralItemId);
    productIds.add(family.masterItemId);
  }
  for (const recipe of catalog.recipes) {
    if (recipe.sourceItemId != null) {
      productIds.add(recipe.sourceItemId);
    }
    if (recipe.resultItemId != null) {
      productIds.add(recipe.resultItemId);
    }
    if (recipe.downgradeItemId != null) {
      productIds.add(recipe.downgradeItemId);
    }
    for (const result of recipe.resultItems ?? []) {
      productIds.add(result.itemId);
    }
  }

  const resourceIds = new Set<number>();
  for (const recipe of catalog.recipes) {
    for (const cost of recipe.costs) {
      if (productIds.has(cost.itemId)) {
        continue;
      }
      // Skip gear used as a recipe ingredient (e.g. Falcon Shield → Escutcheon).
      if (getItemById(cost.itemId)?.slot) {
        continue;
      }
      resourceIds.add(cost.itemId);
    }
  }
  return resourceIds;
})();

export function listCraftResourceItemIds(): number[] {
  return [...craftResourceItemIds].sort((a, b) => a - b);
}

export function isCraftResourceItem(itemId: number): boolean {
  return craftResourceItemIds.has(itemId);
}
