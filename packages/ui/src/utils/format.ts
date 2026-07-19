import type { BotState } from "@stonegy/helper/types";
import type { PlayerState } from "@stonegy/helper/types";

const PLAYER_STATE_LABELS: Record<PlayerState, string> = {
  idling: "Idle",
  hunting: "Hunting",
  selling_loot: "Selling loot",
  splitting_loot: "Splitting loot",
  buying_bless: "Buying bless",
  training: "Training",
};

export function formatStamina(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "—";
  }

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function formatPlayerState(state: PlayerState | null | undefined): string {
  if (!state) {
    return "—";
  }
  return PLAYER_STATE_LABELS[state];
}

export function formatGold(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toLocaleString()} gp`;
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function readPercent(raw: string | number, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : fallback;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatDebugTimestamp(at: number): string {
  const date = new Date(at);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function formatBinaryType(type: number): string {
  return `0x${type.toString(16).padStart(2, "0")}`;
}


export const TAB_STORAGE_KEY = "stonegyHelperActiveTab";

export const READY_STATE_LABELS = ["Connecting", "Open", "Closing", "Closed"];

export function isGameConnected(state: BotState | null): boolean {
  return !!state?.connection.connected && state.connection.readyState === 1;
}
