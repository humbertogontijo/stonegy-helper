import type { BotState } from "../../../lib/types";
import { isLootSellEnabled } from "../../../lib/domain/loot-sell";
import {
  FEATURES,
  FEATURE_TAB_ORDER,
} from "../../../lib/core/features/instances";
import type { Feature } from "../../../lib/core/features/types";
import type { FeatureId } from "../../../lib/core/services/types";

export type { FeatureId, Feature };
export { FEATURES, FEATURE_TAB_ORDER };

export interface FeatureStatus {
  running: boolean;
  summary: string;
}

export interface TabBadgeInfo {
  label: "On" | "Off";
  active: boolean;
}

function isActiveMarketFullScanStatus(status: string): boolean {
  return (
    status.startsWith("Requesting") ||
    status.startsWith("Scanned page") ||
    status.startsWith("Requested page")
  );
}

export function isMarketFullScanRunning(state: BotState | null | undefined): boolean {
  if (!state) {
    return false;
  }

  const status = state.market.marketFullScanStatus;
  if (!status) {
    return false;
  }

  if (status.startsWith("Full scan complete") || status.includes("paused")) {
    return false;
  }

  return isActiveMarketFullScanStatus(status) || state.market.marketFullScanPage != null;
}

function isMarketFullScanPaused(state: BotState): boolean {
  const status = state.market.marketFullScanStatus;
  return (
    state.market.marketFullScanPage == null &&
    !!status &&
    status.includes("paused") &&
    !isActiveMarketFullScanStatus(status) &&
    !status.startsWith("Full scan complete")
  );
}

function isMarketSubFeatureActive(state: BotState): boolean {
  return (
    !!state.settings.marketScanEnabled ||
    !!state.settings.marketAutoBuyEnabled ||
    !!state.market.marketFullScanStatus ||
    isMarketFullScanPaused(state)
  );
}

function isLootSubFeatureActive(state: BotState): boolean {
  return (
    isLootSellEnabled(state.settings) ||
    Object.keys(state.settings.lootSellModeByItemId ?? {}).length > 0 ||
    !!state.settings.autoSplitLootOnHuntFinished
  );
}

function isBattleSubFeatureActive(state: BotState): boolean {
  return !!(
    state.settings.autoApplyPresets ||
    state.settings.autoPlacePartyPosition ||
    state.settings.autoLockLure
  );
}

export function getFeatureStatus(featureId: FeatureId, state: BotState | null): FeatureStatus {
  if (!state) {
    return { running: false, summary: "Loading…" };
  }

  switch (featureId) {
    case "market": {
      const parts: string[] = [];
      if (state.settings.marketScanEnabled) {
        parts.push(
          state.market.marketScanStatus || `Page 1 every ${state.settings.marketScanIntervalSec}s`
        );
      }
      if (state.settings.marketAutoBuyEnabled) {
        parts.push("Auto-buy on");
      }
      const fullScan =
        state.market.marketFullScanStatus ||
        (state.market.marketFullScanPage != null && state.market.marketFullScanTotalPages != null
          ? `Page ${state.market.marketFullScanPage}/${state.market.marketFullScanTotalPages}`
          : isMarketFullScanPaused(state)
            ? "Scan paused"
            : "");
      if (fullScan) {
        parts.push(fullScan);
      }
      if (!parts.length) {
        const age = state.market.marketPricesUpdatedAt
          ? `Last sync ${new Date(state.market.marketPricesUpdatedAt).toLocaleTimeString()}`
          : "Scanner off";
        return { running: false, summary: age };
      }
      return { running: isMarketSubFeatureActive(state), summary: parts.join(" · ") };
    }
    case "loot": {
      const parts: string[] = [];
      if (isLootSellEnabled(state.settings)) parts.push("Auto-sell on");
      if (Object.keys(state.settings.lootSellModeByItemId ?? {}).length > 0) {
        parts.push("Item overrides");
      }
      if (state.settings.autoSplitLootOnHuntFinished) parts.push("Auto loot split");
      return {
        running: isLootSubFeatureActive(state),
        summary: parts.length ? parts.join(" · ") : "Loot automation off",
      };
    }
    case "battle": {
      const parts: string[] = [];
      if (state.settings.autoPlacePartyPosition) parts.push("Auto position");
      if (state.settings.autoLockLure) parts.push("Auto lure");
      if (state.settings.autoApplyPresets) parts.push("Auto presets");
      return {
        running: isBattleSubFeatureActive(state),
        summary: parts.length ? parts.join(" · ") : "Manual apply",
      };
    }
    case "hunt":
      if (state.settings.autoTaskerEnabled) {
        return { running: true, summary: "Controlled by Tasks" };
      }
      if (state.settings.autoHuntEnabled) {
        const huntId = state.hunt.activeHuntId ?? state.settings.selectedHuntId;
        return {
          running: true,
          summary: huntId != null ? `Auto hunt #${huntId}` : "Auto hunt running",
        };
      }
      return {
        running: false,
        summary: "Auto hunt off",
      };
    case "tasks":
      return {
        running: !!state.settings.autoTaskerEnabled,
        summary: state.settings.autoTaskerEnabled
          ? state.settings.taskerStatus || state.settings.taskerPhase
          : "Tasker stopped",
      };
    case "tools": {
      const training = state.party.partyStatus === "training" || !!state.training.activeTrainingId;
      const parts: string[] = [];
      if (state.settings.keepAliveEnabled !== false) {
        parts.push("Anti-disconnect on");
      }
      if (state.settings.autoReconnectEnabled) {
        parts.push("Auto reconnect on");
      }
      if (state.settings.autoConfirmReadyCheck) {
        parts.push("Auto confirm ready");
      }
      if (state.settings.autoAcceptPartyInvite) {
        parts.push(
          state.settings.partyInviteAcceptMode === "allowlist"
            ? "Auto accept allowlist"
            : "Auto accept party"
        );
      }
      if (state.settings.autoTrainingEnabled && training) {
        parts.push(`Training ${state.settings.autoTrainingSkillToTrain.toLowerCase()}`);
      } else if (state.settings.autoTrainingEnabled) {
        parts.push(`Auto training (${state.settings.autoTrainingIdleDelaySec ?? 5}s idle)`);
      }
      return {
        running: !!state.settings.autoTrainingEnabled && training,
        summary: parts.length ? parts.join(" · ") : "Tools off",
      };
    }
    default:
      return { running: false, summary: "—" };
  }
}

export function isHuntControlledByParent(state: BotState | null): boolean {
  return !!state?.settings.autoTaskerEnabled;
}

export function isLureControlledByTasks(state: BotState | null): boolean {
  return !!state?.settings.autoTaskerEnabled && !!state?.settings.taskerMaxLure;
}

export function getTabBadge(_tabId: FeatureId, masterOn: boolean): TabBadgeInfo {
  return { label: masterOn ? "On" : "Off", active: masterOn };
}
