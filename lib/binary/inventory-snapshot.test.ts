import { describe, expect, it } from "vitest";
import { decodeBinaryMessage, isInventorySnapshot } from "./decode.ts";
import {
  binaryFixtures,
  expectedInventoryDepotItemIdsWithTimingAttr,
  expectedInventoryItemsWithTimingAttr,
} from "./fixtures/session-traffic.ts";
import { winterCourtTrafficFixtures } from "./fixtures/winter-court-traffic.ts";
import { BinaryReader } from "./reader.ts";
import { decodeInventorySnapshot, INVENTORY_ITEM_SIZE } from "./inventory-snapshot.ts";

function writeUuid(bytes: Uint8Array, offset: number, fill: number) {
  bytes[offset] = 0x01;
  bytes[offset + 1] = 0x9f;
  for (let i = 2; i < 16; i += 1) {
    bytes[offset + i] = (fill + i) & 0xff;
  }
}

function writeItem(bytes: Uint8Array, offset: number, itemId: number, amount: number, fill: number) {
  writeUuid(bytes, offset, fill);
  bytes[offset + 16] = itemId & 0xff;
  bytes[offset + 17] = (itemId >> 8) & 0xff;
  bytes[offset + 18] = 0;
  bytes[offset + 19] = 0;
  bytes[offset + 20] = amount & 0xff;
  bytes[offset + 21] = (amount >> 8) & 0xff;
  bytes[offset + 22] = (amount >> 16) & 0xff;
  bytes[offset + 23] = (amount >> 24) & 0xff;
  // flagsA + flagsB + remainingUnits derived at decode time
  for (let i = 24; i < INVENTORY_ITEM_SIZE; i += 1) {
    bytes[offset + i] = 0;
  }
}

describe("decodeInventorySnapshot", () => {
  it("keeps backpack items when depot section count does not match header", () => {
    const backpackCount = 2;
    const depotSectionCount = 1;
    const headerDepotCount = 98;
    const headerSize = 19;
    const bytes = new Uint8Array(
      headerSize + backpackCount * INVENTORY_ITEM_SIZE + 3 + depotSectionCount * INVENTORY_ITEM_SIZE
    );

    // goldCoins = 100
    bytes[0] = 100;
    // reserved = 0
    // depotItemCount BE = 98
    bytes[8] = 0;
    bytes[9] = headerDepotCount;
    // 3 padding bytes
    // capacity = 1000 LE
    bytes[13] = 232;
    bytes[14] = 3;
    // u16 padding
    // usedSlots
    bytes[17] = backpackCount;
    bytes[18] = 0;

    writeItem(bytes, headerSize, 584, 1, 10);
    writeItem(bytes, headerSize + INVENTORY_ITEM_SIZE, 289, 1, 20);

    const sectionOffset = headerSize + backpackCount * INVENTORY_ITEM_SIZE;
    bytes[sectionOffset] = 20;
    bytes[sectionOffset + 1] = depotSectionCount;
    bytes[sectionOffset + 2] = 0;
    writeItem(bytes, sectionOffset + 3, 534, 1, 30);

    const decoded = decodeInventorySnapshot(new BinaryReader(bytes));
    expect(decoded.usedSlots).toBe(backpackCount);
    expect(decoded.depotItemCount).toBe(headerDepotCount);
    expect(decoded.items).toHaveLength(backpackCount);
    expect(decoded.items.map((item) => item.itemId)).toEqual([584, 289]);
    expect(decoded.depot?.items).toHaveLength(depotSectionCount);
    expect(decoded.depot?.items[0]?.itemId).toBe(534);
  });

  it("skips timing_remaining_ms attribute blobs between fixed item records", () => {
    const message = decodeBinaryMessage(binaryFixtures.inventorySnapshotWithTimingAttr);
    expect(isInventorySnapshot(message)).toBe(true);
    if (!isInventorySnapshot(message)) {
      throw new Error("expected inventory snapshot");
    }

    const { data } = message.body;
    expect(data.goldCoins).toBe(176653);
    expect(data.usedSlots).toBe(15);
    expect(data.items.map((item) => item.itemId)).toEqual([...expectedInventoryItemsWithTimingAttr]);
    expect(data.depot?.sectionType).toBe(20);
    expect(data.depot?.items.map((item) => item.itemId)).toEqual([
      ...expectedInventoryDepotItemIdsWithTimingAttr,
    ]);

    const timedRing = data.items[2];
    expect(timedRing?.itemId).toBe(705);
    expect(timedRing?.flagsA & 0x4).toBe(0x4);
    // timing_remaining_ms=578796 → 9 minutes remaining (in use, not full)
    expect(timedRing?.remainingUnits).toBe(9);
  });

  it("skips timing attrs on depot items (winter court stealth ring)", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.inventorySnapshot);
    expect(isInventorySnapshot(message)).toBe(true);
    if (!isInventorySnapshot(message)) {
      throw new Error("expected inventory snapshot");
    }

    const stealth = message.body.data.depot?.items.find((item) => item.itemId === 250);
    expect(stealth).toBeTruthy();
    expect(stealth!.flagsA & 0x4).toBe(0x4);
    // timing_remaining_ms=597599 → 9 minutes
    expect(stealth!.remainingUnits).toBe(9);
    expect(message.body.data.depot?.items).toHaveLength(12);
  });
});
