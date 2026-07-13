import { describe, expect, it } from "vitest";
import { CommandBus } from "./bus";
import { defaultSessionView } from "../projections/defaults";
import { patchSessionView } from "../projections/patch";
import { ReceiveMessageTypes, type StonegyMessage } from "../../protocol";
import type { Transport, WireMessage } from "../transport";

class MockTransport implements Transport {
  private handler: ((message: WireMessage) => void) | null = null;
  private sendHook: (() => void) | null = null;

  async connect(): Promise<void> {}
  async send(): Promise<void> {
    this.sendHook?.();
  }
  onMessage(handler: (message: WireMessage) => void): void {
    this.handler = handler;
  }
  onConnectionChange(): void {}
  close(): void {}

  onSend(hook: () => void): void {
    this.sendHook = hook;
  }

  emitReceive(message: StonegyMessage): void {
    this.handler?.({ direction: "receive", opcode: 1, data: JSON.stringify(message) });
  }
}

describe("CommandBus response waiters", () => {
  it("resolves quest snapshot registered before send", async () => {
    const transport = new MockTransport();
    let view = defaultSessionView();
    const bus = new CommandBus(transport, () => view);

    transport.onSend(() => {
      view = patchSessionView(view, {
        market: { ...view.market, lastQuestSnapshotAt: Date.now() },
        character: {
          ...view.character,
          finishedTasks: [],
        },
        quests: {
          ...view.quests,
          activeMonsterTasks: [
            {
              questId: 6,
              missionId: 1,
              monsterId: 1,
              requiredAmount: 10,
              currentAmount: 0,
              met: false,
            },
          ],
        },
      });
      bus.notifyResponse(
        {
          type: ReceiveMessageTypes.TASKS_SNAPSHOT,
          data: {
            activeMonsterTasks: [
              {
                questId: 6,
                missionId: 1,
                monsterId: 1,
                requiredAmount: 10,
                currentAmount: 0,
                met: false,
              },
            ],
          },
        },
        view
      );
    });

    const result = await bus.run("quest_get_snapshot", {}, { force: true, timeoutMs: 1000 });

    expect(result.success).not.toBe(false);
    expect(view.market.lastQuestSnapshotAt).not.toBeNull();
  });

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

  it("does not block unrelated commands while another is waiting to timeout", async () => {
    const transport = new MockTransport();
    let view = defaultSessionView();
    const bus = new CommandBus(transport, () => view);

    let sendCount = 0;
    transport.onSend(() => {
      sendCount += 1;
      if (sendCount === 2) {
        bus.notifyResponse({ type: ReceiveMessageTypes.PONG, data: {} }, view);
      }
    });

    const stuckQuest = bus.run("quest_get_snapshot", {}, { force: true, timeoutMs: 200, retries: 0 });
    const ping = bus.run("ping", { t: Date.now() }, { force: true, timeoutMs: 200, retries: 0 });

    const pingResult = await ping;
    const questResult = await stuckQuest;

    expect(pingResult.success).not.toBe(false);
    expect(questResult.success).toBe(false);
    expect(questResult.errorMessage).toMatch(/Timed out waiting for/);
    expect(sendCount).toBe(2);
  });

  it("retries once after a response timeout", async () => {
    const transport = new MockTransport();
    let view = defaultSessionView();
    const bus = new CommandBus(transport, () => view);

    let sendCount = 0;
    transport.onSend(() => {
      sendCount += 1;
      if (sendCount === 2) {
        view = patchSessionView(view, {
          market: { ...view.market, lastQuestSnapshotAt: Date.now() },
        });
        bus.notifyResponse(
          {
            type: ReceiveMessageTypes.TASKS_SNAPSHOT,
            data: { activeMonsterTasks: [] },
          },
          view
        );
      }
    });

    const result = await bus.run("quest_get_snapshot", {}, { force: true, timeoutMs: 50 });

    expect(result.success).not.toBe(false);
    expect(sendCount).toBe(2);
  });

  it("gives up after timeout retries are exhausted", async () => {
    const transport = new MockTransport();
    const view = defaultSessionView();
    const bus = new CommandBus(transport, () => view);

    let sendCount = 0;
    transport.onSend(() => {
      sendCount += 1;
    });

    const result = await bus.run("quest_get_snapshot", {}, {
      force: true,
      timeoutMs: 30,
      retries: 1,
    });

    expect(result.success).toBe(false);
    expect(result.sent).toBe(true);
    expect(result.errorMessage).toMatch(/Timed out waiting for/);
    expect(sendCount).toBe(2);
  });

  it("matches gold transfer responses by requestId", async () => {
    const transport = new MockTransport();
    let view = defaultSessionView();
    const bus = new CommandBus(transport, () => view);

    transport.onSend(() => {
      bus.notifyResponse(
        {
          type: ReceiveMessageTypes.GOLD_TRANSFER_RESULT,
          data: {
            success: true,
            message: "Transferred to Alice.",
            requestId: "gold_transfer_stale",
          },
        },
        view
      );
      bus.notifyResponse(
        {
          type: ReceiveMessageTypes.GOLD_TRANSFER_RESULT,
          data: {
            success: true,
            message: "Transferred to Bob.",
            requestId: "gold_transfer_current",
          },
        },
        view
      );
    });

    const result = await bus.run(
      "gold_transfer",
      { targetName: "Bob", amount: 200, requestId: "gold_transfer_current" },
      { force: true, goldTransferRequestId: "gold_transfer_current", timeoutMs: 1000 }
    );

    expect(result.success).not.toBe(false);
    expect(result.response?.data).toMatchObject({
      success: true,
      requestId: "gold_transfer_current",
    });
  });

  it("resolves leave_hunt on hunt_finished", async () => {
    const transport = new MockTransport();
    let view = defaultSessionView();
    const bus = new CommandBus(transport, () => view);

    transport.onSend(() => {
      view = patchSessionView(view, {
        hunt: { ...view.hunt, activeHuntId: null },
        party: { ...view.party, partyStatus: "idle" },
      });
      bus.notifyResponse(
        {
          type: ReceiveMessageTypes.HUNT_FINISHED,
          data: { reason: "hunt_left", mode: "hunt" },
        },
        view
      );
    });

    const result = await bus.run("leave_hunt", {}, { force: true, timeoutMs: 1000 });

    expect(result.success).not.toBe(false);
    expect(view.hunt.activeHuntId).toBeNull();
    expect(view.party.partyStatus).toBe("idle");
  });

  it("rejects pending waiters when clear() is called", async () => {
    const transport = new MockTransport();
    const bus = new CommandBus(transport, () => defaultSessionView());

    const pending = bus.run("party_get_snapshot", {}, { force: true, timeoutMs: 5_000 });
    // Allow the send + waiter to arm.
    await Promise.resolve();
    bus.clear();

    const result = await pending;
    expect(result.sent).toBe(true);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/cleared/i);
  });

  it("returns send failure without leaving an unhandled rejection", async () => {
    const transport = new MockTransport();
    transport.onSend(() => {
      throw new Error("transport down");
    });
    const bus = new CommandBus(transport, () => defaultSessionView());

    const result = await bus.run("party_get_snapshot", {}, { force: true, timeoutMs: 1_000 });
    expect(result.sent).toBe(false);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/transport down/);
  });
});
