import { describe, expect, it } from "vitest";
import { defaultSettings } from "../core/settings";
import { getQuickSellDeselectedItemIds } from "./hunt-loot";

/** Hunt 1 drops Cheese (731) — no rarity → NPC rule. */
const junkHuntId = 1;
const junkItemId = 731;
/** Hunt 2 drops Wolf Paw (344) — rarity 1 → market rule. */
const rarityHuntId = 2;
const rarityItemId = 344;
/** Hunt 5 drops Minotaur Leather (100) — questItem → keep. */
const questHuntId = 5;
const questItemId = 100;

function settings(overrides: Partial<ReturnType<typeof defaultSettings>> = {}) {
  return {
    ...defaultSettings(),
    ...overrides,
  };
}

describe("getQuickSellDeselectedItemIds", () => {
  it("does not deselect NPC-rule junk loot", () => {
    const deselected = getQuickSellDeselectedItemIds(junkHuntId, {
      settings: settings(),
      autoSellLootEnabled: true,
    });

    expect(deselected).not.toContain(junkItemId);
  });

  it("deselects rarity loot for post-hunt market listing", () => {
    const deselected = getQuickSellDeselectedItemIds(rarityHuntId, {
      settings: settings(),
      autoSellLootEnabled: true,
    });

    expect(deselected).toContain(rarityItemId);
  });

  it("deselects junk loot when forced to market mode", () => {
    const deselected = getQuickSellDeselectedItemIds(junkHuntId, {
      settings: settings({
        lootSellModeByItemId: { [junkItemId]: "market" },
      }),
      autoSellLootEnabled: true,
    });

    expect(deselected).toContain(junkItemId);
  });

  it("does not deselect items forced to npc quick sell", () => {
    const deselected = getQuickSellDeselectedItemIds(rarityHuntId, {
      settings: settings({
        lootSellModeByItemId: { [rarityItemId]: "npc" },
      }),
      autoSellLootEnabled: true,
    });

    expect(deselected).not.toContain(rarityItemId);
  });

  it("always deselects never-sell quest items", () => {
    const deselected = getQuickSellDeselectedItemIds(questHuntId, {
      settings: settings(),
      autoSellLootEnabled: true,
    });

    expect(deselected).toContain(questItemId);
  });

  it("deselects mounts kept by default via special category rule", () => {
    // Carrot on a Stick (246) — mountItem
    const mountId = 246;
    const off = getQuickSellDeselectedItemIds(1, {
      settings: settings({
        lootSellModeByItemId: {},
      }),
      autoSellLootEnabled: true,
    });
    const withKeep = getQuickSellDeselectedItemIds(junkHuntId, {
      settings: settings({
        lootSellModeByItemId: { [mountId]: "keep" },
      }),
      autoSellLootEnabled: true,
    });
    expect(withKeep).toContain(mountId);
    expect(off).not.toContain(junkItemId);
  });
});
