import { describe, expect, it } from "vitest";
import {
  getAttackSpellOptions,
  getHealOptions,
  getManaPotionOptions,
  getSupportSpellOptions,
} from "./battle-options";

describe("battle-options", () => {
  it("filters heals by paladin vocation and level", () => {
    const options = getHealOptions({ vocation: "PALADIN", level: 40 });

    expect(options).toContain("Health Potion");
    expect(options).toContain("Light Healing");
    expect(options).not.toContain("Great Health Potion");
    expect(options).not.toContain("Wound Cleansing");
  });

  it("filters attack spells by knight vocation", () => {
    const options = getAttackSpellOptions({ vocation: "KNIGHT", level: 120, magicLevel: 0 });

    expect(options).toContain("Berserk");
    expect(options).toContain("Annihilation");
    expect(options).not.toContain("Divine Caldera");
    expect(options).not.toContain("Exori");
  });

  it("filters support spells by vocation", () => {
    const knightSupport = getSupportSpellOptions({ vocation: "KNIGHT", level: 100 });
    const sorcererSupport = getSupportSpellOptions({ vocation: "SORCERER", level: 100, magicLevel: 20 });

    expect(knightSupport).toContain("Utamo Tempo");
    expect(knightSupport).not.toContain("Magic Shield");
    expect(sorcererSupport).toContain("Magic Shield");
  });

  it("filters mana potions by vocation", () => {
    const knightMana = getManaPotionOptions({ vocation: "KNIGHT", level: 100 });
    const sorcererMana = getManaPotionOptions({ vocation: "SORCERER", level: 140 });

    expect(knightMana).toContain("Strong Mana Potion");
    expect(knightMana).not.toContain("Ultimate Mana Potion");
    expect(sorcererMana).toContain("Ultimate Mana Potion");
  });

  it("hides small health potion on high level hunts", () => {
    const options = getHealOptions({
      vocation: "PALADIN",
      level: 50,
      huntRecommendedLevel: 20,
    });

    expect(options).not.toContain("Small Health Potion");
  });
});
