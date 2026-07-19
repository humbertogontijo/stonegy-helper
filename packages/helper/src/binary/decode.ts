import { decodeClientAreaFrame } from "./client-area.ts";
import {
  decodeAbilityCastPacket,
  decodeSpellCastPacket,
} from "./combat-packets.ts";
import { assertSupportedVersion, parseEnvelope } from "./envelope.ts";
import { decodeEntityMove, decodeEntityPosition } from "./entity-move.ts";
import {
  decodeAnalyzerStats,
  decodeCombatFloat,
  decodeCounterTriplet,
  decodeCooldownUpdate,
  decodeEffectArea,
  decodeGroundItemUpdate,
  decodeHuntAnalyzerSnapshot,
  decodeHuntEntitySpawn,
  decodeHuntFrame,
  decodeKillEvent,
  decodeSessionMetric,
  decodeGoldBalance,
  decodeVitals,
  decodeXpGain,
  decodeXpSummary,
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
  AutoAttackBody,
  DecodedBinaryBody,
  DecodedBinaryMessage,
  EntityMoveBody,
  EntityPositionBody,
  InventorySnapshotBody,
  MarketSnapshotBody,
  SpeechBody,
  SpellCastBody,
} from "./types.ts";
import type {
  CombatFloatBody,
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

    return {
      envelope,
      body: decodeBody(envelope.type, reader),
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

function decodeBody(type: number, reader: BinaryReader): DecodedBinaryBody {
  const payloadStart = reader.position;

  try {
    return decodeBodyOrThrow(type, reader);
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

  // Multiplexed types (AutoAttack 0x19 / AbilityCast 0x12): validate by body.kind.
  if (
    (type === StonegyBinaryMessageType.AutoAttack ||
      type === StonegyBinaryMessageType.AbilityCast) &&
    "data" in body
  ) {
    const kindSchema = binaryBodyKindSchemas[body.kind];
    kindSchema?.parse(body.data);
  }

  return body;
}

export function decodeBodyOrThrow(type: number, reader: BinaryReader): DecodedBinaryBody {
  const body = decodeBodyOrThrowUnvalidated(type, reader);
  const validated = validateDecodedBody(type, body);
  // Incomplete decoders must not silently discard leftovers and report the
  // frame as fully known — any unread payload fails the decode (→ kind "unknown").
  // Named trailers (trailingBytes / rawTail) are consumed into the body first;
  // debug telemetry then marks those events unknown.
  if (validated.kind !== "unknown") {
    reader.assertExhausted(validated.kind);
  }
  return validated;
}

function decodeBodyOrThrowUnvalidated(type: number, reader: BinaryReader): DecodedBinaryBody {
  switch (type) {
    case StonegyBinaryMessageType.Ping:
      return { kind: "ping" };
    case StonegyBinaryMessageType.HuntEntitySpawn:
      return { kind: "hunt_entity_spawn", data: decodeHuntEntitySpawn(reader) };
    case StonegyBinaryMessageType.HuntAnalyzerSnapshot:
      return { kind: "hunt_analyzer_snapshot", data: decodeHuntAnalyzerSnapshot(reader) };
    case StonegyBinaryMessageType.KillEvent:
      return { kind: "kill_event", data: decodeKillEvent(reader) };
    case StonegyBinaryMessageType.CooldownUpdate:
      return { kind: "cooldown_update", data: decodeCooldownUpdate(reader) };
    case StonegyBinaryMessageType.Vitals:
      return { kind: "vitals", data: decodeVitals(reader) };
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
    case StonegyBinaryMessageType.XpSummary:
      return { kind: "xp_summary", data: decodeXpSummary(reader) };
    case StonegyBinaryMessageType.XpGain:
      return { kind: "xp_gain", data: decodeXpGain(reader) };
    case StonegyBinaryMessageType.SessionMetric:
      return { kind: "session_metric", data: decodeSessionMetric(reader) };
    case StonegyBinaryMessageType.Speech:
      return { kind: "speech", data: decodeSpeech(reader) };
    case StonegyBinaryMessageType.EffectArea:
      return { kind: "effect_area", data: decodeEffectArea(reader) };
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
    return { kind: "combat_float", data: decodeCombatFloat(reader) };
  }

  const body = decodeAbilityCastPacket(reader, wireType);
  if ("header" in body && "rawTail" in body) {
    return { kind: "support_ability_cast", data: body };
  }

  return { kind: "auto_attack", data: body };
}

/**
 * Type 0x17 — batched speech lines:
 *   u16 entryCount
 *   entryCount × { u8 mode (observed 2), u32 speakerIndex, u16 len, utf8 text }
 * Live party frames bundle several members' spell yells per frame; the
 * speakerIndex values match xp-share member indexes.
 */
function decodeSpeech(reader: BinaryReader): SpeechBody {
  const entryCount = reader.u16();
  const entries: SpeechBody["entries"] = [];

  for (let index = 0; index < entryCount; index += 1) {
    const mode = reader.u8();
    const speakerIndex = reader.u32();
    const length = reader.u16();
    const text = new TextDecoder().decode(reader.bytes(length));
    entries.push({ mode, speakerIndex, text });
  }

  return { entries };
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

export function isCombatFloat(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "combat_float"; data: CombatFloatBody };
} {
  return message.body.kind === "combat_float";
}

export function isSpellCast(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "spell_cast"; data: SpellCastBody };
} {
  return message.body.kind === "spell_cast";
}

export function isAutoAttack(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "auto_attack"; data: AutoAttackBody };
} {
  return message.body.kind === "auto_attack";
}

export function isEntityMove(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "entity_move"; data: EntityMoveBody };
} {
  return message.body.kind === "entity_move";
}

