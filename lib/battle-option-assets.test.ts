import { describe, expect, it } from "vitest";
import { getBattleOptionImageUrl } from "./battle-option-assets";
import { getItemByName, getItemImageUrl, listInventoryEquipOptions } from "./items";

describe("battle option assets", () => {
  it("resolves heal potion images from inventory assets", () => {
    const url = getBattleOptionImageUrl("heal", "Health Potion");
    expect(url).toContain("/assets/inventory/");
    expect(url).toMatch(/Health_Potion\.gif$/);
  });

  it("resolves heal spells from the heals pack", () => {
    const url = getBattleOptionImageUrl("heal", "Light Healing");
    expect(url).toContain("/assets/heals/");
    expect(url).toMatch(/Light_Healing\.gif$/);
  });

  it("resolves mapped spell icons including special filenames", () => {
    expect(getBattleOptionImageUrl("spell", "Utito Tempo")).toMatch(/Blood_Rage\.gif$/);
    expect(getBattleOptionImageUrl("spell", "Strong Flame Strike")).toMatch(
      /Strong_Flame_Strike\.png$/
    );
  });

  it("resolves mana and ammo from inventory assets", () => {
    expect(getBattleOptionImageUrl("mana", "Mana Potion")).toMatch(/Mana_Potion\.gif$/);
    expect(getBattleOptionImageUrl("ammo", "Simple Arrow")).toMatch(/Simple_Arrow\.gif$/);
  });
});

describe("inventory equip options", () => {
  it("lists rings from inventory and keeps selected ids", () => {
    const lifeRing = getItemByName("Life Ring");
    expect(lifeRing?.slot).toBe("RING");
    expect(getItemImageUrl(lifeRing!.id)).toMatch(/Life_Ring\.gif$/);

    const options = listInventoryEquipOptions(
      [{ uuid: "a", itemId: lifeRing!.id, amount: 2, flagsA: 0, flagsB: 0, remainingUnits: 0 }],
      "RING",
      []
    );
    expect(options).toEqual([
      expect.objectContaining({ itemId: lifeRing!.id, amount: 2, name: "Life Ring" }),
    ]);
  });
});
