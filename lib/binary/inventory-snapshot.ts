import type { BinaryReader } from "./reader.ts";
import type { InventoryDepotSection, InventoryItemEntry, InventorySnapshotBody } from "./types.ts";

export const INVENTORY_ITEM_SIZE = 30;
const DEPOT_SECTION_TYPE = 20;
/** Low bit on flagsA: item is present/valid (also set on plain stacks). */
const INVENTORY_FLAG_HAS_STRING_ATTRS = 0x4;
const TIMING_REMAINING_MS_ATTR = /^timing_remaining_ms=(\d+)$/;

/**
 * Timed rings in use append a variable-length string-attr block after the
 * fixed 30-byte item record: u16 count, then count × (u16 len + utf8 bytes).
 * Observed when (flagsA & 0x4) !== 0, e.g. Energy/Stealth Ring with
 * `timing_remaining_ms=…`.
 */
export function readInventoryItemStringAttributes(
  reader: BinaryReader,
  flagsA: number
): string[] {
  if ((flagsA & INVENTORY_FLAG_HAS_STRING_ATTRS) === 0) {
    return [];
  }

  if (reader.remaining < 2) {
    return [];
  }

  const count = reader.u16();
  if (count <= 0 || count > 16) {
    throw new Error(`Unexpected inventory item attribute count: ${count}`);
  }

  const attributes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (reader.remaining < 2) {
      throw new Error("Truncated inventory item attribute length");
    }
    const length = reader.u16();
    if (length < 0 || length > 512 || reader.remaining < length) {
      throw new Error(`Unexpected inventory item attribute length: ${length}`);
    }
    const bytes = reader.bytes(length);
    attributes.push(new TextDecoder().decode(bytes));
  }
  return attributes;
}

function remainingUnitsFromFlagsAndAttributes(flagsA: number, attributes: string[]): number {
  for (const attribute of attributes) {
    const match = TIMING_REMAINING_MS_ATTR.exec(attribute);
    if (!match) {
      continue;
    }
    const ms = Number(match[1]);
    if (!Number.isFinite(ms) || ms <= 0) {
      return 0;
    }
    // Sellability compares against timmingMinutes; keep a non-zero minute
    // count while any duration remains so in-use rings are not treated as full.
    const minutes = Math.floor(ms / 60_000);
    return minutes > 0 ? minutes : 1;
  }

  return (flagsA >>> 16) & 0xffff;
}

export function decodeInventoryItemEntry(reader: BinaryReader): InventoryItemEntry {
  const start = reader.position;
  const uuid = reader.uuid();
  const itemId = reader.u16();
  reader.u16();
  const amount = reader.u32();
  const flagsA = reader.u32();
  const flagsB = reader.u16();

  const consumed = reader.position - start;
  if (consumed !== INVENTORY_ITEM_SIZE) {
    throw new Error(
      `Inventory item consumed ${consumed} bytes, expected ${INVENTORY_ITEM_SIZE}`
    );
  }

  const attributes = readInventoryItemStringAttributes(reader, flagsA);

  return {
    uuid,
    itemId,
    amount,
    flagsA,
    flagsB,
    remainingUnits: remainingUnitsFromFlagsAndAttributes(flagsA, attributes),
  };
}

function decodeInventoryItemList(reader: BinaryReader, count: number): InventoryItemEntry[] {
  const items: InventoryItemEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    items.push(decodeInventoryItemEntry(reader));
  }
  return items;
}

function tryDecodeAtBackpackCount(
  reader: BinaryReader,
  headerEnd: number,
  backpackCount: number,
  depotItemCount: number
): {
  items: InventoryItemEntry[];
  depot?: InventoryDepotSection;
  matchesDepotHeader: boolean;
} | null {
  reader.seek(headerEnd);
  if (reader.remaining < backpackCount * INVENTORY_ITEM_SIZE) {
    return null;
  }

  let items: InventoryItemEntry[];
  try {
    items = decodeInventoryItemList(reader, backpackCount);
  } catch {
    return null;
  }

  if (reader.remaining < 3) {
    return { items, depot: undefined, matchesDepotHeader: depotItemCount <= 0 };
  }

  if (reader.bufferView[reader.position] !== DEPOT_SECTION_TYPE) {
    // Valid backpack boundary with trailing non-depot payload (equipment/other sections).
    return { items, depot: undefined, matchesDepotHeader: false };
  }

  const sectionType = reader.u8();
  const sectionCount = reader.u16();
  if (sectionCount <= 0 || reader.remaining < sectionCount * INVENTORY_ITEM_SIZE) {
    return null;
  }

  let depotItems: InventoryItemEntry[];
  try {
    depotItems = decodeInventoryItemList(reader, sectionCount);
  } catch {
    return null;
  }

  const depot: InventoryDepotSection = {
    sectionType,
    items: depotItems,
  };

  return {
    items,
    depot,
    matchesDepotHeader: sectionCount === depotItemCount,
  };
}

export function decodeInventorySnapshot(reader: BinaryReader): InventorySnapshotBody {
  const goldCoins = reader.u32();
  const reserved = reader.u32();
  const depotItemCount = reader.u16Be();
  reader.u8();
  reader.u8();
  reader.u8();
  const capacity = reader.u16();
  reader.u16();
  const usedSlots = reader.u8();
  const unknownByte = reader.u8();

  const headerEnd = reader.position;
  let matchedHeader:
    | { items: InventoryItemEntry[]; depot?: InventoryDepotSection }
    | null = null;
  let fallback:
    | { items: InventoryItemEntry[]; depot?: InventoryDepotSection }
    | null = null;

  for (let backpackCount = usedSlots; backpackCount >= 0; backpackCount -= 1) {
    const attempt = tryDecodeAtBackpackCount(reader, headerEnd, backpackCount, depotItemCount);
    if (!attempt) {
      continue;
    }

    if (attempt.matchesDepotHeader) {
      matchedHeader = { items: attempt.items, depot: attempt.depot };
      break;
    }

    // Prefer usedSlots when the depot section count no longer matches the header
    // (seen when header reports aggregate counts but only a small type-20 section follows).
    if (!fallback || backpackCount === usedSlots) {
      fallback = { items: attempt.items, depot: attempt.depot };
    }
  }

  const chosen =
    matchedHeader ??
    fallback ?? {
      items:
        usedSlots > 0 && reader.length >= headerEnd + usedSlots * INVENTORY_ITEM_SIZE
          ? (() => {
              reader.seek(headerEnd);
              return decodeInventoryItemList(reader, usedSlots);
            })()
          : [],
      depot: undefined,
    };

  if (reader.remaining > 0) {
    reader.rest();
  }

  return {
    goldCoins,
    reserved,
    padding: 0,
    depotItemCount,
    capacity,
    usedSlots,
    unknownByte,
    items: chosen.items,
    depot: chosen.depot,
  };
}
