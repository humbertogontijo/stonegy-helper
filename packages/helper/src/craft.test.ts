import { describe, expect, it } from "vitest";
import {
  getCraftRecipeById,
  isCraftResourceItem,
  listCraftRecipes,
  listCraftRecipesByType,
  listCraftRecipesCostingItem,
  listCraftResourceItemIds,
  listCraftTypes,
} from "./craft";
import {
  getEnchantRecipeById,
  isEnchantResourceItem,
  listEnchantRecipes,
  listEnchantResourceItemIds,
} from "./enchant";

describe("craft catalog", () => {
  it("loads NPC craft recipes and types from the bundle extract", () => {
    expect(listCraftTypes().map((entry) => entry.label)).toEqual([
      "UMBRAL",
      "CRYSTALLINE TOKEN",
      "GOLD TOKEN",
      "SPECIAL",
    ]);
    expect(listCraftRecipes()).toHaveLength(57);
  });

  it("includes Major Crystalline Token exchanges", () => {
    const crystalline = listCraftRecipesCostingItem(299);
    expect(crystalline).toHaveLength(11);
    expect(crystalline.some((recipe) => recipe.label === "Gill Gugel")).toBe(true);
    expect(listCraftRecipesByType(2)).toHaveLength(11);
  });

  it("looks up umbral create recipes by id", () => {
    const createBlade = getCraftRecipeById(1001);
    expect(createBlade?.action).toBe("create");
    expect(createBlade?.label).toBe("Create blade");
    expect(createBlade?.costs).toEqual([
      { itemId: 404, amount: 1 },
      { itemId: 389, amount: 20 },
    ]);
  });

  it("lists craft resource materials without umbral/equipment gear", () => {
    const resources = listCraftResourceItemIds();
    expect(resources).toContain(389);
    expect(resources).toContain(404);
    expect(resources).toContain(299);
    expect(resources).toContain(578);
    expect(isCraftResourceItem(389)).toBe(true);
    expect(isCraftResourceItem(405)).toBe(false);
    expect(isCraftResourceItem(606)).toBe(false);
  });
});

describe("enchant catalog", () => {
  it("loads NPC enchant recipes", () => {
    const enchants = listEnchantRecipes();
    expect(enchants).toHaveLength(4);
    expect(enchants.map((entry) => entry.label)).toEqual([
      "Werewolf Amulet",
      "Soft Boots Repair",
      "Amulet of Theurgy",
      "Blister Ring",
    ]);
  });

  it("preserves gold cost and market block flags", () => {
    const softBoots = getEnchantRecipeById(3002);
    expect(softBoots?.goldCost).toBe(10000);
    expect(softBoots?.costs).toEqual([]);

    const werewolf = getEnchantRecipeById(3001);
    expect(werewolf?.blocksMarketResult).toBe(true);
    expect(werewolf?.costs).toEqual([{ itemId: 336, amount: 1 }]);
  });

  it("lists enchant resource materials without source gear", () => {
    expect(listEnchantResourceItemIds()).toEqual([336, 541]);
    expect(isEnchantResourceItem(336)).toBe(true);
    expect(isEnchantResourceItem(26)).toBe(false);
  });
});
