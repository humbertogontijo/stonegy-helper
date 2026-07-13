import type { BinaryReader } from "./reader.ts";
import type {
  AutoAttackBody,
  SpellCastBody,
  SupportAbilityCastBody,
  SupportAbilityCastEffectTail,
} from "./types.ts";

const SPELL_EFFECT_RECORD_BYTES = 14;
const AUTO_ATTACK_TARGET_BYTES = 8;
const ABILITY_TARGET_BYTES = 9;
const AUTO_ATTACK_TIMESTAMP_BYTES = 8;
const SUPPORT_CAST_HEADER = [0x01, 0x01, 0x01, 0x00] as const;

function decodeSpellEffectRecords(reader: BinaryReader, maxRecords?: number): SpellCastBody["effects"] {
  const effects: SpellCastBody["effects"] = [];
  const limit = maxRecords ?? Number.POSITIVE_INFINITY;

  while (effects.length < limit && reader.remaining >= SPELL_EFFECT_RECORD_BYTES) {
    const fields: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      fields.push(reader.u16());
    }
    effects.push({ fields });
  }

  return effects;
}

function tryDecodeTrailingEffects(
  reader: BinaryReader,
  strings: string[]
): AutoAttackBody | null {
  const total = reader.remaining;
  if (total < SPELL_EFFECT_RECORD_BYTES) {
    return null;
  }

  const effectCount = Math.floor(total / SPELL_EFFECT_RECORD_BYTES);
  const slack = total - effectCount * SPELL_EFFECT_RECORD_BYTES;
  if (effectCount === 0 || slack > 2) {
    return null;
  }

  const effects = decodeSpellEffectRecords(reader, effectCount);
  if (slack > 0) {
    reader.bytes(slack);
  }

  return { ...emptyAutoAttack(strings), effects };
}

export function decodeSpellCastPacket(reader: BinaryReader): SpellCastBody {
  const strings = decodeLengthPrefixedStrings(reader);
  const header = {
    mode: reader.u8(),
    effectId: reader.u16(),
    fieldA: reader.u8(),
    fieldB: reader.u8(),
  };
  const effects = decodeSpellEffectRecords(reader);

  if (reader.remaining === 8) {
    reader.u64();
  }

  return { strings, header, effects };
}

/**
 * Types 0x12/0x19 ability frames branch on the leading discriminator byte:
 *   0x00 (type 0x19 only) → combat damage
 *   0x01–0x06             → u8 string-count + u16-length strings, then target/effect tail
 *   0x07+                 → consecutive u16-length strings (equipment-heavy casts)
 * Type 0x12 support casts use a fixed 4-byte 0x01 header before consecutive strings.
 */
export function decodeAbilityCastPacket(
  reader: BinaryReader,
  wireType: number
): AutoAttackBody | SupportAbilityCastBody {
  const start = reader.position;
  const discriminator = reader.u8();

  if (discriminator === 0 && wireType === 0x19) {
    throw new RangeError("Combat damage must be routed before ability cast decoding");
  }

  reader.seek(start);

  if (wireType === 0x12 && matchesSupportCastHeader(reader)) {
    return decodeSupportAbilityCastPacket(reader);
  }

  return decodeAutoAttackPacket(reader);
}

function matchesSupportCastHeader(reader: BinaryReader): boolean {
  if (reader.remaining < SUPPORT_CAST_HEADER.length) {
    return false;
  }

  const start = reader.position;
  for (const expected of SUPPORT_CAST_HEADER) {
    if (reader.u8() !== expected) {
      reader.seek(start);
      return false;
    }
  }

  reader.seek(start);
  return true;
}

export function decodeAutoAttackPacket(reader: BinaryReader): AutoAttackBody {
  const strings = decodeAutoAttackStrings(reader);

  if (reader.remaining === 0) {
    return emptyAutoAttack(strings);
  }

  const trailingEffects = tryDecodeTrailingEffects(reader, strings);
  if (trailingEffects) {
    return trailingEffects;
  }

  const prefix = reader.u16();
  const remainingAfterPrefix = reader.remaining;

  if (remainingAfterPrefix === prefix * ABILITY_TARGET_BYTES) {
    return {
      strings,
      targetCount: prefix,
      timestamp: 0,
      targets: readAbilityTargets(reader, prefix),
      effects: [],
    };
  }

  if (
    prefix > 0 &&
    remainingAfterPrefix === (prefix - 1) * ABILITY_TARGET_BYTES + AUTO_ATTACK_TARGET_BYTES
  ) {
    return {
      strings,
      targetCount: prefix,
      timestamp: 0,
      targets: readHybridAbilityTargets(reader, prefix),
      effects: [],
    };
  }

  if (
    remainingAfterPrefix >= AUTO_ATTACK_TIMESTAMP_BYTES &&
    remainingAfterPrefix - AUTO_ATTACK_TIMESTAMP_BYTES === prefix * AUTO_ATTACK_TARGET_BYTES
  ) {
    const timestamp = reader.u64();
    return {
      strings,
      targetCount: prefix,
      timestamp,
      targets: readAutoAttackTargets(reader, prefix),
      effects: [],
    };
  }

  if (
    remainingAfterPrefix >= AUTO_ATTACK_TIMESTAMP_BYTES &&
    remainingAfterPrefix - AUTO_ATTACK_TIMESTAMP_BYTES === prefix * ABILITY_TARGET_BYTES
  ) {
    const targets = readAbilityTargets(reader, prefix);
    const timestamp = reader.u64();
    return {
      strings,
      targetCount: prefix,
      timestamp,
      targets,
      effects: [],
    };
  }

  const targets = readBatchedAbilityTargets(reader);
  const timestamp = reader.remaining === AUTO_ATTACK_TIMESTAMP_BYTES ? reader.u64() : 0;

  return {
    strings,
    targetCount: targets.length,
    timestamp,
    targets,
    effects: [],
    batchLead: prefix,
  };
}

