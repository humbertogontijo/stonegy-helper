import { sendBot } from "../api/bot";
import type { BotState } from "../../../lib/types";
import { getFeatureMasterOffPatch } from "../../../lib/core/features/feature-control";
import type { FeatureId } from "./index";
import { isHuntControlledByParent } from "./index";

export type FeatureStopLocalUpdates = Record<string, unknown>;

export interface StopFeatureAutomationOptions {
  featureId: FeatureId;
  state: BotState | null;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  runAction?: (action: () => Promise<{ ok?: boolean; error?: string }>) => Promise<void>;
}

/** Persisted settings patches to sync local `usePersistedField` state after master off. */
export async function stopFeatureSubFeatures(
  options: StopFeatureAutomationOptions
): Promise<FeatureStopLocalUpdates> {
  const { featureId, state, saveSettings, runAction } = options;
  const patch = getFeatureMasterOffPatch(featureId);

  if (featureId === "hunt") {
    if (state?.settings.autoHuntEnabled && !isHuntControlledByParent(state) && runAction) {
      await runAction(() => sendBot("bot:stop-auto-hunt"));
    }
    await saveSettings(patch);
    return patch;
  }

  if (featureId === "tasks") {
    if (state?.settings.autoTaskerEnabled && runAction) {
      await runAction(() => sendBot("bot:stop-auto-tasker"));
    }
    return patch;
  }

  if (featureId === "tools") {
    // Timer lives in the service worker ToolsService; settings patch disables further scheduling.
    if (Object.keys(patch).length > 0) {
      await saveSettings(patch);
    }
    return patch;
  }

  if (Object.keys(patch).length > 0) {
    await saveSettings(patch);
  }
  return patch;
}
