import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  defaultFeatureMasters,
  type SettingsPatch,
} from "@stonegy/helper/core/features/feature-control";
import type { FeatureId } from "@stonegy/helper/core/services/types";
import { FEATURE_TAB_ORDER } from "@stonegy/helper/core/features/instances";

export type FeatureMasterMap = Record<FeatureId, boolean>;

export interface CliCharacterConfig {
  featureMasters: FeatureMasterMap;
  settings: SettingsPatch;
}

export const CONFIG_DIR = join(homedir(), ".stonegy-helper");

let characterConfigDirOverride: string | undefined;

/** Test-only: override where `{characterId}.json` is stored. */
export function setCharacterConfigDirForTests(dir: string | undefined): void {
  characterConfigDirOverride = dir;
}

function characterConfigDir(): string {
  return characterConfigDirOverride ?? CONFIG_DIR;
}

function configPath(characterId: string): string {
  return join(characterConfigDir(), `${characterId}.json`);
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
  await mkdir(characterConfigDir(), { recursive: true });
  await writeFile(configPath(characterId), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/** Extension → helper: merge settings / masters into on-disk character config. */
export async function syncSettingsFromExtension(input: {
  characterId: string;
  settings?: Record<string, unknown>;
  featureMasters?: Partial<Record<FeatureId, boolean>>;
}): Promise<CliCharacterConfig> {
  const existing = await loadCharacterConfig(input.characterId);
  const next: CliCharacterConfig = {
    featureMasters: { ...existing.featureMasters },
    settings: { ...existing.settings },
  };

  if (input.settings && typeof input.settings === "object") {
    next.settings = { ...existing.settings, ...input.settings };
  }

  if (input.featureMasters && typeof input.featureMasters === "object") {
    for (const id of FEATURE_TAB_ORDER) {
      if (typeof input.featureMasters[id] === "boolean") {
        next.featureMasters[id] = input.featureMasters[id]!;
      }
    }
  }

  await saveCharacterConfig(input.characterId, next);
  return next;
}
