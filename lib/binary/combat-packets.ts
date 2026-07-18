import {
  parseAutoAttackCombatRecords,
  parseCombatActors,
  parseSpellCastCombatRecords,
} from "./ability-combat-hits.ts";
import type { BinaryReader } from "./reader.ts";
import type {
  AutoAttackBody,
  SpellCastBody,
  SupportAbilityCastBody,
  SupportAbilityCastEffectTail,
  SupportAbilityCastEntry,
  SupportAbilityStatusEffect,
} from "./types.ts";

const MAX_STRING_LENGTH = 256;
const MAX_SUPPORT_CAST_ENTRIES = 8;
const SUPPORT_ENTRY_STRING_COUNT = 3;
/** Effect tail without optional extra: remaining + pad + flags(u16+u8+u8) + duration. */
const SUPPORT_EFFECT_TAIL_BASE = 4 + 1 + 2 + 1 + 1 + 4;

/**
 * spell_cast (0x1c): u8 stringCount + strings, u8 actorCount + actor records,
 * u16 recordCount + combat records. See ability-combat-hits.ts for layouts.
 */
export function decodeSpellCastPacket(reader: BinaryReader): SpellCastBody {
  const strings = decodeLengthPrefixedStrings(reader);
  const actors = parseCombatActors(reader, strings);
  const combatHits = parseSpellCastCombatRecords(reader, strings, actors);

  if (reader.remaining > 0) {
    throw new RangeError(
      `spell_cast frame has ${reader.remaining} unparsed trailing bytes`
    );
  }

  return { strings, actors, combatHits };
}

/**
 * Types 0x12/0x19 ability frames branch on the leading discriminator byte:
 *   0x00 (type 0x19 only) → combat_float (handled by decodeAutoAttackOrDamage)
 *   otherwise             → u8 string count + strings, then combat records
 * Type 0x12 support casts use u8 entryCount + per-entry (3-byte header + strings + effect).
 */
export function decodeAbilityCastPacket(
  reader: BinaryReader,
  wireType: number
): AutoAttackBody | SupportAbilityCastBody {
  const start = reader.position;
  const discriminator = reader.u8();

  if (discriminator === 0 && wireType === 0x19) {
    throw new RangeError("combat_float must be routed before ability cast decoding");
  }

  reader.seek(start);

  if (wireType === 0x12 && matchesSupportCastHeader(reader)) {
    return decodeSupportAbilityCastPacket(reader);
  }

  return decodeAutoAttackPacket(reader);
}

/** Observed support-cast header.byteA values (bit1/bit2 mark Magic Shield strength). */
const SUPPORT_CAST_BYTE_A = new Set([0x01, 0x03, 0x04]);

/** Continuation entries (no strings) open with byteA=0x02, byteB=byteC=0. */
const SUPPORT_CAST_CONTINUATION_BYTE_A = 0x02;

/**
 * Support casts start with u8 entryCount (1–8), then a compact 3-byte header
 * (observed byteA in {0x01, 0x03, 0x04}, byteB === 0x01) and a u16 length-prefixed
 * spell-code string. Auto-attack frames put stringCount then display names
 * directly — their second byte is a string length, not 0x01.
 *
 * Frames may also open with a headerless continuation entry (byteA=0x02,
 * byteB=byteC=0) followed by statusCount(0) + flagsB(1) — observed as a
 * standalone buff-tick refresh with no strings at all.
 */
function matchesSupportCastHeader(reader: BinaryReader): boolean {
  if (reader.remaining < 1 + 3 + 2) {
    return false;
  }

  const start = reader.position;
  const entryCount = reader.u8();
  const byteA = reader.u8();
  const byteB = reader.u8();
  const byteC = reader.u8();
  const firstStringLength = reader.u16();
  reader.seek(start);

  if (entryCount < 1 || entryCount > MAX_SUPPORT_CAST_ENTRIES) {
    return false;
  }

  if (
    byteA === SUPPORT_CAST_CONTINUATION_BYTE_A &&
    byteB === 0x00 &&
    byteC === 0x00
  ) {
    // firstStringLength here covers the statusCount + flagsB bytes: 0x0100.
    return firstStringLength === 0x0100;
  }

  return (
    byteB === 0x01 &&
    SUPPORT_CAST_BYTE_A.has(byteA) &&
    firstStringLength > 0 &&
    firstStringLength <= MAX_STRING_LENGTH &&
    reader.remaining >= 1 + 3 + 2 + firstStringLength
  );
}

