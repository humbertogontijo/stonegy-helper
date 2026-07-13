import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { ReceiveMessageTypes, SendMessageTypes, type StonegyMessage } from "../protocol";
import type { Transport, WireMessage } from "./transport";
import { HuntService } from "./services/hunt.service";
import { TasksService } from "./services/tasks.service";

class RelayTransport implements Transport {
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

  receive(message: StonegyMessage): void {
    this.handler?.({
      direction: "receive",
      opcode: 1,
      data: JSON.stringify(message),
    });
  }
}

function leaderSession(
  transport: RelayTransport,
  settings: Partial<ReturnType<typeof defaultSettings>> = {}
): GameSession {
  const session = new GameSession(transport, {
    settings: { ...defaultSettings(), ...settings },
  });
  session.view = patchSessionView(defaultSessionView(), {
    connection: { connected: true, readyState: 1 },
    character: {
      ...defaultSessionView().character,
      characterId: "hero-1",
      level: 50,
      finishedTasks: [],
    },
    party: {
      ...defaultSessionView().party,
      partySnapshotSynced: true,
      partyStatus: "idle",
      partyLeaderId: "hero-1",
      partyMemberCount: 1,
    },
    quests: { activeMonsterTasks: [] },
    market: { ...defaultSessionView().market, lastQuestSnapshotAt: Date.now() },
  });
  return session;
}

describe("event-driven tasker pipeline", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("advances tasker when TASKS_SNAPSHOT arrives after HUNT_FINISHED", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "hunting",
      autoHuntEnabled: true,
    });
    session.view = patchSessionView(session.view, {
      quests: {
        activeMonsterTasks: [
          {
            questId: 6,
            missionId: 1,
            monsterId: 1,
            requiredAmount: 10,
            currentAmount: 10,
            met: true,
          },
        ],
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    transport.receive({ type: ReceiveMessageTypes.HUNT_FINISHED, data: { reason: "completed" } });
    await session.drainMessages();

    expect(session.settings.taskerPhase).toBe("syncing");
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
      expect.anything(),
      expect.anything()
    );

    transport.receive({
      type: ReceiveMessageTypes.TASKS_SNAPSHOT,
      data: {
        activeMonsterTasks: [
          {
            questId: 6,
            missionId: 1,
            monsterId: 1,
            requiredAmount: 10,
            currentAmount: 10,
            met: true,
          },
        ],
        finishedTasks: [],
      },
    });
    await session.drainMessages();

    expect(session.settings.taskerPhase).toBe("delivering");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
      { questId: 6, missionId: 1 },
      { cooldownMs: 1000 }
    );
  });

  it("progresses after claim_reward when TASKS_SNAPSHOT arrives on the next message", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "claiming",
    });
    session.view = patchSessionView(session.view, {
      character: {
        ...session.view.character,
        finishedTasks: [1],
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    transport.receive({
      type: ReceiveMessageTypes.QUEST_ACTION_RESULT,
      data: { action: "claim_reward", success: true, message: "Reward claimed." },
    });
    await session.drainMessages();

    expect(session.settings.taskerPhase).toBe("syncing");
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.QUEST_START_MONSTER_TASK,
      expect.anything(),
      expect.anything()
    );

    transport.receive({
      type: ReceiveMessageTypes.TASKS_SNAPSHOT,
      data: {
        activeMonsterTasks: [],
        finishedTasks: [1, 2],
      },
    });
    await session.drainMessages();

    expect(session.settings.taskerPhase).toBe("starting");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.QUEST_START_MONSTER_TASK,
      expect.objectContaining({ questId: 6 }),
      { cooldownMs: 1000 }
    );
  });

  it("requests quest snapshot without blocking when quest context is missing at idle", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "idle",
    });
    session.view = patchSessionView(session.view, {
      market: { ...defaultSessionView().market, lastQuestSnapshotAt: null },
      character: { ...session.view.character, finishedTasks: [] },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await session.services.get<TasksService>("tasks").advanceTasker();

    expect(session.settings.taskerPhase).toBe("syncing");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.QUEST_GET_SNAPSHOT,
      {},
      expect.objectContaining({ force: true, waitForResponse: false })
    );
  });
});

