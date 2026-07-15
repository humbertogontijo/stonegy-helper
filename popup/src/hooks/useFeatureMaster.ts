import { useCallback, useMemo } from "react";
import type { FeatureId } from "../features";
import type { BotState } from "../../../lib/types";
import { readFeatureMaster } from "./featureMasterStorage";

/** Master switch UI state derived from BotState (session registry). */
export function useFeatureMaster(featureId: FeatureId, state: BotState | null) {
  const masterOn = useMemo(() => readFeatureMaster(featureId, state), [featureId, state]);

  const setMasterOn = useCallback((_on: boolean) => {
    // Optimistic updates are applied by the caller after a successful RPC.
  }, []);

  return {
    masterOn,
    setMasterOn,
    subsDisabled: !masterOn,
  };
}
