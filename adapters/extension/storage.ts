import { defaultFeatureMasters } from "../../lib/core/features/feature-control";
import type { FeatureId } from "../../lib/core/features/types";
import type { FeatureMasters } from "../../lib/core/services/types";
import { createBattlePreset } from "../../lib/presets";
import {
  excludedItemIdsFromLootSellModes,
  isLootSellEnabled,
  normalizeLootSellModes,
} from "../../lib/domain/loot-sell";
import {
  isTerminalHuntLootSyncStatus,
  sanitizeHuntLootSyncStatusForPersistence,
  sanitizeMarketScanFieldsForPersistence,
} from "../../lib/state";
import { loadMarketPricesFromStorage, saveMarketPricesToStorage } from "../../lib/market/store";
import { MARKET_PRICES_STORAGE_KEY } from "../../lib/market/constants";
import type { BattlePreset, BotState } from "../../lib/types";
import {
  defaultSettings,
  type HuntBattleSettings,
  type Settings,
} from "../../lib/core/settings";
import type { SessionView } from "../../lib/core/projections/types";
import { defaultSessionView } from "../../lib/core/projections/defaults";

export const LAST_CHARACTER_ID_KEY = "lastCharacterId";

export function characterFeatureMastersKey(characterId: string): string {
  return `featureMasters:${characterId}`;
}

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

export function resolveCharacterId(state: BotState): string | null {
  return state.character.characterId ?? state.settings.characterId ?? null;
}

export function characterBotSettingsKey(characterId: string): string {
  return `botSettings:${characterId}`;
}

export function characterBotStateKey(characterId: string): string {
  return `botState:${characterId}`;
}

export function characterMarketCacheKey(characterId: string): string {
  return `${MARKET_PRICES_STORAGE_KEY}:${characterId}`;
}

function isPersistedBotState(value: unknown): value is BotState {
  return (
    !!value &&
    typeof value === "object" &&
    "connection" in value &&
    "character" in value &&
    "settings" in value
  );
}

