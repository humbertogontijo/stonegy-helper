import type {
  AutoEquipSlot,
  BattlePreset,
  BotState,
  DebugEventRecord,
  DebugTypeStats,
  FlowTrace,
  LogEntry,
} from "../../../lib/types";

export type {
  AutoEquipSlot,
  BattlePreset,
  BotState,
  DebugEventRecord,
  DebugTypeStats,
  FlowTrace,
  LogEntry,
};

export interface LootSettings {
  autoSellLoot: boolean;
  marketUndercutGold: number;
  marketSellMinRarityTier: number;
  marketSellMountItems: boolean;
  lootSellModeByItemId: Record<number, string>;
}

export interface CavebotSettings {
  selectedHuntId: number | null;
  autoPlacePartyPosition: boolean;
  autoLockLure: boolean;
}

export interface PresetSettings {
  autoApplyPresets: boolean;
}

export interface MarketSettings {
  marketScanEnabled: boolean;
  marketScanIntervalSec: number;
  marketAutoBuyEnabled: boolean;
}

export type AppTab = "market" | "loot" | "battle" | "hunt" | "tasks" | "tools" | "debug";

export type ConnectionHint = "connected" | "connecting" | "no-tab" | "no-game-session";

export interface BotResponse {
  ok?: boolean;
  error?: string;
  state?: BotState;
  connected?: boolean;
  hasGameTab?: boolean;
  connectionHint?: ConnectionHint;
  message?: string;
}
