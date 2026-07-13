import { describe, expect, it } from "vitest";
import { BinaryReader } from "./reader.ts";

function bytesFromU64(value: bigint): Uint8Array {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, value, true);
  return new Uint8Array(buffer);
}

describe("BinaryReader safe integers", () => {
  it("u64 returns lossy Number for oversized protocol fields", () => {
    const reader = new BinaryReader(bytesFromU64(0x1000000_00000001n));
    const value = reader.u64();
    expect(typeof value).toBe("number");
    expect(Number.isFinite(value)).toBe(true);
  });

  it("u64Safe accepts market-scale prices", () => {
    const reader = new BinaryReader(bytesFromU64(1_250_000n));
    expect(reader.u64Safe()).toBe(1_250_000);
  });

  it("u64Safe rejects values above Number.MAX_SAFE_INTEGER", () => {
    const reader = new BinaryReader(bytesFromU64(BigInt(Number.MAX_SAFE_INTEGER) + 1n));
    expect(() => reader.u64Safe()).toThrow(/safe integer/);
  });

  it("i64Safe rejects unsafe magnitudes", () => {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigInt64(0, BigInt(Number.MAX_SAFE_INTEGER) + 10n, true);
    const reader = new BinaryReader(new Uint8Array(buffer));
    expect(() => reader.i64Safe()).toThrow(/safe integer/);
  });

  it("rejects negative skip counts", () => {
    const reader = new BinaryReader(new Uint8Array(4));
    expect(() => reader.skip(-1)).toThrow(/negative/);
  });
});
