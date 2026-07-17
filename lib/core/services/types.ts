export type FeatureId = "market" | "loot" | "battle" | "hunt" | "tasks" | "tools";

export type DomainStateId =
  | "sessionState"
  | "partyState"
  | "huntState"
  | "trainingState"
  | "inventoryState"
  | "marketState"
  | "tasksState"
  | "blessState";

/** Registry key for any registered service (domain or core). */
export type ServiceId = FeatureId | DomainStateId;

export type FeatureMasters = Record<FeatureId, boolean>;

/**
 * Host-provided repeating timers (chrome.alarms in the extension, setInterval in CLI, or no-op).
 * Core services must not call chrome.* directly.
 */
export interface HostTimers {
  /** Schedule or replace a repeating named timer. `intervalSec` is the desired period. */
  scheduleRepeating(name: string, intervalSec: number, tick: () => void): void;
  clear(name: string): void;
}

export type SubFeatureId =
  | "market.intervalScan"
  | "market.autoBuy"
  | "loot.autoSell"
  | "loot.lootSplit"
  | "battle.applyPresets"
  | "battle.placePosition"
  | "battle.lockLure"
  | "hunt.autoHunt"
  | "tasks.autoTasker"
  | "tools.autoTraining"
  | "tools.confirmPartyHunt"
  | "tools.acceptPartyInvite"
  | "tools.autoBuyBless"
  | "tools.autoDisbandSoloParty";

export function isFeatureId(id: ServiceId): id is FeatureId {
  return (
    id === "market" ||
    id === "loot" ||
    id === "battle" ||
    id === "hunt" ||
    id === "tasks" ||
    id === "tools"
  );
}
