import { BinaryReader } from "./reader.ts";
import {
  readInventoryItemStringAttributes,
  remainingUnitsFromFlagsAndAttributes,
} from "./inventory-snapshot.ts";
import type {
  AnalyzerStatsBody,
  CombatFloatBody,
  CounterTripletBody,
  DecodedHuntFrameBody,
  EffectAreaBody,
  EffectAreaRecord,
  EntityRef,
  CooldownUpdateBody,
  EntityUuidListBody,
  GroundItemUpdateBody,
  MonsterLootBody,
  MonsterLootDropEntry,
  GoldBalanceBody,
  HuntAnalyzerLootItem,
  HuntAnalyzerMonsterEntry,
  HuntAnalyzerPartyMember,
  HuntAnalyzerPartyTotals,
  HuntAnalyzerSnapshotBody,
  HuntEntitySpawnBody,
  HuntEntitySpawnCorpseEntry,
  HuntEntitySpawnLiveEntry,
  HuntEntitySpawnTile,
  HuntEntitySpawnTileFooter,
  ItemGrantBody,
  KillEventBody,
  SessionMetricBody,
  VitalsBody,
  XpGainBody,
  XpSummaryBody,
} from "../protocol-messages.ts";

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

/**
 * Shared per-item trailer after groundUuid: itemId/amount + charge flags.
 * Same layout as inventory snapshot flagsA (high word = remainingUnits) + flagsB.
 */
function readLootItemFields(reader: BinaryReader): Omit<MonsterLootDropEntry, "groundUuid"> {
  const itemId = reader.u32();
  const amount = reader.u32();
  const flagsA = reader.u32();
  const flagsB = reader.u16();
  return {
    itemId,
    amount,
    flagsA,
    flagsB,
    remainingUnits: (flagsA >>> 16) & 0xffff,
  };
}

function decodeMonsterLoot(reader: BinaryReader, totalLootValue: number): MonsterLootBody {
  reader.u32();
  const dropCount = reader.u16();
  // dropCount === 0 is a real empty-kill frame (no ground drops).
  if (dropCount < 0 || dropCount > HUNT_FRAME_MAX_DROP_COUNT) {
    throw new RangeError(`Invalid monster loot drop count: ${dropCount}`);
  }

  const drops: MonsterLootDropEntry[] = [];

  for (let index = 0; index < dropCount; index += 1) {
    const groundUuid = readEntityUuid(reader);
    drops.push({
      groundUuid,
      ...readLootItemFields(reader),
    });
  }

  // Captures end with a 2-byte zero pad after the last drop trailer.
  reader.consumeTrailingZeroPad();

  return { subType: 1, totalLootValue, dropCount, drops };
}

