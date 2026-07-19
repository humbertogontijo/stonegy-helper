import { defaultFeatureMasters } from "@stonegy/helper/core/features/feature-control";
import type { FeatureId, FeatureMasters } from "@stonegy/helper/core/services/types";
import {
  excludedItemIdsFromLootSellModes,
  normalizeCategorySellMode,
  normalizeLootSellModes,
} from "@stonegy/helper/domain/loot-sell";
import {
  isTerminalHuntLootSyncStatus,
  sanitizeHuntLootSyncStatusForPersistence,
  sanitizeMarketScanFieldsForPersistence,
} from "@stonegy/helper/state";
import { loadMarketPricesFromStorage, saveMarketPricesToStorage } from "@stonegy/helper/market/store";
import { MARKET_PRICES_STORAGE_KEY } from "@stonegy/helper/market/constants";
import type { BotState } from "@stonegy/helper/types";
import {
  defaultSettings,
  type Settings,
} from "@stonegy/helper/core/settings";
import {
  normalizeHuntBattleByHuntId,
  pickPersistedSettings as pickPersistedSettingsFromHelper,
} from "@stonegy/helper/core/settings-persist";
import type { SessionView } from "@stonegy/helper/core/projections/types";
import { defaultSessionView } from "@stonegy/helper/core/projections/defaults";

export { normalizeHuntBattleByHuntId };

export const LAST_CHARACTER_ID_KEY = "lastCharacterId";

export function characterFeatureMastersKey(characterId: string): string {
  return `featureMasters:${characterId}`;
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
    const raw = stored[settingsKey] as Partial<Settings> & {
      marketMountItems?: boolean;
      marketImbuementItems?: boolean;
      marketCraftItems?: boolean;
      marketEnchantItems?: boolean;
      /** @deprecated Renamed to autoConfirmPartyHunt */
      autoConfirmReadyCheck?: boolean;
      /** @deprecated Renamed to autoDisbandSoloParty */
      autoDisbandPartyWhenAlone?: boolean;
    };
    const lootSellModeByItemId = normalizeLootSellModes(
      (raw.lootSellModeByItemId as Record<number, string> | undefined) ?? {}
    );

    Object.assign(settings, {
      autoConfirmPartyHunt: raw.autoConfirmPartyHunt ?? raw.autoConfirmReadyCheck,
      autoBuyBless: raw.autoBuyBless,
      autoDisbandSoloParty: raw.autoDisbandSoloParty ?? raw.autoDisbandPartyWhenAlone,
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
      minRaritySellMode: normalizeCategorySellMode(raw.minRaritySellMode, true),
      mountSellMode: normalizeCategorySellMode(raw.mountSellMode, !!raw.marketMountItems),
      imbuementSellMode: normalizeCategorySellMode(
        raw.imbuementSellMode,
        !!raw.marketImbuementItems
      ),
      craftSellMode: normalizeCategorySellMode(raw.craftSellMode, !!raw.marketCraftItems),
      enchantSellMode: normalizeCategorySellMode(raw.enchantSellMode, !!raw.marketEnchantItems),
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
      autoReconnectEnabled: raw.autoReconnectEnabled,
      autoTaskerEnabled: raw.autoTaskerEnabled,
      taskerMaxLure: raw.taskerMaxLure !== undefined ? !!raw.taskerMaxLure : settings.taskerMaxLure,
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
  return pickPersistedSettingsFromHelper(state.settings);
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
