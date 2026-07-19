import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../session";
import type { Transport, WireMessage } from "../transport";
import { KeyedLocks } from "./locks";
import { ServiceRegistry } from "./registry";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { GameEvent } from "../events/types";

class MockTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(_handler: (message: WireMessage) => void): void {}
  onConnectionChange(): void {}
  close(): void {}
}

class TestService extends Service {
  readonly id: FeatureId = "tools";
  events: GameEvent[] = [];

  async onEvent(event: GameEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("KeyedLocks", () => {
  it("serializes work on the same key", async () => {
    const locks = new KeyedLocks();
    const order: number[] = [];

    const first = locks.runExclusive("a", async () => {
      order.push(1);
      await Promise.resolve();
      order.push(2);
      return "first";
    });
    const second = locks.runExclusive("a", async () => {
      order.push(3);
      return "second";
    });

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("runs different keys concurrently", async () => {
    const locks = new KeyedLocks();
    let releaseA!: () => void;
    const aGate = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let bFinished = false;

    const a = locks.runExclusive("a", async () => {
      await aGate;
      return "a";
    });
    const b = locks.runExclusive("b", async () => {
      bFinished = true;
      return "b";
    });

    await expect(b).resolves.toBe("b");
    expect(bFinished).toBe(true);
    releaseA();
    await expect(a).resolves.toBe("a");
  });
});

describe("ServiceRegistry", () => {
  it("dispatches events to registered services when master is on", async () => {
    const session = new GameSession(new MockTransport(), { settings: {} });
    const registry = new ServiceRegistry({ session });
    const service = new TestService(registry.createContext());
    registry.register(service);

    const event: GameEvent = { kind: "market_scan_tick", manual: true };
    await registry.dispatch(event);

    expect(service.events).toEqual([event]);
  });

  it("skips services when master is off", async () => {
    const session = new GameSession(new MockTransport(), { settings: {} });
    const registry = new ServiceRegistry({
      session,
      masters: {
        market: false,
        loot: false,
        battle: false,
        hunt: false,
        tasks: false,
        tools: false,
      },
          });
    const service = new TestService(registry.createContext());
    registry.register(service);

    await registry.dispatch({ kind: "market_scan_tick" });
    expect(service.events).toEqual([]);
  });

  it("queues emit() until after current dispatch", async () => {
    const session = new GameSession(new MockTransport(), { settings: {} });
    const registry = new ServiceRegistry({ session });

    class EmittingService extends Service {
      readonly id: FeatureId = "loot";
      order: string[] = [];

      async onEvent(event: GameEvent): Promise<void> {
        this.order.push(event.kind);
        if (event.kind === "market_scan_tick") {
          this.ctx.emit({
            kind: "loot_sell_finished",
            result: { itemCount: 0, soldCount: 0, failedCount: 0, skippedCount: 0 },
          });
          this.order.push("emitted");
        }
      }
    }

    const service = new EmittingService(registry.createContext());
    registry.register(service);

    await registry.dispatch({ kind: "market_scan_tick" });
    expect(service.order).toEqual(["market_scan_tick", "emitted", "loot_sell_finished"]);
  });

  it("settings.transaction serializes writers", async () => {
    const session = new GameSession(new MockTransport(), {
      settings: { autoSellLoot: false },
    });
    const registry = new ServiceRegistry({ session });
    const ctx = registry.createContext();

    await Promise.all([
      ctx.settings.transaction(() => ({ autoSellLoot: true })),
      ctx.settings.transaction((s) => ({
        autoSplitLootOnHuntFinished: s.autoSellLoot,
      })),
    ]);

    expect(session.settings.autoSellLoot).toBe(true);
    expect(session.settings.autoSplitLootOnHuntFinished).toBe(true);
  });

  it("setMasters(false) stops service and applies off patch", async () => {
    const session = new GameSession(new MockTransport(), {
      settings: { autoTrainingEnabled: true, autoConfirmPartyHunt: true },
    });
    const registry = new ServiceRegistry({ session });
    const stop = vi.fn();

    class ToolsStub extends Service {
      readonly id: FeatureId = "tools";
      async onEvent(): Promise<void> {}
      stop(): void {
        stop();
      }
    }

    registry.register(new ToolsStub(registry.createContext()));
    await registry.setMasters({ tools: false });

    expect(stop).toHaveBeenCalledOnce();
    expect(session.settings.autoTrainingEnabled).toBe(false);
    expect(session.settings.autoConfirmPartyHunt).toBe(false);
  });
});

describe("ServiceContext typing", () => {
  it("exposes session by reference", () => {
    const session = new GameSession(new MockTransport());
    const registry = new ServiceRegistry({ session });
    const ctx: ServiceContext = registry.createContext();
    expect(ctx.session).toBe(session);
  });
});