export async function loadPersistedSettings(characterId?: string | null): Promise<{
  settings: Partial<Settings>;
  viewPatch: Partial<SessionView>;
  logs: BotState["logs"];
}> {
  if (!characterId) {
    return {
      settings: { ...defaultSettings() },
      viewPatch: {},
      logs: [],
    };
  }

  const settingsKey = characterBotSettingsKey(characterId);
  const stateKey = characterBotStateKey(characterId);
  const marketKey = characterMarketCacheKey(characterId);

  const stored = await chrome.storage.local.get([stateKey, settingsKey]);
  const marketCache = await loadMarketPricesFromStorage(chrome.storage.local, marketKey);

  const settings: Partial<Settings> = { ...defaultSettings() };
  let logs: BotState["logs"] = [];
  let storedState: BotState | undefined;

  if (isPersistedBotState(stored[stateKey])) {
    storedState = stored[stateKey];
    logs = storedState.logs ?? [];
    // Legacy: tasker runtime fields used to live only on botState.settings.
    settings.taskerPhase = storedState.settings?.taskerPhase ?? settings.taskerPhase;
    settings.taskerStatus = storedState.settings?.taskerStatus ?? settings.taskerStatus;
    settings.taskerTargetHuntId =
      storedState.settings?.taskerTargetHuntId ?? settings.taskerTargetHuntId;
  }

  if (stored[settingsKey] && typeof stored[settingsKey] === "object") {
    const raw = stored[settingsKey] as Partial<Settings>;
    const lootSellModeByItemId = normalizeLootSellModes(
      (raw.lootSellModeByItemId as Record<number, string> | undefined) ?? {}
    );

    Object.assign(settings, {
      autoConfirmReadyCheck: raw.autoConfirmReadyCheck,
      autoAcceptPartyInvite: raw.autoAcceptPartyInvite,
      partyInviteAcceptMode: raw.partyInviteAcceptMode === "allowlist" ? "allowlist" : "anyone",
      partyInviteAllowlistNames: Array.isArray(raw.partyInviteAllowlistNames)
        ? raw.partyInviteAllowlistNames.filter((name): name is string => typeof name === "string")
        : [],
      autoSplitLootOnHuntFinished: raw.autoSplitLootOnHuntFinished,
      autoSellLoot: !!raw.autoSellLoot,
      lootSellModeByItemId,
      lootSellExcludedItemIds: excludedItemIdsFromLootSellModes(lootSellModeByItemId),
      marketSellMinRarityTier: raw.marketSellMinRarityTier ?? 1,
      marketSellMountItems: raw.marketSellMountItems ?? false,
      marketTaxPercent: raw.marketTaxPercent,
      marketUndercutGold: raw.marketUndercutGold,
      marketScanEnabled: raw.marketScanEnabled,
      marketScanIntervalSec: raw.marketScanIntervalSec,
      marketAutoBuyEnabled: raw.marketAutoBuyEnabled,
      autoHuntEnabled: raw.autoHuntEnabled,
      selectedHuntId: raw.selectedHuntId,
      autoPlacePartyPosition: raw.autoPlacePartyPosition,
      autoLockLure: raw.autoLockLure,
      autoApplyPresets: raw.autoApplyPresets,
      huntBattleByHuntId: normalizeHuntBattleByHuntId(raw.huntBattleByHuntId),
      loggingEnabled: raw.loggingEnabled,
      keepAliveEnabled: raw.keepAliveEnabled,
      autoTaskerEnabled: raw.autoTaskerEnabled,
      selectedTaskQuestId: raw.selectedTaskQuestId,
      taskerPhase: raw.taskerPhase ?? settings.taskerPhase,
      taskerStatus: raw.taskerStatus ?? settings.taskerStatus,
      taskerTargetHuntId:
        raw.taskerTargetHuntId !== undefined ? raw.taskerTargetHuntId : settings.taskerTargetHuntId,
      autoTrainingEnabled: raw.autoTrainingEnabled,
      autoTrainingSkillToTrain: raw.autoTrainingSkillToTrain,
      autoTrainingIdleDelaySec: raw.autoTrainingIdleDelaySec,
    });
  }

  const baseMarket = defaultSessionView().market;
  const viewPatch: Partial<SessionView> = {
    party: {
      lootSplitHistory: storedState?.party?.lootSplitHistory ?? [],
    } as SessionView["party"],
    market: {
      ...baseMarket,
      marketPrices: marketCache.prices,
      marketPricesUpdatedAt: marketCache.updatedAt || null,
      huntLootSyncStatus: isTerminalHuntLootSyncStatus(storedState?.market?.huntLootSyncStatus ?? "")
        ? (storedState?.market?.huntLootSyncStatus ?? "")
        : "",
      marketBoughtItems: storedState?.market?.marketBoughtItems ?? [],
      marketMissedOffers: storedState?.market?.marketMissedOffers ?? [],
      marketFullScanTotalPages: storedState?.market?.marketFullScanTotalPages ?? null,
      marketFullScanPage: storedState?.market?.marketFullScanPage ?? null,
      marketFullScanCheckpointOrderId: storedState?.market?.marketFullScanCheckpointOrderId ?? null,
      recentMarketListings: storedState?.market?.recentMarketListings ?? {},
    },
  };

  const sanitized = sanitizeMarketScanFieldsForPersistence(storedState?.market ?? baseMarket);
  if (viewPatch.market) {
    Object.assign(viewPatch.market, sanitized);
  }

  return { settings, viewPatch, logs };
}

export function pickPersistedSettings(state: BotState) {
  const lootSellModeByItemId = normalizeLootSellModes(
    state.settings.lootSellModeByItemId as Record<number, string>
  );
  return {
    autoConfirmReadyCheck: state.settings.autoConfirmReadyCheck,
    autoAcceptPartyInvite: state.settings.autoAcceptPartyInvite,
    partyInviteAcceptMode: state.settings.partyInviteAcceptMode,
    partyInviteAllowlistNames: state.settings.partyInviteAllowlistNames,
    autoSplitLootOnHuntFinished: state.settings.autoSplitLootOnHuntFinished,
    autoSellLoot: isLootSellEnabled(state.settings),
    lootSellModeByItemId,
    lootSellExcludedItemIds: excludedItemIdsFromLootSellModes(lootSellModeByItemId),
    marketSellMinRarityTier: state.settings.marketSellMinRarityTier ?? 1,
    marketSellMountItems: state.settings.marketSellMountItems ?? false,
    marketTaxPercent: state.settings.marketTaxPercent,
    marketUndercutGold: state.settings.marketUndercutGold,
    marketScanEnabled: state.settings.marketScanEnabled,
    marketScanIntervalSec: state.settings.marketScanIntervalSec,
    marketAutoBuyEnabled: state.settings.marketAutoBuyEnabled,
    autoHuntEnabled: state.settings.autoHuntEnabled,
    selectedHuntId: state.settings.selectedHuntId,
    autoPlacePartyPosition: state.settings.autoPlacePartyPosition,
    autoLockLure: state.settings.autoLockLure,
    autoApplyPresets: state.settings.autoApplyPresets,
    huntBattleByHuntId: state.settings.huntBattleByHuntId,
    loggingEnabled: state.settings.loggingEnabled,
    keepAliveEnabled: state.settings.keepAliveEnabled,
    autoTaskerEnabled: state.settings.autoTaskerEnabled,
    selectedTaskQuestId: state.settings.selectedTaskQuestId,
    taskerPhase: state.settings.taskerPhase,
    taskerStatus: state.settings.taskerStatus,
    taskerTargetHuntId: state.settings.taskerTargetHuntId,
    autoTrainingEnabled: state.settings.autoTrainingEnabled,
    autoTrainingSkillToTrain: state.settings.autoTrainingSkillToTrain,
    autoTrainingIdleDelaySec: state.settings.autoTrainingIdleDelaySec,
  };
}

