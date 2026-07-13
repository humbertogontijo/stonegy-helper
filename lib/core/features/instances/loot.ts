import { isLootSellEnabled } from "../../../domain/loot-sell";
import type { SubFeature, Feature } from "../types";

export const lootAutoSellSubFeature: SubFeature = {
  id: "loot.autoSell",
  featureId: "loot",
  label: "Auto sell on hunt finish",
  isEnabled(session) {
    return isLootSellEnabled(session.settings);
  },
};

export const lootLootSplitSubFeature: SubFeature = {
  id: "loot.lootSplit",
  featureId: "loot",
  label: "Loot split on hunt finish",
  isEnabled(session) {
    return session.settings.autoSplitLootOnHuntFinished;
  },
};

export const lootFeature: Feature = {
  id: "loot",
  label: "Loot",
  description: "Configures loot selling, pricing rules, per-item sell overrides, and loot split.",
  dependsOn: ["market"],
  subFeatures: [lootAutoSellSubFeature, lootLootSplitSubFeature],
};
