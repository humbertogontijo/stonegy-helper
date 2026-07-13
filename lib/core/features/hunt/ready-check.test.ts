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

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(session, partySnapshotWithReadyCheck());

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("skips ready checks that were already confirmed", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoConfirmReadyCheck: true,
      },
    });
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

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(session, partySnapshotWithReadyCheck("rc-1", "confirmed"));

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("confirms ready check while hunting without leaving the hunt", async () => {
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
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleReadyCheck(session, partySnapshotWithReadyCheck());

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
    expect(session.services.get<ToolsService>("tools").getConfirmedReadyCheckIds()).toEqual(["rc-1"]);
  });

  it("finishes training, unsubscribes presence, waits 5s, then confirms", async () => {
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
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    const pending = handleReadyCheck(session, partySnapshotWithReadyCheck());

    await vi.runAllTimersAsync();
    await pending;

    expect(runSpy).toHaveBeenNthCalledWith(
      1,
      SendMessageTypes.FINISH_TRAINING,
      {},
      expect.objectContaining({ cooldownMs: 2500, timeoutMs: 4000 })
    );
    expect(runSpy).toHaveBeenNthCalledWith(
      2,
      SendMessageTypes.TRAINING_PRESENCE_UNSUBSCRIBE,
      { trainingId: "train-1" },
      { cooldownMs: 500 }
    );
    expect(runSpy).toHaveBeenNthCalledWith(
      3,
      SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
      { readyCheckId: "rc-1" },
      { cooldownMs: 1000 }
    );
    expect(runSpy).toHaveBeenCalledTimes(3);
    expect(session.services.get<ToolsService>("tools").getConfirmedReadyCheckIds()).toEqual(["rc-1"]);
  });
});
