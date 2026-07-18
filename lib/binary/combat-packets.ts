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
} from "./types.ts";

const SUPPORT_CAST_HEADER_LENGTH = 4;
const MAX_STRING_LENGTH = 256;

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
 * Type 0x12 support casts use a fixed 4-byte 0x01 header before consecutive strings.
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

/**
 * Support casts start with a 4-byte header (observed: 01 01 01 00 and
 * 01 03 01 01) followed by a u16 length-prefixed string. Bytes 0 and 2 are
 * always 0x01; validate the string length to avoid misrouting attack frames.
 */
function matchesSupportCastHeader(reader: BinaryReader): boolean {
  if (reader.remaining < SUPPORT_CAST_HEADER_LENGTH + 2) {
    return false;
  }

  const start = reader.position;
  const byteA = reader.u8();
  reader.u8();
  const byteC = reader.u8();
  reader.u8();
  const firstStringLength = reader.u16();
  reader.seek(start);

  return (
    byteA === 0x01 &&
    byteC === 0x01 &&
    firstStringLength > 0 &&
    firstStringLength <= MAX_STRING_LENGTH
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
  const header = {
    byteA: reader.u8(),
    byteB: reader.u8(),
    byteC: reader.u8(),
    byteD: reader.u8(),
  };
  const strings = decodeConsecutiveLengthPrefixedStrings(reader);
  const effectTail = decodeSupportAbilityCastEffectTail(reader);

  return { header, strings, effectTail, rawTail: new Uint8Array(0) };
}

function decodeSupportAbilityCastEffectTail(
  reader: BinaryReader
): SupportAbilityCastEffectTail | undefined {
  if (reader.remaining < 13) {
    return undefined;
  }

  const fieldA = reader.u8();
  const fieldB = reader.u16();
  const fieldC = reader.u32();
  const byteD = reader.u8();
  const byteE = reader.u8();
  const durationMs = reader.u16();
  reader.u16();
  const values: number[] = [];

  while (reader.remaining >= 4) {
    values.push(reader.u32());
  }

  return {
    fieldA,
    fieldB,
    fieldC,
    byteD,
    byteE,
    durationMs,
    values,
  };
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

function decodeConsecutiveLengthPrefixedStrings(reader: BinaryReader): string[] {
  const strings: string[] = [];

  while (reader.remaining >= 2) {
    const length = reader.u16();
    if (length === 0 || length > MAX_STRING_LENGTH || reader.remaining < length) {
      reader.seek(reader.position - 2);
      break;
    }

    strings.push(new TextDecoder().decode(reader.bytes(length)));
  }

  if (strings.length === 0) {
    throw new RangeError("Expected at least one length-prefixed string");
  }

  return strings;
}
