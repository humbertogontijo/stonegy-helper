import type { HuntLootSellResult } from "./loot.service";
import type { GameEvent } from "../events/types";

export function marketScanTickEvent(options?: { manual?: boolean }): GameEvent {
  return { kind: "market_scan_tick", manual: options?.manual };
}

export function lootSellFinishedEvent(result: HuntLootSellResult): GameEvent {
  return { kind: "loot_sell_finished", result };
}

export function lootPipelineFinishedEvent(): GameEvent {
  return { kind: "loot_pipeline_finished" };
}
