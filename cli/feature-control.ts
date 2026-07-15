import { FEATURES, FEATURE_TAB_ORDER } from "../lib/core/features/instances";
import { getFeatureMasterOffPatch, canArmFeature } from "../lib/core/features/feature-control";
import type { HuntService } from "../lib/core/services/hunt.service";
import type { TasksService } from "../lib/core/services/tasks.service";
import type { FeatureId, SubFeatureId } from "../lib/core/services/types";
import type { GameSession } from "../lib/core/session";
import type { Settings } from "../lib/core/settings";
import type { BotState } from "../lib/types";
import type { FeatureMasterMap } from "./config";

function huntService(session: GameSession): HuntService {
  return session.services.get<HuntService>("hunt");
}

function tasksService(session: GameSession): TasksService {
  return session.services.get<TasksService>("tasks");
}

export interface FeatureControlContext {
  session: GameSession;
  featureMasters: FeatureMasterMap;
  getState: () => BotState;
}

export interface ControlResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export function isHuntControlledByParent(state: BotState): boolean {
  return !!state.settings.autoTaskerEnabled;
}

export function isLureControlledByTasks(state: BotState): boolean {
  return !!state.settings.autoTaskerEnabled && !!state.settings.taskerMaxLure;
}

export function isSubFeatureLocked(
  ctx: FeatureControlContext,
  subFeatureId: SubFeatureId
): boolean {
  const subFeature = FEATURES[subFeatureId.split(".")[0] as FeatureId].subFeatures.find(
    (entry) => entry.id === subFeatureId
  );
  if (!subFeature) {
    return true;
  }

  if (!ctx.featureMasters[subFeature.featureId]) {
    return true;
  }

  const state = ctx.getState();
  if (subFeature.featureId === "hunt" && isHuntControlledByParent(state)) {
    return subFeatureId === "hunt.autoHunt";
  }
  if (subFeatureId === "battle.lockLure" && isLureControlledByTasks(state)) {
    return true;
  }

  return false;
}

export function isSubFeatureEnabled(ctx: FeatureControlContext, subFeatureId: SubFeatureId): boolean {
  const featureId = subFeatureId.split(".")[0] as FeatureId;
  const subFeature = FEATURES[featureId].subFeatures.find((entry) => entry.id === subFeatureId);
  if (!subFeature) {
    return false;
  }
  return subFeature.isEnabled(ctx.session);
}

export async function setFeatureMaster(
  ctx: FeatureControlContext,
  featureId: FeatureId,
  enabled: boolean
): Promise<ControlResult> {
  if (enabled) {
    const check = canArmFeature(featureId, ctx.featureMasters);
    if (!check.ok) {
      return check;
    }
    ctx.featureMasters[featureId] = true;
    await ctx.session.services.setMasters({ [featureId]: true });
    return { ok: true, message: `${FEATURES[featureId].label} armed.` };
  }

  ctx.featureMasters[featureId] = false;
  const patch = getFeatureMasterOffPatch(featureId);
  const state = ctx.getState();

  if (featureId === "hunt" && state.settings.autoHuntEnabled && !isHuntControlledByParent(state)) {
    const result = await huntService(ctx.session).disableAutoHunt();
    if (!result.ok) {
      return result;
    }
  }

  if (featureId === "tasks" && state.settings.autoTaskerEnabled) {
    const result = await tasksService(ctx.session).disableAutoTasker();
    if (!result.ok) {
      return result;
    }
  }

  if (Object.keys(patch).length > 0) {
    ctx.session.updateSettings(patch);
  }

  await ctx.session.services.setMasters({ [featureId]: false });

  return { ok: true, message: `${FEATURES[featureId].label} disarmed.` };
}

function settingsPatchForSubFeature(
  subFeatureId: SubFeatureId,
  enabled: boolean
): Partial<Settings> | null {
  switch (subFeatureId) {
    case "market.intervalScan":
      return { marketScanEnabled: enabled };
    case "market.autoBuy":
      return { marketAutoBuyEnabled: enabled };
    case "loot.autoSell":
      return { autoSellLoot: enabled };
    case "battle.applyPresets":
      return { autoApplyPresets: enabled };
    case "battle.placePosition":
      return { autoPlacePartyPosition: enabled };
    case "battle.lockLure":
      return { autoLockLure: enabled };
    case "loot.lootSplit":
      return { autoSplitLootOnHuntFinished: enabled };
    case "tools.readyCheck":
      return { autoConfirmReadyCheck: enabled };
    case "tools.autoBuyBless":
      return { autoBuyBless: enabled };
    case "tools.acceptPartyInvite":
      return { autoAcceptPartyInvite: enabled };
    case "tools.autoTraining":
      return { autoTrainingEnabled: enabled };
    default:
      return null;
  }
}

