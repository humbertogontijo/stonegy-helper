import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBattlePreset } from "../presets";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { SendMessageTypes, ReceiveMessageTypes } from "../protocol";
import type { Transport } from "./transport";
import { HuntService } from "./services/hunt.service";
import { TasksService } from "./services/tasks.service";
import { BattleService } from "./services/battle.service";

vi.mock("./readiness", () => ({
  QUEST_PUSH_WAIT_MS: 4_000,
  requestBlessSnapshot: vi.fn(),
  requestPartySnapshot: vi.fn(),
  requestQuestSnapshot: vi.fn(),
}));

import {
  requestBlessSnapshot,
  requestPartySnapshot,
} from "./readiness";

class MockTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

function connectedSession(): GameSession {
  const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
  session.view = patchSessionView(defaultSessionView(), {
    connection: { connected: true, readyState: 1 },
    character: { ...defaultSessionView().character, characterId: "hero-1" },
    party: {
      ...defaultSessionView().party,
      partySnapshotSynced: true,
      partyStatus: "idle",
      partyLeaderId: "hero-1",
      partyMemberCount: null,
    },
    bless: {
      blessSnapshotSynced: true,
      ownedCount: 7,
      skillLossReductionPercent: 56,
      itemLossPercent: 0,
      hasAolEquipped: false,
      blessings: [],
      lastSnapshotAt: Date.now(),
    },
  });
  session.settings = { ...session.settings, selectedHuntId: 1 };
  return session;
}

