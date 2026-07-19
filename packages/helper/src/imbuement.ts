import { IMBUEMENTS } from "@stonegy/game-data/imbuement";
import { getItemByName } from "./items";

export type ImbuementTier = "BASIC" | "INTRICATE" | "POWERFUL";

export interface ImbuementIngredient {
  itemName: string;
  amount: number;
}

export interface ImbuementRecord {
  id: string;
  name: string;
  tier: ImbuementTier | string;
  category: string;
  icon: string;
  description: string;
  durationMs: number;
  goldFee: number;
  protectionGoldFee: number;
  successRate: number;
  premiumOnly: boolean;
  ingredients: ImbuementIngredient[];
}

function resolveIngredientItemId(itemName: string): number | undefined {
  const direct = getItemByName(itemName);
  if (direct) {
    return direct.id;
  }

  // Bundle uses singular "Fairy Wing"; item catalog is "Fairy Wings".
  if (!itemName.endsWith("s")) {
    return getItemByName(`${itemName}s`)?.id;
  }

  return getItemByName(itemName.slice(0, -1))?.id;
}

const imbuementItemIds = new Set<number>();
for (const imbuement of IMBUEMENTS as ImbuementRecord[]) {
  for (const ingredient of imbuement.ingredients) {
    const itemId = resolveIngredientItemId(ingredient.itemName);
    if (itemId != null) {
      imbuementItemIds.add(itemId);
    }
  }
}

export function listImbuements(): ImbuementRecord[] {
  return IMBUEMENTS as ImbuementRecord[];
}

/** Item IDs used as imbuement ingredients (materials). */
export function listImbuementItemIds(): number[] {
  return [...imbuementItemIds].sort((a, b) => a - b);
}

export function isImbuementItem(itemId: number): boolean {
  return imbuementItemIds.has(itemId);
}
