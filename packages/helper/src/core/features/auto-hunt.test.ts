import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GameSession } from "../session";
import { defaultSettings } from "../settings";
import { defaultSessionView } from "../projections/defaults";
import { patchSessionView } from "../projections/patch";
import { ReceiveMessageTypes, SendMessageTypes, type StonegyMessage } from "../../protocol";
import { createBattlePreset } from "../../presets";
import type { Transport, WireMessage } from "../transport";
import { getHuntLureRange } from "../../hunts";
import { BattleService } from "../services/battle.service";
import { PIPELINE_COOLDOWNS } from "../commands/cooldown";

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

function partyHuntSession(transport: RelayTransport, overrides: {
  characterId?: string;
  partyLeaderId?: string;
  partyMemberCount?: number;
} = {}): GameSession {
  const session = new GameSession(transport, {
    settings: {
      ...defaultSettings(),
      autoPlacePartyPosition: true,
      selectedHuntId: 1,
      huntBattleByHuntId: {
        1: {
          partyPositionX: 2,
          partyPositionY: 0,
          selectedLureId: null,
          battlePreset: null,
        },
      },
    },
  });
  session.view = patchSessionView(defaultSessionView(), {
    connection: { connected: true, readyState: 1 },
    character: {
      ...defaultSessionView().character,
      characterId: overrides.characterId ?? "member-2",
    },
    party: {
      ...defaultSessionView().party,
      partySnapshotSynced: true,
      partyStatus: "hunting",
      partyLeaderId: overrides.partyLeaderId ?? "leader-1",
      partyMemberCount: overrides.partyMemberCount ?? 2,
    },
    hunt: {
      ...defaultSessionView().hunt,
      activeHuntId: 1,
      currentPartyTileX: 0,
      currentPartyTileY: 0,
    },
  });
  return session;
}

