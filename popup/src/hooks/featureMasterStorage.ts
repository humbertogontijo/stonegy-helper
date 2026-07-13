import type { FeatureId } from "../features";
import { FEATURE_TAB_ORDER } from "../features";
import type { BotState } from "../types/bot";

export type FeatureMasterMap = Record<FeatureId, boolean>;

/** Build a master map from BotState (session registry is the source of truth). */
export function mastersFromBotState(state: BotState | null | undefined): FeatureMasterMap {
  const defaults = Object.fromEntries(FEATURE_TAB_ORDER.map((id) => [id, false])) as FeatureMasterMap;
  const raw = state?.featureMasters;
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  for (const id of FEATURE_TAB_ORDER) {
    if (typeof raw[id] === "boolean") {
      defaults[id] = raw[id]!;
    }
  }
  return defaults;
}

export function readFeatureMaster(featureId: FeatureId, state: BotState | null | undefined): boolean {
  return mastersFromBotState(state)[featureId] === true;
}

export function readAllFeatureMasters(state: BotState | null | undefined): FeatureMasterMap {
  return mastersFromBotState(state);
}

export function isAnyFeatureMasterOn(masters: FeatureMasterMap): boolean {
  return FEATURE_TAB_ORDER.some((id) => masters[id]);
}
