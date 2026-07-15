import { describe, expect, it } from "vitest";
import type { SubFeatureId } from "../../services/types";
import { FEATURES, FEATURE_TAB_ORDER, SUB_FEATURES } from "./index";

const ALL_SUB_FEATURE_IDS: SubFeatureId[] = [
  "market.intervalScan",
  "market.autoBuy",
  "loot.autoSell",
  "battle.applyPresets",
  "battle.placePosition",
  "battle.lockLure",
  "loot.lootSplit",
  "hunt.autoHunt",
  "tasks.autoTasker",
  "tools.autoTraining",
  "tools.readyCheck",
  "tools.acceptPartyInvite",
];

describe("feature instances", () => {
  it("registers every subfeature id exactly once", () => {
    const ids = SUB_FEATURES.map((subFeature) => subFeature.id);
    expect(ids).toHaveLength(ALL_SUB_FEATURE_IDS.length);
    expect(new Set(ids).size).toBe(ALL_SUB_FEATURE_IDS.length);
    for (const id of ALL_SUB_FEATURE_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("links each subfeature to its parent feature", () => {
    for (const featureId of FEATURE_TAB_ORDER) {
      const feature = FEATURES[featureId];
      expect(feature.id).toBe(featureId);
      for (const subFeature of feature.subFeatures) {
        expect(subFeature.featureId).toBe(featureId);
        expect(SUB_FEATURES).toContain(subFeature);
      }
    }
  });

  it("derives SUB_FEATURES from FEATURES in tab order", () => {
    const expected = FEATURE_TAB_ORDER.flatMap((id) => FEATURES[id].subFeatures);
    expect(SUB_FEATURES).toEqual(expected);
  });
});
