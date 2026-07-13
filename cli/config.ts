import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  defaultFeatureMasters,
  type SettingsPatch,
} from "../lib/core/features/feature-control";
import type { FeatureId } from "../lib/core/services/types";
import { FEATURE_TAB_ORDER } from "../lib/core/features/instances";

export type FeatureMasterMap = Record<FeatureId, boolean>;

export interface CliCharacterConfig {
  featureMasters: FeatureMasterMap;
  settings: SettingsPatch;
}

const CONFIG_DIR = join(homedir(), ".stonegy-helper");

function configPath(characterId: string): string {
  return join(CONFIG_DIR, `${characterId}.json`);
}

export function createDefaultConfig(): CliCharacterConfig {
  return {
    featureMasters: defaultFeatureMasters(),
    settings: {},
  };
}

export async function loadCharacterConfig(
  characterId: string
): Promise<CliCharacterConfig> {
  try {
    const raw = await readFile(configPath(characterId), "utf8");
    const parsed = JSON.parse(raw) as Partial<CliCharacterConfig>;
    const defaults = createDefaultConfig();
    const masters = { ...defaults.featureMasters };
    if (parsed.featureMasters && typeof parsed.featureMasters === "object") {
      for (const id of FEATURE_TAB_ORDER) {
        if (typeof parsed.featureMasters[id] === "boolean") {
          masters[id] = parsed.featureMasters[id]!;
        }
      }
    }
    return {
      featureMasters: masters,
      settings:
        parsed.settings && typeof parsed.settings === "object"
          ? parsed.settings
          : {},
    };
  } catch {
    return createDefaultConfig();
  }
}

export async function saveCharacterConfig(
  characterId: string,
  config: CliCharacterConfig
): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(configPath(characterId), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
