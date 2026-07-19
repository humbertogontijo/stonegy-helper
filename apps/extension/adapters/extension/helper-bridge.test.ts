import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { HelperExtensionBridge } from "./helper-bridge";
import type { BotState } from "@stonegy/helper/types";

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  readonly url: string;
  readonly sent: string[] = [];
  private listeners = new Map<string, Set<(event: { data?: string }) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (event: { data?: string }) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  emit(type: string, data?: string): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data });
    }
  }
}

describe("HelperExtensionBridge", () => {
  let gameLive = false;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    gameLive = false;
    FakeWebSocket.instances = [];
    (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  function makeBridge() {
    const bridge = new HelperExtensionBridge("ws://127.0.0.1:9/v1/extension");
    bridge.setHandlers({
      getSettingsPayload: () => null,
      getBotState: () => ({}) as BotState,
      isGameLive: () => gameLive,
      onRemoteSettings: async () => {},
      onRemoteCommand: async () => ({ ok: true }),
    });
    return bridge;
  }

  it("does not claim when game is not live", () => {
    const bridge = makeBridge();
    gameLive = false;
    bridge.syncLive("char-a", "A", true);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("claims while game is live and releases when game drops", () => {
    const bridge = makeBridge();
    gameLive = true;
    bridge.syncLive("char-a", "A", true);
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    expect(ws.sent.some((s) => s.includes('"type":"claim"'))).toBe(true);

    gameLive = false;
    bridge.syncLive("char-a", "A", false);
    expect(ws.sent.some((s) => s.includes('"type":"release"'))).toBe(true);
  });

  it("does not reclaim after helper disconnect when game is gone", async () => {
    const bridge = makeBridge();
    gameLive = true;
    bridge.syncLive("char-a", "A", true);
    const ws = FakeWebSocket.instances[0]!;
    ws.open();

    gameLive = false;
    // Helper server restarts — socket drops without an intentional release.
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reconnects after helper disconnect only while game stays live", async () => {
    const bridge = makeBridge();
    gameLive = true;
    bridge.syncLive("char-a", "A", true);
    const first = FakeWebSocket.instances[0]!;
    first.open();
    first.close();

    await new Promise((r) => setTimeout(r, 600));
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
    const second = FakeWebSocket.instances[1]!;
    second.open();
    expect(second.sent.some((s) => s.includes('"type":"claim"'))).toBe(true);
  });
});
