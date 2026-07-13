import type { BinaryReader } from "./reader.ts";
import type { EntityMoveBody, EntityPositionBody } from "./types.ts";

export function decodeEntityMove(reader: BinaryReader): EntityMoveBody {
  const entityIndex = reader.u16();
  const moveKind = reader.u8();
  const name = reader.stringAsciiLengthPrefixed();
  const delta = reader.i64();
  const reserved = reader.u32();
  const state = reader.u8();

  return {
    entityIndex,
    moveKind,
    name,
    delta,
    reserved,
    state,
  };
}

export function decodeEntityPosition(reader: BinaryReader): EntityPositionBody {
  const entityIndex = reader.u16();
  const name = reader.stringAsciiLengthPrefixed();
  const delta = reader.i32();
  const fieldA = reader.u32();
  const fieldB = reader.u32();
  const state = reader.u8();

  return {
    entityIndex,
    name,
    delta,
    fieldA,
    fieldB,
    state,
  };
}
