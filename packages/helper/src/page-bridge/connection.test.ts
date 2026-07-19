import { describe, expect, it, vi } from "vitest";
import {
  connectionSnapshotFromStatus,
  connectionSnapshotFromWsEvent,
  isSocketOpen,
} from "./connection";
import {
  computeAutoReconnectDelayMs,
  createAutoReconnectController,
} from "./auto-reconnect";
import { createReloadGrace } from "./reload-grace";
import {
  AUTO_RECONNECT_BASE_DELAY_MS,
  AUTO_RECONNECT_MAX_DELAY_MS,
} from "./constants";

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

describe("computeAutoReconnectDelayMs", () => {
  it("uses exponential backoff capped at the max delay", () => {
    expect(computeAutoReconnectDelayMs(0)).toBe(AUTO_RECONNECT_BASE_DELAY_MS);
    expect(computeAutoReconnectDelayMs(1)).toBe(AUTO_RECONNECT_BASE_DELAY_MS * 2);
    expect(computeAutoReconnectDelayMs(2)).toBe(AUTO_RECONNECT_BASE_DELAY_MS * 4);
    expect(computeAutoReconnectDelayMs(10)).toBe(AUTO_RECONNECT_MAX_DELAY_MS);
  });
});

describe("createAutoReconnectController", () => {
  it("reloads until connected, with backoff between attempts", async () => {
    const delays: number[] = [];
    let connected = false;
    let reloads = 0;

    const controller = createAutoReconnectController({
      delay: async (ms) => {
        delays.push(ms);
      },
      isEnabled: () => true,
      isConnected: () => connected,
      reloadTab: async () => {
        reloads += 1;
        if (reloads >= 2) {
          connected = true;
        }
        return true;
      },
      maxAttempts: 5,
      connectWaitMs: 10,
      connectPollMs: 1,
    });

    await controller.scheduleAfterDisconnect();

    expect(reloads).toBe(2);
    expect(delays.some((ms) => ms === AUTO_RECONNECT_BASE_DELAY_MS)).toBe(true);
  });

  it("does nothing when disabled or already connected", async () => {
    const reloadTab = vi.fn(async () => true);

    const disabled = createAutoReconnectController({
      delay: async () => undefined,
      isEnabled: () => false,
      isConnected: () => false,
      reloadTab,
    });
    await disabled.scheduleAfterDisconnect();
    expect(reloadTab).not.toHaveBeenCalled();

    const alreadyUp = createAutoReconnectController({
      delay: async () => undefined,
      isEnabled: () => true,
      isConnected: () => true,
      reloadTab,
    });
    await alreadyUp.scheduleAfterDisconnect();
    expect(reloadTab).not.toHaveBeenCalled();
  });

  it("stops after cancel", async () => {
    let resolveReload: (() => void) | undefined;
    const reloadTab = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveReload = () => resolve(true);
        })
    );
    const controller = createAutoReconnectController({
      delay: async () => undefined,
      isEnabled: () => true,
      isConnected: () => false,
      reloadTab,
      maxAttempts: 3,
      connectWaitMs: 1,
      connectPollMs: 1,
    });

    const run = controller.scheduleAfterDisconnect();
    await Promise.resolve();
    expect(reloadTab).toHaveBeenCalledTimes(1);
    controller.cancel();
    resolveReload?.();
    await run;

    expect(reloadTab).toHaveBeenCalledTimes(1);
  });
});
