import { describe, expect, it } from "vitest";
import { sampleMarketSnapshotBrowse } from "./fixtures/snapshots";
import {
  backwardScanPageOrder,
  binarySearchResumePage,
  oldestReferenceOrderId,
  snapshotContainsOrderId,
} from "./scan-cursor";

describe("scan-cursor", () => {
  it("returns the last order id as the reference cursor", () => {
    expect(oldestReferenceOrderId(sampleMarketSnapshotBrowse)).toBe("buy-1346");
  });

  it("orders pages last→2", () => {
    expect(backwardScanPageOrder(8)).toEqual([8, 7, 6, 5, 4, 3, 2]);
  });

  it("respects the resume start page", () => {
    expect(backwardScanPageOrder(10, 4)).toEqual([4, 3, 2]);
  });

  it("finds the highest page containing a reference order id", () => {
    const contains = new Map<number, boolean>([
      [2, false],
      [3, false],
      [4, true],
      [5, true],
      [6, false],
    ]);

    expect(
      binarySearchResumePage(6, "ref", (page) => contains.get(page) ?? false)
    ).toBe(5);
  });

  it("detects when a snapshot contains a reference order id", () => {
    expect(snapshotContainsOrderId(sampleMarketSnapshotBrowse, "buy-1346")).toBe(true);
    expect(snapshotContainsOrderId(sampleMarketSnapshotBrowse, "missing")).toBe(false);
  });
});
