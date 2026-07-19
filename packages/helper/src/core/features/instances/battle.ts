import type { SubFeature, Feature } from "../types";

export const battleApplyPresetsSubFeature: SubFeature = {
  id: "battle.applyPresets",
  featureId: "battle",
  label: "Auto apply presets",
  isEnabled(session) {
    return session.settings.autoApplyPresets;
  },
};

export const battlePlacePositionSubFeature: SubFeature = {
  id: "battle.placePosition",
  featureId: "battle",
  label: "Auto place party position",
  isEnabled(session) {
    return session.settings.autoPlacePartyPosition;
  },
};

export const battleLockLureSubFeature: SubFeature = {
  id: "battle.lockLure",
  featureId: "battle",
  label: "Auto lock lure",
  isEnabled(session) {
    return session.settings.autoLockLure;
  },
};

export const battleFeature: Feature = {
  id: "battle",
  label: "Battle",
  description: "Hunt setup, healing, spells, party position, and lure applied on hunt join.",
  dependsOn: [],
  subFeatures: [
    battleApplyPresetsSubFeature,
    battlePlacePositionSubFeature,
    battleLockLureSubFeature,
  ],
};
