import type { BinaryReader } from "./reader.ts";

export interface ClientAreaBody {
  mapName: string;
  coordA: number;
  coordB: number;
  fieldC: number;
  fieldD: number;
}

export function decodeClientAreaFrame(reader: BinaryReader): ClientAreaBody {
  const mapName = reader.stringAsciiLengthPrefixed();
  const coordA = reader.i32();
  const coordB = reader.i32();
  const fieldC = reader.u32();
  const fieldD = reader.u8();

  return { mapName, coordA, coordB, fieldC, fieldD };
}
