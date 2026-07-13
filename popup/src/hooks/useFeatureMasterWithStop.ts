import { useCallback, useState } from "react";
import type { FeatureId } from "../features";
import {
  stopFeatureSubFeatures,
  type FeatureStopLocalUpdates,
} from "../features/stop-feature-automation";
import type { BotState } from "../types/bot";
import { sendBot } from "../api/bot";
import { useFeatureMaster } from "./useFeatureMaster";

export interface UseFeatureMasterWithStopOptions {
  state: BotState | null;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  runAction?: (action: () => Promise<{ ok?: boolean; error?: string }>) => Promise<void>;
  onLocalStateReset?: (updates: FeatureStopLocalUpdates) => void;
  onState?: (state: BotState) => void;
  showFeedback?: (message: string, kind?: "success" | "error") => void;
}

/** Master switch: locks sub-feature UI and stops running automation when turned off. */
export function useFeatureMasterWithStop(
  featureId: FeatureId,
  options: UseFeatureMasterWithStopOptions
) {
  const { state, saveSettings, runAction, onLocalStateReset, onState, showFeedback } = options;
  const { masterOn: remoteMasterOn, subsDisabled } = useFeatureMaster(featureId, state);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const masterOn = optimistic ?? remoteMasterOn;

  const handleMasterChange = useCallback(
    async (enabled: boolean) => {
      const previous = remoteMasterOn;
      setOptimistic(enabled);
      try {
        const response = await sendBot("bot:set-feature-masters", {
          patch: { [featureId]: enabled },
        });
        if (!response || response.ok === false) {
          setOptimistic(previous);
          showFeedback?.(
            typeof response?.error === "string" ? response.error : "Failed to update feature master",
            "error"
          );
          return;
        }
        if (response.state) {
          onState?.(response.state as BotState);
        }
        setOptimistic(null);

        if (!enabled) {
          const localUpdates = await stopFeatureSubFeatures({
            featureId,
            state,
            saveSettings,
            runAction,
          });
          if (Object.keys(localUpdates).length > 0) {
            onLocalStateReset?.(localUpdates);
          }
        }
      } catch (error) {
        setOptimistic(previous);
        showFeedback?.(
          error instanceof Error ? error.message : "Failed to update feature master",
          "error"
        );
      }
    },
    [
      featureId,
      onLocalStateReset,
      onState,
      remoteMasterOn,
      runAction,
      saveSettings,
      showFeedback,
      state,
    ]
  );

  return { masterOn, subsDisabled: !masterOn || subsDisabled, handleMasterChange };
}
