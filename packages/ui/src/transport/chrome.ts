import type { BotState } from "@stonegy/helper/types";
import { sendBot } from "../api/bot";
import type { BotTransport } from "./types";

export function createChromeBotTransport(): BotTransport {
  return {
    send(channel, payload = {}) {
      return sendBot(channel, payload);
    },
    subscribe(onState) {
      const listener = (message: { channel?: string; state?: BotState }) => {
        if (message.channel === "state-updated" && message.state) {
          onState(message.state);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  };
}
