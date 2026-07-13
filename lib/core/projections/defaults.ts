import { createBattlePreset } from "../../presets";
import type { HuntProjection, PartyProjection, SessionView, TrainingProjection } from "./types";

export function defaultSessionView(): SessionView {
  return {
    connection: { connected: false, readyState: 3 },
    character: {
      characterName: null,
      characterId: null,
      characterVocation: null,
      level: null,
      goldCoins: null,
      staminaMs: null,
      lastStaminaUpdateAt: null,
      staminaConfig: null,
      finishedTasks: [],
      finishedQuests: [],
    },
    party: {
      partyStatus: null,
      currentHuntId: null,
      partyLeaderId: null,
      partyMemberCount: null,
      partySnapshotSynced: false,
      lastSnapshotAt: null,
      partyLootSplitter: null,
      lootSplitCompletedByPlayerId: {},
      lootSplitProgressFingerprint: null,
      lootSplitHistory: [],
    },
    hunt: {
      activeHuntId: null,
      currentLureId: null,
      currentPartyTileX: null,
      currentPartyTileY: null,
      lastBootstrapHuntId: null,
      pendingHuntLootSell: false,
      pendingHuntLootSellAt: null,
    },
    training: {
      activeTrainingId: null,
    },
    inventory: {
      items: [],
      gameQuickSellDeselectedItemIds: [],
      gameLootFilterExcludedItemIds: [],
    },
    market: {
      marketPrices: {},
      marketPricesUpdatedAt: null,
      marketScanStatus: "",
      marketFullScanStatus: "",
      huntLootSyncStatus: "",
      marketBoughtItems: [],
      marketMissedOffers: [],
      marketFullScanPage: null,
      marketFullScanTotalPages: null,
      marketFullScanCheckpointOrderId: null,
      recentMarketListings: {},
      lastQuestSnapshotAt: null,
    },
    quests: { activeMonsterTasks: [] },
    playerState: "idling",
    playerStateDetail: "",
    battlePreset: createBattlePreset(),
  };
}

export function clearedHuntProjection(
  overrides: Partial<HuntProjection> = {}
): HuntProjection {
  return { ...defaultSessionView().hunt, ...overrides };
}

export function clearedTrainingProjection(): TrainingProjection {
  return { ...defaultSessionView().training };
}

export function clearedPartyProjection(
  lastSnapshotAt: number,
  preserve: Pick<PartyProjection, "lootSplitHistory"> = { lootSplitHistory: [] }
): PartyProjection {
  return {
    ...defaultSessionView().party,
    partySnapshotSynced: true,
    lastSnapshotAt,
    lootSplitHistory: preserve.lootSplitHistory,
  };
}
