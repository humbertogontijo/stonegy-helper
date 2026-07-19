import type { BotState } from "@stonegy/helper/types";
import type { PartySummary } from "./parties";

export type HelperSseEvent =
  | { event: "state"; data: { characterId: string; state: BotState } }
  | { event: "parties"; data: PartySummary[] };

type Listener = (event: HelperSseEvent) => void;

export class HelperEventBus {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: HelperSseEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}
