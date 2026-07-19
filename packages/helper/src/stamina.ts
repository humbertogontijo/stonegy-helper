import type { BotState } from "./types";

export interface StaminaConfig {
  maxStaminaMs: number;
  recoveryFactor: number;
  consumptionIntervalMs: number;
  consumptionAmountMs: number;
}

export interface StaminaSnapshot {
  anchorMs: number;
  lastUpdateAt: number;
  config: StaminaConfig;
  consuming: boolean;
  now?: number;
}

export type StaminaStateSlice = {
  character: Pick<
    BotState["character"],
    "staminaMs" | "lastStaminaUpdateAt" | "staminaConfig"
  >;
  party: Pick<BotState["party"], "partyStatus">;
  hunt: Pick<BotState["hunt"], "activeHuntId">;
};

export function parseStaminaConfig(value: unknown): StaminaConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const config = value as Record<string, unknown>;
  if (typeof config.maxStaminaMs !== "number" || !Number.isFinite(config.maxStaminaMs)) {
    return null;
  }

  return {
    maxStaminaMs: config.maxStaminaMs,
    recoveryFactor:
      typeof config.recoveryFactor === "number" && Number.isFinite(config.recoveryFactor)
        ? config.recoveryFactor
        : 2,
    consumptionIntervalMs:
      typeof config.consumptionIntervalMs === "number" &&
      Number.isFinite(config.consumptionIntervalMs)
        ? config.consumptionIntervalMs
        : 60_000,
    consumptionAmountMs:
      typeof config.consumptionAmountMs === "number" &&
      Number.isFinite(config.consumptionAmountMs)
        ? config.consumptionAmountMs
        : 60_000,
  };
}

export function parseLastStaminaUpdateAt(value: unknown): number | null {
  if (typeof value !== "string" || !value.length) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isStaminaConsuming(
  state: Pick<StaminaStateSlice, "party" | "hunt">
): boolean {
  return state.party.partyStatus === "hunting" || state.hunt.activeHuntId != null;
}

export function computeCurrentStaminaMs(snapshot: StaminaSnapshot): number {
  const { anchorMs, lastUpdateAt, config, consuming, now = Date.now() } = snapshot;
  const elapsed = Math.max(0, now - lastUpdateAt);
  if (elapsed === 0) {
    return anchorMs;
  }

  if (consuming) {
    const ticks = Math.floor(elapsed / config.consumptionIntervalMs);
    return Math.max(0, anchorMs - ticks * config.consumptionAmountMs);
  }

  const recoveryIntervalMs = config.consumptionIntervalMs * config.recoveryFactor;
  const ticks = Math.floor(elapsed / recoveryIntervalMs);
  return Math.min(config.maxStaminaMs, anchorMs + ticks * config.consumptionAmountMs);
}

export function reanchorStamina(
  state: StaminaStateSlice,
  now = Date.now()
): Pick<BotState["character"], "staminaMs" | "lastStaminaUpdateAt"> | null {
  const { staminaMs, lastStaminaUpdateAt, staminaConfig } = state.character;
  if (staminaMs == null || lastStaminaUpdateAt == null || !staminaConfig) {
    return null;
  }

  return {
    staminaMs: computeCurrentStaminaMs({
      anchorMs: staminaMs,
      lastUpdateAt: lastStaminaUpdateAt,
      config: staminaConfig,
      consuming: isStaminaConsuming(state),
      now,
    }),
    lastStaminaUpdateAt: now,
  };
}

export function resolveDisplayedStaminaMs(
  state: StaminaStateSlice | null | undefined,
  now = Date.now()
): number | null {
  const staminaMs = state?.character.staminaMs;
  if (staminaMs == null) {
    return null;
  }

  const { lastStaminaUpdateAt, staminaConfig } = state!.character;
  if (lastStaminaUpdateAt == null || !staminaConfig) {
    return staminaMs;
  }

  return computeCurrentStaminaMs({
    anchorMs: staminaMs,
    lastUpdateAt: lastStaminaUpdateAt,
    config: staminaConfig,
    consuming: isStaminaConsuming(state!),
    now,
  });
}