/**
 * auto_attack (0x19/0x12): u8 stringCount + strings, u16 recordCount + combat
 * records. combat_float is the same record stream with an empty string table.
 */
export function decodeAutoAttackPacket(reader: BinaryReader): AutoAttackBody {
  const stringCount = reader.u8();
  const strings: string[] = [];
  for (let index = 0; index < stringCount; index += 1) {
    strings.push(readBoundedString(reader));
  }

  if (reader.remaining === 0) {
    return { strings, combatHits: [] };
  }

  const combatHits = parseAutoAttackCombatRecords(reader, strings);

  if (reader.remaining > 0) {
    throw new RangeError(
      `auto_attack frame has ${reader.remaining} unparsed trailing bytes`
    );
  }

  return { strings, combatHits };
}

export function decodeSupportAbilityCastPacket(reader: BinaryReader): SupportAbilityCastBody {
  const entryCount = reader.u8();
  if (entryCount < 1 || entryCount > MAX_SUPPORT_CAST_ENTRIES) {
    throw new RangeError(`Invalid support ability entry count: ${entryCount}`);
  }

  const entries: SupportAbilityCastEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    entries.push(decodeSupportAbilityCastEntry(reader));
  }

  if (reader.remaining > 0) {
    throw new RangeError(
      `support_ability_cast frame has ${reader.remaining} unparsed trailing bytes`
    );
  }

  const first = entries[0]!;
  const strings = entries.flatMap((entry) => entry.strings);
  const effectTail: SupportAbilityCastEffectTail = {
    remainingMs: first.remainingMs,
    flag: first.flag,
    durationMs: first.durationMs,
    values: first.values,
    ...(first.extra != null ? { extra: first.extra } : {}),
    ...(first.statusEffects != null ? { statusEffects: first.statusEffects } : {}),
  };

  return {
    entries,
    header: {
      byteA: first.header.byteA,
      byteB: first.header.byteB,
      byteC: first.header.byteC,
      byteD: 0,
    },
    strings,
    effectTail,
    rawTail: new Uint8Array(0),
  };
}

/**
 * Named entry (header.byteB === 1): 3 strings + full effect tail.
 * Continuation entry (header.byteB === 0, observed byteA=0x02 following a
 * status-carrying entry): no strings/remainingMs — just statusCount + tail end.
 */
function decodeSupportAbilityCastEntry(reader: BinaryReader): SupportAbilityCastEntry {
  const header = {
    byteA: reader.u8(),
    byteB: reader.u8(),
    byteC: reader.u8(),
  };

  if (header.byteB !== 1) {
    const statusEffects = decodeStatusEffectAttachments(reader);
    const end = decodeEffectTailEnd(reader);
    return {
      header,
      strings: [],
      remainingMs: 0,
      flag: end.flag,
      durationMs: end.durationMs,
      values: end.values,
      ...(statusEffects != null ? { statusEffects } : {}),
    };
  }

  const strings = decodeFixedLengthPrefixedStrings(reader, SUPPORT_ENTRY_STRING_COUNT);
  const effect = decodeSupportAbilityCastEffectTail(reader, header.byteA);

  return {
    header,
    strings,
    remainingMs: effect.remainingMs,
    flag: effect.flag,
    durationMs: effect.durationMs,
    values: effect.values,
    ...(effect.extra != null ? { extra: effect.extra } : {}),
    ...(effect.statusEffects != null ? { statusEffects: effect.statusEffects } : {}),
  };
}

/**
 * Per-entry effect after the string table:
 *   u32 remainingMs
 *   u8  pad (0)
 *   [u8 extra]? when header.byteA has bit 0x02 or 0x04 (Magic Shield = 100)
 *   u8  reserved (0)
 *   u8  statusCount, then statusCount × status-effect records
 *   u8  flagsB (1)
 *   u8  flag
 *   u32 durationMs
 *   6 × u32 values
 *
 * Observed byteA with extra: 0x03, 0x04. Without: 0x01.
 * (Earlier captures always had statusCount=0, which older code read together
 * with the reserved byte as a u16 flagsA=0.)
 */
