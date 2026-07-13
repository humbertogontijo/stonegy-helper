import type { SubFeature, Feature } from "../types";

export const huntAutoHuntSubFeature: SubFeature = {
  id: "hunt.autoHunt",
  featureId: "hunt",
  label: "Auto hunt loop",
  isEnabled(session) {
    return session.settings.autoHuntEnabled;
  },
};

export const huntFeature: Feature = {
  id: "hunt",
  label: "Hunt",
  description: "Auto hunt loop using Battle and Loot settings.",
  dependsOn: ["battle", "loot"],
  subFeatures: [huntAutoHuntSubFeature],
};
