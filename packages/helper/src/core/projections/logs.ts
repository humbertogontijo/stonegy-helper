import type { BotState, LogEntry, StonegyMessage } from "../../types";

const MAX_LOGS = 200;

export function appendLog(
  state: BotState,
  entry: { direction: "send" | "receive"; opcode: number; data: string },
  parsed: StonegyMessage | null
): BotState {
  if (!state.settings.loggingEnabled || entry.opcode === 2) {
    return state;
  }

  const preview = entry.data.length > 180 ? `${entry.data.slice(0, 180)}…` : entry.data;

  const logEntry: LogEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    direction: entry.direction,
    opcode: entry.opcode,
    preview,
    type: parsed?.type,
  };

  const logs = [logEntry, ...state.logs].slice(0, MAX_LOGS);
  return { ...state, logs };
}
