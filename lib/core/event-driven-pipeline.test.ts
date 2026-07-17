import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { ReceiveMessageTypes, SendMessageTypes, type StonegyMessage } from "../protocol";
import type { Transport, WireMessage } from "./transport";
import { LONG_COOLDOWN } from "./commands/cooldown";
import { HuntService } from "./services/hunt.service";
import { LootService } from "./services/loot.service";
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
    bless: {
      ...defaultSessionView().bless,
      blessSnapshotSynced: true,
      ownedCount: 7,
      lastSnapshotAt: Date.now(),
    },
  });
  return session;
}

describe("event-driven tasker pipeline", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("delivers after HUNT_FINISHED when task progress is already known", async () => {
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

    expect(session.settings.taskerPhase).toBe("delivering");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
      { questId: 6, missionId: 1 },
      { cooldownMs: 1000 }
    );
  });

  it("waits for loot sell/split after HUNT_FINISHED before delivering", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "hunting",
      autoHuntEnabled: true,
      autoSellLoot: true,
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
    expect(session.settings.taskerStatus).toBe("Hunt finished — waiting for loot…");
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
      expect.anything(),
      expect.anything()
    );

    // Simulate loot pipeline completing (flow cleared + back to idle).
    session.services
      .get<LootService>("loot")
      .applyPendingHuntLootPatch({ pendingHuntLootSell: false });
    session.services.setPlayerState("idling", "");
    await session.services.dispatch({ kind: "loot_pipeline_finished" });
    await session.drainMessages();

    expect(session.settings.taskerPhase).toBe("delivering");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
      { questId: 6, missionId: 1 },
      { cooldownMs: 1000 }
    );
  });

  it("leaves the hunt when get_tasks shows the mission is complete", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "hunting",
      taskerTargetHuntId: 48,
      autoHuntEnabled: true,
    });
    session.view = patchSessionView(session.view, {
      party: { ...session.view.party, partyStatus: "hunting" },
      hunt: { ...session.view.hunt, activeHuntId: 48 },
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

    const leaveSpy = vi
      .spyOn(session.services.get<HuntService>("hunt"), "leaveHuntIfActive")
      .mockResolvedValue({ left: true });
    vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

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

    expect(session.settings.taskerStatus).toBe("Task complete — finishing current hunt…");
    expect(session.settings.autoHuntEnabled).toBe(false);
    expect(leaveSpy).toHaveBeenCalled();
  });

  it("requests get_tasks after HUNT_FINISHED when quest context is missing", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "hunting",
      autoHuntEnabled: true,
    });
    session.view = patchSessionView(session.view, {
      market: { ...defaultSessionView().market, lastQuestSnapshotAt: null },
      quests: { activeMonsterTasks: [] },
      character: { ...session.view.character, finishedTasks: [], finishedQuests: [] },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    transport.receive({ type: ReceiveMessageTypes.HUNT_FINISHED, data: { reason: "completed" } });
    await session.drainMessages();

    expect(session.settings.taskerPhase).toBe("syncing");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.GET_TASKS,
      {},
      { force: true, waitForResponse: false }
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
    expect(session.settings.taskerStatus).toBe("Reward claimed — next task…");
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

  it("requests get_tasks without blocking when quest context is missing at idle", async () => {
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
      SendMessageTypes.GET_TASKS,
      {},
      { force: true, waitForResponse: false }
    );
  });

  it("debounces get_tasks on monster_loot while hunting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "hunting",
      autoHuntEnabled: true,
    });
    const tasks = session.services.get<TasksService>("tasks");
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    const lootEvent = {
      kind: "monster_loot" as const,
      direction: "receive" as const,
      data: { subType: 1 as const, totalLootValue: 10, dropCount: 0, drops: [] },
      raw: "",
    };

    await tasks.onEvent(lootEvent);
    await tasks.onEvent(lootEvent);
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.GET_TASKS,
      {},
      { force: true, waitForResponse: false }
    );

    vi.setSystemTime(LONG_COOLDOWN);
    await tasks.onEvent(lootEvent);
    expect(runSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe("player_death stops hunt automation", () => {
  const deathPayload = {
    expLost: 100,
    levelBefore: 50,
    levelAfter: 49,
    itemsDeathLost: [],
    blessingsBeforeDeathCount: 0,
    hadAolEquipped: false,
    aolConsumed: false,
    mode: "pve",
    deathAt: "2026-07-15T00:15:27.985Z",
  };

  it("stops auto hunt on player_death", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
    });

    transport.receive({
      type: ReceiveMessageTypes.PLAYER_DEATH,
      data: deathPayload,
    });
    await session.drainMessages();

    expect(session.settings.autoHuntEnabled).toBe(false);
    expect(session.settings.autoTaskerEnabled).toBe(false);
  });

  it("stops auto tasker (and hunt) on player_death", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoTaskerEnabled: true,
      autoHuntEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "hunting",
      taskerStatus: "Hunting for task",
      taskerTargetHuntId: 1,
    });

    transport.receive({
      type: ReceiveMessageTypes.PLAYER_DEATH,
      data: deathPayload,
    });
    await session.drainMessages();

    expect(session.settings.autoTaskerEnabled).toBe(false);
    expect(session.settings.autoHuntEnabled).toBe(false);
    expect(session.settings.taskerPhase).toBe("idle");
    expect(session.services.get<TasksService>("tasks").snapshot()).toMatchObject({
      phase: "idle",
      targetHuntId: null,
    });
  });
});

