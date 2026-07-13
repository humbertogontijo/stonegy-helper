import type { BinaryReader } from "./reader.ts";
import type { HuntWorldSnapshotBody, WorldSnapshotEntity } from "./types.ts";

/** Per-entity block size after the length-prefixed name (validated on live frames). */
const ENTITY_BLOCK_BYTES = 47;
const ENTITY_POSITION_BYTES = 12;
const ENTITY_NAME_MAX = 64;

/**
 * Type 0x1f hunt-area world snapshot.
 *
 * Layout (validated: 32 entities tiled exactly on a fixed 47-byte block):
 *   u16  entityCount
 *   repeat entityCount times:
 *     u16   nameLen
 *     name[nameLen]
 *     i32   dx, i32 dy, i32 dz   — signed tile offsets from the player
 *     35    raw                  — remaining per-entity block (not yet mapped)
 *   tail                          — trailing tile/path section (not yet mapped)
 *
 * Parsing stops gracefully (dumping the remainder to `tail`) if an entity does
 * not fit the fixed layout, so unexpected frames degrade instead of throwing.
 */
export function decodeHuntWorldSnapshot(reader: BinaryReader): HuntWorldSnapshotBody {
  const entityCount = reader.u16();
  const entities: WorldSnapshotEntity[] = [];

  for (let index = 0; index < entityCount; index += 1) {
    if (reader.remaining < 2) {
      break;
    }

    const start = reader.position;
    const nameLen = reader.u16();
    if (
      nameLen === 0 ||
      nameLen > ENTITY_NAME_MAX ||
      reader.remaining < nameLen + ENTITY_BLOCK_BYTES
    ) {
      reader.seek(start);
      break;
    }

    const name = new TextDecoder().decode(reader.bytes(nameLen));
    const dx = reader.i32();
    const dy = reader.i32();
    const dz = reader.i32();
    const raw = reader.bytes(ENTITY_BLOCK_BYTES - ENTITY_POSITION_BYTES);

    entities.push({ name, dx, dy, dz, raw });
  }

  const tail = reader.remaining > 0 ? reader.rest() : new Uint8Array(0);

  return { entityCount, entities, tail };
}
