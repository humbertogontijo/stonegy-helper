import { describe, expect, it } from "vitest";
import {
  connectionSnapshotFromStatus,
  connectionSnapshotFromWsEvent,
  isSocketOpen,
} from "./connection";
import { createReloadGrace } from "./reload-grace";

describe("page-bridge connection helpers", () => {
  it("detects an open socket", () => {
    expect(isSocketOpen({ connected: true, readyState: 1 })).toBe(true);
    expect(isSocketOpen({ connected: true, readyState: 0 })).toBe(false);
  });

  it("maps page status to connection snapshots", () => {
    expect(connectionSnapshotFromStatus({ connected: true, readyState: 1 })).toEqual({
      connected: true,
      readyState: 1,
    });
  });

  it("maps ws events to connection snapshots", () => {
    expect(connectionSnapshotFromWsEvent("ws:open")).toEqual({
      connected: true,
      readyState: 1,
    });
    expect(connectionSnapshotFromWsEvent("ws:connected", { readyState: 0 })).toEqual({
      connected: false,
      readyState: 0,
    });
  });
});

describe("createReloadGrace", () => {
  it("suppresses events during the grace window", () => {
    const grace = createReloadGrace(1_000);
    expect(grace.isActive()).toBe(false);
    grace.begin();
    expect(grace.isActive()).toBe(true);
  });
});
