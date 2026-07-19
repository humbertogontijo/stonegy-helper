import type { BotState } from "@stonegy/helper/types";
import type { BotResponse } from "../types/bot";

export interface BotTransport {
  send(channel: string, payload?: Record<string, unknown>): Promise<BotResponse>;
  subscribe(onState: (state: BotState) => void): () => void;
}
