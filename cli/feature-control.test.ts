import { describe, expect, it, vi } from "vitest";
import {
  canArmFeature,
  defaultFeatureMasters,
  getFeatureMasterOffPatch,
} from "../lib/core/features/feature-control";
import {
  isSubFeatureLocked,
  setFeatureMaster,
  setSubFeatureEnabled,
} from "./feature-control";
import { GameSession } from "../lib/core/session";
import type { Transport } from "../lib/core/transport";
import { defaultSettings } from "../lib/core/settings";
import type { FeatureMasterMap } from "./config";

function createMockTransport(): Transport {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    onConnectionChange: vi.fn(),
    close: vi.fn(),
  };
}

function createTestContext(masters: Partial<FeatureMasterMap> = {}) {
  const transport = createMockTransport();
  const session = new GameSession(transport, { settings: defaultSettings() });
  const featureMasters = { ...defaultFeatureMasters(), ...masters };
  return {
    session,
    featureMasters,
    getState: () => session.botState,
  };
}

describe("getFeatureMasterOffPatch", () => {
  it("clears market settings", () => {
    expect(getFeatureMasterOffPatch("market")).toEqual({
      marketScanEnabled: false,
      marketAutoBuyEnabled: false,
    });
  });

  it("clears hunt auto-hunt when hunt master turns off", () => {
    expect(getFeatureMasterOffPatch("hunt")).toEqual({
      autoHuntEnabled: false,
    });
  });

  it("clears loot split with loot settings", () => {
    expect(getFeatureMasterOffPatch("loot").autoSplitLootOnHuntFinished).toBe(false);
  });

  it("clears party tools with tools settings", () => {
    expect(getFeatureMasterOffPatch("tools")).toEqual({
      autoConfirmReadyCheck: false,
      autoAcceptPartyInvite: false,
      autoTrainingEnabled: false,
    });
  });

  it("clears tasker settings when tasks master turns off", () => {
    expect(getFeatureMasterOffPatch("tasks")).toEqual({
      autoTaskerEnabled: false,
      taskerPhase: "idle",
      taskerStatus: "",
      taskerTargetHuntId: null,
    });
  });
});

describe("canArmFeature", () => {
  it("blocks loot when market is disarmed", () => {
    const masters = defaultFeatureMasters();
    masters.market = false;
    const result = canArmFeature("loot", masters);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Market");
    }
  });

  it("allows market with no dependencies", () => {
    const masters = defaultFeatureMasters();
    const result = canArmFeature("market", masters);
    expect(result.ok).toBe(true);
  });
});

describe("setFeatureMaster", () => {
  it("arms a feature when dependencies are met", async () => {
    const ctx = createTestContext({ market: true });
    const result = await setFeatureMaster(ctx, "loot", true);
    expect(result.ok).toBe(true);
    expect(ctx.featureMasters.loot).toBe(true);
  });

  it("disarms and clears market settings", async () => {
    const ctx = createTestContext({ market: true });
    ctx.session.updateSettings({ marketScanEnabled: true, marketAutoBuyEnabled: true });
    const result = await setFeatureMaster(ctx, "market", false);
    expect(result.ok).toBe(true);
    expect(ctx.session.settings.marketScanEnabled).toBe(false);
    expect(ctx.session.settings.marketAutoBuyEnabled).toBe(false);
  });
});

describe("isSubFeatureLocked", () => {
  it("locks sub-features when master is off", () => {
    const ctx = createTestContext({ market: false });
    expect(isSubFeatureLocked(ctx, "market.intervalScan")).toBe(true);
  });

  it("unlocks sub-features when master is on", () => {
    const ctx = createTestContext({ market: true });
    expect(isSubFeatureLocked(ctx, "market.intervalScan")).toBe(false);
  });

  it("locks only battle lure when auto tasker is running with max lure", () => {
    const ctx = createTestContext({ battle: true, loot: true, hunt: true });
    ctx.session.updateSettings({ autoTaskerEnabled: true, taskerMaxLure: true });
    expect(isSubFeatureLocked(ctx, "battle.lockLure")).toBe(true);
    expect(isSubFeatureLocked(ctx, "battle.placePosition")).toBe(false);
    expect(isSubFeatureLocked(ctx, "battle.applyPresets")).toBe(false);
    expect(isSubFeatureLocked(ctx, "loot.autoSell")).toBe(false);
    expect(isSubFeatureLocked(ctx, "hunt.autoHunt")).toBe(true);
  });

  it("does not lock battle lure when tasker max lure is off", () => {
    const ctx = createTestContext({ battle: true, hunt: true });
    ctx.session.updateSettings({ autoTaskerEnabled: true, taskerMaxLure: false });
    expect(isSubFeatureLocked(ctx, "battle.lockLure")).toBe(false);
    expect(isSubFeatureLocked(ctx, "hunt.autoHunt")).toBe(true);
  });
});

describe("setSubFeatureEnabled", () => {
  it("updates marketScanEnabled for interval scan", async () => {
    const ctx = createTestContext({ market: true });
    const result = await setSubFeatureEnabled(ctx, "market.intervalScan", true);
    expect(result.ok).toBe(true);
    expect(ctx.session.settings.marketScanEnabled).toBe(true);
  });

  it("rejects toggles when master is off", async () => {
    const ctx = createTestContext({ market: false });
    const result = await setSubFeatureEnabled(ctx, "market.autoBuy", true);
    expect(result.ok).toBe(false);
  });
});
