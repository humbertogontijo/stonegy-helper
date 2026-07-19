import type { SubFeature, Feature } from "../types";

export const tasksAutoTaskerSubFeature: SubFeature = {
  id: "tasks.autoTasker",
  featureId: "tasks",
  label: "Auto tasker",
  isEnabled(session) {
    return session.settings.autoTaskerEnabled || session.settings.taskerPhase !== "idle";
  },
};

export const tasksFeature: Feature = {
  id: "tasks",
  label: "Tasks",
  description: "Runs monster task quests end-to-end via the Hunt feature.",
  dependsOn: ["hunt"],
  subFeatures: [tasksAutoTaskerSubFeature],
};
