import {
  decodeBinaryMessage,
  isAutoAttack,
  isCombatFloat,
  isEntityMove,
  isEntityPosition,
  isGoldBalance,
  isGroundItemUpdate,
  isMonsterLoot,
  isInventorySnapshot,
  isItemGrant,
  isMarketSnapshot,
  isSpellCast,
} from "../../binary/decode";
import { marketSnapshotBodyToData } from "../../binary/market-snapshot";
import { parseMessage, ReceiveMessageTypes, type StonegyMessage } from "../../protocol";
import type { WireMessage } from "../transport";
import { jsonEvent, type GameEvent } from "./types";

export function normalizeWireMessage(wire: WireMessage): GameEvent[] {
  if (wire.opcode === 1) {
    const parsed = parseMessage(wire.data);
    if (parsed) {
      return [jsonEvent(wire.direction, parsed, wire.data)];
    }
    return [];
  }

  if (wire.opcode === 2 && wire.direction === "receive") {
    try {
      const decoded = decodeBinaryMessage(wire.data);
      if (isInventorySnapshot(decoded)) {
        return [
          {
            kind: "inventory_snapshot",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isGoldBalance(decoded)) {
        return [
          {
            kind: "gold_balance",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isMonsterLoot(decoded)) {
        return [
          {
            kind: "monster_loot",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isGroundItemUpdate(decoded)) {
        return [
          {
            kind: "ground_item_update",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isItemGrant(decoded)) {
        return [
          {
            kind: "item_grant",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isMarketSnapshot(decoded)) {
        return [
          {
            kind: "market_snapshot_binary",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isCombatFloat(decoded)) {
        return [
          {
            kind: "combat_float",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isSpellCast(decoded)) {
        return [
          {
            kind: "spell_cast",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isAutoAttack(decoded)) {
        return [
          {
            kind: "auto_attack",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isEntityMove(decoded)) {
        return [
          {
            kind: "entity_move",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
      if (isEntityPosition(decoded)) {
        return [
          {
            kind: "entity_position",
            direction: "receive",
            data: decoded.body.data,
            raw: wire.data,
          },
        ];
      }
    } catch {
      return [];
    }
  }

  return [];
}

export function asStonegyMessage(event: GameEvent): StonegyMessage | null {
  if (event.kind === "json") {
    return event.message;
  }
  if (event.kind === "market_snapshot_binary") {
    return {
      type: ReceiveMessageTypes.MARKET_SNAPSHOT,
      data: marketSnapshotBodyToData(event.data),
    };
  }
  if (event.kind === "gold_balance") {
    return {
      type: ReceiveMessageTypes.GOLD_BALANCE,
      data: { goldCoins: event.data.goldCoins },
    };
  }
  return null;
}
