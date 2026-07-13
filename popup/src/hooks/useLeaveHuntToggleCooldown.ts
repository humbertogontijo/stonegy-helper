import { useCallback, useEffect, useRef, useState } from "react";
import { LONG_COOLDOWN } from "../../../lib/core/commands/cooldown";
import { isActivelyHunting } from "../../../lib/core/humanize";
import type { BotResponse, BotState } from "../types/bot";

export function useLeaveHuntToggleCooldown() {
  const [coolingDown, setCoolingDown] = useState(false);
  const [stopping, setStopping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const runStopAfterLeaveHunt = useCallback(
    async (
      state: BotState | null,
      runAction: (action: () => Promise<BotResponse>) => Promise<void>,
      stopAction: () => Promise<BotResponse>
    ) => {
      const willLeaveHunt =
        !!state && isActivelyHunting(state.party.partyStatus, state.hunt.activeHuntId);
      if (willLeaveHunt) {
        setStopping(true);
      }

      try {
        await runAction(stopAction);
      } finally {
        if (willLeaveHunt) {
          setStopping(false);
          setCoolingDown(true);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(() => {
            setCoolingDown(false);
            timerRef.current = null;
          }, LONG_COOLDOWN);
        }
      }
    },
    []
  );

  return {
    toggleDisabled: coolingDown || stopping,
    runStopAfterLeaveHunt,
  };
}
