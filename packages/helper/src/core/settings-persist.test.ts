import { describe, expect, it } from "vitest";
import { defaultSettings, type Settings } from "./settings";
import {
  applySettingsPatch,
  normalizeHuntBattleByHuntId,
  pickPersistedSettings,
} from "./settings-persist";

describe("pickPersistedSettings", () => {
  it("includes loot modes, invite mode, and undercut", () => {
    const settings = defaultSettings();
    settings.autoSellLoot = true;
    settings.lootSellModeByItemId = { 42: "npc", 7: "keep" };
    settings.partyInviteAcceptMode = "allowlist";
    settings.partyInviteAllowlistNames = ["Alice"];
    settings.marketUndercutGold = 25;

    const picked = pickPersistedSettings(settings);

    expect(picked.autoSellLoot).toBe(true);
    expect(picked.lootSellModeByItemId).toEqual({ 42: "npc", 7: "keep" });
    expect(picked.lootSellExcludedItemIds).toContain(7);
    expect(picked.partyInviteAcceptMode).toBe("allowlist");
    expect(picked.partyInviteAllowlistNames).toEqual(["Alice"]);
    expect(picked.marketUndercutGold).toBe(25);
    expect(picked.marketTaxPercent).toBe(settings.marketTaxPercent);
  });
});

describe("applySettingsPatch", () => {
  it("merges loot modes, invite mode, and undercut onto the target", () => {
    const settings = defaultSettings();
    const target = {
      get settings() {
        return settings;
      },
      updateSettings(patch: Partial<Settings>) {
        Object.assign(settings, patch);
      },
    };

    applySettingsPatch(target, {
      autoSellLoot: true,
      lootSellModeByItemId: { 99: "market", 3: "keep" },
      partyInviteAcceptMode: "allowlist",
      partyInviteAllowlistNames: ["Bob"],
      marketUndercutGold: 10,
    });

    expect(settings.autoSellLoot).toBe(true);
    expect(settings.lootSellModeByItemId).toEqual({ 99: "market", 3: "keep" });
    expect(settings.partyInviteAcceptMode).toBe("allowlist");
    expect(settings.partyInviteAllowlistNames).toEqual(["Bob"]);
    expect(settings.marketUndercutGold).toBe(10);
  });

  it("leaves unset fields unchanged", () => {
    const settings = defaultSettings();
    settings.selectedHuntId = 12;
    const target = {
      get settings() {
        return settings;
      },
      updateSettings(patch: Partial<Settings>) {
        Object.assign(settings, patch);
      },
    };

    applySettingsPatch(target, { autoBuyBless: true });

    expect(settings.autoBuyBless).toBe(true);
    expect(settings.selectedHuntId).toBe(12);
  });
});

describe("normalizeHuntBattleByHuntId", () => {
  it("normalizes numeric hunt entries", () => {
    const map = normalizeHuntBattleByHuntId({
      "5": {
        partyPositionX: 10,
        partyPositionY: 20,
        selectedLureId: 3,
        battlePreset: null,
      },
    });
    expect(map[5]).toEqual({
      partyPositionX: 10,
      partyPositionY: 20,
      selectedLureId: 3,
      battlePreset: null,
    });
  });
});
