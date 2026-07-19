import type { BotState } from "@stonegy/helper/types";
import { getFeatureMasterOffPatch } from "@stonegy/helper/core/features/feature-control";
import type { BotResponse } from "../types/bot";
import type { FeatureId } from "./index";
import { isHuntControlledByParent } from "./index";

export type FeatureStopLocalUpdates = Record<string, unknown>;

export type BotSend = (
  channel: string,
  payload?: Record<string, unknown>
) => Promise<BotResponse>;

export interface StopFeatureAutomationOptions {
  featureId: FeatureId;
  state: BotState | null;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  runAction?: (action: () => Promise<{ ok?: boolean; error?: string }>) => Promise<void>;
  sendBot: BotSend;
}

/** Persisted settings patches to sync local `usePersistedField` state after master off. */
export async function stopFeatureSubFeatures(
  options: StopFeatureAutomationOptions
): Promise<FeatureStopLocalUpdates> {
  const { featureId, state, saveSettings, runAction, sendBot } = options;
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
