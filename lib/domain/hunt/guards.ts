/** Settings slice needed for auto-hunt restart eligibility. */
export type AutoHuntRestartSettings = {
  autoHuntEnabled: boolean;
  autoTaskerEnabled: boolean;
};

/** Returns true when auto-hunt should restart hunts (enabled and tasker is not controlling). */
export function isAutoHuntRestartEnabled(settings: AutoHuntRestartSettings): boolean {
  return settings.autoHuntEnabled && !settings.autoTaskerEnabled;
}

/** Post-hunt loot settings that own the HUNT_FINISHED → idle transition. */
export type HuntFinishLootSettings = {
  autoSplitLootOnHuntFinished?: boolean;
};

/**
 * On HUNT_FINISHED, defer auto-restart when loot sell/split will run.
 * Avoids racing Promise.all core dispatch before playerState becomes selling_loot.
 */
export function shouldDeferHuntRestartForLootFinish(
  settings: HuntFinishLootSettings,
  options: { isLeader: boolean; lootSellEnabled: boolean }
): boolean {
  if (options.lootSellEnabled) {
    return true;
  }
  if (settings.autoSplitLootOnHuntFinished && options.isLeader) {
    return true;
  }
  return false;
}

export type CanRestartHuntInput = {
  isLeader: boolean;
  selectedHuntId: number | null | undefined;
  autoHuntEnabled: boolean;
  autoTaskerEnabled: boolean;
  handlingLoot: boolean;
  /** When true, party/hunt is already active — restart should not start again. */
  alreadyHunting?: boolean;
  /** When false, restart must wait until the player has all 7 blessings. */
  hasAllBlessings?: boolean;
};

/** Shared restart eligibility for HUNT_FINISHED / PARTY_SNAPSHOT auto-restart. */
export function canRestartHunt(input: CanRestartHuntInput): boolean {
  if (!isAutoHuntRestartEnabled(input)) {
    return false;
  }
  if (input.handlingLoot) {
    return false;
  }
  if (!input.isLeader) {
    return false;
  }
  if (input.selectedHuntId == null) {
    return false;
  }
  if (input.alreadyHunting) {
    return false;
  }
  if (input.hasAllBlessings === false) {
    return false;
  }
  return true;
}

export type CanEnableAutoHuntInput = {
  connected: boolean;
  autoTaskerEnabled: boolean;
  hasValidHunt: boolean;
  hasCharacterId: boolean;
  partySnapshotSynced: boolean;
  isLeader: boolean;
  hasAllBlessings: boolean;
};

export type EnableAutoHuntBlockReason =
  | "invalid_hunt"
  | "not_connected"
  | "tasker_controls"
  | "no_character"
  | "party_not_synced"
  | "not_leader"
  | "missing_blessings";

/** Pure enable-auto-hunt prechecks (party wait / start are service I/O). */
export function enableAutoHuntBlockReason(
  input: CanEnableAutoHuntInput
): EnableAutoHuntBlockReason | null {
  if (!input.hasValidHunt) {
    return "invalid_hunt";
  }
  if (!input.connected) {
    return "not_connected";
  }
  if (input.autoTaskerEnabled) {
    return "tasker_controls";
  }
  if (!input.hasCharacterId) {
    return "no_character";
  }
  if (!input.partySnapshotSynced) {
    return "party_not_synced";
  }
  if (!input.isLeader) {
    return "not_leader";
  }
  if (!input.hasAllBlessings) {
    return "missing_blessings";
  }
  return null;
}
