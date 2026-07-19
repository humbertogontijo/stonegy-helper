export type {
  StonegyMessage,
  SendMessage,
  ReceiveMessage,
  PartyLootSplitter,
  ActiveMonsterTask,
  AutoEquipSlot,
  MarketFilters,
} from "./protocol-messages";
import type { AutoEquipSlot } from "./protocol-messages";
export type { StaminaConfig } from "./stamina";

export interface BattlePreset {
  selectedHeal: string;
  selectedHealPercent: number;
  selectedHealSecondary: string;
  selectedHealPercentSecondary: number;
  selectedHealTertiary: string;
  selectedHealPercentTertiary: number;
  selectedHealQuaternary: string;
  selectedHealPercentQuaternary: number;
  selectedManaPotion: string;
  selectedManaPotionPercent: number;
  selectedArrow: string | null;
  selectedSkills: Array<string | null>;
  selectedSkillsMinCreatures: Record<string, number>;
  selectedSupportSkills: Array<string | null>;
  autoEquip: {
    ring: AutoEquipSlot;
    neck: AutoEquipSlot;
  };
}

export interface LogEntry {
  id: string;
  at: number;
  direction: "send" | "receive";
  opcode: number;
  preview: string;
  type?: string;
}

export type {
  DebugCommandRecord,
  DebugEventRecord,
  DebugTelemetrySnapshot,
  DebugTypeStats,
} from "./core/events/debug-telemetry";
export type {
  FlowTrace,
  FlowGuard,
  FlowCommandRecord,
} from "./core/events/flow-trace";
export type { PayloadSchemaIssue } from "./core/events/schemas/helpers";

export type TaskerPhase =
  | "idle"
  | "syncing"
  | "starting"
  | "hunting"
  | "delivering"
  | "claiming"
  | "done"
  | "error";

export type PlayerState =
  | "idling"
  | "hunting"
  | "selling_loot"
  | "splitting_loot"
  | "buying_bless"
  | "training";

export interface MonsterTaskQuestSummary {
  id: number;
  title: string;
  levelMin: number;
  monsterMissionCount: number;
}

export interface ItemMarketPrice {
  itemId: number;
  /** Lowest non-own sell — undercut reference for listing. */
  lowestSellPrice: number | null;
  /** Highest non-own buy — fillable buy-order venue only. */
  highestBuyPrice: number | null;
  /**
   * Own buy/sell price used as list reference when there is no competing
   * non-own sell book. Listing matches this price (no undercut).
   */
  ownOrderReferencePrice?: number | null;
  sellOrderCount: number;
  buyOrderCount: number;
  tradableAmount: number | null;
  updatedAt: number;
}

export interface MarketBoughtItem {
  itemId: number;
  buyPrice: number;
  sellPrice: number;
  profitPerItem: number;
  amount: number;
  boughtAt: number;
}

export interface MarketMissedOffer {
  itemId: number;
  buyPrice: number;
  sellPrice: number;
  profitPerItem: number;
  missedAmount: number;
  missedAt: number;
}

export interface RecentMarketListing {
  amount: number;
  price: number;
  at: number;
}

/** Explicit per-item override. Absence from the map means use rarity/mount rules. */
export type LootSellMode = "npc" | "market" | "keep";

/** Resolved sell rule after hard-keeps, overrides, and rarity/mount defaults. */
export type LootSellRule = "npc" | "market" | "keep";

export type {
  ConnectionProjection,
  CharacterProjection,
  PartyProjection,
  HuntProjection,
  TrainingProjection,
  InventoryProjection,
  MarketProjection,
  QuestProjection,
  BlessProjection,
  CombatProjection,
  DamageEntityStats,
  DamageElementStat,
} from "./core/projections/types";

import type {
  ConnectionProjection,
  CharacterProjection,
  PartyProjection,
  HuntProjection,
  TrainingProjection,
  InventoryProjection,
  MarketProjection,
  QuestProjection,
  BlessProjection,
  CombatProjection,
} from "./core/projections/types";
import type { DebugTelemetrySnapshot } from "./core/events/debug-telemetry";
import type { Settings } from "./core/settings";

