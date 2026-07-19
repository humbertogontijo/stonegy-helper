import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "./commands/bus";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { projectAfterEvent } from "./projections/project-events";
import { ReceiveMessageTypes, SendMessageTypes, type StonegyMessage } from "../protocol";
import type { Transport, WireMessage } from "./transport";
import { jsonEvent } from "./events/types";
import { resetLastBrowseMarketSnapshotMeta } from "../market/store";
import type { MarketService } from "./services/market.service";
import { binaryMarketSnapshotBrowse } from "../binary/fixtures/market-traffic";

class MockTransport implements Transport {
  private handler: ((message: WireMessage) => void) | null = null;
  sent: string[] = [];

  async connect(): Promise<void> {}
  async send(_opcode: 1 | 2, data: string): Promise<void> {
    this.sent.push(data);
  }
  onMessage(handler: (message: WireMessage) => void): void {
    this.handler = handler;
  }
  onConnectionChange(): void {}
  close(): void {}

  emitReceive(message: StonegyMessage, raw = "{}"): void {
    this.handler?.({ direction: "receive", opcode: 1, data: raw });
    void message;
  }

  emitBinaryReceive(data: string): void {
    this.handler?.({ direction: "receive", opcode: 2, data });
  }
}

async function flushDeferredFeatureEvents(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("CommandBus party snapshot sync", () => {
  it("waits for party snapshot after projection marks synced", async () => {
    const transport = new MockTransport();
    let view = defaultSessionView();
    const bus = new CommandBus(transport, () => view);

    const waitPromise = bus.run("party_get_snapshot", {}, { force: true });
    await new Promise((resolve) => setTimeout(resolve, 10));

    view = patchSessionView(view, {
      party: {
        ...view.party,
        partySnapshotSynced: true,
        lastSnapshotAt: Date.now(),
      },
      character: { ...view.character, characterId: "1" },
    });
    bus.notifyResponse(
      { type: ReceiveMessageTypes.PARTY_SNAPSHOT, data: { meId: "1" } },
      view
    );

    const result = await waitPromise;
    expect(result.success).not.toBe(false);
    expect(view.party.partySnapshotSynced).toBe(true);
  });
});

describe("projectAfterEvent", () => {
  it("marks party snapshot synced on party:snapshot", async () => {
    const view = await projectAfterEvent(
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.PARTY_SNAPSHOT,
          data: { party: { status: "idle", members: [{ id: "1", name: "Hero" }] }, meId: "1" },
        },
        "{}"
      )
    );
    expect(view.party.partySnapshotSynced).toBe(true);
    expect(view.party.partyStatus).toBe("idle");
  });
});

