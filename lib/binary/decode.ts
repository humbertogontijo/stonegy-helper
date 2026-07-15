import { decodeClientAreaFrame } from "./client-area.ts";
import {
  decodeAbilityCastPacket,
  decodeSpellCastPacket,
} from "./combat-packets.ts";
import { assertSupportedVersion, parseEnvelope } from "./envelope.ts";
import { decodeEntityMove, decodeEntityPosition } from "./entity-move.ts";
import {
  decodeAnalyzerStats,
  decodeCombatDamage,
  decodeCompactCombatDamage,
  decodeCounterTriplet,
  decodeEntityUpdate,
  decodeGroundItemUpdate,
  decodeHuntAnalyzerSnapshot,
  decodeHuntEntitySpawn,
  decodeHuntFrame,
  decodeKillEvent,
  decodePlayerVitals,
  decodeSessionMetric,
  decodeGoldBalance,
  decodeStatusEffect,
  decodeVitalDelta,
  decodeXpGain,
} from "./hunt-events.ts";
import { decodeInventorySnapshot } from "./inventory-snapshot.ts";
import { decodeMapBootstrap, sumMapBootstrapBlobBytes } from "./map-bootstrap.ts";
import { decodeMarketSnapshot, marketSnapshotBodyToData } from "./market-snapshot.ts";
import { resolveMarketSnapshotTotalPages } from "../market/parse.ts";
import { binaryBodyKindSchemas, binaryPayloadSchemas } from "../protocol-messages.ts";
import { BinaryReader, decodeBase64ToBytes } from "./reader.ts";
import { decodeVisualUpdate } from "./visual-update.ts";
import { decodeHuntWorldSnapshot } from "./world-snapshot.ts";
import { STONEGY_BINARY_MAGIC, STONEGY_BINARY_VERSION, StonegyBinaryMessageType } from "./types.ts";
import type {
  DecodedBinaryBody,
  DecodedBinaryMessage,
  InventorySnapshotBody,
  MarketSnapshotBody,
  SpeechBody,
} from "./types.ts";
import type {
  EntityUuidListBody,
  GoldBalanceBody,
  GroundItemUpdateBody,
  MonsterLootBody,
  ItemGrantBody,
} from "../protocol-messages.ts";

export function decodeBinaryMessage(input: Uint8Array | string): DecodedBinaryMessage {
  try {
    const buffer = typeof input === "string" ? decodeBase64ToBytes(input) : input;
    const envelope = parseEnvelope(buffer);
    assertSupportedVersion(envelope.version);

    const reader = new BinaryReader(buffer);
    reader.seek(envelope.payloadOffset);
    const payloadLength = buffer.length - envelope.payloadOffset;

    return {
      envelope,
      body: decodeBody(envelope.type, reader, payloadLength),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      envelope: {
        magic: STONEGY_BINARY_MAGIC,
        version: STONEGY_BINARY_VERSION,
        type: 0xff,
        payloadOffset: 0,
      },
      body: {
        kind: "unknown",
        data: { raw: new Uint8Array(), error: message },
      },
    };
  }
}