/** User-configurable bot preferences (persisted separately from live game snapshots). */
export type BotSettings = Settings;

export interface BotState {
  connection: ConnectionProjection;
  character: CharacterProjection;
  party: PartyProjection;
  hunt: HuntProjection;
  training: TrainingProjection;
  inventory: InventoryProjection;
  market: MarketProjection;
  quests: QuestProjection;
  bless: BlessProjection;
  combat: CombatProjection;
  playerState: PlayerState;
  playerStateDetail: string;
  /** Resolved preset for the selected hunt (configured settings, else live game). */
  battlePreset: BattlePreset;
  /** Last battle config received from the game (ignores per-hunt overrides). */
  characterBattlePreset: BattlePreset;
  settings: BotSettings;
  logs: LogEntry[];
  debug: DebugTelemetrySnapshot;
  /** Serializable snapshots from each registered service (tasker phase, scan status, etc.). */
  serviceState?: Record<string, Record<string, unknown>>;
  /** Feature master arm/disarm switches (source of truth in the session registry). */
  featureMasters?: Record<string, boolean>;
}

export interface HuntSummary {
  id: number;
  title: string;
  recommendedLevel?: number;
  levelMin?: number;
}

/** Kind of entry shown in the Battle hunt selector. */
export type HuntSelectorKind = "hunt" | "boss" | "quest";

export interface HuntSelectorOption extends HuntSummary {
  kind: HuntSelectorKind;
  /** Select/display label (includes Boss/Quest prefix when needed). */
  label: string;
}

export interface BossRecord {
  id: number;
  monsterId: number;
  rarity: number;
  bossType: string;
  recommendedLevel?: number;
  [key: string]: unknown;
}

export interface TilePosition {
  x: number;
  y: number;
}

export interface HuntRecord {
  id: number;
  title: string;
  monsters: number[];
  mapId: number;
  recommendedLevel?: number;
  maxLure?: number;
  minLure?: number;
  levelMin?: number;
  levelMax?: number;
  monsterWeights?: Record<number, number>;
  blockedTiles?: TilePosition[];
  ambientLight?: unknown;
  isPremmium?: boolean;
  [key: string]: unknown;
}

export interface MonsterTaskEntry {
  monsterId: number;
  amount: number;
}

export interface QuestMission {
  id: number;
  title: string;
  type: string;
  monsterTasks?: MonsterTaskEntry[];
  requirements?: { levelMin?: number };
  [key: string]: unknown;
}

export interface QuestRecord {
  id: number;
  title: string;
  levelMin?: number;
  missions: QuestMission[];
  [key: string]: unknown;
}

export interface MonsterLootEntry {
  itemId: number;
  chance: number;
  maxCount?: number;
}

export interface MonsterRecord {
  id: number;
  name: string;
  loot: MonsterLootEntry[];
}

export interface ItemRecord {
  id: number;
  name: string;
  /** Filename under /assets/inventory/ (e.g. "Life_Ring.gif"). */
  image?: string;
  /** Equipment slot when applicable (e.g. "RING", "NECK", "HAND"). */
  slot?: string;
  npcSellPrice?: number;
  rarityBorderTier?: number;
  /** Equipment upgrade class (1–4); used as market-rarity fallback when rarityBorderTier is absent. */
  classification?: number;
  stackable?: boolean;
  mountItem?: boolean;
  untradable?: boolean;
  questItem?: boolean;
  /** Max charges for chargeable equipment (e.g. Glacier Amulet). */
  charge?: number;
  /** Max duration in minutes for timed equipment (e.g. Prismatic Ring). */
  timmingMinutes?: number;
  /** Max duration in milliseconds for timed equipment. */
  timmingMs?: number;
}

export interface WsSerializedMessage {
  opcode: number;
  data: string;
}
