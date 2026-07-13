import type { PartyLootSplitter } from "../../protocol-messages";
import type { StaminaConfig } from "../../stamina";
import type { InventoryItemEntry } from "../../binary/types";
import type {
  ActiveMonsterTask,
  BattlePreset,
  ItemMarketPrice,
  PlayerState,
  MarketBoughtItem,
  MarketMissedOffer,
  RecentMarketListing,
} from "../../types";

export interface ConnectionProjection {
  connected: boolean;
  readyState: number;
}

export interface CharacterProjection {
  characterName: string | null;
  characterId: string | null;
  characterVocation: string | null;
  level: number | null;
  goldCoins: number | null;
  staminaMs: number | null;
  lastStaminaUpdateAt: number | null;
  staminaConfig: StaminaConfig | null;
  finishedTasks: number[];
  finishedQuests: number[];
}

export interface PartyLootSplitTransfer {
  playerId: string;
  name: string;
  amount: number;
}

export interface PartyLootSplitHistoryEntry {
  at: number;
  totals: {
    lootTotalValue: number;
    suppliesGold: number;
    balanceGold: number;
  };
  transfers: PartyLootSplitTransfer[];
  transferCount: number;
}

export interface PartyProjection {
  partyStatus: string | null;
  currentHuntId: number | null;
  partyLeaderId: string | null;
  partyMemberCount: number | null;
  partySnapshotSynced: boolean;
  lastSnapshotAt: number | null;
  partyLootSplitter: PartyLootSplitter | null;
  /** Tracks gold already sent during an in-progress loot split (same splitter fingerprint). */
  lootSplitCompletedByPlayerId: Record<string, number>;
  lootSplitProgressFingerprint: string | null;
  /** Recent completed splits (newest first), kept after the live splitter resets. */
  lootSplitHistory: PartyLootSplitHistoryEntry[];
}

export interface HuntProjection {
  activeHuntId: number | null;
  currentLureId: number | null;
  currentPartyTileX: number | null;
  currentPartyTileY: number | null;
  lastBootstrapHuntId: number | null;
  /** Set on hunt_finished; cleared after post-hunt sell completes or pending timeout. */
  pendingHuntLootSell: boolean;
  /** Wall-clock ms when pendingHuntLootSell was set; used for soft timeout. */
  pendingHuntLootSellAt: number | null;
}

export interface TrainingProjection {
  activeTrainingId: string | null;
}

export interface InventoryProjection {
  /** Backpack instances from the latest inventory snapshot (feature layer filters/maps). */
  items: InventoryItemEntry[];
  /** Quick-sell deselected item ids synced from update_battle_config. */
  gameQuickSellDeselectedItemIds: number[];
  /** Loot-filter excluded item ids synced from update_battle_config (game won't pick these up). */
  gameLootFilterExcludedItemIds: number[];
}

export interface MarketProjection {
  marketPrices: Record<number, ItemMarketPrice>;
  marketPricesUpdatedAt: number | null;
  marketScanStatus: string;
  marketFullScanStatus: string;
  huntLootSyncStatus: string;
  marketBoughtItems: MarketBoughtItem[];
  marketMissedOffers: MarketMissedOffer[];
  /** Current full-scan page (ephemeral UI progress). */
  marketFullScanPage: number | null;
  /** Total market pages from the latest page-1 snapshot. */
  marketFullScanTotalPages: number | null;
  /** Oldest order id reached — used to resume via binary search on the next run. */
  marketFullScanCheckpointOrderId: string | null;
  recentMarketListings: Record<number, RecentMarketListing>;
  lastQuestSnapshotAt: number | null;
}

export interface QuestProjection {
  activeMonsterTasks: ActiveMonsterTask[];
}

export interface SessionView {
  connection: ConnectionProjection;
  character: CharacterProjection;
  party: PartyProjection;
  hunt: HuntProjection;
  training: TrainingProjection;
  inventory: InventoryProjection;
  market: MarketProjection;
  quests: QuestProjection;
  playerState: PlayerState;
  playerStateDetail: string;
  battlePreset: BattlePreset;
}