describe("attemptAutoPlacePartyPosition", () => {
  it("places position for non-leader party members", async () => {
    const transport = new RelayTransport();
    const session = partyHuntSession(transport, {
      characterId: "member-2",
      partyLeaderId: "leader-1",
    });
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await session.services.get<BattleService>("battle").attemptAutoPlacePartyPosition(1);

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
      { x: 2, y: 0 },
      { cooldownMs: 1000 }
    );
  });

  it("skips placement for solo hunts", async () => {
    const transport = new RelayTransport();
    const session = partyHuntSession(transport, { partyMemberCount: 1 });
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await session.services.get<BattleService>("battle").attemptAutoPlacePartyPosition(1);

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("places position when auto toggle is off", async () => {
    const transport = new RelayTransport();
    const session = partyHuntSession(transport, {
      characterId: "member-2",
      partyLeaderId: "leader-1",
    });
    session.updateSettings({ autoPlacePartyPosition: false });
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await session.services.get<BattleService>("battle").attemptAutoPlacePartyPosition(1);

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
      { x: 2, y: 0 },
      { cooldownMs: 1000 }
    );
  });

  it("skips placement when party position is not configured", async () => {
    const transport = new RelayTransport();
    const session = partyHuntSession(transport, {
      characterId: "member-2",
      partyLeaderId: "leader-1",
    });
    session.updateSettings({
      huntBattleByHuntId: {
        1: {
          partyPositionX: null,
          partyPositionY: null,
          selectedLureId: null,
          battlePreset: null,
        },
      },
    });
    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await session.services.get<BattleService>("battle").attemptAutoPlacePartyPosition(1);

    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe("handleAutoHuntEvent party position", () => {
  it("retries placement when hunt:update_players supplies the current tile", async () => {
    const transport = new RelayTransport();
    const session = partyHuntSession(transport, {
      characterId: "member-2",
      partyLeaderId: "leader-1",
    });
    session.view = patchSessionView(session.view, {
      hunt: {
        ...session.view.hunt,
        currentPartyTileX: null,
        currentPartyTileY: null,
        lastBootstrapHuntId: 1,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    transport.receive({
      type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
      data: {
        players: [{ id: "member-2", position: { x: 0, y: 0 } }],
      },
    });
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
      { x: 2, y: 0 },
      { cooldownMs: 1000 }
    );
  });
});

describe("hunt bootstrap subfeatures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function receiveAndDrain(transport: RelayTransport, session: GameSession, message: StonegyMessage) {
    transport.receive(message);
    const drained = session.drainMessages();
    await vi.advanceTimersByTimeAsync(PIPELINE_COOLDOWNS.afterHuntBootstrap);
    await drained;
  }

  it("applies lure on bootstrap when hunt matches battle config (solo)", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
        autoLockLure: true,
        huntBattleByHuntId: {
          1: {
            partyPositionX: null,
            partyPositionY: null,
            selectedLureId: 2,
            battlePreset: null,
          },
        },
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        characterId: "solo-1",
      },
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: false,
        partyMemberCount: 0,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 1 } },
    });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_LURE_ID,
      { lureId: 2 },
      { cooldownMs: 1000 }
    );
  });

  it("runs bootstrap for the active hunt from the event", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
        autoLockLure: true,
        autoPlacePartyPosition: true,
        autoApplyPresets: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        characterId: "solo-1",
      },
    });

    vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 2 } },
    });

    expect(session.view.hunt.activeHuntId).toBe(2);
    expect(session.settings.selectedHuntId).toBe(2);
  });

  it("skips auto lure when lure is not configured", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
        autoLockLure: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        characterId: "solo-1",
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 1 } },
    });

    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.HUNT_LURE_ID,
      expect.anything(),
      expect.anything()
    );
  });

  it("updates battle selected hunt from hunt_bootstrap", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
    });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 12 } },
    });

    expect(session.view.hunt.activeHuntId).toBe(12);
    expect(session.view.hunt.activeHuntTitle).toBeNull();
    expect(session.settings.selectedHuntId).toBe(12);
  });

  it("maps quest room bootstrap to synthetic selector hunt id", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
    });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: {
        hunt: {
          id: 900402,
          title: "The Pits of Inferno - Alavanca 14",
          mode: "quest",
          questFight: { questId: 4, missionId: 2 },
        },
      },
    });

    expect(session.view.hunt.activeHuntId).toBe(900402);
    expect(session.view.hunt.activeHuntTitle).toBe("The Pits of Inferno - Alavanca 14");
    expect(session.settings.selectedHuntId).toBe(2_004_002);
  });

  it("maps boss fight bootstrap to synthetic selector id when game id collides", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
    });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: {
        hunt: {
          id: 43,
          title: "Boss - The Count of the Core",
          mode: "boss",
          bossFight: { bossId: 43 },
        },
      },
    });

    expect(session.view.hunt.activeHuntId).toBe(43);
    expect(session.view.hunt.activeHuntTitle).toBe("Boss - The Count of the Core");
    expect(session.settings.selectedHuntId).toBe(1_000_043);
  });

  it("keeps battle selected hunt when bootstrap has no hunt", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 12,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      hunt: { ...defaultSessionView().hunt, activeHuntId: 12 },
    });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: null },
    });

    expect(session.view.hunt.activeHuntId).toBeNull();
    expect(session.settings.selectedHuntId).toBe(12);
  });

  it("applies party position on bootstrap when hunt matches battle config", async () => {
    const transport = new RelayTransport();
    const session = partyHuntSession(transport, {
      characterId: "member-2",
      partyLeaderId: "leader-1",
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: {
        hunt: { id: 1 },
        analyzer: {
          party: {
            leaderId: "leader-1",
            members: [{ id: "leader-1" }, { id: "member-2" }],
          },
        },
      },
    });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
      { x: 2, y: 0 },
      { cooldownMs: 1000 }
    );
  });

  it("re-applies party position on bootstrap after the same hunt finishes", async () => {
    const transport = new RelayTransport();
    const session = partyHuntSession(transport, {
      characterId: "member-2",
      partyLeaderId: "leader-1",
    });
    session.view = patchSessionView(session.view, {
      hunt: {
        ...session.view.hunt,
        lastBootstrapHuntId: 1,
        currentPartyTileX: null,
        currentPartyTileY: null,
      },
    });

    transport.receive({
      type: ReceiveMessageTypes.HUNT_FINISHED,
      data: {},
    });
    await session.drainMessages();

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: {
        hunt: { id: 1 },
        analyzer: {
          party: {
            leaderId: "leader-1",
            members: [{ id: "leader-1" }, { id: "member-2" }],
          },
        },
      },
    });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
      { x: 2, y: 0 },
      { cooldownMs: 1000 }
    );
    expect(session.view.hunt.lastBootstrapHuntId).toBe(1);
  });

  it("applies max lure for tasker leader even without autoLockLure", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
        autoTaskerEnabled: true,
        taskerMaxLure: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        characterId: "leader-1",
      },
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: true,
        partyLeaderId: "leader-1",
        partyMemberCount: 1,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });
    const maxLure = getHuntLureRange(1).max;

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 1 } },
    });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_LURE_ID,
      { lureId: maxLure },
      { cooldownMs: 1000 }
    );
  });

  it("uses battle lure when tasker max lure is off", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
        autoTaskerEnabled: true,
        taskerMaxLure: false,
        autoLockLure: true,
        huntBattleByHuntId: {
          1: {
            partyPositionX: null,
            partyPositionY: null,
            selectedLureId: 2,
            battlePreset: null,
          },
        },
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        characterId: "leader-1",
      },
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: true,
        partyLeaderId: "leader-1",
        partyMemberCount: 1,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 1 } },
    });

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_LURE_ID,
      { lureId: 2 },
      { cooldownMs: 1000 }
    );
  });

  it("does not auto-lock lure when tasker max lure is off and autoLockLure is off", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
        autoTaskerEnabled: true,
        taskerMaxLure: false,
        autoLockLure: false,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        characterId: "leader-1",
      },
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: true,
        partyLeaderId: "leader-1",
        partyMemberCount: 1,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await receiveAndDrain(transport, session, {
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 1 } },
    });

    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.HUNT_LURE_ID,
      expect.anything(),
      expect.anything()
    );
  });

  it("runs presets, position, and lure in parallel on bootstrap", async () => {
    const transport = new RelayTransport();
    const session = new GameSession(transport, {
      settings: {
        ...defaultSettings(),
        selectedHuntId: 1,
        autoApplyPresets: true,
        autoPlacePartyPosition: true,
        autoLockLure: true,
        huntBattleByHuntId: {
          1: {
            partyPositionX: 2,
            partyPositionY: 0,
            selectedLureId: 2,
            battlePreset: createBattlePreset({
              selectedArrow: "Diamond Arrow",
            }),
          },
        },
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      character: {
        ...defaultSessionView().character,
        characterId: "leader-1",
      },
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: true,
        partyLeaderId: "leader-1",
        partyMemberCount: 2,
      },
      hunt: {
        ...defaultSessionView().hunt,
        currentPartyTileX: 0,
        currentPartyTileY: 0,
      },
    });

    let resolvePresets!: () => void;
    const presetsGate = new Promise<void>((resolve) => {
      resolvePresets = resolve;
    });
    const started: string[] = [];
    const runSpy = vi.spyOn(session.commands, "run").mockImplementation(async (type) => {
      started.push(type);
      if (type === SendMessageTypes.SELECT_ARROW) {
        await presetsGate;
      }
      return { sent: true, success: true };
    });

    transport.receive({
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: {
        hunt: { id: 1 },
        analyzer: {
          party: {
            leaderId: "leader-1",
            members: [{ id: "leader-1" }, { id: "member-2" }],
          },
        },
      },
    });
    const drained = session.drainMessages();
    await vi.advanceTimersByTimeAsync(PIPELINE_COOLDOWNS.afterHuntBootstrap);
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual(
      expect.arrayContaining([
        SendMessageTypes.SELECT_ARROW,
        SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
        SendMessageTypes.HUNT_LURE_ID,
      ])
    );
    expect(started).toHaveLength(3);

    resolvePresets();
    await drained;

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.HUNT_LURE_ID,
      { lureId: 2 },
      { cooldownMs: 1000 }
    );

    const flows = session.telemetry.debug.flowTraces.map((trace) => trace.flow);
    expect(flows).toEqual(
      expect.arrayContaining(["apply-presets", "place-position", "lock-lure"])
    );
    const lureTrace = session.telemetry.debug.flowTraces.find((trace) => trace.flow === "lock-lure");
    expect(lureTrace?.outcome).toBe("ok");
    expect(lureTrace?.commands).toEqual([
      { type: SendMessageTypes.HUNT_LURE_ID, success: true },
    ]);
  });
});
