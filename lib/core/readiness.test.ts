import { describe, expect, it, vi } from "vitest";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { projectAfterEvent } from "./projections/project-events";
import { ReceiveMessageTypes, SendMessageTypes, type StonegyMessage } from "../protocol";
import { jsonEvent } from "./events/types";
import {
  awaitSessionReady,
  isBootstrapEvent,
  isPartySnapshotEvent,
  isTasksSnapshotEvent,
  waitForQuestSnapshot,
} from "./readiness";
import type { Transport, WireMessage } from "./transport";

class RelayTransport implements Transport {
  private handler: ((message: WireMessage) => void) | null = null;

  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(handler: (message: WireMessage) => void): void {
    this.handler = handler;
  }
  onConnectionChange(): void {}
  close(): void {}

  receive(message: StonegyMessage): void {
    this.handler?.({
      direction: "receive",
      opcode: 1,
      data: JSON.stringify(message),
    });
  }
}

describe("push-first login traffic", () => {
  it("session_bootstrap supplies character and quest data without quest_get_snapshot", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, { settings: defaultSettings() });
    const runSpy = vi.spyOn(session.commands, "run");

    transport.receive({
      type: ReceiveMessageTypes.SESSION_BOOTSTRAP,
      data: {
        character: {
          id: "hero-1",
          nickname: "Hero",
          finishedTasks: [1, 2],
          activeMonsterTasks: [],
        },
      },
    });

    await session.drainMessages();

    expect(session.view.character.characterId).toBe("hero-1");
    expect(session.view.character.finishedTasks).toEqual([1, 2]);
    expect(session.view.market.lastQuestSnapshotAt).not.toBeNull();
    expect(runSpy).not.toHaveBeenCalledWith(SendMessageTypes.QUEST_GET_SNAPSHOT, {}, expect.anything());
  });

  it("party:snapshot push marks party ready without party_get_snapshot", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, { settings: defaultSettings() });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: { ...defaultSessionView().character, characterId: "hero-1" },
    });

    const runSpy = vi.spyOn(session.commands, "run");

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: { party: { status: "idle", members: [{ id: "hero-1", name: "Hero" }] }, meId: "hero-1" },
    });

    await session.drainMessages();

    expect(session.view.party.partySnapshotSynced).toBe(true);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("tasks:snapshot push updates finishedTasks for tasker progression", async () => {
    const view = await projectAfterEvent(
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.TASKS_SNAPSHOT,
          data: {
            activeMonsterTasks: [],
            finishedTasks: [10, 11],
          },
        },
        "{}"
      )
    );

    expect(view.character.finishedTasks).toEqual([10, 11]);
    expect(view.market.lastQuestSnapshotAt).not.toBeNull();
  });
});

describe("awaitSessionReady", () => {
  it("waits for bootstrap then party push before commanding", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, { settings: defaultSettings() });
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    const readyPromise = awaitSessionReady(session);

    transport.receive({
      type: ReceiveMessageTypes.SESSION_BOOTSTRAP,
      data: { character: { id: "hero-1", nickname: "Hero" } },
    });
    await session.drainMessages();

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: { meId: "hero-1" },
    });
    await session.drainMessages();

    await readyPromise;

    // Party arrived via push — no party_get_snapshot command needed.
    expect(runSpy).not.toHaveBeenCalledWith(
      "party_get_snapshot",
      expect.anything(),
      expect.anything()
    );
    // Bless is requested fire-and-forget when no bless snapshot has arrived yet.
    expect(runSpy).toHaveBeenCalledWith(
      "bless_get_snapshot",
      {},
      expect.objectContaining({ force: true, waitForResponse: false })
    );
    expect(session.view.party.partySnapshotSynced).toBe(true);
  });
});

describe("event matchers", () => {
  it("identifies bootstrap, party, and tasks snapshot events", () => {
    expect(
      isBootstrapEvent(
        jsonEvent("receive", { type: ReceiveMessageTypes.SESSION_BOOTSTRAP, data: {} }, "{}")
      )
    ).toBe(true);
    expect(
      isPartySnapshotEvent(
        jsonEvent("receive", { type: ReceiveMessageTypes.PARTY_SNAPSHOT, data: {} }, "{}")
      )
    ).toBe(true);
    expect(
      isTasksSnapshotEvent(
        jsonEvent("receive", { type: ReceiveMessageTypes.TASKS_SNAPSHOT, data: {} }, "{}")
      )
    ).toBe(true);
  });
});

describe("waitForQuestSnapshot", () => {
  it("resolves from pushed tasks:snapshot without quest_get_snapshot", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, { settings: defaultSettings() });
    const runSpy = vi.spyOn(session.commands, "run");

    const waitPromise = waitForQuestSnapshot(session, { timeoutMs: 500 });

    transport.receive({
      type: ReceiveMessageTypes.TASKS_SNAPSHOT,
      data: { activeMonsterTasks: [], finishedTasks: [3] },
    });
    await session.drainMessages();

    await waitPromise;

    expect(runSpy).not.toHaveBeenCalled();
    expect(session.view.character.finishedTasks).toEqual([3]);
  });
});
