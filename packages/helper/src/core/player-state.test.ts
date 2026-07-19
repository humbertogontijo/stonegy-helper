import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import {
  canRunIdleAutomation,
  isHandlingLoot,
  isPlayerIdling,
  updatePlayerState,
} from "./player-state";
import type { Transport } from "./transport";

class MockTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

describe("player state", () => {
  it("tracks loot handling states", () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });

    expect(isPlayerIdling(session)).toBe(true);
    expect(isHandlingLoot(session)).toBe(false);
    expect(canRunIdleAutomation(session)).toBe(true);

    updatePlayerState(session, "selling_loot", "Selling hunt loot…");
    expect(session.view.playerState).toBe("selling_loot");
    expect(isHandlingLoot(session)).toBe(true);
    expect(canRunIdleAutomation(session)).toBe(false);

    updatePlayerState(session, "splitting_loot", "Splitting loot…");
    expect(isHandlingLoot(session)).toBe(true);

    updatePlayerState(session, "idling", "Done");
    expect(isPlayerIdling(session)).toBe(true);
    expect(isHandlingLoot(session)).toBe(false);
  });

  it("treats hunting and training as non-idle", () => {
    const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
    session.view = patchSessionView(defaultSessionView(), { playerState: "hunting" });
    expect(canRunIdleAutomation(session)).toBe(false);

    session.view = patchSessionView(session.view, { playerState: "training" });
    expect(canRunIdleAutomation(session)).toBe(false);
  });
});
