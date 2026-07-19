import { useCallback } from "react";
import type { BotState } from "@stonegy/helper/types";
import type { BotResponse } from "../types/bot";
import { useBotTransport } from "../transport/context";

export type RunActionOptions = {
  /** Skip the success toast (for background sync side-effects). */
  silent?: boolean;
  /** Apply response.state instead of a full refresh when present. */
  applyState?: (state: BotState) => void;
};

export function useBotActions(
  refreshState: () => Promise<void>,
  showFeedback: (msg: string, type?: "success" | "error") => void
) {
  const transport = useBotTransport();
  const sendBot = useCallback(
    (channel: string, payload: Record<string, unknown> = {}) => transport.send(channel, payload),
    [transport]
  );

  const runAction = useCallback(
    async (
      action: () => Promise<BotResponse>,
      options: RunActionOptions = {}
    ) => {
      try {
        const response = await action();
        if (response?.ok === false) {
          throw new Error(response.error ?? "Action failed");
        }
        if (response?.state && options.applyState) {
          options.applyState(response.state);
        } else {
          await refreshState();
        }
        if (!options.silent) {
          showFeedback(response?.message ?? "Done", "success");
        }
      } catch (error) {
        if (!options.silent) {
          showFeedback(error instanceof Error ? error.message : String(error), "error");
          return;
        }
        throw error;
      }
    },
    [refreshState, showFeedback]
  );

  const saveSettings = useCallback(
    async (settings: Record<string, unknown>): Promise<void> => {
      try {
        const response = await sendBot("bot:set-settings", settings);
        if (response?.ok === false) {
          throw new Error(response.error ?? "Failed to save settings");
        }
        await refreshState();
      } catch (error) {
        showFeedback(error instanceof Error ? error.message : String(error), "error");
        throw error;
      }
    },
    [refreshState, sendBot, showFeedback]
  );

  return { runAction, saveSettings, sendBot };
}
