import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyLootSplitter } from "../../../protocol-messages";
import { ReceiveMessageTypes } from "../../../protocol";
import { GameSession } from "../../session";
import { defaultSettings } from "../../settings";
import { defaultSessionView } from "../../projections/defaults";
import { patchSessionView } from "../../projections/patch";
import { inventoryItemsFromAmounts } from "../../../inventory";
import type { Transport } from "../../transport";
import { isHandlingLoot } from "../../player-state";
import * as lootSplitter from "../hunt/loot-splitter";
import { lootSellFinishedEvent } from "../../services/events";
import { LootService } from "../../services/loot.service";

class MockTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

const LEADER_ID = "leader-id";

const sampleSplitter: PartyLootSplitter = {
  leaderId: LEADER_ID,
  leaderName: "Leader",
  totals: { lootTotalValue: 500_000, suppliesGold: 0, balanceGold: 200_000 },
  splitter: {
    profitPerMember: 100_000,
    remainderToLeader: 0,
    members: [
      {
        playerId: "member-a",
        name: "Member",
        isLeader: false,
        lootTotalValue: 0,
        suppliesGold: 0,
        balanceGold: -100_000,
        settlementDeltaGold: 100_000,
        transferFromLeaderGold: 100_000,
        owedToLeaderGold: 0,
      },
      {
        playerId: LEADER_ID,
        name: "Leader",
        isLeader: true,
        lootTotalValue: 500_000,
        suppliesGold: 0,
        balanceGold: 400_000,
        settlementDeltaGold: -100_000,
        transferFromLeaderGold: 0,
        owedToLeaderGold: 0,
      },
    ],
  },
};

function leaderSession(
  settings: Partial<ReturnType<typeof defaultSettings>> = {}
): GameSession {
  const session = new GameSession(new MockTransport(), {
    settings: { ...defaultSettings(), ...settings },
  });
  session.view = patchSessionView(defaultSessionView(), {
    connection: { connected: true, readyState: 1 },
    character: {
      ...defaultSessionView().character,
      characterId: LEADER_ID,
      goldCoins: 2_000_000,
    },
    party: {
      ...defaultSessionView().party,
      partySnapshotSynced: true,
      partyLeaderId: LEADER_ID,
      partyMemberCount: 3,
      partyLootSplitter: sampleSplitter,
    },
  });
  session.syncPartyContext = vi.fn().mockResolvedValue({ sent: true, success: true });
  return session;
}

const huntFinishedEvent = {
  kind: "json" as const,
  direction: "receive" as const,
  message: { type: ReceiveMessageTypes.HUNT_FINISHED, data: { reason: "completed" } },
  raw: "{}",
};

