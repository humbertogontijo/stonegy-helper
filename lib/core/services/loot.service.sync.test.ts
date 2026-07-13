import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendMessageTypes } from "../../protocol";
import { GameSession } from "../session";
import type { Transport } from "../transport";
import { LootService } from "./loot.service";
import { MarketService } from "./market.service";

function createMockTransport(): Transport {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    onConnectionChange: vi.fn(),
    close: vi.fn(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("LootService.syncMarketItemIds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches each item via MarketService under the scan lock", async () => {
    const session = new GameSession(createMockTransport());
    const market = session.services.get<MarketService>("market");
    const syncItemPrices = vi.spyOn(market, "syncItemPrices").mockResolvedValue(undefined);

    await session.services.get<LootService>("loot").syncMarketItemIds([10, 20], true);

    expect(syncItemPrices).toHaveBeenCalledWith([10, 20], true);
  });

  it("serializes overlapping sync calls through the scan lock", async () => {
    const session = new GameSession(createMockTransport());
    session.updateView({ connection: { connected: true, readyState: 1 } });
    const order: number[] = [];

    session.commands.run = vi.fn(async (_type: string, data: { filters: { itemId: number } }) => {
      order.push(data.filters.itemId);
      await delay(5);
      return {
        sent: true,
        success: true,
        response: { type: "market:snapshot", data: { requestedItemId: data.filters.itemId } },
      };
    }) as never;

    const loot = session.services.get<LootService>("loot");
    const first = loot.syncMarketItemIds([1, 2], true);
    const second = loot.syncMarketItemIds([3], true);
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);

    expect(order).toEqual([1, 2, 3]);
    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.MARKET_GET_SNAPSHOT,
      expect.objectContaining({ filters: expect.objectContaining({ itemId: 1 }) }),
      expect.objectContaining({ waitForResponse: true, force: true })
    );
  });
});
