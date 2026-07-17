import type { SubFeature, Feature } from "../types";

export const toolsConfirmPartyHuntSubFeature: SubFeature = {
  id: "tools.confirmPartyHunt",
  featureId: "tools",
  label: "Auto confirm party hunt",
  isEnabled(session) {
    return session.settings.autoConfirmPartyHunt;
  },
};

export const toolsAutoBuyBlessSubFeature: SubFeature = {
  id: "tools.autoBuyBless",
  featureId: "tools",
  label: "Auto buy bless",
  isEnabled(session) {
    return session.settings.autoBuyBless;
  },
};

export const toolsAutoDisbandSoloPartySubFeature: SubFeature = {
  id: "tools.autoDisbandSoloParty",
  featureId: "tools",
  label: "Auto disband solo party",
  isEnabled(session) {
    return session.settings.autoDisbandSoloParty;
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
    toolsConfirmPartyHuntSubFeature,
    toolsAutoBuyBlessSubFeature,
    toolsAutoDisbandSoloPartySubFeature,
    toolsAcceptPartyInviteSubFeature,
    toolsAutoTrainingSubFeature,
  ],
};