describe("detached hunt finish loot features", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sell dispatches loot_sell_finished for split to consume", async () => {
    const session = leaderSession({
      autoSellLoot: true,
      autoSplitLootOnHuntFinished: true,
    });
    session.view = patchSessionView(session.view, {
      inventory: {
        ...session.view.inventory,
        items: inventoryItemsFromAmounts({ 731: 2 }),
        gameQuickSellDeselectedItemIds: [],
      },
      market: {
        ...session.view.market,
        marketPrices: {
          731: {
            itemId: 731,
            lowestSellPrice: 100,
            highestBuyPrice: 90,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    const loot = session.services.get<LootService>("loot");
    const order: string[] = [];
    vi.spyOn(loot, "sellLootOnHuntFinished").mockImplementation(async () => {
      order.push("sell");
      return { itemCount: 1, soldCount: 1, failedCount: 0, skippedCount: 0 };
    });
    vi.spyOn(lootSplitter, "executeLootSplit").mockImplementation(async () => {
      order.push("split");
      return { ok: true, transferCount: 2 };
    });

    // Dispatch through the registry so the chained loot_sell_finished event is
    // fully processed before asserting (ctx.emit queues it; dispatch drains all).
    await session.services.dispatch(huntFinishedEvent);
    await session.drainMessages();

    expect(order).toEqual(["sell", "split"]);
    expect(session.view.playerState).toBe("idling");
    expect(isHandlingLoot(session)).toBe(false);
  });

  it("split listens to loot_sell_finished after sell", async () => {
    const session = leaderSession({ autoSplitLootOnHuntFinished: true });
    const splitSpy = vi.spyOn(lootSplitter, "executeLootSplit").mockResolvedValue({
      ok: true,
      transferCount: 1,
    });

    session.view.playerState = "selling_loot";
    await session.services.get<LootService>("loot").handleLootSplitAfterSell(
      lootSellFinishedEvent({ itemCount: 0, soldCount: 0, failedCount: 0, skippedCount: 0 })
    );

    expect(splitSpy).toHaveBeenCalled();
    expect(session.view.playerState).toBe("idling");
  });

  it("split-only runs directly on hunt_finished when sell is disabled", async () => {
    const session = leaderSession({ autoSplitLootOnHuntFinished: true });
    const splitSpy = vi.spyOn(lootSplitter, "executeLootSplit").mockResolvedValue({
      ok: true,
      transferCount: 1,
    });

    await session.services.get<LootService>("loot").handleLootSplitAfterSell(huntFinishedEvent);

    expect(splitSpy).toHaveBeenCalled();
    expect(session.syncPartyContext).toHaveBeenCalled();
  });

  it("skips split when gold is insufficient", async () => {
    const session = leaderSession({ autoSplitLootOnHuntFinished: true });
    session.view = patchSessionView(session.view, {
      character: { ...session.view.character, goldCoins: 100_000 },
      party: {
        ...session.view.party,
        partyLootSplitter: {
          leaderId: LEADER_ID,
          leaderName: "Leader",
          totals: { lootTotalValue: 500_000, suppliesGold: 0, balanceGold: 200_000 },
          splitter: {
            profitPerMember: 100_000,
            remainderToLeader: 0,
            members: [
              {
                playerId: "member-a",
                name: "Member",
                isLeader: false,
                lootTotalValue: 0,
                suppliesGold: 0,
                balanceGold: -200_000,
                settlementDeltaGold: 200_000,
                transferFromLeaderGold: 200_000,
                owedToLeaderGold: 0,
              },
              {
                playerId: LEADER_ID,
                name: "Leader",
                isLeader: true,
                lootTotalValue: 500_000,
                suppliesGold: 0,
                balanceGold: 300_000,
                settlementDeltaGold: -200_000,
                transferFromLeaderGold: 0,
                owedToLeaderGold: 0,
              },
            ],
          },
        },
      },
    });

    const splitSpy = vi.spyOn(lootSplitter, "executeLootSplit");

    await session.services.get<LootService>("loot").handleLootSplitAfterSell(
      lootSellFinishedEvent({ itemCount: 0, soldCount: 0, failedCount: 0, skippedCount: 0 })
    );

    expect(splitSpy).not.toHaveBeenCalled();
    expect(session.view.playerStateDetail).toMatch(/Not enough gold/i);
  });

  it("sellLootNow sets selling_loot then returns to idle with force sell", async () => {
    const session = leaderSession({ autoSellLoot: false });
    session.view = patchSessionView(session.view, {
      inventory: {
        ...session.view.inventory,
        items: inventoryItemsFromAmounts({ 731: 2 }),
        gameQuickSellDeselectedItemIds: [],
      },
    });

    const loot = session.services.get<LootService>("loot");
    const states: string[] = [];
    const originalSetPlayerState = session.services.setPlayerState.bind(session.services);
    session.services.setPlayerState = (state, detail) => {
      originalSetPlayerState(state, detail);
      states.push(state);
    };

    vi.spyOn(loot, "sellLootOnHuntFinished").mockImplementation(async (options) => {
      expect(options?.force).toBe(true);
      expect(session.view.playerState).toBe("selling_loot");
      return { itemCount: 1, soldCount: 1, failedCount: 0, skippedCount: 0 };
    });

    const result = await loot.sellLootNow();

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/1 sold/);
    expect(states).toEqual(["selling_loot", "idling"]);
    expect(session.view.playerState).toBe("idling");
  });

  it("keeps pending sell on empty inventory snapshot until loot arrives", async () => {
    const session = leaderSession({ autoSellLoot: true });
    const loot = session.services.get<LootService>("loot");
    const sellSpy = vi.spyOn(loot, "sellLootOnHuntFinished").mockResolvedValue({
      itemCount: 1,
      soldCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });

    await loot.handleLootSellOnHuntFinished(huntFinishedEvent);
    expect(session.view.hunt.pendingHuntLootSell).toBe(true);
    expect(sellSpy).not.toHaveBeenCalled();

    await loot.handleLootSellOnHuntFinished({
      kind: "inventory_snapshot",
      direction: "receive",
      data: {
        goldCoins: 0,
        reserved: 0,
        padding: 0,
        depotItemCount: 0,
        capacity: 0,
        usedSlots: 0,
        unknownByte: 0,
        items: [],
      },
      raw: "",
    });

    expect(session.view.hunt.pendingHuntLootSell).toBe(true);
    expect(sellSpy).not.toHaveBeenCalled();

    session.view = patchSessionView(session.view, {
      inventory: {
        ...session.view.inventory,
        items: inventoryItemsFromAmounts({ 731: 2 }),
      },
    });

    await loot.handleLootSellOnHuntFinished({
      kind: "inventory_snapshot",
      direction: "receive",
      data: {
        goldCoins: 0,
        reserved: 0,
        padding: 0,
        depotItemCount: 0,
        capacity: 0,
        usedSlots: 1,
        unknownByte: 0,
        items: inventoryItemsFromAmounts({ 731: 2 }),
      },
      raw: "",
    });

    expect(sellSpy).toHaveBeenCalled();
    expect(session.view.hunt.pendingHuntLootSell).toBe(false);
  });

  it("times out awaiting inventory even without inventory snapshots", async () => {
    vi.useFakeTimers();
    const session = leaderSession({ autoSellLoot: true });
    const loot = session.services.get<LootService>("loot");
    const sellSpy = vi.spyOn(loot, "sellLootOnHuntFinished").mockResolvedValue({
      itemCount: 0,
      soldCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });

    await loot.handleLootSellOnHuntFinished(huntFinishedEvent);
    expect(session.view.hunt.pendingHuntLootSell).toBe(true);
    expect(session.view.playerState).toBe("selling_loot");
    expect(sellSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(session.view.hunt.pendingHuntLootSell).toBe(false);
    expect(isHandlingLoot(session)).toBe(false);
    expect(session.view.playerState).toBe("idling");
    vi.useRealTimers();
  });
});