function decodeBody(type: number, reader: BinaryReader, payloadLength: number): DecodedBinaryBody {
  const payloadStart = reader.position;

  try {
    return decodeBodyOrThrow(type, reader, payloadLength);
  } catch (error) {
    reader.seek(payloadStart);
    return {
      kind: "unknown",
      data: {
        raw: reader.rest(),
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function validateDecodedBody(type: number, body: DecodedBinaryBody): DecodedBinaryBody {
  const schema = binaryPayloadSchemas[type];
  if (schema) {
    // HuntLoot (0x0a) returns the discriminated union as the body itself.
    if (type === StonegyBinaryMessageType.HuntLoot) {
      return schema.parse(body) as DecodedBinaryBody;
    }
    if ("data" in body) {
      schema.parse(body.data);
    }
    return body;
  }

  // Multiplexed types (VitalDelta 0x09, AutoAttack 0x19): validate by body.kind.
  if (
    (type === StonegyBinaryMessageType.VitalDelta ||
      type === StonegyBinaryMessageType.AutoAttack) &&
    "data" in body
  ) {
    const kindSchema = binaryBodyKindSchemas[body.kind];
    kindSchema?.parse(body.data);
  }

  return body;
}

export function decodeBodyOrThrow(
  type: number,
  reader: BinaryReader,
  payloadLength: number
): DecodedBinaryBody {
  const body = decodeBodyOrThrowUnvalidated(type, reader, payloadLength);
  return validateDecodedBody(type, body);
}

function decodeBodyOrThrowUnvalidated(
  type: number,
  reader: BinaryReader,
  payloadLength: number
): DecodedBinaryBody {
  switch (type) {
    case StonegyBinaryMessageType.Ping:
      return { kind: "ping" };
    case StonegyBinaryMessageType.HuntEntitySpawn:
      return { kind: "hunt_entity_spawn", data: decodeHuntEntitySpawn(reader) };
    case StonegyBinaryMessageType.HuntAnalyzerSnapshot:
      return { kind: "hunt_analyzer_snapshot", data: decodeHuntAnalyzerSnapshot(reader) };
    case StonegyBinaryMessageType.KillEvent:
      return { kind: "kill_event", data: decodeKillEvent(reader) };
    case StonegyBinaryMessageType.EntityUpdate:
      return { kind: "entity_update", data: decodeEntityUpdate(reader) };
    case StonegyBinaryMessageType.VitalDelta:
      return decodeVitalDeltaMessage(reader, payloadLength);
    case StonegyBinaryMessageType.HuntLoot:
      return decodeHuntFrame(reader);
    case StonegyBinaryMessageType.AnalyzerStats:
      return { kind: "analyzer_stats", data: decodeAnalyzerStats(reader) };
    case StonegyBinaryMessageType.CounterTriplet:
      return { kind: "counter_triplet", data: decodeCounterTriplet(reader) };
    case StonegyBinaryMessageType.GoldBalance:
      return { kind: "gold_balance", data: decodeGoldBalance(reader) };
    case StonegyBinaryMessageType.MapBootstrap:
      return { kind: "map_bootstrap", data: decodeMapBootstrap(reader) };
    case StonegyBinaryMessageType.InventorySnapshot:
      return { kind: "inventory_snapshot", data: decodeInventorySnapshot(reader) };
    case StonegyBinaryMessageType.MarketSnapshot:
      return { kind: "market_snapshot", data: decodeMarketSnapshot(reader) };
    case StonegyBinaryMessageType.PlayerUpdate:
      return { kind: "player_update", data: decodePlayerVitals(reader, payloadLength) };
    case StonegyBinaryMessageType.XpGain:
      return { kind: "xp_gain", data: decodeXpGain(reader) };
    case StonegyBinaryMessageType.SessionMetric:
      return { kind: "session_metric", data: decodeSessionMetric(reader) };
    case StonegyBinaryMessageType.Speech:
      return { kind: "speech", data: decodeSpeech(reader) };
    case StonegyBinaryMessageType.StatusEffect:
      return { kind: "status_effect", data: decodeStatusEffect(reader) };
    case StonegyBinaryMessageType.AbilityCast:
      return decodeAutoAttackOrDamage(reader, type);
    case StonegyBinaryMessageType.AutoAttack:
      return decodeAutoAttackOrDamage(reader, type);
    case StonegyBinaryMessageType.GroundItemUpdate:
      return { kind: "ground_item_update", data: decodeGroundItemUpdate(reader) };
    case StonegyBinaryMessageType.VisualUpdate:
      return { kind: "visual_update", data: decodeVisualUpdate(reader) };
    case StonegyBinaryMessageType.SpellCast:
      return { kind: "spell_cast", data: decodeSpellCastPacket(reader) };
    case StonegyBinaryMessageType.HuntWorldSnapshot:
      return { kind: "hunt_world_snapshot", data: decodeHuntWorldSnapshot(reader) };
    case StonegyBinaryMessageType.EntityMove:
      return { kind: "entity_move", data: decodeEntityMove(reader) };
    case StonegyBinaryMessageType.EntityPosition:
      return { kind: "entity_position", data: decodeEntityPosition(reader) };
    case StonegyBinaryMessageType.EntityPositionSync:
      return decodeEntityPositionSync(reader);
    case StonegyBinaryMessageType.ClientAreaSelect:
    case StonegyBinaryMessageType.ClientAreaPulse:
      return { kind: "client_area", data: decodeClientAreaFrame(reader) };
    case StonegyBinaryMessageType.ClientInput:
      return { kind: "client_input", data: decodeClientInput(reader) };
    default:
      return {
        kind: "unknown",
        data: { raw: reader.rest() },
      };
  }
}

function decodeVitalDeltaMessage(reader: BinaryReader, payloadLength: number): DecodedBinaryBody {
  if (payloadLength === 7) {
    return { kind: "combat_damage", data: decodeCompactCombatDamage(reader) };
  }

  if (payloadLength === 13) {
    return { kind: "vital_delta", data: decodeVitalDelta(reader) };
  }

  throw new RangeError(`Unsupported vital delta payload length: ${payloadLength}`);
}

function decodeEntityPositionSync(reader: BinaryReader): DecodedBinaryBody {
  const indexStart = reader.position;
  reader.u16();
  const nameLengthOffset = indexStart + 2;

  if (
    reader.bufferView[nameLengthOffset + 1] === 0 &&
    reader.bufferView[nameLengthOffset] > 0
  ) {
    reader.seek(indexStart);
    return { kind: "entity_position", data: decodeEntityPosition(reader) };
  }

  reader.seek(indexStart);
  return { kind: "entity_move", data: decodeEntityMove(reader) };
}

function decodeClientInput(reader: BinaryReader): { fields: number[] } {
  const fields: number[] = [];

  while (reader.remaining >= 2) {
    fields.push(reader.u16());
  }

  if (reader.remaining > 0) {
    fields.push(reader.u8());
  }

  return { fields };
}

function decodeAutoAttackOrDamage(reader: BinaryReader, wireType: number): DecodedBinaryBody {
  const discriminator = reader.bufferView[reader.position];

  if (discriminator === 0 && wireType === StonegyBinaryMessageType.AutoAttack) {
    reader.u8();
    return { kind: "combat_damage", data: decodeCombatDamage(reader) };
  }

  const body = decodeAbilityCastPacket(reader, wireType);
  if ("header" in body && "rawTail" in body) {
    return { kind: "support_ability_cast", data: body };
  }

  return { kind: "auto_attack", data: body };
}

function decodeSpeech(reader: BinaryReader): SpeechBody {
  const channel = reader.u16();
  const mode = reader.u16();
  reader.u16();
  reader.u8();
  const length = reader.u8();
  reader.u8();
  const text = new TextDecoder().decode(reader.bytes(length));

  return { channel, mode, text };
}

export function isInventorySnapshot(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "inventory_snapshot"; data: InventorySnapshotBody };
} {
  return message.body.kind === "inventory_snapshot";
}

export function isMarketSnapshot(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "market_snapshot"; data: MarketSnapshotBody };
} {
  return message.body.kind === "market_snapshot";
}

export function isMonsterLoot(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "monster_loot"; data: MonsterLootBody };
} {
  return message.body.kind === "monster_loot";
}

export function isItemGrant(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "item_grant"; data: ItemGrantBody };
} {
  return message.body.kind === "item_grant";
}

