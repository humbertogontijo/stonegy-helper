import type { SubFeatureId } from "../services/types";

/** Fast back-to-back actions (market page turns, gold transfers, poll loops). */
export const BURST_COOLDOWN = 500;

/** Default spacing between ordinary commands. */
export const SHORT_COOLDOWN = 1000;

/** Heavier actions that should not fire in quick succession. */
export const REGULAR_COOLDOWN = 2500;

/** Slow / prep gaps (party activity settle, UI leave-hunt lockout). */
export const LONG_COOLDOWN = 5000;

/** Default wait for a command response before timing out. */
export const RESPONSE_TIMEOUT_MS = 10_000;

/**
 * Per sub-feature pacing. Services should prefer these (or COMMAND_COOLDOWNS)
 * over ad-hoc millisecond literals.
 */
export const FEATURE_COOLDOWNS = {
  "market.intervalScan": BURST_COOLDOWN,
  "market.autoBuy": SHORT_COOLDOWN,
  "loot.autoSell": SHORT_COOLDOWN,
  "loot.lootSplit": REGULAR_COOLDOWN,
  "battle.applyPresets": REGULAR_COOLDOWN,
  "battle.placePosition": SHORT_COOLDOWN,
  "battle.lockLure": SHORT_COOLDOWN,
  "hunt.autoHunt": SHORT_COOLDOWN,
  "tasks.autoTasker": SHORT_COOLDOWN,
  "tools.autoTraining": REGULAR_COOLDOWN,
  "tools.readyCheck": SHORT_COOLDOWN,
  "tools.acceptPartyInvite": SHORT_COOLDOWN,
  "tools.autoBuyBless": SHORT_COOLDOWN,
} as const satisfies Record<SubFeatureId, number>;

/**
 * Gaps between major hunt phases (bootstrap setup, leave/finish → sell → split → restart).
 * Command cooldowns alone do not cover these transitions.
 */
export const PIPELINE_COOLDOWNS = {
  /** After hunt bootstrap, before party position / lure / presets. */
  afterHuntBootstrap: REGULAR_COOLDOWN,
  /** After hunt ends, before starting loot sell. */
  beforeSell: REGULAR_COOLDOWN,
  /** After sell finishes, before loot split. */
  beforeSplit: REGULAR_COOLDOWN,
  /** After loot pipeline finishes, before auto-restart hunt. */
  beforeRestart: REGULAR_COOLDOWN,
} as const;

/**
 * Default bus cooldown by send message type.
 * `force: true` bypasses the wait; otherwise the bus waits out the remaining window.
 */
export const COMMAND_COOLDOWNS: Readonly<Record<string, number>> = {
  // Market
  market_get_snapshot: FEATURE_COOLDOWNS["market.intervalScan"],
  market_create_order: FEATURE_COOLDOWNS["loot.autoSell"],
  market_resolve_order: FEATURE_COOLDOWNS["market.autoBuy"],
  coin_market_resolve_order: FEATURE_COOLDOWNS["market.autoBuy"],
  // Loot
  quick_sell_items: FEATURE_COOLDOWNS["loot.autoSell"],
  gold_transfer: FEATURE_COOLDOWNS["loot.lootSplit"],
  party_loot_splitter_reset: FEATURE_COOLDOWNS["loot.lootSplit"],
  // Battle
  select_arrow: FEATURE_COOLDOWNS["battle.applyPresets"],
  select_heal: FEATURE_COOLDOWNS["battle.applyPresets"],
  select_mana_potion: FEATURE_COOLDOWNS["battle.applyPresets"],
  select_skills: FEATURE_COOLDOWNS["battle.applyPresets"],
  hunt_change_party_position: FEATURE_COOLDOWNS["battle.placePosition"],
  hunt_lure_id: FEATURE_COOLDOWNS["battle.lockLure"],
  // Hunt
  start_hunt: FEATURE_COOLDOWNS["hunt.autoHunt"],
  leave_hunt: REGULAR_COOLDOWN,
  party_disband: SHORT_COOLDOWN,
  // Tasks
  quest_start_monster_task: FEATURE_COOLDOWNS["tasks.autoTasker"],
  quest_deliver_monster_task: FEATURE_COOLDOWNS["tasks.autoTasker"],
  quest_claim_reward: FEATURE_COOLDOWNS["tasks.autoTasker"],
  // Tools
  party_ready_check_confirm: FEATURE_COOLDOWNS["tools.readyCheck"],
  party_accept_invite: FEATURE_COOLDOWNS["tools.acceptPartyInvite"],
  bless_buy: FEATURE_COOLDOWNS["tools.autoBuyBless"],
  bless_get_snapshot: FEATURE_COOLDOWNS["tools.autoBuyBless"],
  start_training: FEATURE_COOLDOWNS["tools.autoTraining"],
  finish_training: SHORT_COOLDOWN,
  training_presence_subscribe: BURST_COOLDOWN,
  training_presence_unsubscribe: BURST_COOLDOWN,
};

export function resolveCommandCooldown(type: string): number | undefined {
  return COMMAND_COOLDOWNS[type];
}

export function featureCooldown(id: SubFeatureId): number {
  return FEATURE_COOLDOWNS[id];
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isOnCooldown(
  lastAt: number | undefined,
  cooldownMs: number,
  now: number
): boolean {
  if (lastAt == null) {
    return false;
  }
  return now - lastAt < cooldownMs;
}

export function remainingCooldownMs(
  lastAt: number | undefined,
  cooldownMs: number,
  now: number
): number {
  if (lastAt == null || cooldownMs <= 0) {
    return 0;
  }
  return Math.max(0, cooldownMs - (now - lastAt));
}

/** Wait out a cooldown window (no-op when already elapsed). */
export async function waitCooldown(
  lastAt: number | undefined,
  cooldownMs: number,
  now: number = Date.now()
): Promise<void> {
  const remaining = remainingCooldownMs(lastAt, cooldownMs, now);
  if (remaining > 0) {
    await delay(remaining);
  }
}
