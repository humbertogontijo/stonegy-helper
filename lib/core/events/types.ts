import type { GroundLootBody, InventorySnapshotBody, ItemGrantBody, MarketSnapshotBody, GoldBalanceBody } from "../../binary/types";
import type { HuntLootSellResult } from "../services/loot.service";
import type { StonegyMessage } from "../../protocol";

export type GameEvent =
  | {
      kind: "json";
      direction: "send" | "receive";
      message: StonegyMessage;
      raw: string;
    }
  | {
      kind: "inventory_snapshot";
      direction: "receive";
      data: InventorySnapshotBody;
      raw: string;
    }
  | {
      kind: "gold_balance";
      direction: "receive";
      data: GoldBalanceBody;
      raw: string;
    }
  | {
      kind: "ground_loot";
      direction: "receive";
      data: GroundLootBody;
      raw: string;
    }
  | {
      kind: "item_grant";
      direction: "receive";
      data: ItemGrantBody;
      raw: string;
    }
  | {
      kind: "market_snapshot_binary";
      direction: "receive";
      data: MarketSnapshotBody;
      raw: string;
    }
  | {
      kind: "connection";
      connected: boolean;
      readyState: number;
    }
  | {
      kind: "market_scan_tick";
      manual?: boolean;
    }
  | {
      kind: "loot_sell_finished";
      result: HuntLootSellResult;
    }
  | {
      /** Fired when post-hunt sell (and optional split) are fully done and the player is idle. */
      kind: "loot_pipeline_finished";
    };

export function jsonEvent(
  direction: "send" | "receive",
  message: StonegyMessage,
  raw: string
): GameEvent {
  return { kind: "json", direction, message, raw };
}
