import { normalizeRarityBorderTier } from "../items";
import {
  excludedItemIdsFromLootSellModes,
  isLootSellEnabled,
  normalizeCategorySellMode,
  normalizeLootSellModes,
} from "../domain/loot-sell";
import { createBattlePreset } from "../presets";
import type { BattlePreset } from "../types";
import type { SkillToTrain } from "../protocol-messages";
import type { HuntBattleSettings, Settings } from "./settings";

export type SettingsApplyTarget = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
};

/** Treat an unconfigured / default battle preset as null. */
function normalizePersistedBattlePreset(
  preset: BattlePreset | null | undefined
): BattlePreset | null {
  if (!preset) {
    return null;
  }
  const normalized = createBattlePreset(preset as never);
  const emptyDefault = createBattlePreset();
  if (JSON.stringify(normalized) === JSON.stringify(emptyDefault)) {
    return null;
  }
  return normalized;
}

export function normalizeHuntBattleByHuntId(raw: unknown): Record<number, HuntBattleSettings> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<number, HuntBattleSettings> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const huntId = Number(key);
    if (!Number.isFinite(huntId) || !value || typeof value !== "object") {
      continue;
    }
    const entry = value as Partial<HuntBattleSettings>;
    out[huntId] = {
      partyPositionX:
        entry.partyPositionX == null || !Number.isFinite(Number(entry.partyPositionX))
          ? null
          : Number(entry.partyPositionX),
      partyPositionY:
        entry.partyPositionY == null || !Number.isFinite(Number(entry.partyPositionY))
          ? null
          : Number(entry.partyPositionY),
      selectedLureId:
        entry.selectedLureId == null || !Number.isFinite(Number(entry.selectedLureId))
          ? null
          : Number(entry.selectedLureId),
      battlePreset: normalizePersistedBattlePreset(entry.battlePreset),
    };
  }
  return out;
}

/** Lean settings shape shared by extension + node persistence. */
export function pickPersistedSettings(settings: Settings): Partial<Settings> {
  const lootSellModeByItemId = normalizeLootSellModes(
    settings.lootSellModeByItemId as Record<number, string>
  );
  return {
    autoConfirmPartyHunt: settings.autoConfirmPartyHunt,
    autoBuyBless: settings.autoBuyBless,
    autoDisbandSoloParty: settings.autoDisbandSoloParty,
    autoAcceptPartyInvite: settings.autoAcceptPartyInvite,
    partyInviteAcceptMode: settings.partyInviteAcceptMode,
    partyInviteAllowlistNames: settings.partyInviteAllowlistNames,
    autoSplitLootOnHuntFinished: settings.autoSplitLootOnHuntFinished,
    autoSellLoot: isLootSellEnabled(settings),
    lootSellModeByItemId,
    lootSellExcludedItemIds: excludedItemIdsFromLootSellModes(lootSellModeByItemId),
    marketSellMinRarityTier: settings.marketSellMinRarityTier ?? 1,
    minRaritySellMode: settings.minRaritySellMode ?? "market",
    mountSellMode: settings.mountSellMode ?? "keep",
    imbuementSellMode: settings.imbuementSellMode ?? "keep",
    craftSellMode: settings.craftSellMode ?? "keep",
    enchantSellMode: settings.enchantSellMode ?? "keep",
    marketTaxPercent: settings.marketTaxPercent,
    marketUndercutGold: settings.marketUndercutGold,
    marketScanEnabled: settings.marketScanEnabled,
    marketScanIntervalSec: settings.marketScanIntervalSec,
    marketAutoBuyEnabled: settings.marketAutoBuyEnabled,
    autoHuntEnabled: settings.autoHuntEnabled,
    selectedHuntId: settings.selectedHuntId,
    autoPlacePartyPosition: settings.autoPlacePartyPosition,
    autoLockLure: settings.autoLockLure,
    autoApplyPresets: settings.autoApplyPresets,
    huntBattleByHuntId: settings.huntBattleByHuntId,
    loggingEnabled: settings.loggingEnabled,
    keepAliveEnabled: settings.keepAliveEnabled,
    autoReconnectEnabled: settings.autoReconnectEnabled,
    autoTaskerEnabled: settings.autoTaskerEnabled,
    taskerMaxLure: settings.taskerMaxLure,
    selectedTaskQuestId: settings.selectedTaskQuestId,
    taskerPhase: settings.taskerPhase,
    taskerStatus: settings.taskerStatus,
    taskerTargetHuntId: settings.taskerTargetHuntId,
    autoTrainingEnabled: settings.autoTrainingEnabled,
    autoTrainingSkillToTrain: settings.autoTrainingSkillToTrain,
    autoTrainingIdleDelaySec: settings.autoTrainingIdleDelaySec,
  };
}

