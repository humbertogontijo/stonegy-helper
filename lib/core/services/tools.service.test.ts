import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { encodeBossHuntId } from "../../hunt-ids";
import { ReceiveMessageTypes, SendMessageTypes } from "../../protocol";
import { LONG_COOLDOWN } from "../commands/cooldown";
import { GameSession } from "../session";
import type { Transport } from "../transport";
import { defaultSettings } from "../settings";
import {
  DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC,
  ToolsService,
} from "./tools.service";

function createMockTransport(): Transport {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    onConnectionChange: vi.fn(),
    close: vi.fn(),
  };
}

function createSession(settings: Partial<ReturnType<typeof defaultSettings>> = {}) {
  const transport = createMockTransport();
  const session = new GameSession(transport, {
    settings: { ...defaultSettings(), autoTrainingEnabled: true, ...settings },
  });
  session.updateView({
    connection: { connected: true, readyState: 1 },
    character: { ...session.view.character, characterId: "char-1" },
    party: { ...session.view.party, partySnapshotSynced: true },
  });
  session.commands.run = vi.fn().mockResolvedValue({ sent: true, success: true });
  return session;
}

function tools(session: GameSession): ToolsService {
  return session.services.get<ToolsService>("tools");
}

describe("auto training", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts training after the configured idle delay", async () => {
    const session = createSession({ autoTrainingIdleDelaySec: 12 });
    session.commands.run = vi.fn().mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_TRAINING) {
        session.updateView({ training: { activeTrainingId: "train-42" } });
      }
      return { sent: true, success: true };
    });

    tools(session).scheduleAutoTrainingCheck();
    await vi.advanceTimersByTimeAsync(11_999);
    await Promise.resolve();
    expect(session.commands.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.START_TRAINING,
      expect.objectContaining({ skillToTrain: "DISTANCE" }),
      expect.any(Object)
    );
    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.TRAINING_PRESENCE_SUBSCRIBE,
      { trainingId: "train-42" },
      expect.any(Object)
    );
  });

  it("defaults idle delay to 5 seconds", () => {
    const session = createSession();
    expect(tools(session).resolveAutoTrainingIdleDelayMs()).toBe(
      DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC * 1_000
    );
  });

  it("does not start while auto hunt will restart", async () => {
    const session = createSession({
      autoHuntEnabled: true,
      selectedHuntId: 12,
    });
    session.updateView({
      character: { ...session.view.character, characterId: "me" },
      party: { ...session.view.party, partyLeaderId: "me", partySnapshotSynced: true },
      bless: {
        ...session.view.bless,
        blessSnapshotSynced: true,
        ownedCount: 7,
        blessings: Array.from({ length: 7 }, (_, id) => ({
          id,
          name: "b",
          tier: "regular",
          iconPath: "",
          cost: 100,
          owned: true,
        })),
      },
    });

    expect(tools(session).canAutoTrain()).toBe(false);

    tools(session).scheduleAutoTrainingCheck();
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC * 1_000);
    await Promise.resolve();

    expect(session.commands.run).not.toHaveBeenCalled();
  });

  it("starts training when auto hunt is armed but blessings are missing", async () => {
    const session = createSession({
      autoHuntEnabled: true,
      selectedHuntId: 12,
      autoBuyBless: false,
      autoTrainingIdleDelaySec: 1,
    });
    session.updateView({
      character: { ...session.view.character, characterId: "me" },
      party: { ...session.view.party, partyLeaderId: "me", partySnapshotSynced: true },
      bless: {
        ...session.view.bless,
        blessSnapshotSynced: true,
        ownedCount: 3,
        blessings: [
          ...Array.from({ length: 3 }, (_, id) => ({
            id,
            name: "b",
            tier: "regular",
            iconPath: "",
            cost: 100,
            owned: true,
          })),
          ...Array.from({ length: 4 }, (_, i) => ({
            id: i + 3,
            name: "b",
            tier: "regular",
            iconPath: "",
            cost: 100,
            owned: false,
          })),
        ],
      },
    });
    session.commands.run = vi.fn().mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_TRAINING) {
        session.updateView({ training: { activeTrainingId: "train-42" } });
      }
      return { sent: true, success: true };
    });

    expect(tools(session).canAutoTrain()).toBe(true);

    tools(session).scheduleAutoTrainingCheck();
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();

    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.START_TRAINING,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("starts training when auto hunt is on but selected hunt is not startable", async () => {
    const session = createSession({
      autoHuntEnabled: true,
      selectedHuntId: encodeBossHuntId(1),
      autoTrainingIdleDelaySec: 1,
    });
    session.updateView({
      character: { ...session.view.character, characterId: "me" },
      party: { ...session.view.party, partyLeaderId: "me", partySnapshotSynced: true },
    });
    session.commands.run = vi.fn().mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_TRAINING) {
        session.updateView({ training: { activeTrainingId: "train-42" } });
      }
      return { sent: true, success: true };
    });

    expect(tools(session).canAutoTrain()).toBe(true);

    tools(session).scheduleAutoTrainingCheck();
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();

    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.START_TRAINING,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("does not start while selling loot", async () => {
    const session = createSession({ autoSellLoot: true });
    session.services.setPlayerState("selling_loot");

    expect(tools(session).canAutoTrain()).toBe(false);
  });

  it("does not start while splitting loot", async () => {
    const session = createSession({ autoSplitLootOnHuntFinished: true });
    session.services.setPlayerState("splitting_loot");

    expect(tools(session).canAutoTrain()).toBe(false);
  });

  it("does not start while tasker is active", async () => {
    const session = createSession({ autoTaskerEnabled: true, taskerPhase: "hunting" });

    expect(tools(session).canAutoTrain()).toBe(false);
  });

  it("does not start while already training", async () => {
    const session = createSession();
    session.updateView({
      party: { ...session.view.party, partyStatus: "training" },
      training: { ...session.view.training, activeTrainingId: "train-1" },
    });

    expect(tools(session).canAutoTrain()).toBe(false);
  });

  it("does not start while a party ready-check modal is open", async () => {
    const session = createSession({ autoConfirmPartyHunt: false });
    session.updateView({
      party: { ...session.view.party, readyCheckId: "rc-open" },
    });

    expect(tools(session).canAutoTrain()).toBe(false);

    tools(session).scheduleAutoTrainingCheck();
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC * 1_000);
    await Promise.resolve();

    expect(session.commands.run).not.toHaveBeenCalled();
  });

  it("defers idle training until the party ready-check is cleared", async () => {
    const session = createSession({
      autoConfirmPartyHunt: false,
      autoTrainingIdleDelaySec: 1,
    });
    session.commands.run = vi.fn().mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_TRAINING) {
        session.updateView({ training: { activeTrainingId: "train-42" } });
      }
      return { sent: true, success: true };
    });

    const readyCheckSnapshot = {
      kind: "json" as const,
      direction: "receive" as const,
      message: {
        type: ReceiveMessageTypes.PARTY_SNAPSHOT,
        data: {
          meId: "char-1",
          party: {
            status: "idle",
            members: [],
            readyCheck: {
              id: "rc-open",
              memberStatuses: { "char-1": "pending" },
            },
          },
        },
      },
      raw: "",
    };
    const clearedSnapshot = {
      kind: "json" as const,
      direction: "receive" as const,
      message: {
        type: ReceiveMessageTypes.PARTY_SNAPSHOT,
        data: {
          meId: "char-1",
          party: { status: "idle", members: [], readyCheck: null },
        },
      },
      raw: "",
    };

    await tools(session).onEvent(readyCheckSnapshot);
    session.updateView({
      party: { ...session.view.party, readyCheckId: "rc-open" },
    });

    // Ready-check defers with LONG_COOLDOWN; starting must wait for confirm/cancel.
    await vi.advanceTimersByTimeAsync(LONG_COOLDOWN);
    await Promise.resolve();
    expect(session.commands.run).not.toHaveBeenCalled();

    session.updateView({
      party: { ...session.view.party, readyCheckId: null },
    });
    await tools(session).onEvent(clearedSnapshot);

    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.START_TRAINING,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("cancels a pending idle timer", async () => {
    const session = createSession();

    tools(session).scheduleAutoTrainingCheck();
    tools(session).cancelAutoTrainingCheck();
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC * 1_000);
    await Promise.resolve();

    expect(session.commands.run).not.toHaveBeenCalled();
  });

  it("does not reset the idle timer on repeated party snapshots", async () => {
    const session = createSession({ autoTrainingIdleDelaySec: 5 });
    session.commands.run = vi.fn().mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_TRAINING) {
        session.updateView({ training: { activeTrainingId: "train-42" } });
      }
      return { sent: true, success: true };
    });

    const partySnapshot = {
      kind: "json" as const,
      direction: "receive" as const,
      message: {
        type: ReceiveMessageTypes.PARTY_SNAPSHOT,
        data: { party: { status: "idle", members: [] } },
      },
      raw: "",
    };

    await tools(session).onEvent(partySnapshot);
    await vi.advanceTimersByTimeAsync(3_000);

    // More snapshots while waiting must not restart the 5s countdown.
    await tools(session).onEvent(partySnapshot);
    await tools(session).onEvent(partySnapshot);

    await vi.advanceTimersByTimeAsync(1_999);
    await Promise.resolve();
    expect(session.commands.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.START_TRAINING,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("schedules training when auto training is toggled on", async () => {
    const session = createSession({ autoTrainingEnabled: false });
    session.commands.run = vi.fn().mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_TRAINING) {
        session.updateView({ training: { activeTrainingId: "train-42" } });
      }
      return { sent: true, success: true };
    });

    session.updateSettings({ autoTrainingEnabled: true });
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC * 1_000);
    await Promise.resolve();

    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.START_TRAINING,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("waits for training bootstrap before subscribing presence", async () => {
    const session = createSession();
    session.commands.run = vi.fn().mockImplementation(async (type) => {
      if (type === SendMessageTypes.START_TRAINING) {
        session.updateView({ training: { activeTrainingId: "train-new" } });
      }
      return { sent: true, success: true };
    });

    await tools(session).tryStartAutoTraining();

    expect(session.commands.run).toHaveBeenNthCalledWith(
      1,
      SendMessageTypes.START_TRAINING,
      expect.any(Object),
      expect.any(Object)
    );
    expect(session.commands.run).toHaveBeenNthCalledWith(
      2,
      SendMessageTypes.TRAINING_PRESENCE_SUBSCRIBE,
      { trainingId: "train-new" },
      expect.any(Object)
    );
  });
});
