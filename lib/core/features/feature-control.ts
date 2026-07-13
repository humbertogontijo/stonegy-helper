import type { Settings } from "../settings";
import type { FeatureId } from "./types";

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