describe("event-driven auto-hunt pipeline", () => {
  it("defers hunt start after solo disband until PARTY_SNAPSHOT arrives", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
    });

    const runSpy = vi.spyOn(session.commands, "run").mockImplementation(async (type) => {
      if (type === SendMessageTypes.PARTY_DISBAND) {
        return { sent: true, success: true };
      }
      if (type === SendMessageTypes.START_HUNT) {
        return { sent: true, success: true };
      }
      return { sent: true };
    });

    const deferred = await session.services.get<HuntService>("hunt").startHunt(1, { force: true });
    expect(deferred).toEqual({ ok: true, deferred: true });
    expect(runSpy).toHaveBeenCalledWith(SendMessageTypes.PARTY_DISBAND, {});
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        party: { status: "idle", members: [] },
        meId: "hero-1",
      },
    });
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 1 }),
      expect.anything()
    );
  });

  it("waits for party snapshot after disband on imperative UI path", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, { selectedHuntId: 1 });

    let disbanded = false;
    const runSpy = vi.spyOn(session.commands, "run").mockImplementation(async (type) => {
      if (type === SendMessageTypes.PARTY_DISBAND) {
        disbanded = true;
        return { sent: true, success: true };
      }
      if (type === SendMessageTypes.START_HUNT) {
        return { sent: true, success: true };
      }
      return { sent: true };
    });

    const waitPromise = session.services.get<HuntService>("hunt").startHunt(1, {
      force: true,
      awaitPartyAfterDisband: true,
    });

    await vi.waitFor(() => expect(disbanded).toBe(true));

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        party: { status: "idle", members: [{ id: "hero-1", name: "Hero" }] },
        meId: "hero-1",
      },
    });
    await session.drainMessages();

    const result = await waitPromise;
    expect(result.ok).toBe(true);
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 1 }),
      expect.anything()
    );
  });

  it("does not auto-restart on HUNT_FINISHED while loot sell owns the finish", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
      autoSellLoot: true,
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    transport.receive({
      type: ReceiveMessageTypes.HUNT_FINISHED,
      data: { reason: "completed" },
    });
    await session.drainMessages();

    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );
  });

  it("does not auto-restart on PARTY_SNAPSHOT while selling loot", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
    });
    session.services.setPlayerState("selling_loot", "Selling…");

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        party: { status: "idle", members: [{ id: "hero-1" }], leaderId: "hero-1" },
        meId: "hero-1",
      },
    });
    await session.drainMessages();

    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );
  });

  it("auto-restarts after loot_pipeline_finished when idle", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
    });

    const runSpy = vi.spyOn(session.commands, "run").mockImplementation(async (type) => {
      if (type === SendMessageTypes.PARTY_DISBAND || type === SendMessageTypes.START_HUNT) {
        return { sent: true, success: true };
      }
      return { sent: true, success: true };
    });

    await session.services.dispatch({ kind: "loot_pipeline_finished" });
    await session.drainMessages();

    // Solo party disbands first; start is deferred until the next PARTY_SNAPSHOT.
    expect(runSpy).toHaveBeenCalledWith(SendMessageTypes.PARTY_DISBAND, {});

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        party: { status: "idle", members: [] },
        meId: "hero-1",
      },
    });
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 1 }),
      expect.anything()
    );
  });

  it("processes ready-check while a deferred auto-restart waits for bootstrap", async () => {
    const transport = new RelayTransport();
    let releaseStartHunt: (() => void) | null = null;
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
      autoConfirmReadyCheck: true,
    });
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyMemberCount: 2,
        partyLeaderId: "hero-1",
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_HUNT) {
        await new Promise<void>((resolve) => {
          releaseStartHunt = resolve;
        });
        session.updateView({ hunt: { activeHuntId: 1 }, party: { partyStatus: "hunting" } });
        return { sent: true, success: true };
      }
      return { sent: true, success: true };
    });

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        party: {
          status: "idle",
          members: [{ id: "hero-1" }, { id: "member-2" }],
          leaderId: "hero-1",
        },
        meId: "hero-1",
      },
    });
    // Wire handler + deferred startHunt kickoff (startHunt stays pending).
    // Auto-restart waits PIPELINE_COOLDOWNS.beforeRestart before START_HUNT.
    await vi.waitFor(
      () => {
        expect(runSpy).toHaveBeenCalledWith(
          SendMessageTypes.START_HUNT,
          expect.objectContaining({ huntId: 1 }),
          expect.anything()
        );
      },
      { timeout: 5_000 }
    );

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        meId: "hero-1",
        party: {
          status: "idle",
          members: [{ id: "hero-1" }, { id: "member-2" }],
          leaderId: "hero-1",
          readyCheck: {
            id: "rc-party",
            initiatedBy: "hero-1",
            memberStatuses: { "member-2": "pending" },
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(runSpy).toHaveBeenCalledWith(
        SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
        { readyCheckId: "rc-party" },
        { cooldownMs: 1000 }
      );
    });

    expect(releaseStartHunt).toBeTypeOf("function");
    releaseStartHunt!();
    await session.drainMessages();
  });

  it("confirms ready-check during auto-restart even when Tools ready-check toggle is off", async () => {
    const transport = new RelayTransport();
    let releaseStartHunt: (() => void) | null = null;
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
      autoConfirmReadyCheck: false,
    });
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyMemberCount: 2,
        partyLeaderId: "hero-1",
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_HUNT) {
        await new Promise<void>((resolve) => {
          releaseStartHunt = resolve;
        });
        session.updateView({ hunt: { activeHuntId: 1 }, party: { partyStatus: "hunting" } });
        return { sent: true, success: true };
      }
      return { sent: true, success: true };
    });

    // Kick off restart without awaiting deferred START_HUNT (held open below).
    void session.services.dispatch({ kind: "loot_pipeline_finished" });

    await vi.waitFor(
      () => {
        expect(runSpy).toHaveBeenCalledWith(
          SendMessageTypes.START_HUNT,
          expect.objectContaining({ huntId: 1 }),
          expect.anything()
        );
      },
      { timeout: 5_000 }
    );

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        meId: "hero-1",
        party: {
          status: "idle",
          members: [{ id: "hero-1" }, { id: "member-2" }],
          leaderId: "hero-1",
          readyCheck: {
            id: "rc-auto-hunt",
            initiatedBy: "hero-1",
            memberStatuses: { "hero-1": "pending", "member-2": "pending" },
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(runSpy).toHaveBeenCalledWith(
        SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
        { readyCheckId: "rc-auto-hunt" },
        { cooldownMs: 1000 }
      );
    });

    expect(releaseStartHunt).toBeTypeOf("function");
    releaseStartHunt!();
    await session.drainMessages();
  }, 10_000);
});
