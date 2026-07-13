import { BinaryReader } from "./reader.ts";
import {
  STONEGY_BINARY_MAGIC,
  STONEGY_BINARY_VERSION,
  type BinaryEnvelope,
} from "./types.ts";

export function parseEnvelope(buffer: Uint8Array): BinaryEnvelope {
  const reader = new BinaryReader(buffer);

  const magicByteA = reader.u8();
  const magicByteB = reader.u8();
  const magic = String.fromCharCode(magicByteA, magicByteB);

  if (magic !== STONEGY_BINARY_MAGIC) {
    throw new Error(`Invalid Stonegy binary magic: ${JSON.stringify(magic)}`);
  }

  const version = reader.u8();
  const type = reader.u8();

  return {
    magic: STONEGY_BINARY_MAGIC,
    version,
    type,
    payloadOffset: reader.position,
  };
}

export function assertSupportedVersion(version: number) {
  if (version !== STONEGY_BINARY_VERSION) {
    throw new Error(`Unsupported Stonegy binary version: ${version}`);
  }
}
