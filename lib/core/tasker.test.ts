import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { SendMessageTypes } from "../protocol";
import type { Transport } from "./transport";
import { TasksService } from "./services/tasks.service";
import { HuntService } from "./services/hunt.service";
import { BattleService } from "./services/battle.service";

class MockTransport implements Transport {
  sent: string[] = [];

  async connect(): Promise<void> {}
  async send(_opcode: 1 | 2, data: string): Promise<void> {
    this.sent.push(data);
  }
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

function taskerSession(transport: MockTransport): GameSession {
  const session = new GameSession(transport, {
    settings: {
      ...defaultSettings(),
      autoTaskerEnabled: true,
      selectedTaskQuestId: 6,
      taskerPhase: "idle",
    },
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
    },
    quests: { activeMonsterTasks: [] },
    market: { ...defaultSessionView().market, lastQuestSnapshotAt: Date.now() },
  });
  return session;
}

describe("advanceTasker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not get stuck on syncing after enabling from idle", async () => {
    const transport = new MockTransport();
    const session = taskerSession(transport);
    vi.spyOn(session.services.get<HuntService>("hunt"), "startHunt").mockResolvedValue({ ok: true });
    vi.spyOn(session.services.get<BattleService>("battle"), "lockLureForHunt").mockResolvedValue();
    vi.spyOn(session.services.get<BattleService>("battle"), "shouldAutoLockLure").mockReturnValue(false);
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<TasksService>("tasks").advanceTasker();

    expect(session.settings.taskerPhase).toBe("starting");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.QUEST_START_MONSTER_TASK,
      expect.objectContaining({ questId: 6 }),
      { cooldownMs: 1000 }
    );
  });

  it("waits in starting phase until tasks snapshot arrives", async () => {
    const transport = new MockTransport();
    const session = taskerSession(transport);
    session.settings = { ...session.settings, taskerPhase: "starting" };
    const runSpy = vi.spyOn(session.commands, "run");

    await session.services.get<TasksService>("tasks").advanceTasker();

    expect(runSpy).not.toHaveBeenCalled();
    expect(session.settings.taskerPhase).toBe("starting");
  });

  it("enters syncing and requests quest snapshot when quest context is missing at idle", async () => {
    const transport = new MockTransport();
    const session = taskerSession(transport);
    session.view = patchSessionView(session.view, {
      market: { ...defaultSessionView().market, lastQuestSnapshotAt: null },
      character: { ...session.view.character, finishedTasks: [] },
    });
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<TasksService>("tasks").advanceTasker();

    expect(session.settings.taskerPhase).toBe("syncing");
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.QUEST_GET_SNAPSHOT,
      {},
      expect.objectContaining({ force: true, waitForResponse: false })
    );
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.QUEST_START_MONSTER_TASK,
      expect.anything(),
      expect.anything()
    );
  });
});
