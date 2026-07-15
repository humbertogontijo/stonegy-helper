import { describe, expect, it } from "vitest";
import { isImbuementItem, listImbuementItemIds, listImbuements } from "./imbuement";

describe("imbuements catalog", () => {
  it("loads the generated imbuement definitions", () => {
    const imbuements = listImbuements();
    expect(imbuements.length).toBe(72);
    expect(imbuements.some((entry) => entry.id === "basic_vampirism")).toBe(true);
    expect(imbuements.some((entry) => entry.category === "LIFE_LEECH")).toBe(true);
  });

  it("resolves ingredient item ids including Fairy Wings pluralization", () => {
    const itemIds = listImbuementItemIds();
    expect(itemIds.length).toBeGreaterThan(70);
    // Vampire Teeth, Protective Charm, Fairy Wings
    expect(isImbuementItem(63)).toBe(true);
    expect(isImbuementItem(13)).toBe(true);
    expect(isImbuementItem(1139)).toBe(true);
    expect(isImbuementItem(595)).toBe(false);
  });
});