/**
 * Merge a `bot:set-settings` message (or settings-shaped object) into the session.
 * Hosts keep their own side effects (persist, keep-alive, market scanner).
 */
export function applySettingsPatch(
  target: SettingsApplyTarget,
  message: Record<string, unknown>
): void {
  const state = target.settings;
  const resolvedAutoSellLoot =
    message.autoSellLoot === undefined ? isLootSellEnabled(state) : !!message.autoSellLoot;

  const lootSellModeByItemId = normalizeLootSellModes(
    message.lootSellModeByItemId && typeof message.lootSellModeByItemId === "object"
      ? (message.lootSellModeByItemId as Record<number, string>)
      : state.lootSellModeByItemId
  );

  target.updateSettings({
    autoConfirmPartyHunt:
      message.autoConfirmPartyHunt === undefined
        ? state.autoConfirmPartyHunt
        : !!message.autoConfirmPartyHunt,
    autoBuyBless:
      message.autoBuyBless === undefined ? state.autoBuyBless : !!message.autoBuyBless,
    autoDisbandSoloParty:
      message.autoDisbandSoloParty === undefined
        ? state.autoDisbandSoloParty
        : !!message.autoDisbandSoloParty,
    autoAcceptPartyInvite:
      message.autoAcceptPartyInvite === undefined
        ? state.autoAcceptPartyInvite
        : !!message.autoAcceptPartyInvite,
    partyInviteAcceptMode:
      message.partyInviteAcceptMode === "allowlist"
        ? "allowlist"
        : message.partyInviteAcceptMode === "anyone"
          ? "anyone"
          : state.partyInviteAcceptMode,
    partyInviteAllowlistNames:
      message.partyInviteAllowlistNames === undefined
        ? state.partyInviteAllowlistNames
        : Array.isArray(message.partyInviteAllowlistNames)
          ? message.partyInviteAllowlistNames.filter(
              (name): name is string => typeof name === "string"
            )
          : state.partyInviteAllowlistNames,
    autoSplitLootOnHuntFinished:
      message.autoSplitLootOnHuntFinished === undefined
        ? state.autoSplitLootOnHuntFinished
        : !!message.autoSplitLootOnHuntFinished,
    autoSellLoot: resolvedAutoSellLoot,
    lootSellModeByItemId: lootSellModeByItemId as never,
    lootSellExcludedItemIds: excludedItemIdsFromLootSellModes(lootSellModeByItemId),
    marketSellMinRarityTier:
      message.marketSellMinRarityTier === undefined
        ? (state.marketSellMinRarityTier ?? 1)
        : normalizeRarityBorderTier(Number(message.marketSellMinRarityTier)),
    minRaritySellMode:
      message.minRaritySellMode === undefined
        ? (state.minRaritySellMode ?? "market")
        : normalizeCategorySellMode(message.minRaritySellMode, true),
    mountSellMode:
      message.mountSellMode === undefined
        ? (state.mountSellMode ?? "keep")
        : normalizeCategorySellMode(message.mountSellMode),
    imbuementSellMode:
      message.imbuementSellMode === undefined
        ? (state.imbuementSellMode ?? "keep")
        : normalizeCategorySellMode(message.imbuementSellMode),
    craftSellMode:
      message.craftSellMode === undefined
        ? (state.craftSellMode ?? "keep")
        : normalizeCategorySellMode(message.craftSellMode),
    enchantSellMode:
      message.enchantSellMode === undefined
        ? (state.enchantSellMode ?? "keep")
        : normalizeCategorySellMode(message.enchantSellMode),
    marketTaxPercent:
      message.marketTaxPercent === undefined
        ? state.marketTaxPercent
        : Math.max(0, Number(message.marketTaxPercent) || 0),
    marketUndercutGold:
      message.marketUndercutGold === undefined
        ? state.marketUndercutGold
        : Math.max(0, Number(message.marketUndercutGold) || 0),
    marketScanEnabled:
      message.marketScanEnabled === undefined
        ? state.marketScanEnabled
        : !!message.marketScanEnabled,
    marketScanIntervalSec:
      message.marketScanIntervalSec === undefined
        ? state.marketScanIntervalSec
        : Math.max(10, Number(message.marketScanIntervalSec) || 30),
    marketAutoBuyEnabled:
      message.marketAutoBuyEnabled === undefined
        ? state.marketAutoBuyEnabled
        : !!message.marketAutoBuyEnabled,
    autoHuntEnabled:
      message.autoHuntEnabled === undefined
        ? state.autoHuntEnabled
        : !!message.autoHuntEnabled,
    selectedHuntId:
      message.selectedHuntId === undefined
        ? state.selectedHuntId
        : message.selectedHuntId === null
          ? null
          : Number(message.selectedHuntId) || null,
    autoPlacePartyPosition:
      message.autoPlacePartyPosition === undefined
        ? state.autoPlacePartyPosition
        : !!message.autoPlacePartyPosition,
    autoLockLure:
      message.autoLockLure === undefined ? state.autoLockLure : !!message.autoLockLure,
    autoApplyPresets:
      message.autoApplyPresets === undefined
        ? state.autoApplyPresets
        : !!message.autoApplyPresets,
    huntBattleByHuntId:
      message.huntBattleByHuntId !== undefined && typeof message.huntBattleByHuntId === "object"
        ? normalizeHuntBattleByHuntId(message.huntBattleByHuntId)
        : state.huntBattleByHuntId,
    loggingEnabled:
      message.loggingEnabled === undefined ? state.loggingEnabled : !!message.loggingEnabled,
    keepAliveEnabled:
      message.keepAliveEnabled === undefined
        ? state.keepAliveEnabled
        : !!message.keepAliveEnabled,
    autoReconnectEnabled:
      message.autoReconnectEnabled === undefined
        ? state.autoReconnectEnabled
        : !!message.autoReconnectEnabled,
    autoTaskerEnabled:
      message.autoTaskerEnabled === undefined
        ? state.autoTaskerEnabled
        : !!message.autoTaskerEnabled,
    selectedTaskQuestId:
      message.selectedTaskQuestId === undefined
        ? state.selectedTaskQuestId
        : Number(message.selectedTaskQuestId) || null,
    taskerMaxLure:
      message.taskerMaxLure === undefined ? state.taskerMaxLure : !!message.taskerMaxLure,
    taskerPhase:
      message.taskerPhase === undefined
        ? state.taskerPhase
        : (String(message.taskerPhase) as Settings["taskerPhase"]),
    taskerStatus:
      message.taskerStatus === undefined ? state.taskerStatus : String(message.taskerStatus),
    taskerTargetHuntId:
      message.taskerTargetHuntId === undefined
        ? state.taskerTargetHuntId
        : message.taskerTargetHuntId === null
          ? null
          : Number(message.taskerTargetHuntId) || null,
    autoTrainingEnabled:
      message.autoTrainingEnabled === undefined
        ? state.autoTrainingEnabled
        : !!message.autoTrainingEnabled,
    autoTrainingSkillToTrain:
      message.autoTrainingSkillToTrain === undefined
        ? state.autoTrainingSkillToTrain
        : (String(message.autoTrainingSkillToTrain) as SkillToTrain),
    autoTrainingIdleDelaySec:
      message.autoTrainingIdleDelaySec === undefined
        ? state.autoTrainingIdleDelaySec
        : Math.max(1, Number(message.autoTrainingIdleDelaySec) || 5),
  });
}