describe("hunt-control", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts hunt before enabling auto hunt for party leaders", async () => {
    const session = connectedSession();
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    const result = await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(result.ok).toBe(true);
    expect(requestPartySnapshot).not.toHaveBeenCalled();
    expect(requestBlessSnapshot).not.toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 1 }),
      expect.objectContaining({ force: true })
    );
    expect(session.settings.autoHuntEnabled).toBe(true);
    expect(result.state).toBeDefined();
    // Flow-trace must not embed botState (creates a JSON cycle on Safari).
    expect(() => JSON.stringify(session.botState)).not.toThrow();
  });

  it("START_HUNT uses event skills when auto-apply presets is off", async () => {
    const session = connectedSession();
    session.settings = {
      ...session.settings,
      autoApplyPresets: false,
      huntBattleByHuntId: {
        1: {
          partyPositionX: null,
          partyPositionY: null,
          selectedLureId: null,
          battlePreset: createBattlePreset({
            selectedSkills: ["Configured A", "Configured B", null, null],
          }),
        },
      },
    };
    session.services.setBattlePreset(
      createBattlePreset({ selectedSkills: ["Last Used", null, null, null] })
    );
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<HuntService>("hunt").startHunt(1, { force: true });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      {
        huntId: 1,
        skillsSelected: ["Last Used", null, null, null],
      },
      expect.anything()
    );
  });

  it("START_HUNT uses configured preset skills when auto-apply presets is on", async () => {
    const session = connectedSession();
    session.settings = {
      ...session.settings,
      autoApplyPresets: true,
      huntBattleByHuntId: {
        1: {
          partyPositionX: null,
          partyPositionY: null,
          selectedLureId: null,
          battlePreset: createBattlePreset({
            selectedSkills: ["Configured A", "Configured B", null, null],
          }),
        },
      },
    };
    session.services.setBattlePreset(
      createBattlePreset({ selectedSkills: ["Last Used", null, null, null] })
    );
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<HuntService>("hunt").startHunt(1, { force: true });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      {
        huntId: 1,
        skillsSelected: ["Configured A", "Configured B", null, null],
      },
      expect.anything()
    );
  });

  it("leaves training and starts hunt when selecting a startable hunt with auto hunt on", async () => {
    vi.useFakeTimers();
    const session = connectedSession();
    session.updateSettings({ autoHuntEnabled: true, selectedHuntId: null });
    session.updateView({
      playerState: "training",
      party: { ...session.view.party, partyStatus: "training" },
      training: { activeTrainingId: "train-1" },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockImplementation(async (type) => {
      if (type === SendMessageTypes.FINISH_TRAINING) {
        session.updateView({
          playerState: "idling",
          party: { ...session.view.party, partyStatus: "idle" },
          training: { activeTrainingId: null },
        });
      }
      if (type === SendMessageTypes.START_HUNT) {
        session.updateView({
          playerState: "hunting",
          party: { ...session.view.party, partyStatus: "hunting" },
          hunt: { ...session.view.hunt, activeHuntId: 57 },
        });
      }
      return { sent: true, success: true };
    });

    session.updateSettings({ selectedHuntId: 57 });
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.FINISH_TRAINING,
      expect.any(Object),
      expect.any(Object)
    );
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 57 }),
      expect.any(Object)
    );
    expect(session.services.get<BattleService>("battle").selectedHuntId).toBe(57);

    vi.useRealTimers();
  });

  it("defers auto-restart until BLESS_SNAPSHOT when blessings are not synced", async () => {
    vi.useFakeTimers();
    const session = connectedSession();
    session.updateView({
      bless: {
        ...session.view.bless,
        blessSnapshotSynced: false,
        ownedCount: null,
        blessings: [],
        lastSnapshotAt: null,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    session.settings = {
      ...session.settings,
      autoHuntEnabled: true,
      selectedHuntId: 57,
    };
    session.services.get<BattleService>("battle").applySelectedHuntId(57);

    const startPromise = session.services.get<HuntService>("hunt").tryStartFromSelectionChange();
    await vi.runAllTimersAsync();
    await startPromise;

    expect(requestBlessSnapshot).toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );

    session.updateView({
      bless: {
        ...session.view.bless,
        blessSnapshotSynced: true,
        ownedCount: 7,
        lastSnapshotAt: Date.now(),
      },
    });

    await session.services.get<HuntService>("hunt").onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.BLESS_SNAPSHOT,
        data: {
          ownedCount: 7,
          skillLossReductionPercent: 56,
          itemLossPercent: 0,
          hasAolEquipped: false,
          blessings: [],
        },
      },
      raw: "",
    });
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 57 }),
      expect.any(Object)
    );

    vi.useRealTimers();
  });

  it("stops tasker on stamina_depleted the same way as insufficient gold", async () => {
    vi.useFakeTimers();
    const session = connectedSession();
    session.settings = {
      ...session.settings,
      autoHuntEnabled: true,
      autoTaskerEnabled: true,
      taskerPhase: "hunting",
      selectedHuntId: 1,
    };

    await session.services.get<HuntService>("hunt").onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_FINISHED,
        data: { reason: "stamina_depleted" },
      },
      raw: "",
    });
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(session.settings.autoHuntEnabled).toBe(false);
    expect(session.settings.autoTaskerEnabled).toBe(false);
    expect(session.settings.taskerPhase).toBe("error");
    expect(session.settings.taskerStatus).toContain("Stamina");

    vi.useRealTimers();
  });

  it("stops auto-hunt on insufficient_gold without restarting", async () => {
    vi.useFakeTimers();
    const session = connectedSession();
    session.settings = {
      ...session.settings,
      autoHuntEnabled: true,
      selectedHuntId: 1,
    };
    session.services.get<BattleService>("battle").applySelectedHuntId(1);
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<HuntService>("hunt").onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_FINISHED,
        data: { reason: "insufficient_gold", mode: "hunt" },
      },
      raw: "",
    });
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(session.settings.autoHuntEnabled).toBe(false);
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );

    vi.useRealTimers();
  });

  it("restarts auto-hunt after insufficient_capacity without clearing autoHuntEnabled", async () => {
    vi.useFakeTimers();
    const session = connectedSession();
    session.settings = {
      ...session.settings,
      autoHuntEnabled: true,
      selectedHuntId: 1,
      autoSellLoot: false,
      autoSplitLootOnHuntFinished: false,
    };
    session.services.get<BattleService>("battle").applySelectedHuntId(1);
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<HuntService>("hunt").onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_FINISHED,
        data: {
          reason: "insufficient_capacity",
          mode: "hunt",
          bossFight: null,
          questFight: null,
          finishInfos: null,
          currentMana: 3073,
        },
      },
      raw: "",
    });
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(session.settings.autoHuntEnabled).toBe(true);
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 1 }),
      expect.any(Object)
    );

    vi.useRealTimers();
  });

  it("defers capacity-finish restart when loot sell owns the finish", async () => {
    vi.useFakeTimers();
    const session = connectedSession();
    await session.services.setMasters({
      loot: true,
      hunt: true,
    });
    session.settings = {
      ...session.settings,
      autoHuntEnabled: true,
      selectedHuntId: 1,
      autoSellLoot: true,
    };
    session.services.get<BattleService>("battle").applySelectedHuntId(1);
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<HuntService>("hunt").onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_FINISHED,
        data: { reason: "insufficient_capacity", mode: "hunt" },
      },
      raw: "",
    });
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(session.settings.autoHuntEnabled).toBe(true);
    expect(session.services.getPlayerState().playerStateDetail).toContain(
      "selling then restarting"
    );
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );

    vi.useRealTimers();
  });

  it("rejects auto hunt when not party leader", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyLeaderId: "other-leader",
        partyMemberCount: 2,
      },
    });
    const runSpy = vi.spyOn(session.commands, "run");

    const result = await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("party leader");
    expect(runSpy).not.toHaveBeenCalled();
    expect(session.settings.autoHuntEnabled).toBe(false);
  });

  it("rejects auto tasker when not party leader", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyLeaderId: "other-leader",
        partyMemberCount: 2,
      },
    });
    const startSpy = vi.spyOn(session.services.get<TasksService>("tasks"), "startAutoTasker");

    const result = await session.services.get<TasksService>("tasks").enableAutoTasker(6);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("party leader");
    expect(startSpy).not.toHaveBeenCalled();
    expect(session.settings.autoTaskerEnabled).toBe(false);
  });

  it("rejects auto hunt and requests party:snapshot when party context is missing", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partySnapshotSynced: false,
      },
    });
    const runSpy = vi.spyOn(session.commands, "run");

    const result = await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("party:snapshot");
    expect(requestPartySnapshot).toHaveBeenCalledWith(session);
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );
    expect(session.settings.autoHuntEnabled).toBe(false);
  });

  it("rejects auto hunt and requests bless:snapshot when blessings are not synced", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      bless: {
        ...session.view.bless,
        blessSnapshotSynced: false,
        ownedCount: null,
        blessings: [],
        lastSnapshotAt: null,
      },
    });
    const runSpy = vi.spyOn(session.commands, "run");

    const result = await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("bless:snapshot");
    expect(requestBlessSnapshot).toHaveBeenCalledWith(session);
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );
    expect(session.settings.autoHuntEnabled).toBe(false);
  });

  it("rejects auto tasker and requests party:snapshot when party context is missing", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partySnapshotSynced: false,
      },
    });
    const startSpy = vi.spyOn(
      session.services.get<TasksService>("tasks"),
      "startAutoTasker"
    );

    const result = await session.services
      .get<TasksService>("tasks")
      .enableAutoTasker(6);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("party:snapshot");
    expect(requestPartySnapshot).toHaveBeenCalledWith(session);
    expect(startSpy).not.toHaveBeenCalled();
    expect(session.settings.autoTaskerEnabled).toBe(false);
  });

  it("rejects Task now and requests party:snapshot when party context is missing", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partySnapshotSynced: false,
      },
    });

    const result = await session.services
      .get<TasksService>("tasks")
      .runTaskNow(6);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("party:snapshot");
    expect(requestPartySnapshot).toHaveBeenCalledWith(session);
  });

  it("does not enable auto hunt when hunt start fails", async () => {
    const session = connectedSession();
    vi.spyOn(session.commands, "run").mockResolvedValue({
      sent: true,
      success: false,
      errorMessage: "Hunt start failed.",
    });

    const result = await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Hunt start failed");
    expect(session.settings.autoHuntEnabled).toBe(false);
  });

  it("enables auto hunt but defers START_HUNT while a party member is offline", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyLeaderId: "hero-1",
        partyMemberCount: 2,
        partyMembers: [
          { id: "hero-1", name: "Hero", isOnline: true },
          { id: "mate-1", name: "AllyA", isOnline: false },
        ],
      },
    });
    const runSpy = vi.spyOn(session.commands, "run");

    const result = await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("AllyA");
    expect(session.settings.autoHuntEnabled).toBe(true);
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );
  });

  it("auto-starts hunt on PARTY_SNAPSHOT once offline members are online", async () => {
    vi.useFakeTimers();
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyLeaderId: "hero-1",
        partyMemberCount: 2,
        partyMembers: [
          { id: "hero-1", name: "Hero", isOnline: true },
          { id: "mate-1", name: "AllyA", isOnline: false },
        ],
      },
    });
    session.settings = {
      ...session.settings,
      autoHuntEnabled: true,
      selectedHuntId: 1,
    };
    session.services.get<BattleService>("battle").applySelectedHuntId(1);
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({
      sent: true,
      success: true,
      response: {
        type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
        data: { hunt: { id: 1 } },
      },
    });

    // Still offline — must not start.
    await session.services.get<HuntService>("hunt").handleAutoHuntEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.PARTY_SNAPSHOT,
        data: {
          meId: "hero-1",
          party: {
            status: "idle",
            leaderId: "hero-1",
            members: [
              { id: "hero-1", name: "Hero", isOnline: true },
              { id: "mate-1", name: "AllyA", isOnline: false },
            ],
          },
        },
      },
      raw: "",
    });

    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.anything(),
      expect.anything()
    );

    // Member comes online — PartyState updates via domains before cores in production;
    // seed the projection then fire the auto-restart event.
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partyMembers: [
          { id: "hero-1", name: "Hero", isOnline: true },
          { id: "mate-1", name: "AllyA", isOnline: true },
        ],
      },
    });

    const startPromise = session.services.get<HuntService>("hunt").handleAutoHuntEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.PARTY_SNAPSHOT,
        data: {
          meId: "hero-1",
          party: {
            status: "idle",
            leaderId: "hero-1",
            members: [
              { id: "hero-1", name: "Hero", isOnline: true },
              { id: "mate-1", name: "AllyA", isOnline: true },
            ],
          },
        },
      },
      raw: "",
    });
    await vi.runAllTimersAsync();
    await startPromise;

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.START_HUNT,
      expect.objectContaining({ huntId: 1 }),
      expect.anything()
    );

    vi.useRealTimers();
  });

  it("blocks disabling auto hunt while tasker controls it", async () => {
    const session = connectedSession();
    session.settings = {
      ...session.settings,
      autoHuntEnabled: true,
      autoTaskerEnabled: true,
    };

    const result = await session.services.get<HuntService>("hunt").disableAutoHunt();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tasker");
    expect(session.settings.autoHuntEnabled).toBe(true);
  });

  it("blocks disabling tasker while claiming", async () => {
    const session = connectedSession();
    session.settings = {
      ...session.settings,
      autoTaskerEnabled: true,
      taskerPhase: "claiming",
    };

    const result = await session.services.get<TasksService>("tasks").disableAutoTasker();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("claiming");
    expect(session.settings.autoTaskerEnabled).toBe(true);
  });

  it("stops auto hunt without leaving an active hunt", async () => {
    const session = connectedSession();
    session.settings = { ...session.settings, autoHuntEnabled: true };
    session.view = patchSessionView(session.view, {
      party: { ...session.view.party, partyStatus: "hunting" },
      hunt: { ...session.view.hunt, activeHuntId: 42 },
    });
    const leaveSpy = vi
      .spyOn(session.services.get<HuntService>("hunt"), "leaveHuntIfActive")
      .mockResolvedValue({ left: true });

    const result = await session.services.get<HuntService>("hunt").disableAutoHunt();

    expect(leaveSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(session.settings.autoHuntEnabled).toBe(false);
  });

  it("stops auto tasker without leaving an active hunt", async () => {
    const session = connectedSession();
    session.settings = { ...session.settings, autoTaskerEnabled: true };
    session.view = patchSessionView(session.view, {
      party: { ...session.view.party, partyStatus: "hunting" },
      hunt: { ...session.view.hunt, activeHuntId: 42 },
    });
    const leaveSpy = vi
      .spyOn(session.services.get<HuntService>("hunt"), "leaveHuntIfActive")
      .mockResolvedValue({ left: true });

    const result = await session.services.get<TasksService>("tasks").disableAutoTasker();

    expect(leaveSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(session.settings.autoTaskerEnabled).toBe(false);
  });
});
