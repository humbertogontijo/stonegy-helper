import { describe, expect, it } from "vitest";
import {
  canAutoHuntClaimIdle,
  canRestartHunt,
  enableAutoHuntBlockReason,
  isAutoHuntRestartEnabled,
  isCapacityHuntFinishReason,
  isPostHuntLootBlocking,
  isTerminalHuntFinishReason,
  shouldDeferHuntRestartForLootFinish,
} from "./guards";

const sevenOwned = Array.from({ length: 7 }, () => ({ owned: true, cost: 100 }));
const sixOwned = [
  ...Array.from({ length: 6 }, () => ({ owned: true, cost: 100 })),
  { owned: false, cost: 500 },
];

describe("isAutoHuntRestartEnabled", () => {
  it("requires auto hunt on and tasker off", () => {
    expect(
      isAutoHuntRestartEnabled({ autoHuntEnabled: true, autoTaskerEnabled: false })
    ).toBe(true);
    expect(
      isAutoHuntRestartEnabled({ autoHuntEnabled: true, autoTaskerEnabled: true })
    ).toBe(false);
    expect(
      isAutoHuntRestartEnabled({ autoHuntEnabled: false, autoTaskerEnabled: false })
    ).toBe(false);
  });
});

describe("isTerminalHuntFinishReason / isCapacityHuntFinishReason", () => {
  it("treats gold and stamina as terminal stops", () => {
    expect(isTerminalHuntFinishReason("insufficient_gold")).toBe(true);
    expect(isTerminalHuntFinishReason("stamina_depleted")).toBe(true);
    expect(isTerminalHuntFinishReason("insufficient_capacity")).toBe(false);
    expect(isTerminalHuntFinishReason("hunt_left")).toBe(false);
    expect(isTerminalHuntFinishReason(undefined)).toBe(false);
  });

  it("recognizes capacity finish for sell-then-restart", () => {
    expect(isCapacityHuntFinishReason("insufficient_capacity")).toBe(true);
    expect(isCapacityHuntFinishReason("insufficient_gold")).toBe(false);
    expect(isCapacityHuntFinishReason("hunt_left")).toBe(false);
  });
});

describe("isPostHuntLootBlocking", () => {
  it("blocks when player or loot flow is busy", () => {
    expect(
      isPostHuntLootBlocking({ playerHandlingLoot: true, lootFlowBusy: false })
    ).toBe(true);
    expect(
      isPostHuntLootBlocking({ playerHandlingLoot: false, lootFlowBusy: true })
    ).toBe(true);
    expect(
      isPostHuntLootBlocking({ playerHandlingLoot: false, lootFlowBusy: false })
    ).toBe(false);
  });
});

describe("shouldDeferHuntRestartForLootFinish", () => {
  it("defers for sell or leader split", () => {
    expect(
      shouldDeferHuntRestartForLootFinish(
        { autoSplitLootOnHuntFinished: false },
        { isLeader: true, lootSellEnabled: true }
      )
    ).toBe(true);
    expect(
      shouldDeferHuntRestartForLootFinish(
        { autoSplitLootOnHuntFinished: true },
        { isLeader: true, lootSellEnabled: false }
      )
    ).toBe(true);
    expect(
      shouldDeferHuntRestartForLootFinish(
        { autoSplitLootOnHuntFinished: true },
        { isLeader: false, lootSellEnabled: false }
      )
    ).toBe(false);
  });
});

describe("canRestartHunt", () => {
  const base = {
    isLeader: true,
    selectedHuntId: 12,
    autoHuntEnabled: true,
    autoTaskerEnabled: false,
    handlingLoot: false,
  };

  it("allows restart when guards pass", () => {
    expect(canRestartHunt(base)).toBe(true);
  });

  it("blocks when tasker owns hunt", () => {
    expect(canRestartHunt({ ...base, autoTaskerEnabled: true })).toBe(false);
  });

  it("blocks when already hunting", () => {
    expect(canRestartHunt({ ...base, alreadyHunting: true })).toBe(false);
  });

  it("blocks when a party member is offline", () => {
    expect(canRestartHunt({ ...base, allPartyMembersOnline: false })).toBe(false);
  });
});

describe("canAutoHuntClaimIdle", () => {
  const base = {
    autoHuntEnabled: true,
    autoTaskerEnabled: false,
    isLeader: true,
    selectedHuntId: 12,
    huntStartable: true,
    blessSnapshotSynced: true,
    autoBuyBless: false,
    goldCoins: 10_000,
    blessings: sevenOwned,
    ownedCount: 7,
  };

  it("claims idle when blessed and startable", () => {
    expect(canAutoHuntClaimIdle(base)).toBe(true);
  });

  it("does not claim when blessings missing and auto-buy off", () => {
    expect(
      canAutoHuntClaimIdle({
        ...base,
        blessings: sixOwned,
        ownedCount: 6,
        autoBuyBless: false,
      })
    ).toBe(false);
  });

  it("does not claim when blessings missing and auto-buy cannot afford", () => {
    expect(
      canAutoHuntClaimIdle({
        ...base,
        blessings: sixOwned,
        ownedCount: 6,
        autoBuyBless: true,
        goldCoins: 100,
      })
    ).toBe(false);
  });

  it("claims when auto-buy can afford the next blessing", () => {
    expect(
      canAutoHuntClaimIdle({
        ...base,
        blessings: sixOwned,
        ownedCount: 6,
        autoBuyBless: true,
        goldCoins: 500,
      })
    ).toBe(true);
  });

  it("does not claim while bless snapshot is unsynced", () => {
    expect(canAutoHuntClaimIdle({ ...base, blessSnapshotSynced: false })).toBe(false);
  });

  it("does not claim for non-startable hunt ids", () => {
    expect(canAutoHuntClaimIdle({ ...base, huntStartable: false })).toBe(false);
  });

  it("does not claim when tasker controls hunt", () => {
    expect(canAutoHuntClaimIdle({ ...base, autoTaskerEnabled: true })).toBe(false);
  });

  it("does not claim while a party member is offline", () => {
    expect(canAutoHuntClaimIdle({ ...base, allPartyMembersOnline: false })).toBe(false);
  });
});

describe("enableAutoHuntBlockReason", () => {
  const base = {
    connected: true,
    autoTaskerEnabled: false,
    hasValidHunt: true,
    hasCharacterId: true,
    partySnapshotSynced: true,
    blessSnapshotSynced: true,
    isLeader: true,
    hasAllBlessings: true,
  };

  it("distinguishes unsynced blessings from missing blessings", () => {
    expect(
      enableAutoHuntBlockReason({
        ...base,
        blessSnapshotSynced: false,
        hasAllBlessings: false,
      })
    ).toBe("bless_not_synced");
    expect(
      enableAutoHuntBlockReason({
        ...base,
        hasAllBlessings: false,
      })
    ).toBe("missing_blessings");
  });
});
