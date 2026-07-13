import { BinaryReader } from "./reader.ts";
import { decodeInventoryItemEntry } from "./inventory-snapshot.ts";
import type {
  AnalyzerStatsBody,
  CombatDamageBody,
  CounterTripletBody,
  DecodedHuntFrameBody,
  EntityRef,
  EntityUpdateBody,
  EntityUuidListBody,
  GroundItemUpdateBody,
  GroundLootBody,
  GroundLootDropEntry,
  GoldBalanceBody,
  HuntAnalyzerLootItem,
  HuntAnalyzerMonsterEntry,
  HuntAnalyzerPartyMember,
  HuntAnalyzerSnapshotBody,
  HuntEntitySpawnBody,
  HuntEntitySpawnEntry,
  ItemGrantBody,
  KillEventBody,
  PlayerVitalsBody,
  SessionMetricBody,
  StatusEffectBody,
  VitalDeltaBody,
  XpGainBody,
} from "../protocol-messages.ts";

export type {
  AnalyzerStatsBody,
  CombatDamageBody,
  CounterTripletBody,
  DecodedHuntFrameBody,
  EntityRef,
  EntityUpdateBody,
  EntityUuidListBody,
  GroundItemUpdateBody,
  GroundLootBody,
  GroundLootDropEntry,
  GoldBalanceBody,
  HuntAnalyzerLootItem,
  HuntAnalyzerMonsterEntry,
  HuntAnalyzerPartyMember,
  HuntAnalyzerSnapshotBody,
  HuntEntitySpawnBody,
  HuntEntitySpawnEntry,
  ItemGrantBody,
  KillEventBody,
  PlayerVitalsBody,
  SessionMetricBody,
  StatusEffectBody,
  VitalDeltaBody,
  XpGainBody,
};

const ENTITY_UUID_STRING_LENGTH = 36;
const ENTITY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HUNT_FRAME_MAX_ENTITY_COUNT = 100;
const HUNT_FRAME_MAX_DROP_COUNT = 100;

function isEntityUuidString(value: string): boolean {
  return value.length === ENTITY_UUID_STRING_LENGTH && ENTITY_UUID_PATTERN.test(value);
}

function readEntityUuid(reader: BinaryReader): string {
  const uuidLength = reader.u16();
  if (uuidLength !== ENTITY_UUID_STRING_LENGTH || reader.remaining < uuidLength) {
    throw new RangeError(`Expected uuid length ${ENTITY_UUID_STRING_LENGTH}, got ${uuidLength}`);
  }

  const uuid = new TextDecoder().decode(reader.bytes(uuidLength));
  if (!isEntityUuidString(uuid)) {
    throw new RangeError(`Invalid entity uuid: ${uuid}`);
  }

  return uuid;
}

function decodeGroundLoot(reader: BinaryReader, totalLootValue: number): GroundLootBody {
  reader.u32();
  const dropCount = reader.u16();
  if (dropCount <= 0 || dropCount > HUNT_FRAME_MAX_DROP_COUNT) {
    throw new RangeError(`Invalid ground loot drop count: ${dropCount}`);
  }

  const drops: GroundLootDropEntry[] = [];

  for (let index = 0; index < dropCount; index += 1) {
    if (index > 0) {
      reader.u32();
      reader.u16();
    }

    const groundUuid = readEntityUuid(reader);
    const itemId = reader.u32();
    const amount = reader.u32();
    drops.push({ groundUuid, itemId, amount });
  }

  if (reader.remaining === 8) {
    reader.u64();
  }

  return { subType: 1, totalLootValue, dropCount, drops };
}

function decodeItemGrant(reader: BinaryReader): ItemGrantBody {
  const groundUuid = new TextDecoder().decode(reader.bytes(ENTITY_UUID_STRING_LENGTH));
  if (!isEntityUuidString(groundUuid)) {
    throw new RangeError(`Invalid item grant uuid: ${groundUuid}`);
  }

  const itemId = reader.u32();
  const amount = reader.u32();
  if (reader.remaining === 8) {
    reader.u64();
  }

  return {
    subType: 0,
    groundUuid,
    itemId,
    amount,
  };
}