function readBatchedAbilityTargets(reader: BinaryReader): AutoAttackBody["targets"] {
  const targets: AutoAttackBody["targets"] = [];

  while (reader.remaining > AUTO_ATTACK_TIMESTAMP_BYTES) {
    targets.push(readAbilityTarget(reader, targets.length, targets.length + 1));
  }

  return targets;
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

function readAutoAttackTargets(reader: BinaryReader, targetCount: number): AutoAttackBody["targets"] {
  const targets: AutoAttackBody["targets"] = [];

  for (let index = 0; index < targetCount; index += 1) {
    if (reader.remaining < AUTO_ATTACK_TARGET_BYTES) {
      throw new RangeError(
        `Auto-attack target ${index + 1}/${targetCount} needs ${AUTO_ATTACK_TARGET_BYTES} bytes, but only ${reader.remaining} remain`
      );
    }

    targets.push({
      attackerIndex: reader.u8(),
      effectType: reader.u8(),
      paramA: reader.u16(),
      paramB: reader.u16(),
      paramC: reader.u16(),
    });
  }

  return targets;
}

function readHybridAbilityTargets(
  reader: BinaryReader,
  targetCount: number
): AutoAttackBody["targets"] {
  const targets: AutoAttackBody["targets"] = [];

  for (let index = 0; index < targetCount - 1; index += 1) {
    targets.push(readAbilityTarget(reader, index, targetCount));
  }

  if (reader.remaining < AUTO_ATTACK_TARGET_BYTES) {
    throw new RangeError(
      `Final auto-attack target needs ${AUTO_ATTACK_TARGET_BYTES} bytes, but only ${reader.remaining} remain`
    );
  }

  targets.push({
    attackerIndex: reader.u8(),
    effectType: reader.u8(),
    paramA: reader.u16(),
    paramB: reader.u16(),
    paramC: reader.u16(),
  });

  return targets;
}

function readAbilityTarget(
  reader: BinaryReader,
  index: number,
  targetCount: number
): AutoAttackBody["targets"][number] {
  if (reader.remaining < ABILITY_TARGET_BYTES) {
    throw new RangeError(
      `Ability target ${index + 1}/${targetCount} needs ${ABILITY_TARGET_BYTES} bytes, but only ${reader.remaining} remain`
    );
  }

  return {
    attackerIndex: reader.u8(),
    effectType: reader.u8(),
    paramA: reader.u16(),
    paramB: reader.u16(),
    paramC: reader.u16(),
    tail: reader.u8(),
  };
}

function readAbilityTargets(reader: BinaryReader, targetCount: number): AutoAttackBody["targets"] {
  const targets: AutoAttackBody["targets"] = [];

  for (let index = 0; index < targetCount; index += 1) {
    targets.push(readAbilityTarget(reader, index, targetCount));
  }

  return targets;
}

function decodeAutoAttackStrings(reader: BinaryReader): string[] {
  const lead = reader.u8();

  if (lead >= 7) {
    return decodeConsecutiveLengthPrefixedStrings(reader);
  }

  const strings: string[] = [];
  for (let index = 0; index < lead; index += 1) {
    strings.push(reader.stringAsciiLengthPrefixed());
  }

  return strings;
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

function decodeLengthPrefixedStrings(reader: BinaryReader): string[] {
  const stringCount = reader.u8();
  const strings: string[] = [];

  for (let index = 0; index < stringCount; index += 1) {
    strings.push(reader.stringAsciiLengthPrefixed());
  }

  return strings;
}

function decodeConsecutiveLengthPrefixedStrings(reader: BinaryReader): string[] {
  const strings: string[] = [];

  while (reader.remaining >= 2) {
    const length = reader.u16();
    if (length === 0 || length > 256 || reader.remaining < length) {
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

function emptyAutoAttack(strings: string[]): AutoAttackBody {
  return {
    strings,
    targetCount: 0,
    timestamp: 0,
    targets: [],
    effects: [],
  };
}
