import type { Settings } from "../settings";
import type { FeatureId } from "../services/types";
import { FEATURES } from "./instances";

export type SettingsPatch = Partial<Settings>;

/** Settings cleared when a feature master switch is turned off. */
export function getFeatureMasterOffPatch(featureId: FeatureId): SettingsPatch {
  switch (featureId) {
    case "market":
      return {
        marketScanEnabled: false,
        marketAutoBuyEnabled: false,
      };
    case "loot":
      return {
        autoSellLoot: false,
        autoSplitLootOnHuntFinished: false,
      };
    case "battle":
      return {
        autoApplyPresets: false,
        autoPlacePartyPosition: false,
        autoLockLure: false,
      };
    case "hunt":
      return {
        autoHuntEnabled: false,
      };
    case "tasks":
      return {
        autoTaskerEnabled: false,
        taskerPhase: "idle",
        taskerStatus: "",
        taskerTargetHuntId: null,
      };
    case "tools":
      return {
        autoConfirmReadyCheck: false,
        autoAcceptPartyInvite: false,
        autoTrainingEnabled: false,
      };
  }
}

export function defaultFeatureMasters(): Record<FeatureId, boolean> {
  return {
    market: false,
    loot: false,
    battle: false,
    hunt: false,
    tasks: false,
    tools: false,
  };
}

/** Whether `featureId` may be armed given the current (or proposed) master map. */
export function canArmFeature(
  featureId: FeatureId,
  masters: Record<FeatureId, boolean>
): { ok: true } | { ok: false; error: string } {
  const feature = FEATURES[featureId];
  for (const dep of feature.dependsOn) {
    if (!masters[dep]) {
      return {
        ok: false,
        error: `Arm ${FEATURES[dep].label} first — ${feature.label} depends on it.`,
      };
    }
  }
  return { ok: true };
}
