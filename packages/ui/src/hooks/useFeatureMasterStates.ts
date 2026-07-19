import { useMemo } from "react";
import type { BotState } from "@stonegy/helper/types";
import {
  isAnyFeatureMasterOn,
  readAllFeatureMasters,
  type FeatureMasterMap,
} from "./featureMasterStorage";

export function useFeatureMasterStates(state: BotState | null): {
  masters: FeatureMasterMap;
  anyMasterOn: boolean;
} {
  const masters = useMemo(() => readAllFeatureMasters(state), [state]);

  return {
    masters,
    anyMasterOn: isAnyFeatureMasterOn(masters),
  };
}