function decodeSupportAbilityCastEffectTail(
  reader: BinaryReader,
  headerByteA: number
): SupportAbilityCastEffectTail {
  const hasExtra = (headerByteA & 0x06) !== 0;
  const minBytes = SUPPORT_EFFECT_TAIL_BASE + (hasExtra ? 1 : 0);
  if (reader.remaining < minBytes) {
    throw new RangeError(
      `support ability effect tail too short: remaining=${reader.remaining}, need=${minBytes}`
    );
  }

  const remainingMs = reader.u32();
  reader.u8(); // pad
  const extra = hasExtra ? reader.u8() : undefined;
  reader.u8(); // reserved
  const statusEffects = decodeStatusEffectAttachments(reader);
  const end = decodeEffectTailEnd(reader);

  return {
    remainingMs,
    flag: end.flag,
    durationMs: end.durationMs,
    values: end.values,
    ...(extra != null ? { extra } : {}),
    ...(statusEffects != null ? { statusEffects } : {}),
  };
}

const MAX_STATUS_EFFECT_ATTACHMENTS = 8;
const STATUS_EFFECT_UUID_LENGTH = 36;

/**
 * u8 statusCount + statusCount × {
 *   u16-prefixed uuid (36 chars),
 *   u16-prefixed element/name/iconPath strings,
 *   u32 totalDurationMs, u32 fieldA, u32 amount, u32 tickIntervalMs
 * }
 * Observed on Utamo Tempo refresh while Burning: FIRE/Burning, 25 per 4000ms.
 */
function decodeStatusEffectAttachments(
  reader: BinaryReader
): SupportAbilityStatusEffect[] | undefined {
  const statusCount = reader.u8();
  if (statusCount === 0) {
    return undefined;
  }
  if (statusCount > MAX_STATUS_EFFECT_ATTACHMENTS) {
    throw new RangeError(`Implausible status effect attachment count: ${statusCount}`);
  }

  const statusEffects: SupportAbilityStatusEffect[] = [];
  for (let index = 0; index < statusCount; index += 1) {
    const uuid = readBoundedString(reader);
    if (uuid.length !== STATUS_EFFECT_UUID_LENGTH) {
      throw new RangeError(`Invalid status effect uuid length: ${uuid.length}`);
    }
    statusEffects.push({
      uuid,
      element: readBoundedString(reader),
      name: readBoundedString(reader),
      iconPath: readBoundedString(reader),
      totalDurationMs: reader.u32(),
      fieldA: reader.u32(),
      amount: reader.u32(),
      tickIntervalMs: reader.u32(),
    });
  }

  return statusEffects;
}

/** Shared tail end: u8 flagsB (1), u8 flag, u32 durationMs, up to 6 × u32 values. */
function decodeEffectTailEnd(reader: BinaryReader): {
  flag: number;
  durationMs: number;
  values: number[];
} {
  reader.u8(); // flagsB
  const flag = reader.u8();
  const durationMs = reader.u32();
  const values: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    if (reader.remaining < 4) {
      break;
    }
    values.push(reader.u32());
  }

  return { flag, durationMs, values };
}

function readBoundedString(reader: BinaryReader): string {
  const length = reader.u16();
  if (length === 0 || length > MAX_STRING_LENGTH) {
    throw new RangeError(`Implausible combat frame string length: ${length}`);
  }
  return new TextDecoder().decode(reader.bytes(length));
}

function decodeLengthPrefixedStrings(reader: BinaryReader): string[] {
  const stringCount = reader.u8();
  const strings: string[] = [];

  for (let index = 0; index < stringCount; index += 1) {
    strings.push(readBoundedString(reader));
  }

  return strings;
}

function decodeFixedLengthPrefixedStrings(
  reader: BinaryReader,
  count: number
): string[] {
  const strings: string[] = [];
  for (let index = 0; index < count; index += 1) {
    strings.push(readBoundedString(reader));
  }
  return strings;
}