describe("GameSession market snapshot dispatch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetLastBrowseMarketSnapshotMeta();
  });

  it("defers market snapshot feature dispatch until after the wire handler returns", async () => {
    const transport = new MockTransport();
    const session = new GameSession(transport, {
      settings: { ...defaultSettings(), marketAutoBuyEnabled: true },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
    });

    const callOrder: string[] = [];
    const service = session.services.get<MarketService>("market");
    const handleSpy = vi
      .spyOn(service, "runAutoBuyOnMarketSnapshot")
      .mockImplementation(async () => {
        callOrder.push("autoBuy");
      });

    try {
      transport.emitBinaryReceive(binaryMarketSnapshotBrowse);
      callOrder.push("receive-called");
      await session.drainMessages();
      callOrder.push("drained");
      await flushDeferredFeatureEvents();
      callOrder.push("flushed");

      expect(callOrder[0]).toBe("receive-called");
      expect(callOrder.at(-1)).toBe("flushed");
      expect(callOrder).toContain("autoBuy");
      expect(callOrder).toContain("drained");
      expect(callOrder.indexOf("autoBuy")).toBeGreaterThan(0);
    } finally {
      handleSpy.mockRestore();
    }
  });

  it("records bought items when auto-buy succeeds on a market snapshot", async () => {
    const transport = new MockTransport();
    const session = new GameSession(transport, {
      settings: { ...defaultSettings(), marketAutoBuyEnabled: true },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        goldCoins: 10_000,
      },
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          4: {
            itemId: 4,
            lowestSellPrice: 100,
            highestBuyPrice: 50,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({
      sent: true,
      success: true,
    });

    await session.dispatchFeatureEvent({
      kind: "market_snapshot_binary",
      direction: "receive",
      data: {
        page: 1,
        totalPages: 1,
        requestedItemId: null,
        selectedItemTradableAmount: 0,
        sellOrders: [
          {
            id: "test-order-4",
            itemId: 4,
            tier: 0,
            isOwnOrder: false,
            isBuyOrder: false,
            eachPrice: 100,
            itemAmount: 1,
            totalPrice: 100,
            createdAt: "",
          },
        ],
        buyOrders: [],
        sellOrderAnchors: [],
        buyOrderAnchors: [],
      },
      raw: "",
    });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.MARKET_RESOLVE_ORDER,
      expect.objectContaining({ side: "buy", amount: 1 }),
      expect.anything()
    );
    expect(session.view.market.marketBoughtItems).toEqual([
      expect.objectContaining({
        itemId: 4,
        buyPrice: 100,
        sellPrice: 400,
        amount: 1,
      }),
    ]);
    runSpy.mockRestore();
  });

  it("records missed offers when auto-buy cannot afford the full listing", async () => {
    const transport = new MockTransport();
    const session = new GameSession(transport, {
      settings: { ...defaultSettings(), marketAutoBuyEnabled: true },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        goldCoins: 150,
      },
      market: {
        ...defaultSessionView().market,
        marketPrices: {
          4: {
            itemId: 4,
            lowestSellPrice: 100,
            highestBuyPrice: 50,
            sellOrderCount: 1,
            buyOrderCount: 1,
            tradableAmount: 10,
            updatedAt: Date.now(),
          },
        },
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({
      sent: true,
      success: true,
    });

    await session.dispatchFeatureEvent({
      kind: "market_snapshot_binary",
      direction: "receive",
      data: {
        page: 1,
        totalPages: 1,
        requestedItemId: null,
        selectedItemTradableAmount: 0,
        sellOrders: [
          {
            id: "test-order-4",
            itemId: 4,
            tier: 0,
            isOwnOrder: false,
            isBuyOrder: false,
            eachPrice: 100,
            itemAmount: 5,
            totalPrice: 500,
            createdAt: "",
          },
        ],
        buyOrders: [],
        sellOrderAnchors: [],
        buyOrderAnchors: [],
      },
      raw: "",
    });

    expect(session.view.market.marketBoughtItems).toEqual([
      expect.objectContaining({ itemId: 4, amount: 1 }),
    ]);
    expect(session.view.market.marketMissedOffers).toEqual([
      expect.objectContaining({
        itemId: 4,
        buyPrice: 100,
        missedAmount: 4,
      }),
    ]);
    runSpy.mockRestore();
  });

  it("reads browse page count for full scan before deferred auto-buy runs", async () => {
    vi.useFakeTimers();

    const transport = new MockTransport();
    const session = new GameSession(transport, {
      settings: { ...defaultSettings(), marketAutoBuyEnabled: true },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
    });

    const service = session.services.get<MarketService>("market");
    const autoBuySpy = vi.spyOn(service, "runAutoBuyOnMarketSnapshot").mockResolvedValue();

    const scanPromise = service.runFullMarketScan();
    await Promise.resolve();
    transport.emitBinaryReceive(binaryMarketSnapshotBrowse);
    await session.drainMessages();

    expect(session.view.market.marketFullScanTotalPages).toBe(463);
    expect(session.view.market.marketFullScanStatus).toContain("Scanned page 1/463");

    await vi.runAllTimersAsync();
    await scanPromise;

    expect(session.view.market.marketFullScanStatus).toContain("Full scan complete");
    expect(autoBuySpy).toHaveBeenCalled();
    autoBuySpy.mockRestore();
    vi.useRealTimers();
  });
});
