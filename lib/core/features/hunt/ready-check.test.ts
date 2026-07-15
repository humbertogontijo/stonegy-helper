import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GameSession } from "../../session";
import { defaultSettings } from "../../settings";
import { defaultSessionView } from "../../projections/defaults";
import { patchSessionView } from "../../projections/patch";
import { ReceiveMessageTypes, SendMessageTypes } from "../../../protocol";
import type { Transport } from "../../transport";
import type { StonegyMessage } from "../../../types";
import { jsonEvent } from "../../events/types";
import { ToolsService } from "../../services/tools.service";

class RelayTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

function partySnapshotWithReadyCheck(
  readyCheckId = "rc-1",
  memberStatus: "pending" | "confirmed" = "pending"
) {
  return jsonEvent(
    "receive",
    {
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        meId: "member-1",
        party: {
          members: [{ id: "member-1" }, { id: "member-2" }],
          readyCheck: {
            id: readyCheckId,
            memberStatuses: {
              "member-1": memberStatus,
              "member-2": "confirmed",
            },
          },
        },
      },
    } as StonegyMessage,
    "{}"
  );
}

async function handleReadyCheck(session: GameSession, event: ReturnType<typeof partySnapshotWithReadyCheck>) {
  await session.services.get<ToolsService>("tools").onEvent(event);
  await session.drainMessages();
}