export function isGroundItemUpdate(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "ground_item_update"; data: GroundItemUpdateBody };
} {
  return message.body.kind === "ground_item_update";
}

export function isGoldBalance(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "gold_balance"; data: GoldBalanceBody };
} {
  return message.body.kind === "gold_balance";
}

export function isEntityUuidList(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "entity_uuid_list"; data: EntityUuidListBody };
} {
  return message.body.kind === "entity_uuid_list";
}

export function summarizeBinaryMessage(message: DecodedBinaryMessage): string {
  switch (message.body.kind) {
    case "ping":
      return "ping";
    case "hunt_entity_spawn":
      return `hunt_spawn(${message.body.data.entities.length} entities, hunt=${message.body.data.huntId})`;
    case "hunt_analyzer_snapshot": {
      const { totalKills, rawXp, xp, partyMembers } = message.body.data;
      return `hunt_analyzer(kills=${totalKills}, rawXp=${rawXp}, xp=${xp}, party=${partyMembers.length})`;
    }
    case "kill_event":
      return `kill(xp=${message.body.data.xp})`;
    case "entity_update":
      return `entity_update(sub=${message.body.data.subType}, refs=${message.body.data.entityRefs.length})`;
    case "vital_delta":
      return `vital(target=${message.body.data.targetIndex}, delta=${message.body.data.delta})`;
    case "monster_loot": {
      const { totalLootValue, drops } = message.body.data;
      return `monster_loot(${drops.length} drops, total=${totalLootValue})`;
    }
    case "item_grant": {
      const { itemId, amount } = message.body.data;
      return `item_grant(item=${itemId}, amount=${amount})`;
    }
    case "entity_uuid_list":
      return `entity_uuid_list(${message.body.data.entityUuids.length} uuids)`;
    case "analyzer_stats":
      return `analyzer_stats(${message.body.data.values.join(", ")})`;
    case "counter_triplet":
      return `counter(${message.body.data.kind}, ${message.body.data.a}/${message.body.data.b}/${message.body.data.c})`;
    case "gold_balance":
      return `gold(${message.body.data.goldCoins})`;
    case "inventory_snapshot": {
      const { items, depot, goldCoins, usedSlots } = message.body.data;
      const backpackCount = items.length;
      const backpackLabel =
        backpackCount === usedSlots ? `${backpackCount}` : `${backpackCount}/${usedSlots}`;
      const depotCount = depot?.items.length ?? 0;
      const depotSuffix = depotCount > 0 ? `, depot ${depotCount}` : "";
      return `inventory(${backpackLabel} items, ${goldCoins} gold${depotSuffix})`;
    }
    case "market_snapshot": {
      const { sellOrders, buyOrders, page } = message.body.data;
      const totalPages =
        resolveMarketSnapshotTotalPages(marketSnapshotBodyToData(message.body.data)) ??
        message.body.data.totalPages;
      return `market(page ${page}/${totalPages}, ${sellOrders.length} sells, ${buyOrders.length} buys)`;
    }
    case "player_update":
      return `player(hp=${message.body.data.currentHp}, mana=${message.body.data.currentMana}, huntMs=${message.body.data.huntTimeMs})`;
    case "xp_gain":
      return `xp(+${message.body.data.xpGain}, session=${message.body.data.sessionXp})`;
    case "session_metric":
      return `session(stamina=${message.body.data.staminaMs}ms)`;
    case "speech":
      return `speech("${message.body.data.text}")`;
    case "spell_cast":
      return `spell(${message.body.data.strings.join(" / ")})`;
    case "status_effect":
      return `status(target=${message.body.data.targetIndex}, effect=${message.body.data.effectId})`;
    case "combat_damage":
      return `damage(${message.body.data.amount} from ${message.body.data.attackerIndex} to ${message.body.data.targetIndex})`;
    case "auto_attack": {
      const { strings } = message.body.data;
      return `auto_attack(${strings.join(" / ")})`;
    }
    case "support_ability_cast":
      return `support_ability(${message.body.data.strings.join(" / ")})`;
    case "ground_item_update": {
      const { subType, count, items, extra } = message.body.data;
      const itemSuffix = items?.length
        ? `, items=${items.length} [${items
            .slice(0, 3)
            .map((item) => `${item.itemId}x${item.amount}`)
            .join(", ")}${items.length > 3 ? ", …" : ""}]`
        : "";
      const extraSuffix = extra != null ? `, extra=${extra}` : "";
      return `ground_item(sub=${subType}, count=${count}${itemSuffix}${extraSuffix})`;
    }
    case "entity_move": {
      const { name, delta, moveKind, state } = message.body.data;
      return `entity_move(${name}, delta=${delta}, kind=${moveKind}, state=${state})`;
    }
    case "entity_position": {
      const { name, delta, state } = message.body.data;
      return `entity_position(${name}, delta=${delta}, state=${state})`;
    }
    case "map_bootstrap": {
      const { mapId, schemaVersion, sections } = message.body.data;
      const tileBytes = sumMapBootstrapBlobBytes(sections);
      return `map(id=${mapId}, schema=${schemaVersion}, tileData=${tileBytes}b)`;
    }
    case "visual_update": {
      const { leadByte, entityHandle, raw } = message.body.data;
      return `visual_update(lead=${leadByte}, entity=${entityHandle}, ${raw.length} raw bytes)`;
    }
    case "hunt_world_snapshot": {
      const { entityCount, entities, tail } = message.body.data;
      return `world_snapshot(${entities.length}/${entityCount} entities, +${tail.length} tail bytes)`;
    }
    case "client_input": {
      const { fields } = message.body.data;
      return `client_input(${fields.join(", ")})`;
    }
    case "client_area": {
      const { mapName, coordA, coordB } = message.body.data;
      return `client_area(${mapName}, ${coordA}, ${coordB})`;
    }
    default:
      return `unknown(type=${message.envelope.type}, ${message.body.data?.raw?.length ?? 0} bytes)`;
  }
}