/**
 * Lean snapshot for chrome.storage.local — never persist debug telemetry, live
 * market prices, or other runtime-only fields (Safari quota is tight).
 */
export function pickPersistedState(state: BotState) {
  const scan = sanitizeMarketScanFieldsForPersistence(state.market);
  return {
    character: {
      characterId: state.character.characterId,
      characterName: state.character.characterName,
      characterVocation: state.character.characterVocation,
      level: state.character.level,
    },
    party: {
      lootSplitHistory: state.party.lootSplitHistory ?? [],
    },
    market: {
      huntLootSyncStatus: sanitizeHuntLootSyncStatusForPersistence(state.market.huntLootSyncStatus),
      marketBoughtItems: state.market.marketBoughtItems ?? [],
      marketMissedOffers: state.market.marketMissedOffers ?? [],
      marketFullScanPage: state.market.marketFullScanPage,
      recentMarketListings: state.market.recentMarketListings ?? {},
      ...scan,
    },
    logs: state.logs ?? [],
    // Minimal shape so isPersistedBotState / legacy loaders still recognize the blob.
    connection: { connected: false, readyState: 3 },
    settings: {
      taskerPhase: state.settings.taskerPhase,
      taskerStatus: state.settings.taskerStatus,
      taskerTargetHuntId: state.settings.taskerTargetHuntId,
    },
  };
}

export async function persistBotState(
  state: BotState,
  characterId: string | null = resolveCharacterId(state)
): Promise<void> {
  if (!characterId) {
    return;
  }

  const settingsKey = characterBotSettingsKey(characterId);
  const stateKey = characterBotStateKey(characterId);

  try {
    await chrome.storage.local.set({
      [settingsKey]: pickPersistedSettings(state),
      [stateKey]: pickPersistedState(state),
      [LAST_CHARACTER_ID_KEY]: characterId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/quota|serialize/i.test(message)) {
      throw error;
    }
    // Drop the bloated legacy blob first so Safari has room for the lean rewrite.
    try {
      await chrome.storage.local.remove(stateKey);
      await chrome.storage.local.set({
        [settingsKey]: pickPersistedSettings(state),
        [stateKey]: { ...pickPersistedState(state), logs: [] },
        [LAST_CHARACTER_ID_KEY]: characterId,
      });
    } catch {
      // ignore — private mode / hard quota
    }
  }
}

export async function saveMarketCache(state: BotState): Promise<void> {
  const characterId = resolveCharacterId(state);
  if (!characterId) {
    return;
  }

  await saveMarketPricesToStorage(
    chrome.storage.local,
    characterMarketCacheKey(characterId)
  );
}

export async function loadFeatureMasters(
  characterId: string | null
): Promise<FeatureMasters> {
  const defaults = defaultFeatureMasters() as FeatureMasters;
  if (!characterId) {
    return defaults;
  }

  try {
    const key = characterFeatureMastersKey(characterId);
    const stored = await chrome.storage.local.get(key);
    const raw = stored[key];
    if (!raw || typeof raw !== "object") {
      return defaults;
    }
    const masters = { ...defaults };
    for (const id of Object.keys(defaults) as FeatureId[]) {
      if (typeof (raw as Record<string, unknown>)[id] === "boolean") {
        masters[id] = (raw as Record<string, boolean>)[id]!;
      }
    }
    return masters;
  } catch {
    return defaults;
  }
}

export async function saveFeatureMasters(
  characterId: string | null,
  masters: FeatureMasters
): Promise<void> {
  if (!characterId) {
    return;
  }
  try {
    await chrome.storage.local.set({
      [characterFeatureMastersKey(characterId)]: masters,
    });
  } catch {
    // ignore quota / private mode
  }
}
