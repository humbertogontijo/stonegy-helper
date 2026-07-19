import { describe, expect, it } from "vitest";
import { resolveBoundTabAcceptance } from "./tab-binding";

describe("resolveBoundTabAcceptance", () => {
  it("claims the first tab that sends an event", () => {
    expect(resolveBoundTabAcceptance(null, 10)).toEqual({
      accept: true,
      nextBoundTabId: 10,
    });
  });

  it("accepts events from the bound tab", () => {
    expect(resolveBoundTabAcceptance(10, 10)).toEqual({
      accept: true,
      nextBoundTabId: 10,
    });
  });

  it("ignores events from other tabs", () => {
    expect(resolveBoundTabAcceptance(10, 20)).toEqual({
      accept: false,
      nextBoundTabId: 10,
    });
  });

  it("rejects events with no sender tab", () => {
    expect(resolveBoundTabAcceptance(10, undefined)).toEqual({
      accept: false,
      nextBoundTabId: 10,
    });
    expect(resolveBoundTabAcceptance(null, null)).toEqual({
      accept: false,
      nextBoundTabId: null,
    });
  });
});
