import type { SubFeature, Feature } from "../types";

export const toolsReadyCheckSubFeature: SubFeature = {
  id: "tools.readyCheck",
  featureId: "tools",
  label: "Auto confirm ready check",
  isEnabled(session) {
    return session.settings.autoConfirmReadyCheck;
  },
};

export const toolsAcceptPartyInviteSubFeature: SubFeature = {
  id: "tools.acceptPartyInvite",
  featureId: "tools",
  label: "Auto accept party invite",
  isEnabled(session) {
    return session.settings.autoAcceptPartyInvite;
  },
};

export const toolsAutoTrainingSubFeature: SubFeature = {
  id: "tools.autoTraining",
  featureId: "tools",
  label: "Auto training",
  isEnabled(session) {
    return session.settings.autoTrainingEnabled;
  },
};

export const toolsFeature: Feature = {
  id: "tools",
  label: "Tools",
  description: "Utility automations that run while the character is idle.",
  dependsOn: [],
  subFeatures: [
    toolsReadyCheckSubFeature,
    toolsAcceptPartyInviteSubFeature,
    toolsAutoTrainingSubFeature,
  ],
};
