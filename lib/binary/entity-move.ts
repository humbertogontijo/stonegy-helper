import type { BinaryReader } from "./reader.ts";
import type {
  EntityAppearance,
  EntityMoveBody,
  EntityMoveRecord,
  EntityPositionBody,
  EntityPositionRecord,
} from "./types.ts";

const APPEARANCE_COLOR_SLOTS = 4;

/**
 * Appearance/outfit block carried by moveKind=1 (spawn/appear) records.
 * Identical to the tail of a type-0x1f world-snapshot entity block:
 *
 *   u32 level, u8 fieldA, u16 fieldB, u32 looktype, u8 flag, u16 value,
 *   u32 reserved (0), 4 × { u8 marker (0x01), u8 r, u8 g, u8 b }
 *
 * The four color slots match outfit head/body/legs/feet colors.
 */
function decodeEntityAppearance(reader: BinaryReader): EntityAppearance {
  const level = reader.u32();
  const fieldA = reader.u8();
  const fieldB = reader.u16();
  const looktype = reader.u32();
  const flag = reader.u8();
  const value = reader.u16();
  const reserved = reader.u32();

  const colors: EntityAppearance["colors"] = [];
  for (let slot = 0; slot < APPEARANCE_COLOR_SLOTS; slot += 1) {
    colors.push({
      marker: reader.u8(),
      r: reader.u8(),
      g: reader.u8(),
      b: reader.u8(),
    });
  }

  return { level, fieldA, fieldB, looktype, flag, value, reserved, colors };
}

/**
 * Type 0x20 — u16 record count, then per record:
 *   u8 moveKind, name (u16 len prefix), i64 delta, u32 reserved, u8 state,
 *   moveKind=1 → appearance block (entity appearing in view carries its outfit)
 */
export function decodeEntityMove(reader: BinaryReader): EntityMoveBody {
  const recordCount = reader.u16();
  const records: EntityMoveRecord[] = [];

  for (let index = 0; index < recordCount; index += 1) {
    const moveKind = reader.u8();
    const name = reader.stringAsciiLengthPrefixed();
    const delta = reader.i64();
    const reserved = reader.u32();
    const state = reader.u8();
    const record: EntityMoveRecord = { moveKind, name, delta, reserved, state };
    if (moveKind === 1) {
      record.appearance = decodeEntityAppearance(reader);
    }
    records.push(record);
  }

  return { records };
}

/**
 * Type 0x21 — u16 record count, then per record:
 *   name (u16 len prefix), i32 delta, i32 fieldA, u32 fieldB, u8 state
 */
export function decodeEntityPosition(reader: BinaryReader): EntityPositionBody {
  const recordCount = reader.u16();
  const records: EntityPositionRecord[] = [];

  for (let index = 0; index < recordCount; index += 1) {
    records.push({
      name: reader.stringAsciiLengthPrefixed(),
      delta: reader.i32(),
      fieldA: reader.i32(),
      fieldB: reader.u32(),
      state: reader.u8(),
    });
  }

  return { records };
}
