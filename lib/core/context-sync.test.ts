import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import {
  isPartyContextFresh,
  isPartyReady,
  isQuestContextFresh,
  isQuestReady,
  isInActiveHunt,
  isSessionBootstrapped,
  START_HUNT_TIMEOUT_MS,
  resolveStartHuntTimeoutMs,
} from "./context-sync";
import type { Transport } from "./transport";

class MockTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

describe("context-sync readiness", () => {
  it("treats synced party as ready regardless of TTL", () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: { ...defaultSessionView().character, characterId: "hero-1" },
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: true,
        lastSnapshotAt: Date.now() - 60_000,
      },
    });

    expect(isPartyReady(session)).toBe(true);
    expect(isPartyContextFresh(session)).toBe(false);
  });

  it("treats quest data from bootstrap as ready without TTL", () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
    session.view = patchSessionView(defaultSessionView(), {
      character: {
        ...defaultSessionView().character,
        finishedTasks: [1],
      },
      market: {
        ...defaultSessionView().market,
        lastQuestSnapshotAt: Date.now() - 60_000,
      },
    });

    expect(isQuestReady(session)).toBe(true);
    expect(isQuestContextFresh(session)).toBe(false);
  });

  it("detects session bootstrap from character id", () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
    expect(isSessionBootstrapped(session)).toBe(false);

    session.view = patchSessionView(defaultSessionView(), {
      character: { ...defaultSessionView().character, characterId: "hero-1" },
    });
    expect(isSessionBootstrapped(session)).toBe(true);
  });

  it("skips quest sync while in an active hunt", async () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      party: { ...defaultSessionView().party, partyStatus: "hunting" },
      hunt: { ...defaultSessionView().hunt, activeHuntId: 1 },
    });

    expect(isInActiveHunt(session)).toBe(true);

    const result = await session.syncQuestContext({ force: true });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("during_hunt");
  });

  it("skips party sync when already ready", async () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: { ...defaultSessionView().character, characterId: "hero-1" },
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: true,
        lastSnapshotAt: Date.now() - 60_000,
      },
    });

    const result = await session.syncPartyContext();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("ready");
  });

  it("uses the same start-hunt timeout for solo and multi-member parties", () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
    expect(resolveStartHuntTimeoutMs(session)).toBe(START_HUNT_TIMEOUT_MS);

    session.view = patchSessionView(defaultSessionView(), {
      party: { ...defaultSessionView().party, partyMemberCount: 2 },
    });
    expect(resolveStartHuntTimeoutMs(session)).toBe(START_HUNT_TIMEOUT_MS);
  });
});
