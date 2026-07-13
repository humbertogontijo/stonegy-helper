import {
  DEFAULT_MARKET_TAX_PERCENT,
  DEFAULT_MARKET_UNDERCUT_GOLD,
} from "../market/constants";
import type { BattlePreset, LootSellMode, TaskerPhase } from "../types";
import type { SkillToTrain } from "../protocol-messages";

export type PartyInviteAcceptMode = "anyone" | "allowlist";

/** Per-hunt party position, lure, and battle preset preferences. */
export interface HuntBattleSettings {
  partyPositionX: number | null;
  partyPositionY: number | null;
  selectedLureId: number | null;
  battlePreset: BattlePreset | null;
}

export interface Settings {
  characterId: string | null;
  characterName: string | null;
  autoConfirmReadyCheck: boolean;
  autoAcceptPartyInvite: boolean;
  partyInviteAcceptMode: PartyInviteAcceptMode;
  partyInviteAllowlistNames: string[];
  autoSplitLootOnHuntFinished: boolean;
  autoSellLoot: boolean;
  lootSellModeByItemId: Record<number, LootSellMode>;
  lootSellExcludedItemIds: number[];
  /** Min rarityBorderTier for default market-sell rule (items below → NPC). */
  marketSellMinRarityTier: number;
  /** When true, mount items are market-sell candidates instead of keep. */
  marketSellMountItems: boolean;
  marketTaxPercent: number;
  marketUndercutGold: number;
  marketScanEnabled: boolean;
  marketScanIntervalSec: number;
  marketAutoBuyEnabled: boolean;
  autoHuntEnabled: boolean;
  selectedHuntId: number | null;
  autoPlacePartyPosition: boolean;
  autoLockLure: boolean;
  autoApplyPresets: boolean;
  /** Party position, lure, and presets keyed by hunt id. */
  huntBattleByHuntId: Record<number, HuntBattleSettings>;
  loggingEnabled: boolean;
  keepAliveEnabled: boolean;
  autoTaskerEnabled: boolean;
  selectedTaskQuestId: number | null;
  taskerPhase: TaskerPhase;
  taskerStatus: string;
  taskerTargetHuntId: number | null;
  autoTrainingEnabled: boolean;
  autoTrainingSkillToTrain: SkillToTrain;
  autoTrainingIdleDelaySec: number;
}

export function emptyHuntBattleSettings(): HuntBattleSettings {
  return {
    partyPositionX: null,
    partyPositionY: null,
    selectedLureId: null,
    battlePreset: null,
  };
}

export function getHuntBattleSettings(
  settings: Pick<Settings, "huntBattleByHuntId">,
  huntId: number | null | undefined
): HuntBattleSettings {
  if (huntId == null || !Number.isFinite(huntId)) {
    return emptyHuntBattleSettings();
  }
  return settings.huntBattleByHuntId[huntId] ?? emptyHuntBattleSettings();
}

export function patchHuntBattleByHuntId(
  map: Record<number, HuntBattleSettings>,
  huntId: number,
  patch: Partial<HuntBattleSettings>
): Record<number, HuntBattleSettings> {
  const prev = map[huntId] ?? emptyHuntBattleSettings();
  return {
    ...map,
    [huntId]: { ...prev, ...patch },
  };
}

export function defaultSettings(): Settings {
  return {
    characterId: null,
    characterName: null,
    autoConfirmReadyCheck: false,
    autoAcceptPartyInvite: false,
    partyInviteAcceptMode: "anyone",
    partyInviteAllowlistNames: [],
    autoSplitLootOnHuntFinished: false,
    autoSellLoot: false,
    lootSellModeByItemId: {},
    lootSellExcludedItemIds: [],
    marketSellMinRarityTier: 1,
    marketSellMountItems: false,
    marketTaxPercent: DEFAULT_MARKET_TAX_PERCENT,
    marketUndercutGold: DEFAULT_MARKET_UNDERCUT_GOLD,
    marketScanEnabled: false,
    marketScanIntervalSec: 30,
    marketAutoBuyEnabled: false,
    autoHuntEnabled: false,
    selectedHuntId: null,
    autoPlacePartyPosition: false,
    autoLockLure: false,
    autoApplyPresets: false,
    huntBattleByHuntId: {},
    loggingEnabled: true,
    keepAliveEnabled: true,
    autoTaskerEnabled: false,
    selectedTaskQuestId: 6,
    taskerPhase: "idle",
    taskerStatus: "",
    taskerTargetHuntId: null,
    autoTrainingEnabled: false,
    autoTrainingSkillToTrain: "DISTANCE",
    autoTrainingIdleDelaySec: 5,
  };
}
