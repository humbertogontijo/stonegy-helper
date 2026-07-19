import { describe, expect, it } from "vitest";
import { defaultFeatureMasters } from "@stonegy/helper/core/features/feature-control";
import { defaultSettings } from "@stonegy/helper/core/settings";
import {
  buildSettingsSyncPayload,
  settingsSyncKey,
} from "./settings-sync";

describe("settingsSyncKey", () => {
  it("changes when settings or masters change", () => {
    const settings = defaultSettings();
    settings.autoBuyBless = true;
    const masters = defaultFeatureMasters();
    const base = buildSettingsSyncPayload("c1", settings, masters);

    expect(settingsSyncKey(base)).toBe(settingsSyncKey({ ...base }));
    expect(settingsSyncKey(base)).not.toBe(
      settingsSyncKey({
        ...base,
        settings: { ...base.settings, autoBuyBless: false },
      })
    );
    expect(settingsSyncKey(base)).not.toBe(
      settingsSyncKey({
        ...base,
        featureMasters: { ...masters, market: !masters.market },
      })
    );
  });
});

describe("buildSettingsSyncPayload", () => {
  it("picks lean settings and includes masters", () => {
    const settings = defaultSettings();
    settings.autoConfirmPartyHunt = true;
    settings.marketUndercutGold = 9;
    const masters = defaultFeatureMasters();
    masters.hunt = true;

    const payload = buildSettingsSyncPayload("hero-1", settings, masters);
    expect(payload.characterId).toBe("hero-1");
    expect(payload.settings.autoConfirmPartyHunt).toBe(true);
    expect(payload.settings.marketUndercutGold).toBe(9);
    expect(payload.featureMasters.hunt).toBe(true);
    expect(payload.settings).not.toHaveProperty("characterId");
  });
});