function decodeEntityUuidList(reader: BinaryReader, entityCount: number): EntityUuidListBody {
  const entityUuids: string[] = [];

  for (let index = 0; index < entityCount; index += 1) {
    entityUuids.push(readEntityUuid(reader));
  }

  return { subType: 0, entityCount, entityUuids };
}

/**
 * Hunt frame (0x0a) layout: u8 subType, u16 fieldA, u16 fieldB, then variant body.
 * Variants branch only on (subType, fieldA):
 *   (1, *)           → ground loot (fieldA = total loot value)
 *   (0, 0)           → entity uuid list (fieldB = entity count)
 *   (0, 1)           → item grant (fieldB = uuid length prefix, always 36)
 */
export function decodeHuntFrame(reader: BinaryReader): DecodedHuntFrameBody {
  const subType = reader.u8();
  const fieldA = reader.u16();
  const fieldB = reader.u16();

  if (subType === 1) {
    return {
      kind: "ground_loot",
      data: decodeGroundLoot(reader, fieldA),
    };
  }

  if (subType === 0 && fieldA === 0) {
    if (fieldB <= 0 || fieldB > HUNT_FRAME_MAX_ENTITY_COUNT) {
      throw new RangeError(`Invalid entity uuid list count: ${fieldB}`);
    }

    return {
      kind: "entity_uuid_list",
      data: decodeEntityUuidList(reader, fieldB),
    };
  }

  if (subType === 0 && fieldA === 1) {
    if (fieldB !== ENTITY_UUID_STRING_LENGTH) {
      throw new RangeError(`Item grant expects uuid length ${ENTITY_UUID_STRING_LENGTH}, got ${fieldB}`);
    }

    return {
      kind: "item_grant",
      data: decodeItemGrant(reader),
    };
  }

  throw new RangeError(`Unknown hunt frame variant subType=${subType} fieldA=${fieldA}`);
}

