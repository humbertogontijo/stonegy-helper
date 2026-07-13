import { describe, expect, it } from "vitest";
import { jsonEqual } from "./usePersistedField";

describe("usePersistedField helpers", () => {
  it("jsonEqual compares by serialized value", () => {
    expect(jsonEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [1, 2])).toBe(true);
  });
});
