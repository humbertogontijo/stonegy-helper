import type { BinaryReader } from "./reader.ts";
import type { VisualUpdateBody } from "./types.ts";

const ENTITY_HANDLE_BYTES = 4;

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Type 0x1b visual/outfit-sync frame. The payload layout is not fully
 * understood yet, so this decoder only surfaces the parts observed to be
 * stable across samples and preserves the rest as `raw`:
 *
 *   u8   leadByte      — a leading discriminator that changes the tail layout
 *                        (observed values 1 and 3); its exact meaning is unconfirmed
 *   4    entityHandle  — compact entity handle (identical across samples for the
 *                        same entity)
 *   …    raw           — remaining bytes, not yet mapped
 */
export function decodeVisualUpdate(reader: BinaryReader): VisualUpdateBody {
  const leadByte = reader.u8();
  const entityHandle =
    reader.remaining >= ENTITY_HANDLE_BYTES ? toHex(reader.bytes(ENTITY_HANDLE_BYTES)) : "";
  const raw = reader.remaining > 0 ? reader.rest() : new Uint8Array(0);

  return { leadByte, entityHandle, raw };
}