export function readEntityRef(reader: BinaryReader): EntityRef {
  const bytes = reader.bytes(8);
  return {
    bytes,
    hex: [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
}

export function decodeEntityUpdate(reader: BinaryReader): EntityUpdateBody {
  const subType = reader.u8();
  const indexA = reader.u16();
  const indexB = reader.u16();
  const entityRefs: EntityRef[] = [];

  while (reader.remaining >= 8) {
    entityRefs.push(readEntityRef(reader));
  }

  return { subType, indexA, indexB, entityRefs };
}

/** Type 0x09 full frame: u8 target, u16 statKind, u16 source, i32 delta, u32 extra (13 bytes). */
export function decodeVitalDelta(reader: BinaryReader): VitalDeltaBody {
  const targetIndex = reader.u8();
  const statKind = reader.u16();
  const sourceIndex = reader.u16();
  const delta = reader.i32();
  const extra = reader.u32();

  return { targetIndex, statKind, sourceIndex, delta, extra };
}

export function decodeCombatDamage(reader: BinaryReader): CombatDamageBody {
  const attackerIndex = reader.u8();
  reader.u8();
  const targetIndex = reader.u8();

  return {
    attackerIndex,
    targetIndex,
    damageKind: reader.u16(),
    amount: reader.u32(),
    flag: reader.u8(),
  };
}

/** Type 0x09 short frame: u8 indices + u16 damageKind + u16 amount (no flag). */
export function decodeCompactCombatDamage(reader: BinaryReader): CombatDamageBody {
  const attackerIndex = reader.u8();
  reader.u8();
  const targetIndex = reader.u8();

  return {
    attackerIndex,
    targetIndex,
    damageKind: reader.u16(),
    amount: reader.u16(),
    flag: 0,
  };
}

const HUNT_ANALYZER_PARTY_SCAN_START = 0x88;
const HUNT_ANALYZER_CLASSIC_LOOT_COUNT_OFFSET = 0xc6;
const HUNT_ANALYZER_CLASSIC_LOOT_ITEMS_OFFSET = 0xc8;
const HUNT_ANALYZER_COMPACT_LOOT_COUNT_OFFSET = 0xbe;
const HUNT_ANALYZER_COMPACT_LOOT_ITEMS_OFFSET = 0xc4;
const HUNT_ANALYZER_COMPACT_LAYOUT_MARKER_OFFSET = 0xb8;
const HUNT_ANALYZER_PLAYER_UUID_LENGTH = 36;
const HUNT_ANALYZER_PLAYER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HuntAnalyzerLayout {
  classic: boolean;
  lootItemCountOffset: number;
  lootItemsOffset: number;
}

function readU16At(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readU32At(buffer: Uint8Array, offset: number): number {
  return new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, true);
}

function detectHuntAnalyzerLayout(buffer: Uint8Array, start: number): HuntAnalyzerLayout {
  const usesCompactGoldTail =
    readU32At(buffer, start + HUNT_ANALYZER_COMPACT_LAYOUT_MARKER_OFFSET) === 0xffff_ffff;

  if (usesCompactGoldTail) {
    return {
      classic: false,
      lootItemCountOffset: HUNT_ANALYZER_COMPACT_LOOT_COUNT_OFFSET,
      lootItemsOffset: HUNT_ANALYZER_COMPACT_LOOT_ITEMS_OFFSET,
    };
  }

  return {
    classic: true,
    lootItemCountOffset: HUNT_ANALYZER_CLASSIC_LOOT_COUNT_OFFSET,
    lootItemsOffset: HUNT_ANALYZER_CLASSIC_LOOT_ITEMS_OFFSET,
  };
}

function readPaddedI64(reader: BinaryReader): number {
  return Number(reader.i64());
}

function skipNamePadding(reader: BinaryReader): void {
  while (reader.remaining >= 1 && reader.bufferView[reader.position] === 0) {
    reader.u8();
  }
}

function skipLeaderRowMarker(reader: BinaryReader): boolean {
  if (reader.remaining >= 1 && reader.bufferView[reader.position] === 0x01) {
    reader.u8();
    return true;
  }

  return false;
}

function readNameString(reader: BinaryReader): string {
  const length = reader.u16();
  return new TextDecoder().decode(reader.bytes(length));
}

function decodePartyMemberAt(buffer: Uint8Array, offset: number, firstMember: boolean): {
  member: HuntAnalyzerPartyMember;
  next: number;
} {
  const reader = new BinaryReader(buffer);
  reader.seek(offset);

  const uuidLength = reader.u16();
  if (uuidLength !== 36) {
    throw new RangeError(`Expected uuid length 36, got ${uuidLength}`);
  }
  const playerId = new TextDecoder().decode(reader.bytes(uuidLength));
  const name = readNameString(reader);
  skipNamePadding(reader);
  const isSummaryRow = skipLeaderRowMarker(reader);

  const lootTotalValue = readPaddedI64(reader);
  const suppliesGold = readPaddedI64(reader);
  const profitGold = readPaddedI64(reader);
  const balanceGold = readPaddedI64(reader);

  if (reader.remaining >= 8) {
    reader.skip(8);
  }

  const gapStart = reader.position;
  while (
    reader.position < buffer.length - 1 &&
    !(buffer[reader.position] === 0x24 && buffer[reader.position + 1] === 0)
  ) {
    reader.seek(reader.position + 1);
  }

  let huntTimeMs: number | undefined;
  const gapSize = reader.position - gapStart;
  if (!firstMember && gapSize === 8) {
    huntTimeMs = Number(new DataView(buffer.buffer, buffer.byteOffset + gapStart, 8).getBigInt64(0, true));
  }

  return {
    member: {
      playerId,
      name,
      lootTotalValue,
      suppliesGold,
      profitGold,
      balanceGold,
      huntTimeMs,
      isSummaryRow,
    },
    next: reader.position,
  };
}

function isPlayerUuidAt(buffer: Uint8Array, offset: number): boolean {
  if (offset + 2 + HUNT_ANALYZER_PLAYER_UUID_LENGTH > buffer.length) {
    return false;
  }

  if (readU16At(buffer, offset) !== HUNT_ANALYZER_PLAYER_UUID_LENGTH) {
    return false;
  }

  const uuid = new TextDecoder().decode(
    buffer.subarray(offset + 2, offset + 2 + HUNT_ANALYZER_PLAYER_UUID_LENGTH)
  );
  return HUNT_ANALYZER_PLAYER_UUID_PATTERN.test(uuid);
}

function findHuntAnalyzerPartyOffset(buffer: Uint8Array, start: number, searchFrom: number): number | undefined {
  const minimum = start + searchFrom;
  const limit = buffer.length - (HUNT_ANALYZER_PLAYER_UUID_LENGTH + 2);

  for (let offset = minimum; offset < limit; offset += 1) {
    if (isPlayerUuidAt(buffer, offset)) {
      return offset;
    }
  }

  return undefined;
}

function readHuntAnalyzerLootItems(
  buffer: Uint8Array,
  start: number,
  layout: HuntAnalyzerLayout,
  partyOffset: number
): HuntAnalyzerLootItem[] {
  const lootItemsOffset = start + layout.lootItemsOffset;
  const wireItemCount = readU16At(buffer, start + layout.lootItemCountOffset);
  const slotsBeforeParty = Math.floor((partyOffset - lootItemsOffset) / 8);
  const itemCount = Math.min(wireItemCount, Math.max(0, slotsBeforeParty));
  const lootItems: HuntAnalyzerLootItem[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const offset = lootItemsOffset + index * 8;
    lootItems.push({
      amount: readU32At(buffer, offset),
      itemId: readU32At(buffer, offset + 4),
    });
  }

  return lootItems;
}

function partyLeaderTotalsFromSummaryRow(
  partyMembers: HuntAnalyzerPartyMember[],
  summaryRow: HuntAnalyzerPartyMember
): HuntAnalyzerPartyMember {
  const baseline = partyMembers.find(
    (member) => member.playerId === summaryRow.playerId && !member.isSummaryRow
  );

  if (!baseline) {
    return summaryRow;
  }

  return {
    ...summaryRow,
    lootTotalValue: baseline.lootTotalValue,
    suppliesGold: baseline.suppliesGold,
    profitGold: baseline.profitGold,
    balanceGold: baseline.balanceGold,
  };
}

function decodePartyMembersFrom(
  buffer: Uint8Array,
  partyStart: number
): {
  partyMembers: HuntAnalyzerPartyMember[];
  partyLeaderTotals?: HuntAnalyzerPartyMember;
} {
  const partyMembers: HuntAnalyzerPartyMember[] = [];
  let partyLeaderTotals: HuntAnalyzerPartyMember | undefined;
  let offset = partyStart;
  let firstMember = true;

  while (offset < buffer.length - 20) {
    const uuidLength = buffer[offset] | (buffer[offset + 1] << 8);
    if (uuidLength !== HUNT_ANALYZER_PLAYER_UUID_LENGTH) {
      break;
    }

    const { member, next } = decodePartyMemberAt(buffer, offset, firstMember);
    if (member.isSummaryRow) {
      partyLeaderTotals = partyLeaderTotalsFromSummaryRow(partyMembers, member);
    } else {
      partyMembers.push(member);
    }

    offset = next;
    firstMember = false;
  }

  return { partyMembers, partyLeaderTotals };
}

export function decodeHuntAnalyzerSnapshot(reader: BinaryReader): HuntAnalyzerSnapshotBody {
  const start = reader.position;
  const subType = reader.u8();
  const sessionRefA = Number(reader.i64());
  const sessionRefB = Number(reader.i64());
  const buffer = reader.bufferView;
  const layout = detectHuntAnalyzerLayout(buffer, start);
  const partyOffset =
    findHuntAnalyzerPartyOffset(buffer, start, HUNT_ANALYZER_PARTY_SCAN_START) ?? start + 0x1c0;

  const sessionMetrics: number[] = [];
  for (let offset = start + 0x14; offset < start + 0x5c; offset += 8) {
    sessionMetrics.push(new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, true));
  }

  reader.seek(start + 0x62);
  const totalKills = reader.u32();
  reader.seek(start + 0x6a);
  const monsterCount = reader.u16();
  const primaryMonsterId = reader.u32();

  const monsters: HuntAnalyzerMonsterEntry[] = [];
  for (let index = 0; index < 3; index += 1) {
    const base = start + 0x70 + index * 8;
    reader.seek(base);
    monsters.push({
      killCount: reader.u32(),
      monsterId: reader.u32(),
    });
  }

  let rawXp = 0;
  let xp = 0;
  let lootBalanceGold = 0;
  let suppliesGold = 0;

  if (layout.classic) {
    reader.seek(start + 0x9c);
    rawXp = reader.u32();
    reader.seek(start + 0xa4);
    lootBalanceGold = reader.i64Safe();
    reader.seek(start + 0xb4);
    xp = reader.u32();
    reader.seek(start + 0xbc);
    suppliesGold = reader.i64Safe();
  } else {
    reader.seek(start + 0x2a);
    rawXp = Number(reader.i64());
    reader.seek(start + 0x3a);
    xp = Number(reader.i64());
    reader.seek(start + 0x94);
    suppliesGold = reader.u32();
    reader.seek(start + 0x9c);
    lootBalanceGold = reader.i64Safe();
  }

  const lootItems = readHuntAnalyzerLootItems(buffer, start, layout, partyOffset);
  const { partyMembers, partyLeaderTotals } = decodePartyMembersFrom(buffer, partyOffset);

  reader.seek(reader.length);

  return {
    subType,
    sessionRefA,
    sessionRefB,
    sessionMetrics,
    totalKills,
    monsterCount,
    primaryMonsterId,
    monsters,
    rawXp,
    lootBalanceGold,
    xp,
    suppliesGold,
    lootItems,
    partyMembers,
    partyLeaderTotals,
  };
}

/** Type 0x0b: u8 subType, u16 fieldA, u16 fieldB, then u32 metric words. */
export function decodeAnalyzerStats(reader: BinaryReader): AnalyzerStatsBody {
  const subType = reader.u8();
  const fieldA = reader.u16();
  const fieldB = reader.u16();
  const values: number[] = [];

  while (reader.remaining > 4) {
    values.push(reader.u32());
  }

  if (reader.remaining === 4) {
    values.push(reader.u32());
  } else if (reader.remaining === 2) {
    reader.u16();
  } else if (reader.remaining > 0) {
    reader.bytes(reader.remaining);
  }

  return { subType, fieldA, fieldB, values };
}

export function decodeSessionMetric(reader: BinaryReader): SessionMetricBody {
  const byteA = reader.u8();
  const byteB = reader.u16();
  const staminaMs = reader.u32();
  const field = reader.u32();
  if (reader.remaining > 0) {
    reader.u8();
  }

  return { byteA, byteB, staminaMs, field };
}

export function decodeXpGain(reader: BinaryReader): XpGainBody {
  const kind = reader.u32();
  const xpGain = reader.u32();
  const sessionXp = reader.u32();

  if (reader.remaining > 0) {
    reader.u16();
    const entryCount = reader.u8();
    if (entryCount > 0 && reader.remaining >= entryCount * 2) {
      reader.bytes(entryCount * 2);
    }
  }

  return { kind, xpGain, sessionXp };
}

/**
 * Player update (0x14) — 61-byte hunt reconnect layout.
 * Longer payloads use a separate extended layout until fully mapped.
 */
export function decodePlayerVitals(reader: BinaryReader, payloadLength = reader.remaining): PlayerVitalsBody {
  if (payloadLength === 107) {
    return decodeExtendedPlayerVitals(reader);
  }

  const start = reader.position;
  reader.u32();
  reader.u16();
  reader.u16();
  reader.u32();
  reader.u32();
  reader.u16();
  reader.u16();
  reader.u8();
  reader.u8();
  reader.u8();
  const currentMana = reader.u32();
  const huntTimeMs = reader.u32();
  reader.u32();
  reader.u8();
  reader.u8();
  reader.u8();
  reader.u8();
  reader.u8();
  reader.u32();
  const currentHp = reader.u32();
  reader.u32();
  reader.u32();
  reader.u8();
  reader.u8();
  reader.u8();
  reader.u8();
  reader.u8();

  return {
    currentHp,
    currentMana,
    huntTimeMs,
    raw: reader.bufferView.slice(start, reader.position),
  };
}

function decodeExtendedPlayerVitals(reader: BinaryReader): PlayerVitalsBody {
  const raw = reader.bytes(reader.remaining);

  return {
    currentHp: readU32At(raw, 44),
    currentMana: readU32At(raw, 24),
    huntTimeMs: readU32At(raw, 10),
    raw,
  };
}

/**
 * Hunt entity spawn (0x02):
 *   u16 declaredEntityCount, u16 huntId
 *   first entry: u16 uuidLen, uuid, u32 value, u32 extra
 *   further entries (marker 0x01): u8 marker, u8 fieldB, u32 fieldC, u32 fieldD,
 *     8-byte entityRef, u16 payloadLen, payload, u32 value, u32 extra
 *   trailing u32 flag words and a final u8
 */
export function decodeHuntEntitySpawn(reader: BinaryReader): HuntEntitySpawnBody {
  const entityCount = reader.u16();
  const huntId = reader.u16();
  const lureId = 0;
  const entities: HuntEntitySpawnEntry[] = [];

  const firstUuidLen = reader.u16();
  const firstUuid = new TextDecoder().decode(reader.bytes(firstUuidLen));
  entities.push({
    marker: 0,
    uuid: firstUuid,
    value: reader.u32(),
  });
  reader.u32();

  for (let index = 0; index < huntId - 1; index += 1) {
    const marker = reader.u8();
    const fieldB = reader.u8();
    const fieldC = reader.u32();
    const fieldD = reader.u32();
    reader.bytes(8);
    const payloadLen = reader.u16();
    const payload = reader.bytes(payloadLen);
    const uuid =
      payloadLen === ENTITY_UUID_STRING_LENGTH
        ? new TextDecoder().decode(payload)
        : "";
    const value = reader.u32();
    reader.u32();
    entities.push({
      marker,
      uuid,
      value,
      fieldB,
      fieldC,
      fieldD,
      payloadLen,
    });
  }

  if (reader.remaining > 0 && reader.bufferView[reader.position] === 0x01) {
    const marker = reader.u8();
    const fieldB = reader.u8();
    const fieldC = reader.u32();
    const fieldD = reader.u32();
    reader.bytes(8);
    const payloadLen = reader.u16();
    reader.bytes(payloadLen);
    reader.u32();
    reader.u32();
    entities.push({
      marker,
      uuid: "",
      value: 0,
      fieldB,
      fieldC,
      fieldD,
      payloadLen,
    });
  }

  const footerFlags: number[] = [];
  while (reader.remaining >= 4) {
    footerFlags.push(reader.u32());
  }
  if (reader.remaining > 0) {
    reader.u8();
  }

  return { entityCount, huntId, lureId, entities, footerFlags };
}

export function decodeKillEvent(reader: BinaryReader): KillEventBody {
  return {
    xp: reader.u32(),
    entityRef: readEntityRef(reader),
    flag: reader.u8(),
  };
}

/** Type 0x0c: three u32 fields (12 bytes). Wire kind is always 0 on observed traffic. */
export function decodeCounterTriplet(reader: BinaryReader): CounterTripletBody {
  const a = reader.u32();
  const b = reader.u32();
  const c = reader.u32();

  return { kind: 0, a, b, c };
}

export function decodeGoldBalance(reader: BinaryReader): GoldBalanceBody {
  const goldCoins = reader.u32();
  // Captures are 8-byte payloads: u32 gold + 4 zero bytes.
  if (reader.remaining >= 4) {
    reader.u32();
  } else if (reader.remaining > 0) {
    reader.bytes(reader.remaining);
  }

  return { goldCoins };
}

export function decodeStatusEffect(reader: BinaryReader): StatusEffectBody {
  const mode = reader.u8();
  const targetIndex = reader.u16();
  const effectId = reader.u16();
  const value = reader.u32();
  const duration = reader.u16();
  const flags = reader.u8();

  return { mode, targetIndex, effectId, value, duration, flags };
}

export function decodeGroundItemUpdate(reader: BinaryReader): GroundItemUpdateBody {
  const entityRef = {
    bytes: reader.bytes(8),
    hex: "",
  };
  entityRef.hex = [...entityRef.bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const subType = reader.u8();
  const count = reader.u8();

  let item: GroundItemUpdateBody["item"];
  if (count > 0 && reader.remaining >= 23) {
    reader.bytes(11);
    readEntityRef(reader);
    reader.u32();
  } else if (count > 0 && reader.remaining >= 30) {
    item = decodeInventoryItemEntry(reader) as GroundItemUpdateBody["item"];
  }

  return {
    entityRef,
    subType,
    count,
    item,
  };
}