export function isEntityPosition(message: DecodedBinaryMessage): message is DecodedBinaryMessage & {
  body: { kind: "entity_position"; data: EntityPositionBody };
} {
  return message.body.kind === "entity_position";
}

export function summarizeBinaryMessage(message: DecodedBinaryMessage): string {
  switch (message.body.kind) {
    case "ping":
      return "ping";
    case "hunt_entity_spawn": {
      const { entities, corpses, tiles, rawTail } = message.body.data;
      const corpseSuffix = corpses.length > 0 ? `, ${corpses.length} corpses` : "";
      const tileSuffix = tiles.length > 0 ? `, ${tiles.length} tiles` : "";
      const tailSuffix = rawTail.length > 0 ? `, +${rawTail.length}b tail` : "";
      return `hunt_spawn(${entities.length} entities${corpseSuffix}${tileSuffix}${tailSuffix})`;
    }
    case "hunt_analyzer_snapshot": {
      const { totalKills, rawXp, xp, partyMembers } = message.body.data;
      return `hunt_analyzer(kills=${totalKills}, rawXp=${rawXp}, xp=${xp}, party=${partyMembers.length})`;
    }
    case "kill_event":
      return `kill(xp=${message.body.data.xp})`;
    case "cooldown_update": {
      const { records } = message.body.data;
      const detail = records
        .map((record) => {
          const second =
            record.expiresAtB != null ? `, slot${record.slotB}@${record.expiresAtB}` : "";
          return `g${record.groupId}:slot${record.slotA}@${record.expiresAtA}${second}`;
        })
        .join(" ");
      return `cooldown_update(${records.length} records${detail ? ` ${detail}` : ""})`;
    }
    case "vitals": {
      const { records } = message.body.data;
      const detail = records
        .map((record) => {
          const fields = record.fields.map((field) => `bit${field.bit}=${field.value}`).join(",");
          return `${record.entityIndex}:{${fields}}`;
        })
        .join(" ");
      return `vitals(${records.length} records${detail ? ` ${detail}` : ""})`;
    }
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
    case "analyzer_stats": {
      const { subType, totals, gauge } = message.body.data;
      const totalsSuffix = totals
        ? `, totals=[${totals.valueA}, ${totals.valueB}, ${totals.valueC}, ${totals.valueD}] ${totals.ratio.toFixed(2)}%`
        : "";
      const gaugeSuffix = gauge
        ? `, gauge=0x${gauge.field.toString(16)} [${gauge.ratios.map((ratio) => `${ratio.toFixed(2)}%`).join(", ")}]`
        : "";
      return `analyzer_stats(sub=${subType}${totalsSuffix}${gaugeSuffix})`;
    }
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
    case "xp_summary": {
      const { xpGain, records } = message.body.data;
      const detail = records
        .map((record) => `+${record.xpGain}@${record.sessionXp}`)
        .join(" ");
      return `xp_summary(latest=+${xpGain}, ${records.length} records${detail ? ` ${detail}` : ""})`;
    }
    case "xp_gain": {
      const { xpGain, sessionXp, shares } = message.body.data;
      const shareSuffix =
        shares.length > 0
          ? `, shares=[${shares.map((share) => `${share.memberIndex}:${share.flag}`).join(", ")}]`
          : "";
      return `xp(+${xpGain}, session=${sessionXp}${shareSuffix})`;
    }
    case "session_metric":
      return `session(stamina=${message.body.data.staminaMs}ms)`;
    case "speech":
      return `speech(${message.body.data.entries
        .map((entry) => `#${entry.speakerIndex} "${entry.text}"`)
        .join(", ")})`;
    case "spell_cast": {
      const { strings, combatHits } = message.body.data;
      const monsterHits = combatHits.filter((hit) => hit.target === "monster").length;
      const hitSuffix = monsterHits > 0 ? `, ${monsterHits} monster hits` : "";
      return `spell(${strings.join(" / ")}${hitSuffix})`;
    }
    case "effect_area": {
      const { records } = message.body.data;
      const detail = records
        .map((record) => {
          const target = record.targetHandle ? `→${record.targetHandle}` : "";
          const ref = record.refId != null ? ` ref=${record.refId}` : "";
          return `0x${record.kind.toString(16)}@(${record.centerX},${record.centerY})×${record.tiles.length}${target}${ref}`;
        })
        .join(" ");
      return `effect_area(${records.length} records${detail ? ` ${detail}` : ""})`;
    }
    case "combat_float": {
      const { hits } = message.body.data;
      const detail = hits
        .map(
          (hit) =>
            `${hit.amount} on ${hit.runtimePlayerId}@(${hit.tileX},${hit.tileY}) cat=${hit.category}/0x${hit.kind.toString(16)}`
        )
        .join("; ");
      return `combat_float(${hits.length} hits${detail ? `: ${detail}` : ""})`;
    }
    case "auto_attack": {
      const { strings, combatHits } = message.body.data;
      const monsterHits = combatHits.filter((hit) => hit.target === "monster").length;
      const hitSuffix = monsterHits > 0 ? `, ${monsterHits} monster hits` : "";
      return `auto_attack(${strings.join(" / ")}${hitSuffix})`;
    }
    case "support_ability_cast": {
      const { entries } = message.body.data;
      const named = entries.filter((entry) => entry.strings.length > 0);
      const label =
        named.length > 0
          ? named.map((entry) => entry.strings.join(" / ")).join("; ")
          : `refresh, duration=${entries[0]?.durationMs ?? 0}ms`;
      const statusNames = entries
        .flatMap((entry) => entry.statusEffects ?? [])
        .map((status) => status.name);
      const statusSuffix =
        statusNames.length > 0 ? `, status: ${statusNames.join(", ")}` : "";
      return `support_ability(${label}${statusSuffix})`;
    }
    case "ground_item_update": {
      const { subType, count, items, extra, refValues, refFlags } = message.body.data;
      const itemSuffix = items?.length
        ? `, items=${items.length} [${items
            .slice(0, 3)
            .map((item) => `${item.itemId}x${item.amount}`)
            .join(", ")}${items.length > 3 ? ", …" : ""}]`
        : "";
      const refValueSuffix = refValues?.length
        ? `, refs=[${refValues
            .map((entry) => `${entry.ref}=${entry.value}`)
            .join(", ")}]`
        : "";
      const refFlagSuffix = refFlags?.length
        ? `, flags=[${refFlags
            .map((entry) => `${entry.ref}:${entry.flag}`)
            .join(", ")}]`
        : "";
      const extraSuffix = extra != null ? `, extra=${extra}` : "";
      return `ground_item(sub=${subType}, count=${count}${itemSuffix}${refValueSuffix}${refFlagSuffix}${extraSuffix})`;
    }
    case "entity_move": {
      const detail = message.body.data.records
        .map((record) => {
          const outfit = record.appearance ? `, lvl=${record.appearance.level}` : "";
          return `${record.name}: delta=${record.delta}, kind=${record.moveKind}, state=${record.state}${outfit}`;
        })
        .join("; ");
      return `entity_move(${detail})`;
    }
    case "entity_position": {
      const detail = message.body.data.records
        .map((record) => `${record.name}: delta=${record.delta}, state=${record.state}`)
        .join("; ");
      return `entity_position(${detail})`;
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
