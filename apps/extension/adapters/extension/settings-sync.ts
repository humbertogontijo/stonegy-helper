import type { FeatureMasters } from "@stonegy/helper/core/services/types";
import type { Settings } from "@stonegy/helper/core/settings";
import { pickPersistedSettings } from "@stonegy/helper/core/settings-persist";

export interface SettingsSyncPayload {
  characterId: string;
  settings: Partial<Settings>;
  featureMasters: FeatureMasters;
}

export function settingsSyncKey(payload: SettingsSyncPayload): string {
  return `${payload.characterId}\0${JSON.stringify(payload.settings)}\0${JSON.stringify(payload.featureMasters)}`;
}

export function buildSettingsSyncPayload(
  characterId: string,
  settings: Settings,
  featureMasters: FeatureMasters
): SettingsSyncPayload {
  return {
    characterId,
    settings: pickPersistedSettings(settings),
    featureMasters,
  };
}
