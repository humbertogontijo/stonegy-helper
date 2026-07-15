import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBattlePreset } from "../presets";
import { GameSession } from "./session";
import { defaultSettings } from "./settings";
import { defaultSessionView } from "./projections/defaults";
import { patchSessionView } from "./projections/patch";
import { SendMessageTypes } from "../protocol";
import type { Transport } from "./transport";
import { HuntService } from "./services/hunt.service";
import { TasksService } from "./services/tasks.service";

vi.mock("./readiness", () => ({
  waitForPartySnapshot: vi.fn().mockResolvedValue(undefined),
  waitForBlessSnapshot: vi.fn().mockResolvedValue(undefined),
}));

import { waitForPartySnapshot } from "./readiness";

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
    vi.mocked(waitForPartySnapshot).mockResolvedValue(undefined);
  });

  it("starts hunt before enabling auto hunt for party leaders", async () => {
    const session = connectedSession();
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    const result = await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(result.ok).toBe(true);
    expect(waitForPartySnapshot).not.toHaveBeenCalled();
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

  it("waits for party snapshot when party context is missing", async () => {
    const session = connectedSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        partySnapshotSynced: false,
      },
    });
    vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    await session.services.get<HuntService>("hunt").enableAutoHunt(1);

    expect(waitForPartySnapshot).toHaveBeenCalled();
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
