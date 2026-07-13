import { beforeEach, describe, expect, it, vi } from "vitest";
import * as lootSell from "../loot-sell";
import { executeBatchNpcQuickSell, executeItemSell } from "../loot-sell";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { inventoryItemsFromAmounts } from "../inventory";
import type { Transport } from "./transport";
import type { LootService } from "./services/loot.service";

vi.mock("../loot-sell", async (importOriginal) => {
  const actual = await importOriginal<typeof lootSell>();
  return {
    ...actual,
    executeItemSell: vi.fn().mockResolvedValue({ sold: true }),
    executeBatchNpcQuickSell: vi.fn().mockResolvedValue(undefined),
  };
});

class MockTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

function idleSession(inventory: Record<number, number> = {}): GameSession {
  const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
  session.view = patchSessionView(defaultSessionView(), {
    party: { ...defaultSessionView().party, partyStatus: "idle" },
    hunt: { ...defaultSessionView().hunt, activeHuntId: null },
    inventory: {
      ...defaultSessionView().inventory,
      items: inventoryItemsFromAmounts(inventory),
      gameQuickSellDeselectedItemIds: [],
    },
    market: {
      ...defaultSessionView().market,
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
        817: {
          itemId: 817,
          lowestSellPrice: 1000,
          highestBuyPrice: 999,
          sellOrderCount: 1,
          buyOrderCount: 1,
          tradableAmount: 1,
          updatedAt: Date.now(),
        },
      },
    },
  });
  session.settings = { ...session.settings, autoSellLoot: true, selectedHuntId: 1 };
  return session;
}

describe("inventory-based hunt finish sell", () => {
  beforeEach(() => {
    vi.mocked(executeItemSell).mockClear();
    vi.mocked(executeBatchNpcQuickSell).mockClear();
  });

  it("npc-sells junk inventory on hunt finish", async () => {
    const session = idleSession({ 731: 3 });
    session.commands.run = vi.fn().mockResolvedValue({ sent: true });

    await session.services.get<LootService>("loot").sellLootOnHuntFinished();

    expect(executeBatchNpcQuickSell).toHaveBeenCalledWith(
      [731],
      expect.any(Object)
    );
    expect(executeItemSell).not.toHaveBeenCalled();
  });

  it("lists market-eligible inventory on hunt finish", async () => {
    const session = idleSession({ 14: 1 });
    session.view = patchSessionView(session.view, {
      market: {
        ...session.view.market,
        marketPrices: {
          ...session.view.market.marketPrices,
          14: {
            itemId: 14,
            lowestSellPrice: 1000,
            highestBuyPrice: 999,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });
    session.commands.run = vi.fn().mockResolvedValue({ sent: true });

    await session.services.get<LootService>("loot").sellLootOnHuntFinished();

    expect(executeItemSell).toHaveBeenCalledWith(
      14,
      expect.objectContaining({ taxPercent: expect.any(Number) }),
      expect.any(Object)
    );
    expect(executeBatchNpcQuickSell).not.toHaveBeenCalled();
  });

  it("skips excluded inventory items", async () => {
    const session = idleSession({ 731: 3, 999: 1 });
    session.view = patchSessionView(session.view, {
      inventory: {
        ...session.view.inventory,
        gameQuickSellDeselectedItemIds: [999],
      },
    });
    session.commands.run = vi.fn().mockResolvedValue({ sent: true });

    await session.services.get<LootService>("loot").sellLootOnHuntFinished();

    expect(executeBatchNpcQuickSell).toHaveBeenCalledTimes(1);
    expect(executeBatchNpcQuickSell).toHaveBeenCalledWith(
      [731],
      expect.any(Object)
    );
  });

  it("force-sells market items even when party status is still hunting", async () => {
    const session = idleSession({ 14: 1 });
    session.view = patchSessionView(session.view, {
      party: { ...session.view.party, partyStatus: "hunting" },
      hunt: { ...session.view.hunt, activeHuntId: 12 },
      market: {
        ...session.view.market,
        marketPrices: {
          ...session.view.market.marketPrices,
          14: {
            itemId: 14,
            lowestSellPrice: 1000,
            highestBuyPrice: 999,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });
    session.commands.run = vi.fn().mockResolvedValue({ sent: true, success: true });
    vi.spyOn(session.services.get<LootService>("loot"), "syncMarketItemIds").mockResolvedValue();

    await session.services.get<LootService>("loot").sellLootOnHuntFinished({ force: true });

    expect(executeItemSell).toHaveBeenCalledWith(
      14,
      expect.objectContaining({ taxPercent: expect.any(Number) }),
      expect.any(Object)
    );
  });

  it("stops further market listings when open-order limit is hit", async () => {
    const session = idleSession({ 14: 1, 23: 1, 40: 1 });
    session.settings = {
      ...session.settings,
      lootSellModeByItemId: {
        14: "market",
        23: "market",
        40: "market",
      },
    };
    session.view = patchSessionView(session.view, {
      market: {
        ...session.view.market,
        marketPrices: {
          ...session.view.market.marketPrices,
          14: {
            itemId: 14,
            lowestSellPrice: 500,
            highestBuyPrice: 400,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
          23: {
            itemId: 23,
            lowestSellPrice: 500,
            highestBuyPrice: 400,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
          40: {
            itemId: 40,
            lowestSellPrice: 500,
            highestBuyPrice: 400,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 1,
            updatedAt: Date.now(),
          },
        },
      },
    });
    session.commands.run = vi.fn().mockResolvedValue({ sent: true, success: true });
    const loot = session.services.get<LootService>("loot");
    vi.spyOn(loot, "syncMarketItemIds").mockResolvedValue();

    vi.mocked(executeItemSell)
      .mockResolvedValueOnce({ sold: true })
      .mockResolvedValueOnce({
        sold: false,
        marketOrderLimitReached: true,
        errorMessage: "Você atingiu o limite de ordens abertas no market.",
      });

    const result = await loot.sellLootOnHuntFinished();

    expect(executeItemSell).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      soldCount: 1,
      failedCount: 1,
      skippedCount: 1,
      marketOrderLimitReached: true,
    });
  });
});