function seedFullBlessings(session: GameSession): void {
  session.view = patchSessionView(session.view, {
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
}

describe("handleReadyCheckEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirms a pending ready check when enabled", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    seedFullBlessings(session);

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(session, partySnapshotWithReadyCheck());

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-1" },
      { cooldownMs: 1000 }
    );
    expect(session.services.get<ToolsService>("tools").getConfirmedReadyCheckIds()).toEqual(["rc-1"]);
  });

  it("confirms ready check when meId is missing but characterId matches", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      character: { characterId: "leader-1" },
      party: { partySnapshotSynced: true, partyLeaderId: "leader-1", partyMemberCount: 2 },
    });
    seedFullBlessings(session);

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(
      session,
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.PARTY_SNAPSHOT,
          data: {
            party: {
              members: [{ id: "leader-1" }, { id: "member-2" }],
              readyCheck: {
                id: "rc-no-meid",
                initiatedBy: "leader-1",
                memberStatuses: {
                  "member-2": "pending",
                },
              },
            },
          },
        } as StonegyMessage,
        "{}"
      )
    );

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-no-meid" },
      { cooldownMs: 1000 }
    );
  });

  it("confirms ready check initiated by the leader even when status is absent", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    seedFullBlessings(session);

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(
      session,
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.PARTY_SNAPSHOT,
          data: {
            meId: "leader-1",
            party: {
              members: [{ id: "leader-1" }, { id: "member-2" }],
              readyCheck: {
                id: "rc-leader",
                initiatedBy: "leader-1",
                memberStatuses: {
                  "member-2": "pending",
                },
              },
            },
          },
        } as StonegyMessage,
        "{}"
      )
    );

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-leader" },
      { cooldownMs: 1000 }
    );
  });

  it("skips when disabled", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: defaultSettings(),
    });
    seedFullBlessings(session);

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(session, partySnapshotWithReadyCheck());

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("remembers ready check when blessings are missing (does not confirm yet)", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    session.view = patchSessionView(session.view, {
      bless: {
        blessSnapshotSynced: true,
        ownedCount: 3,
        skillLossReductionPercent: 20,
        itemLossPercent: 10,
        hasAolEquipped: false,
        blessings: [],
        lastSnapshotAt: Date.now(),
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });
    const tools = session.services.get<ToolsService>("tools");

    await handleReadyCheck(session, partySnapshotWithReadyCheck());

    expect(runSpy).not.toHaveBeenCalled();
    expect(tools.getPendingReadyCheckId()).toBe("rc-1");
  });

  it("buys missing blessings then confirms the remembered ready check", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
        autoBuyBless: true,
      },
    });
    session.view = patchSessionView(session.view, {
      character: { goldCoins: 1_000_000 },
      bless: {
        blessSnapshotSynced: true,
        ownedCount: 6,
        skillLossReductionPercent: 40,
        itemLossPercent: 5,
        hasAolEquipped: false,
        blessings: [
          {
            id: 2,
            name: "The Wisdom of Solitude",
            tier: "REGULAR",
            iconPath: "",
            owned: true,
            cost: 100,
          },
          {
            id: 3,
            name: "The Spark of the Phoenix",
            tier: "REGULAR",
            iconPath: "",
            owned: true,
            cost: 100,
          },
          {
            id: 4,
            name: "The Fire of the Suns",
            tier: "REGULAR",
            iconPath: "",
            owned: true,
            cost: 100,
          },
          {
            id: 5,
            name: "The Spiritual Shielding",
            tier: "REGULAR",
            iconPath: "",
            owned: true,
            cost: 100,
          },
          {
            id: 6,
            name: "The Embrace of Tibia",
            tier: "REGULAR",
            iconPath: "",
            owned: true,
            cost: 100,
          },
          {
            id: 7,
            name: "Heart of the Mountain",
            tier: "ENHANCED",
            iconPath: "",
            owned: true,
            cost: 200,
          },
          {
            id: 8,
            name: "Blood of the Mountain",
            tier: "ENHANCED",
            iconPath: "",
            owned: false,
            cost: 200,
          },
        ],
        lastSnapshotAt: Date.now(),
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });
    const tools = session.services.get<ToolsService>("tools");

    await handleReadyCheck(session, partySnapshotWithReadyCheck());
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.BLESS_BUY,
      { blessingId: 8 },
      { cooldownMs: 1000 }
    );
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-1" },
      { cooldownMs: 1000 }
    );
    expect(tools.getConfirmedReadyCheckIds()).toEqual(["rc-1"]);
    expect(tools.getPendingReadyCheckId()).toBeNull();
  });

  it("confirms a remembered ready check after blessings become complete", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    session.view = patchSessionView(session.view, {
      bless: {
        blessSnapshotSynced: true,
        ownedCount: 3,
        skillLossReductionPercent: 20,
        itemLossPercent: 10,
        hasAolEquipped: false,
        blessings: [],
        lastSnapshotAt: Date.now(),
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });
    const tools = session.services.get<ToolsService>("tools");

    await handleReadyCheck(session, partySnapshotWithReadyCheck());
    expect(tools.getPendingReadyCheckId()).toBe("rc-1");
    expect(runSpy).not.toHaveBeenCalled();

    // Player buys blessings (or another character flow updates snapshot).
    session.view = patchSessionView(session.view, {
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

    await tools.onEvent(
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.BLESS_SNAPSHOT,
          data: {
            ownedCount: 7,
            skillLossReductionPercent: 56,
            itemLossPercent: 0,
            hasAolEquipped: false,
            blessings: [],
          },
        } as StonegyMessage,
        "{}"
      )
    );
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-1" },
      { cooldownMs: 1000 }
    );
    expect(tools.getPendingReadyCheckId()).toBeNull();
  });

  it("skips ready checks that were already confirmed", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    seedFullBlessings(session);
    session.services.get<ToolsService>("tools").seedRuntimeIds({ confirmedReadyCheckIds: ["rc-1"] });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(session, partySnapshotWithReadyCheck());

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("skips when the member status is not pending", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    seedFullBlessings(session);

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(session, partySnapshotWithReadyCheck("rc-1", "confirmed"));

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("waits for idle while hunting, then confirms without leaving", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      party: { partyStatus: "hunting" },
      hunt: { activeHuntId: 42 },
      playerState: "hunting",
    });
    seedFullBlessings(session);

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });
    const tools = session.services.get<ToolsService>("tools");

    await handleReadyCheck(session, partySnapshotWithReadyCheck());
    await session.drainMessages();

    expect(tools.getPendingReadyCheckId()).toBe("rc-1");
    expect(runSpy).not.toHaveBeenCalled();

    // Hunt ended — idle state change fulfills the pending ready-check.
    session.view = patchSessionView(session.view, {
      hunt: { activeHuntId: null },
      party: { partyStatus: "idle" },
      playerState: "idling",
    });
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-1" },
      { cooldownMs: 1000 }
    );
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.LEAVE_HUNT,
      expect.anything(),
      expect.anything()
    );
    expect(tools.getConfirmedReadyCheckIds()).toEqual(["rc-1"]);
  });

  it("waits for idle while selling loot, then confirms", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    seedFullBlessings(session);
    session.services.setPlayerState("selling_loot", "Selling…");

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });
    const tools = session.services.get<ToolsService>("tools");

    await handleReadyCheck(session, partySnapshotWithReadyCheck());
    await session.drainMessages();

    expect(tools.getPendingReadyCheckId()).toBe("rc-1");
    expect(runSpy).not.toHaveBeenCalled();

    session.services.setPlayerState("idling", "Loot sold");
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-1" },
      { cooldownMs: 1000 }
    );
  });

  it("leaves training then confirms once idle", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      party: { partyStatus: "training" },
      training: { activeTrainingId: "train-1" },
      playerState: "training",
    });
    seedFullBlessings(session);

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true, success: true });

    const pending = handleReadyCheck(session, partySnapshotWithReadyCheck());

    await vi.runAllTimersAsync();
    await pending;
    await session.drainMessages();

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.FINISH_TRAINING,
      {},
      expect.objectContaining({ cooldownMs: 2500, timeoutMs: 4000 })
    );
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.TRAINING_PRESENCE_UNSUBSCRIBE,
      { trainingId: "train-1" },
      { cooldownMs: 500 }
    );
    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-1" },
      { cooldownMs: 1000 }
    );
    expect(session.view.playerState).toBe("idling");
    expect(session.services.get<ToolsService>("tools").getConfirmedReadyCheckIds()).toEqual(["rc-1"]);
  });
});