function decodeItemGrant(reader: BinaryReader): ItemGrantBody {
  // Same item fields as a single monster_loot drop; uuid length lives in frame
  // fieldB instead of a per-entry u16 prefix.
  const groundUuid = new TextDecoder().decode(reader.bytes(ENTITY_UUID_STRING_LENGTH));
  if (!isEntityUuidString(groundUuid)) {
    throw new RangeError(`Invalid item grant uuid: ${groundUuid}`);
  }

  const fields = readLootItemFields(reader);

  // Timed items (flagsA & 0x4) carry the same string-attribute block as
  // inventory items (e.g. `timing_remaining_ms=…` on rings).
  const attributes = readInventoryItemStringAttributes(reader, fields.flagsA);

  // Trailing uuid list: u16 count + count × (u16 len + uuid). Observed with a
  // single UUIDv7 entry — likely the source item/entity instance.
  const relatedUuids: string[] = [];
  if (reader.remaining >= 2) {
    const relatedCount = reader.u16();
    for (let index = 0; index < relatedCount; index += 1) {
      relatedUuids.push(readEntityUuid(reader));
    }
  }
  reader.consumeTrailingZeroPad();

  return {
    subType: 0,
    groundUuid,
    ...fields,
    remainingUnits: remainingUnitsFromFlagsAndAttributes(fields.flagsA, attributes),
    ...(attributes.length > 0 ? { attributes } : {}),
    ...(relatedUuids.length > 0 ? { relatedUuids } : {}),
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
 *   (1, *)           → monster loot (fieldA = total loot value)
 *   (0, 0)           → entity uuid list (fieldB = entity count)
 *   (0, 1)           → item grant (fieldB = uuid length, always 36; body matches one loot drop)
 */
export function decodeHuntFrame(reader: BinaryReader): DecodedHuntFrameBody {
  const subType = reader.u8();
  const fieldA = reader.u16();
  const fieldB = reader.u16();

  if (subType === 1) {
    return {
      kind: "monster_loot",
      data: decodeMonsterLoot(reader, fieldA),
    };
  }

  if (subType === 0 && fieldA === 0) {
    // Validate structurally: each uuid entry is u16 len + 36 chars = 38 bytes.
    // (Live captures reach 136+ entries, so a fixed cap is too strict.)
    if (fieldB <= 0 || fieldB * 38 > reader.remaining) {
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

/**
 * Type 0x08 — spell/potion cooldown sync:
 *   u16 recordCount
 *   recordCount × {
 *     u8  groupId,       // observed: 1 attack spells, 2 healing spells, 3 potions
 *     u8  slotA,         // spell/slot id inside the group; 0xff = group/global
 *     u8  slotB,         // 0 = no second expiry follows
 *     u64 expiresAtA,    // unix ms
 *     u64 expiresAtB     // unix ms, only when slotB != 0
 *   }
 *
 * Verified against a live HAR: every u64 is a unix-ms timestamp near the pong
 * `serverTime`; potion rows (group 3) land right after gold ticks with ~1s
 * expiry, heal rows track exura casts (~1s), and attack rows pair the spell
 * cooldown (+2s/+4s) with the group cooldown (+2s). Bootstrap frames sync
 * outstanding cooldowns using slotA=0xff plus per-slot expiries in B.
 */
export function decodeCooldownUpdate(reader: BinaryReader): CooldownUpdateBody {
  const recordCount = reader.u16();
  const records: CooldownUpdateBody["records"] = [];

  for (let i = 0; i < recordCount; i++) {
    const groupId = reader.u8();
    const slotA = reader.u8();
    const slotB = reader.u8();
    const expiresAtA = reader.u64Safe();

    records.push(
      slotB !== 0
        ? { groupId, slotA, slotB, expiresAtA, expiresAtB: reader.u64Safe() }
        : { groupId, slotA, slotB, expiresAtA }
    );
  }

  return { records };
}

/**
 * Type 0x09 — masked per-entity vital updates:
 *   u8 recordCount
 *   recordCount × { u8 entityIndex, u8 fieldMask, u32 value[popcount(mask)] }
 * Values are absolute current vitals (bit0 ≈ HP, bit2 ≈ mana), not deltas.
 */
export function decodeVitals(reader: BinaryReader): VitalsBody {
  const recordCount = reader.u8();
  const records: VitalsBody["records"] = [];

  for (let i = 0; i < recordCount; i++) {
    const entityIndex = reader.u8();
    const fieldMask = reader.u8();
    const fields: VitalsBody["records"][number]["fields"] = [];

    for (let bit = 0; bit < 8; bit++) {
      if ((fieldMask & (1 << bit)) !== 0) {
        fields.push({ bit, value: reader.u32() });
      }
    }

    records.push({ entityIndex, fieldMask, fields });
  }

  return { records };
}

/**
 * Type 0x19 combat float frame (after the 0x00 discriminator):
 *   u16 hitCount
 *   hitCount × {
 *     u8  category,          // 0 damage(/mana restore), 2 HP heal, 4 magic-shield
 *     u16 kind,              // (school << 8) | flags; bit7 of lo = restore
 *     u16 amount,
 *     i8  tileX, i8 tileY,   // affected player's tile (matches hunt:update_players)
 *     u8  runtimePlayerId    // matches hunt:update_players runtimePlayerId
 *   }
 *
 * Party-player floating numbers only (damage taken, heals, mana restore, shield
 * absorption) — not attacker→target monster damage.
 *
 * `kind` packing `(hiByte << 8) | loByte`:
 *   - hiByte ≈ school / element (observed):
 *       0x01 energy, 0x02 fire, 0x03 holy, 0x04 physical,
 *       0x05 mana, 0x06 life drain / heal (cat 2), 0x08 ice
 *       0x07 / 0x09 still unlabeled on floats
 *   - loByte ≈ flags + base (base 0x04 in all captures so far):
 *       bit7 set   → restore (mana heal uses lo 0x84)
 *       bit7 clear → damage / non-restore
 *
 * `category` 4 is magic-shield absorption (Utamo Vita) — damage paid from
 * mana. The `kind` hi byte still carries the incoming attack's element.
 */
export function decodeCombatFloat(reader: BinaryReader): CombatFloatBody {
  const hitCount = reader.u16();
  const hits: CombatFloatBody["hits"] = [];

  for (let i = 0; i < hitCount; i++) {
    hits.push({
      category: reader.u8(),
      kind: reader.u16(),
      amount: reader.u16(),
      tileX: reader.i8(),
      tileY: reader.i8(),
      runtimePlayerId: reader.u8(),
    });
  }

  return { hits };
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

function readNameString(reader: BinaryReader): string {
  const length = reader.u16();
  return new TextDecoder().decode(reader.bytes(length));
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

/**
 * Party section of type 0x05, starting at the first player uuid. Deterministic
 * loot-split layout (byte-exact on live/training/fresh-hunt frames):
 *
 *   leader totals block: uuid, name, 5 × i64 —
 *     lootTotalValue, suppliesGold, profitGold (= loot − supplies),
 *     profitPerMember (= profit / partySize, floored),
 *     remainderGold (division remainder, absorbed by the leader row)
 *   u16 memberCount
 *   memberCount × member row: uuid, name, u8 leaderFlag, 6 × i64 —
 *     lootTotalValue, suppliesGold, profitGold,
 *     transferGold (= share − own profit; positive receives, negative pays),
 *     receiveGold / payGold (transfer split into its two directions;
 *     both zero on the leader's own row — the leader executes the split)
 */
function decodePartySectionFrom(
  buffer: Uint8Array,
  partyStart: number
): {
  partyMembers: HuntAnalyzerPartyMember[];
  partyLeaderTotals?: HuntAnalyzerPartyTotals;
} {
  if (!isPlayerUuidAt(buffer, partyStart)) {
    return { partyMembers: [] };
  }

  const reader = new BinaryReader(buffer);
  reader.seek(partyStart);

  const partyLeaderTotals: HuntAnalyzerPartyTotals = {
    playerId: readNameString(reader),
    name: readNameString(reader),
    lootTotalValue: reader.i64Safe(),
    suppliesGold: reader.i64Safe(),
    profitGold: reader.i64Safe(),
    profitPerMember: reader.i64Safe(),
    remainderGold: reader.i64Safe(),
  };

  const memberCount = reader.u16();
  const partyMembers: HuntAnalyzerPartyMember[] = [];
  for (let index = 0; index < memberCount; index += 1) {
    partyMembers.push({
      playerId: readNameString(reader),
      name: readNameString(reader),
      isLeaderRow: reader.u8() === 1,
      lootTotalValue: reader.i64Safe(),
      suppliesGold: reader.i64Safe(),
      profitGold: reader.i64Safe(),
      transferGold: reader.i64Safe(),
      receiveGold: reader.i64Safe(),
      payGold: reader.i64Safe(),
    });
  }

  reader.assertExhausted("hunt_analyzer_snapshot party section");

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

  // Classic frames size the monster table by monsterCount (capped at 3 slots):
  // fresh-hunt snapshots with monsterCount=0 omit it entirely, shifting the
  // value block and loot table up by 24 bytes. Compact frames keep 3 slots.
  const monsterTableSlots = layout.classic ? Math.min(monsterCount, 3) : 3;
  const monsters: HuntAnalyzerMonsterEntry[] = [];
  for (let index = 0; index < monsterTableSlots; index += 1) {
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
    const valueBase = start + 0x70 + monsterTableSlots * 8;
    reader.seek(valueBase + 0x14);
    rawXp = reader.u32();
    reader.seek(valueBase + 0x1c);
    lootBalanceGold = reader.i64Safe();
    reader.seek(valueBase + 0x2c);
    xp = reader.u32();
    reader.seek(valueBase + 0x34);
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

  // Classic loot offsets assume the full 3-slot monster table (0xc6/0xc8);
  // shift them together with the value block when the table is shorter.
  const layoutForFrame = layout.classic
    ? {
        ...layout,
        lootItemCountOffset: 0x70 + monsterTableSlots * 8 + 0x3e,
        lootItemsOffset: 0x70 + monsterTableSlots * 8 + 0x40,
      }
    : layout;

  const lootItems = readHuntAnalyzerLootItems(buffer, start, layoutForFrame, partyOffset);
  const { partyMembers, partyLeaderTotals } = decodePartySectionFrom(buffer, partyOffset);

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

/**
 * Type 0x0b: u8 subType (bitfield) + u8 pad, then blocks selected by subType:
 *   bits 0x06 → totals: u64 valueA, u32 valueB, u64 valueC, u64 valueD, f32 ratio
 *   bit  0x08 → gauge: u16 field bitmask, one f32 ratio per set bit
 * Observed subTypes 6, 8, 14 all consume their payloads exactly under this
 * grammar (14 carries both blocks). Ratios look like percentages (13–96).
 */
export function decodeAnalyzerStats(reader: BinaryReader): AnalyzerStatsBody {
  const subType = reader.u8();
  reader.consumeZeroPad(1);

  const body: AnalyzerStatsBody = { subType };

  if ((subType & 0x06) !== 0) {
    body.totals = {
      valueA: reader.u64Safe(),
      valueB: reader.u32(),
      valueC: reader.u64Safe(),
      valueD: reader.u64Safe(),
      ratio: reader.f32(),
    };
  }

  if ((subType & 0x08) !== 0) {
    const field = reader.u16();
    const ratios: number[] = [];
    for (let mask = field; mask !== 0; mask &= mask - 1) {
      ratios.push(reader.f32());
    }
    body.gauge = { field, ratios };
  }

  return body;
}

export function decodeSessionMetric(reader: BinaryReader): SessionMetricBody {
  const byteA = reader.u8();
  const byteB = reader.u16();
  const staminaMs = reader.u32();
  const field = reader.u32();
  // Some captures append a single zero reserved byte.
  reader.consumeTrailingZeroPad();

  return { byteA, byteB, staminaMs, field };
}

/**
 * Type 0x15 — one xp record:
 *   u32 xpGain, u64 sessionXp, u16 memberCount,
 *   u8 shareCount, shareCount × { u8 memberIndex, u8 flag }
 * `sessionXp` accumulates per xp source across the session; `memberCount`
 * is ≥ shares.length (party size the record applies to). Flag semantics
 * unconfirmed (0/1 per member).
 */
export function decodeXpGain(reader: BinaryReader): XpGainBody {
  const xpGain = reader.u32();
  const sessionXp = reader.u64Safe();
  const memberCount = reader.u16();
  const shareCount = reader.u8();
  const shares: XpGainBody["shares"] = [];

  for (let index = 0; index < shareCount; index += 1) {
    shares.push({ memberIndex: reader.u8(), flag: reader.u8() });
  }

  return { xpGain, sessionXp, memberCount, shares };
}

/**
 * Type 0x14 (formerly misread as fixed-offset "player vitals") — xp record
 * batch on hunt bootstrap/reconnect:
 *   u32 xpGain (matches one record's xpGain), u16 recordCount,
 *   recordCount × type-0x15 record
 * Verified byte-exact against the historical 61/107-byte captures and live
 * 103-byte frames.
 */
export function decodeXpSummary(reader: BinaryReader): XpSummaryBody {
  const xpGain = reader.u32();
  const recordCount = reader.u16();
  const records: XpGainBody[] = [];

  for (let index = 0; index < recordCount; index += 1) {
    records.push(decodeXpGain(reader));
  }

  return { xpGain, records };
}

/** Tile footer after a non-empty nearby-tile list: flag + related ref + extra. */
const HUNT_SPAWN_TILE_FOOTER_SIZE = 13;

/**
 * Hunt entity spawn (0x02) — live monsters + nearby corpses + tile neighbourhood:
 *   u16 liveCount
 *   liveCount × {
 *     u8  marker,
 *     u32 runtimeIndex,
 *     u16 uuidLen(36) + uuid,
 *     u32 monsterId, u32 currentHp, u32 maxHp,
 *     i32 dx, i32 dy, u8 direction,
 *     u64 spawnedAt (unix ms; matches UUIDv7 timestamp)
 *   }
 *   u16 corpseCount
 *   corpseCount × {
 *     u16 uuidLen(36) + uuid,
 *     u32 monsterId, u32 corpseId,
 *     u8 flagA, u8 flagB,
 *     i32 dx, i32 dy,
 *     u64 timestamp (unix ms)
 *   }
 *   u16 tileCount
 *   tileCount × { i32 dx, i32 dy }
 *   when tileCount > 0:
 *     u8  flag,
 *     relatedEntityRef (8),
 *     u32 extra (often duration ms, e.g. 11000/12000)
 *   remaining all-zero pad (consumed) or rawTail (unmapped; treated as unknown)
 */
export function decodeHuntEntitySpawn(reader: BinaryReader): HuntEntitySpawnBody {
  const liveCount = reader.u16();
  if (liveCount > HUNT_FRAME_MAX_ENTITY_COUNT) {
    throw new RangeError(`Invalid hunt entity spawn live count: ${liveCount}`);
  }

  const entities: HuntEntitySpawnLiveEntry[] = [];
  for (let index = 0; index < liveCount; index += 1) {
    const marker = reader.u8();
    const runtimeIndex = reader.u32();
    const uuid = readEntityUuid(reader);
    entities.push({
      marker,
      runtimeIndex,
      uuid,
      monsterId: reader.u32(),
      currentHp: reader.u32(),
      maxHp: reader.u32(),
      dx: reader.i32(),
      dy: reader.i32(),
      direction: reader.u8(),
      spawnedAt: reader.u64Safe(),
    });
  }

  const corpseCount = reader.u16();
  if (corpseCount > HUNT_FRAME_MAX_ENTITY_COUNT) {
    throw new RangeError(`Invalid hunt entity spawn corpse count: ${corpseCount}`);
  }

  const corpses: HuntEntitySpawnCorpseEntry[] = [];
  for (let index = 0; index < corpseCount; index += 1) {
    const uuid = readEntityUuid(reader);
    corpses.push({
      uuid,
      monsterId: reader.u32(),
      corpseId: reader.u32(),
      flagA: reader.u8(),
      flagB: reader.u8(),
      dx: reader.i32(),
      dy: reader.i32(),
      timestamp: reader.u64Safe(),
    });
  }

  const { tiles, tileFooter } = decodeHuntEntitySpawnTiles(reader);

  // Empty tile section is often `u16 count=0` plus a trailing zero pad byte.
  reader.consumeTrailingZeroPad();
  const rawTail = reader.remaining > 0 ? reader.rest() : new Uint8Array(0);

  return {
    entities,
    corpses,
    tiles,
    ...(tileFooter ? { tileFooter } : {}),
    rawTail,
  };
}

/**
 * Third section: nearby tile offsets. When the count/footer layout does not fit,
 * the reader is rewound so leftovers stay in rawTail (forward-compatible).
 */
function decodeHuntEntitySpawnTiles(reader: BinaryReader): {
  tiles: HuntEntitySpawnTile[];
  tileFooter?: HuntEntitySpawnTileFooter;
} {
  if (reader.remaining < 2) {
    return { tiles: [] };
  }

  const mark = reader.position;
  const tileCount = reader.u16();
  const footerSize = tileCount > 0 ? HUNT_SPAWN_TILE_FOOTER_SIZE : 0;
  if (
    tileCount > HUNT_FRAME_MAX_ENTITY_COUNT ||
    reader.remaining < tileCount * 8 + footerSize
  ) {
    reader.seek(mark);
    return { tiles: [] };
  }

  const tiles: HuntEntitySpawnTile[] = [];
  for (let index = 0; index < tileCount; index += 1) {
    tiles.push({ dx: reader.i32(), dy: reader.i32() });
  }

  if (tileCount === 0) {
    return { tiles };
  }

  return {
    tiles,
    tileFooter: {
      flag: reader.u8(),
      relatedEntityRef: readEntityRef(reader),
      extra: reader.u32(),
    },
  };
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
  reader.consumeTrailingZeroPad();

  return { goldCoins };
}

/** Known kind bits on type 0x18 records — unknown bits fail the decode. */
const EFFECT_AREA_KNOWN_KIND_BITS = 0x47;

function bytesToHandleHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Type 0x18 (formerly misread as a fixed "status_effect" layout) — batched
 * effect/AoE area records:
 *   u16 recordCount
 *   recordCount × {
 *     u8 kind (bitfield), i8 centerX, i8 centerY,
 *     u8 tileCount, tileCount × { i8 dx, i8 dy },
 *     kind & 0x01 → sourceHandle (4 bytes),
 *     kind & 0x06 → targetHandle (4 bytes) + i8 targetDx + i8 targetDy,
 *     kind & 0x40 → u8 refId + f32 magnitude
 *   }
 * Tile lists trace spell areas (3×3 squares, radius-3 blobs); handles use the
 * same compact 4-byte format as visual_update entityHandle. Verified
 * byte-exact against kinds 0x00/0x01/0x07/0x41/0x47 in live captures.
 */
export function decodeEffectArea(reader: BinaryReader): EffectAreaBody {
  const recordCount = reader.u16();
  const records: EffectAreaRecord[] = [];

  for (let index = 0; index < recordCount; index += 1) {
    const kind = reader.u8();
    if ((kind & ~EFFECT_AREA_KNOWN_KIND_BITS) !== 0) {
      throw new RangeError(`Unknown effect area kind bits: 0x${kind.toString(16)}`);
    }

    const centerX = reader.i8();
    const centerY = reader.i8();
    const tileCount = reader.u8();
    const tiles: EffectAreaRecord["tiles"] = [];
    for (let tile = 0; tile < tileCount; tile += 1) {
      tiles.push({ dx: reader.i8(), dy: reader.i8() });
    }

    const record: EffectAreaRecord = { kind, centerX, centerY, tiles };

    if ((kind & 0x01) !== 0) {
      record.sourceHandle = bytesToHandleHex(reader.bytes(4));
    }
    if ((kind & 0x06) !== 0) {
      record.targetHandle = bytesToHandleHex(reader.bytes(4));
      record.targetDx = reader.i8();
      record.targetDy = reader.i8();
    }
    if ((kind & 0x40) !== 0) {
      record.refId = reader.u8();
      record.magnitude = reader.f32();
    }

    records.push(record);
  }

  return { records };
}

/** Compact drop notify: u32 reserved, u8 amount, u32 itemId (no entityRef). */
const GROUND_ITEM_DROP_NOTIFY_SIZE = 9;

export function decodeGroundItemUpdate(reader: BinaryReader): GroundItemUpdateBody {
  if (reader.remaining === GROUND_ITEM_DROP_NOTIFY_SIZE) {
    return decodeGroundItemDropNotify(reader);
  }

  const refList = tryDecodeGroundItemRefList(reader);
  if (refList) {
    return refList;
  }

  const entityRef = readEntityRef(reader);

  // Long form embeds backpack slot updates: header (9 bytes + u8 count) + count×27-byte
  // items, then an optional tile trailer. Short tile updates end with related entity +
  // u32 (timestamp + duration on aura tiles); appearance length is 11 (classic) or 5 (compact).
  if (reader.remaining > GROUND_ITEM_SHORT_BODY_SIZE) {
    const mark = reader.position;
    const headerFields = reader.bytes(GROUND_ITEM_LONG_HEADER_SIZE);
    const itemCount = reader.u8();
    const itemsStart = reader.position;
    const itemsBytes = itemCount * GROUND_ITEM_INVENTORY_ENTRY_SIZE;
    if (
      itemCount > 0 &&
      itemCount <= 64 &&
      reader.remaining >= itemsBytes &&
      isUuidV7At(reader.bufferView, itemsStart)
    ) {
      const items: GroundItemInventoryEntry[] = [];
      for (let index = 0; index < itemCount; index += 1) {
        items.push(decodeGroundItemInventoryEntry(reader));
      }
      const trailer = decodeGroundItemInventoryTrailer(reader);
      return {
        entityRef,
        subType: trailer.subType ?? 0,
        count: itemCount,
        header: Array.from(headerFields),
        items,
        appearance: trailer.appearance,
        relatedEntityRef: trailer.relatedEntityRef,
        extra: trailer.extra,
        item: items[0],
      };
    }
    reader.seek(mark);
  }

  const tile = decodeGroundItemTileTail(reader);
  if (!tile) {
    throw new RangeError(
      `Ground item update too short: remaining=${reader.remaining} after entityRef`
    );
  }

  return {
    entityRef,
    subType: tile.subType,
    count: tile.count,
    appearance: tile.appearance,
    relatedEntityRef: tile.relatedEntityRef,
    extra: tile.extra,
  };
}

const GROUND_ITEM_REF_LIST_MIN_SIZE = 10;
const GROUND_ITEM_REF_LIST_MAX_ENTRIES = 64;

/**
 * Type 0x1a ref/value list variant (10+ bytes, no entityRef):
 *   u8×3 reserved (0), u8 count
 *   count × { u16 ref, u16 value }
 *   u8 flagCount, flagCount × { u16 ref, u8 flag }
 *   u8 terminator (0)
 *
 * Refs are clustered per frame and grow across the session (1148/1149 →
 * 1641–1644 → 1707–1712 within ~35 min), which points at runtime
 * ground-entity indexes. The paired u16 value and u8 flag semantics are
 * unconfirmed. Either list may be empty (count=0 frames carry only flags).
 * Detection is structural: zero prefix + exact length match, so real
 * entityRef-headed frames (min 22 bytes) never collide.
 */
function tryDecodeGroundItemRefList(reader: BinaryReader): GroundItemUpdateBody | null {
  const buffer = reader.bufferView;
  const start = reader.position;
  const length = reader.remaining;

  if (length < GROUND_ITEM_REF_LIST_MIN_SIZE) {
    return null;
  }
  if (buffer[start] !== 0 || buffer[start + 1] !== 0 || buffer[start + 2] !== 0) {
    return null;
  }

  const count = buffer[start + 3];
  if (count > GROUND_ITEM_REF_LIST_MAX_ENTRIES) {
    return null;
  }

  const flagCountOffset = 4 + count * 4;
  if (flagCountOffset >= length) {
    return null;
  }
  const flagCount = buffer[start + flagCountOffset];
  if (flagCount > GROUND_ITEM_REF_LIST_MAX_ENTRIES) {
    return null;
  }
  if (count === 0 && flagCount === 0) {
    return null;
  }
  if (length !== flagCountOffset + 1 + flagCount * 3 + 1) {
    return null;
  }
  if (buffer[start + length - 1] !== 0) {
    return null;
  }

  reader.consumeZeroPad(3);
  const counted = reader.u8();
  if (counted !== count) {
    throw new RangeError(`ground item ref list count mismatch: peeked ${count}, read ${counted}`);
  }
  const refValues: { ref: number; value: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    refValues.push({ ref: reader.u16(), value: reader.u16() });
  }

  reader.u8(); // flagCount
  const refFlags: { ref: number; flag: number }[] = [];
  for (let index = 0; index < flagCount; index += 1) {
    refFlags.push({ ref: reader.u16(), flag: reader.u8() });
  }
  reader.u8(); // terminator

  return {
    subType: 0,
    count,
    ...(refValues.length > 0 ? { refValues } : {}),
    ...(refFlags.length > 0 ? { refFlags } : {}),
  };
}

/**
 * Type 0x1a compact drop notify (9 bytes):
 *   u32 reserved (0), u8 amount, u32 itemId
 * Observed repeatedly for stackable loot (e.g. Bakragore's Amalgamation).
 */
function decodeGroundItemDropNotify(reader: BinaryReader): GroundItemUpdateBody {
  reader.u32(); // reserved
  const amount = reader.u8();
  const itemId = reader.u32();
  const item = {
    uuid: "",
    itemId,
    amount,
    flagsA: 0,
    flagsB: 0,
    remainingUnits: 0,
    meta: 0,
    flags: 0,
    suffix: 0,
  };
  return {
    subType: 0,
    count: amount,
    items: [item],
    item,
  };
}

/** Classic short tile body: subType + count + 11 appearance + related(8) + extra(4). */
const GROUND_ITEM_SHORT_BODY_SIZE = 25;
/** Compact tile body seen on timed aura/effect tiles: same tail, shorter appearance. */
const GROUND_ITEM_SHORT_BODY_MIN = 14;
const GROUND_ITEM_LONG_HEADER_SIZE = 9;
const GROUND_ITEM_INVENTORY_ENTRY_SIZE = 27;
const GROUND_ITEM_TILE_TAIL_SIZE = 12;

function isUuidV7At(buffer: Uint8Array, offset: number): boolean {
  if (offset + 16 > buffer.length) {
    return false;
  }
  const version = (buffer[offset + 6] >> 4) & 0xf;
  return version === 7;
}

function decodeGroundItemInventoryEntry(reader: BinaryReader): GroundItemInventoryEntry {
  const uuid = reader.uuid();
  const itemId = reader.u16();
  // Live captures: uuid(16) + itemId(u16) + unk(u16) + unk(u8) + amount(u8) + flags(u32) + pad(u8).
  // Treating the middle dword as amount previously pulled flag bytes (and produced values like 256/512).
  const metaLow = reader.u16();
  const metaHigh = reader.u8();
  const amount = reader.u8();
  const flags = reader.u32();
  const suffix = reader.u8();
  const meta = (metaHigh << 16) | metaLow;
  return {
    uuid,
    itemId,
    amount,
    flagsA: 2,
    flagsB: 0,
    remainingUnits: 0,
    meta,
    flags,
    suffix,
  };
}

function decodeGroundItemTileTail(reader: BinaryReader): {
  subType: number;
  count: number;
  appearance: number[];
  relatedEntityRef: ReturnType<typeof readEntityRef>;
  extra: number;
} | null {
  // Anchor on the trailing relatedEntityRef(8) + extra/duration(4). Appearance
  // length varies: classic tiles use 11 bytes (25 total), compact aura tiles use 5 (19 total).
  if (reader.remaining < GROUND_ITEM_SHORT_BODY_MIN) {
    return null;
  }

  const prefixLen = reader.remaining - GROUND_ITEM_TILE_TAIL_SIZE;
  if (prefixLen < 2) {
    return null;
  }

  const subType = reader.u8();
  const count = reader.u8();
  const appearance = Array.from(reader.bytes(prefixLen - 2));
  const relatedEntityRef = readEntityRef(reader);
  const extra = reader.u32();
  return { subType, count, appearance, relatedEntityRef, extra };
}

/** After inventory slots, tail often ends with related entity + u32 (same as short form). */
function decodeGroundItemInventoryTrailer(reader: BinaryReader): {
  subType?: number;
  appearance?: number[];
  relatedEntityRef?: ReturnType<typeof readEntityRef>;
  extra?: number;
} {
  if (reader.remaining === 0) {
    return {};
  }

  if (reader.remaining >= 12) {
    const prefixLen = reader.remaining - 12;
    const appearance =
      prefixLen > 0 ? Array.from(reader.bytes(prefixLen)) : undefined;
    const relatedEntityRef = readEntityRef(reader);
    const extra = reader.u32();
    return { appearance, relatedEntityRef, extra };
  }

  throw new RangeError(
    `ground item trailer has ${reader.remaining} unparsed trailing bytes`
  );
}

export type GroundItemInventoryEntry = {
  uuid: string;
  itemId: number;
  amount: number;
  flagsA: number;
  flagsB: number;
  remainingUnits: number;
  meta: number;
  flags: number;
  suffix: number;
};