describe("event-driven auto-hunt pipeline", () => {
  it("starts the hunt directly without disbanding a solo party", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({
      sent: true,
      success: true,
    });

    const result = await session.services.get<HuntService>("hunt").startHunt(1, { force: true });
    expect(result).toEqual({ ok: true });
    expect(runSpy).not.toHaveBeenCalledWith(SendMessageTypes.PARTY_DISBAND, {});
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

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({
      sent: true,
      success: true,
    });

    await session.services.dispatch({ kind: "loot_pipeline_finished" });
    await session.drainMessages();

    expect(runSpy).not.toHaveBeenCalledWith(SendMessageTypes.PARTY_DISBAND, {});
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
      autoConfirmPartyHunt: true,
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
      autoConfirmPartyHunt: false,
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

  it("enters awaiting_ready on party ready-check and does not start hunt again", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
      autoConfirmPartyHunt: true,
    });
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyMemberCount: 2,
        partyLeaderId: "hero-1",
      },
    });

    const readyCheckSnapshot = {
      meId: "hero-1",
      party: {
        status: "idle" as const,
        members: [{ id: "hero-1" }, { id: "member-2" }],
        leaderId: "hero-1",
        readyCheck: {
          id: "rc-wait",
          initiatedBy: "hero-1",
          memberStatuses: {
            "hero-1": "pending",
            "member-2": "pending",
          },
        },
      },
    };

    const originalSend = transport.send.bind(transport);
    transport.send = async (opcode, data) => {
      await originalSend(opcode, data);
      const msg = JSON.parse(data) as StonegyMessage;
      if (msg.type === SendMessageTypes.START_HUNT) {
        queueMicrotask(() => {
          transport.receive({
            type: ReceiveMessageTypes.PARTY_SNAPSHOT,
            data: readyCheckSnapshot,
          });
        });
      }
      if (msg.type === SendMessageTypes.PARTY_READY_CHECK_CONFIRM) {
        queueMicrotask(() => {
          transport.receive({
            type: ReceiveMessageTypes.PARTY_SNAPSHOT,
            data: {
              ...readyCheckSnapshot,
              party: {
                ...readyCheckSnapshot.party,
                readyCheck: {
                  ...readyCheckSnapshot.party.readyCheck,
                  memberStatuses: {
                    "hero-1": "confirmed",
                    "member-2": "pending",
                  },
                },
              },
            },
          });
        });
      }
    };

    await session.services.dispatch({ kind: "loot_pipeline_finished" });
    await session.drainMessages();

    const hunt = session.services.get<HuntService>("hunt");
    expect(hunt.snapshot().huntFlow).toMatchObject({ phase: "awaiting_ready" });
    expect(hunt.isAwaitingHuntStart()).toBe(true);

    const startCount = transport.sent.filter((line) => line.includes('"start_hunt"')).length;
    expect(startCount).toBe(1);

    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        ...readyCheckSnapshot,
        party: {
          ...readyCheckSnapshot.party,
          readyCheck: {
            ...readyCheckSnapshot.party.readyCheck,
            memberStatuses: {
              "hero-1": "confirmed",
              "member-2": "pending",
            },
          },
        },
      },
    });
    await session.drainMessages();

    expect(transport.sent.filter((line) => line.includes('"start_hunt"')).length).toBe(1);
    expect(hunt.snapshot().huntFlow).toMatchObject({ phase: "awaiting_ready" });
  }, 10_000);

  it("leaves awaiting_ready when ready_check_cancel arrives", async () => {
    const transport = new RelayTransport();
    const session = leaderSession(transport, {
      autoHuntEnabled: true,
      selectedHuntId: 1,
      autoConfirmPartyHunt: false,
    });
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyMemberCount: 2,
        partyLeaderId: "hero-1",
      },
    });

    const originalSend = transport.send.bind(transport);
    transport.send = async (opcode, data) => {
      await originalSend(opcode, data);
      const msg = JSON.parse(data) as StonegyMessage;
      if (msg.type === SendMessageTypes.START_HUNT) {
        queueMicrotask(() => {
          transport.receive({
            type: ReceiveMessageTypes.PARTY_SNAPSHOT,
            data: {
              meId: "hero-1",
              party: {
                status: "idle",
                members: [{ id: "hero-1" }, { id: "member-2" }],
                leaderId: "hero-1",
                readyCheck: {
                  id: "rc-expire",
                  initiatedBy: "hero-1",
                  memberStatuses: {
                    "hero-1": "pending",
                    "member-2": "pending",
                  },
                },
              },
            },
          });
        });
      }
      if (msg.type === SendMessageTypes.PARTY_READY_CHECK_CONFIRM) {
        queueMicrotask(() => {
          transport.receive({
            type: ReceiveMessageTypes.PARTY_SNAPSHOT,
            data: {
              meId: "hero-1",
              party: {
                status: "idle",
                members: [{ id: "hero-1" }, { id: "member-2" }],
                leaderId: "hero-1",
                readyCheck: {
                  id: "rc-expire",
                  initiatedBy: "hero-1",
                  memberStatuses: {
                    "hero-1": "confirmed",
                    "member-2": "pending",
                  },
                },
              },
            },
          });
        });
      }
    };

    await session.services.dispatch({ kind: "loot_pipeline_finished" });
    await session.drainMessages();

    const hunt = session.services.get<HuntService>("hunt");
    expect(hunt.snapshot().huntFlow).toMatchObject({ phase: "awaiting_ready" });

    // Avoid a post-cancel auto-restart racing this assertion.
    session.updateSettings({ autoHuntEnabled: false });

    transport.receive({
      type: ReceiveMessageTypes.PARTY_ACTION_RESULT,
      data: {
        action: "ready_check_cancel",
        success: false,
        message: "Confirmação de prontidão expirou.",
        display: "toast",
      },
    });
    transport.receive({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        meId: "hero-1",
        party: {
          status: "idle",
          members: [{ id: "hero-1" }, { id: "member-2" }],
          leaderId: "hero-1",
          readyCheck: null,
        },
      },
    });
    await session.drainMessages();

    expect(hunt.snapshot().huntFlow).toMatchObject({ phase: "idle" });
    expect(hunt.isAwaitingHuntStart()).toBe(false);
  }, 10_000);
});