export async function setSubFeatureEnabled(
  ctx: FeatureControlContext,
  subFeatureId: SubFeatureId,
  enabled: boolean,
  options?: { huntId?: number; questId?: number }
): Promise<ControlResult> {
  if (isSubFeatureLocked(ctx, subFeatureId)) {
    return { ok: false, error: "Sub-feature is locked — arm the parent feature first." };
  }

  if (subFeatureId === "hunt.autoHunt") {
    if (enabled) {
      const huntId = options?.huntId ?? ctx.session.settings.selectedHuntId;
      if (huntId == null) {
        return { ok: false, error: "Select a hunt id first." };
      }
      return huntService(ctx.session).enableAutoHunt(huntId);
    }
    return huntService(ctx.session).disableAutoHunt();
  }

  if (subFeatureId === "tasks.autoTasker") {
    if (enabled) {
      const questId = options?.questId ?? ctx.session.settings.selectedTaskQuestId ?? 6;
      return tasksService(ctx.session).enableAutoTasker(questId);
    }
    return tasksService(ctx.session).disableAutoTasker();
  }

  const patch = settingsPatchForSubFeature(subFeatureId, enabled);
  if (!patch) {
    return { ok: false, error: `Unknown sub-feature: ${subFeatureId}` };
  }

  ctx.session.updateSettings(patch);
  const featureId = subFeatureId.split(".")[0] as FeatureId;
  const subFeature = FEATURES[featureId].subFeatures.find((entry) => entry.id === subFeatureId);
  const label = subFeature?.label ?? subFeatureId;
  return {
    ok: true,
    message: `${label} ${enabled ? "enabled" : "disabled"}.`,
  };
}

export function collectPersistedSettings(ctx: FeatureControlContext): Partial<Settings> {
  const state = ctx.getState();
  return {
    autoConfirmReadyCheck: state.settings.autoConfirmReadyCheck,
    autoBuyBless: state.settings.autoBuyBless,
    autoAcceptPartyInvite: state.settings.autoAcceptPartyInvite,
    partyInviteAcceptMode: state.settings.partyInviteAcceptMode,
    partyInviteAllowlistNames: state.settings.partyInviteAllowlistNames,
    autoSplitLootOnHuntFinished: state.settings.autoSplitLootOnHuntFinished,
    autoSellLoot: state.settings.autoSellLoot,
    marketSellMinRarityTier: state.settings.marketSellMinRarityTier,
    minRaritySellMode: state.settings.minRaritySellMode,
    mountSellMode: state.settings.mountSellMode,
    imbuementSellMode: state.settings.imbuementSellMode,
    craftSellMode: state.settings.craftSellMode,
    enchantSellMode: state.settings.enchantSellMode,
    marketScanEnabled: state.settings.marketScanEnabled,
    marketScanIntervalSec: state.settings.marketScanIntervalSec,
    marketAutoBuyEnabled: state.settings.marketAutoBuyEnabled,
    autoHuntEnabled: state.settings.autoHuntEnabled,
    selectedHuntId: state.settings.selectedHuntId,
    autoPlacePartyPosition: state.settings.autoPlacePartyPosition,
    autoLockLure: state.settings.autoLockLure,
    autoApplyPresets: state.settings.autoApplyPresets,
    huntBattleByHuntId: state.settings.huntBattleByHuntId,
    autoTaskerEnabled: state.settings.autoTaskerEnabled,
    taskerMaxLure: state.settings.taskerMaxLure,
    selectedTaskQuestId: state.settings.selectedTaskQuestId,
    autoTrainingEnabled: state.settings.autoTrainingEnabled,
    autoTrainingSkillToTrain: state.settings.autoTrainingSkillToTrain,
    autoTrainingIdleDelaySec: state.settings.autoTrainingIdleDelaySec,
  };
}

export function formatMasterSummary(masters: FeatureMasterMap): string {
  return FEATURE_TAB_ORDER.map((id) => `${FEATURES[id].label} ${masters[id] ? "on" : "off"}`).join(
    " · "
  );
}

export function formatFullStatus(ctx: FeatureControlContext): string {
  const state = ctx.getState();
  const lines: string[] = [
    `Character: ${state.character.characterName ?? state.character.characterId ?? "—"}`,
    `Connected: ${state.connection.connected ? "yes" : "no"}`,
    `Party: ${state.party.partyStatus ?? "—"}`,
    `Hunt: ${state.hunt.activeHuntId ?? state.settings.selectedHuntId ?? "—"}`,
    `Gold: ${state.character.goldCoins?.toLocaleString() ?? "—"}`,
    "",
    `Feature masters: ${formatMasterSummary(ctx.featureMasters)}`,
    "",
    "Sub-features:",
  ];

  for (const featureId of FEATURE_TAB_ORDER) {
    const feature = FEATURES[featureId];
    lines.push(`  ${feature.label}${ctx.featureMasters[featureId] ? "" : " (disarmed)"}:`);
    for (const subFeature of feature.subFeatures) {
      const locked = isSubFeatureLocked(ctx, subFeature.id);
      const enabled = subFeature.isEnabled(ctx.session);
      const suffix = locked ? "locked" : enabled ? "on" : "off";
      lines.push(`    - ${subFeature.label}: ${suffix}`);
    }
  }

  if (state.settings.autoTaskerEnabled) {
    lines.push("");
    lines.push(`Tasker: ${state.settings.taskerPhase} — ${state.settings.taskerStatus || "running"}`);
  }

  return lines.join("\n");
}
