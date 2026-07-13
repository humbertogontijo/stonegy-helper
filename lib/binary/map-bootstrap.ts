import type { BinaryReader } from "./reader.ts";
import type { MapBootstrapBody, MapBootstrapEntry } from "./types.ts";

const VALUE_TYPES = new Set([1, 2, 5, 6, 7]);
const VALID_TYPES = new Set([1, 2, 3, 5, 6, 7]);
const GROUP_END_MARKER = new Uint8Array([0x02, 0x00, 0x06, 0x02]);
const HEADER_SIZE = 16;

function isGroupEndMarker(reader: BinaryReader): boolean {
  if (reader.remaining < GROUP_END_MARKER.length) {
    return false;
  }

  const offset = reader.position;
  for (let index = 0; index < GROUP_END_MARKER.length; index += 1) {
    if (reader.slice(offset + index, offset + index + 1)[0] !== GROUP_END_MARKER[index]) {
      return false;
    }
  }

  return true;
}

function skipZeros(reader: BinaryReader) {
  while (reader.remaining > 0 && reader.slice(reader.position, reader.position + 1)[0] === 0) {
    reader.u8();
  }
}

function canReadEntry(reader: BinaryReader): boolean {
  return reader.remaining >= 4 && VALID_TYPES.has(reader.slice(reader.position + 2, reader.position + 3)[0]);
}

function readEntry(reader: BinaryReader): MapBootstrapEntry | null {
  skipZeros(reader);

  if (reader.remaining === 0) {
    return null;
  }

  if (isGroupEndMarker(reader)) {
    reader.skip(GROUP_END_MARKER.length);
    return null;
  }

  const key = reader.u16();
  const type = reader.u8();
  const sub = reader.u8();
  const entry: MapBootstrapEntry = { key, type, sub };

  if (type === 3) {
    entry.children = [];
    skipZeros(reader);

    while (reader.remaining > 0) {
      if (isGroupEndMarker(reader)) {
        reader.skip(GROUP_END_MARKER.length);
        break;
      }

      if (canReadEntry(reader)) {
        const child = readEntry(reader);
        if (child) {
          entry.children.push(child);
        }
        continue;
      }

      entry.blob = reader.rest();
      break;
    }

    return entry;
  }

  if (VALUE_TYPES.has(type)) {
    entry.value = reader.u32();
    return entry;
  }

  entry.raw = reader.u32();
  return entry;
}

export function decodeMapBootstrap(reader: BinaryReader): MapBootstrapBody {
  const mapId = reader.u32();
  const schemaVersion = reader.u16();
  const reserved = reader.u16();
  reader.skip(HEADER_SIZE - reader.position);

  const sections: MapBootstrapEntry[] = [];
  while (reader.remaining > 0) {
    skipZeros(reader);
    if (reader.remaining === 0) {
      break;
    }

    const section = readEntry(reader);
    if (section) {
      sections.push(section);
    }
  }

  return {
    mapId,
    schemaVersion,
    reserved,
    sections,
  };
}

export function countMapBootstrapBlobs(entries: MapBootstrapEntry[]): number {
  let count = 0;

  for (const entry of entries) {
    if (entry.blob?.length) {
      count += 1;
    }
    if (entry.children?.length) {
      count += countMapBootstrapBlobs(entry.children);
    }
  }

  return count;
}

export function sumMapBootstrapBlobBytes(entries: MapBootstrapEntry[]): number {
  let total = 0;

  for (const entry of entries) {
    if (entry.blob?.length) {
      total += entry.blob.length;
    }
    if (entry.children?.length) {
      total += sumMapBootstrapBlobBytes(entry.children);
    }
  }

  return total;
}

export function findFirstMapBlob(entries: MapBootstrapEntry[]): MapBootstrapEntry | null {
  for (const entry of entries) {
    if (entry.blob?.length) {
      return entry;
    }
    if (entry.children?.length) {
      const found = findFirstMapBlob(entry.children);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

export function serializeMapBootstrapEntry(entry: MapBootstrapEntry): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    key: entry.key,
    type: entry.type,
    sub: entry.sub,
  };

  if (entry.value !== undefined) {
    serialized.value = entry.value;
  }
  if (entry.raw !== undefined) {
    serialized.raw = entry.raw;
  }
  if (entry.blob?.length) {
    serialized.blobLength = entry.blob.length;
  }
  if (entry.children?.length) {
    serialized.children = entry.children.map(serializeMapBootstrapEntry);
  }

  return serialized;
}
