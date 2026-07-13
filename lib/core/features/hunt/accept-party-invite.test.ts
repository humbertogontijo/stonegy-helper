import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GameSession } from "../../session";
import { defaultSettings } from "../../settings";
import { defaultSessionView } from "../../projections/defaults";
import { patchSessionView } from "../../projections/patch";
import { ReceiveMessageTypes, SendMessageTypes } from "../../../protocol";
import type { Transport } from "../../transport";
import type { PartyReceivedInvite } from "../../../protocol-messages";
import type { StonegyMessage } from "../../../types";
import { jsonEvent } from "../../events/types";
import { ToolsService } from "../../services/tools.service";
import type { GameEvent } from "../../events/types";

class RelayTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

const sampleInvite: PartyReceivedInvite = {
  id: "invite-1",
  partyId: "p1",
  createdAt: "",
  sender: { id: "l1", name: "Leader" },
};
function partySnapshotWithInvite(receivedInvites: PartyReceivedInvite[] = []) {
  return jsonEvent(
    "receive",
    {
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        meId: "member-1",
        party: null,
        receivedInvites,
      },
    } as StonegyMessage,
    "{}"
  );
}

async function handleAcceptPartyInvite(session: GameSession, event: GameEvent) {
  await session.services.get<ToolsService>("tools").onEvent(event);
}

describe("handleAcceptPartyInviteEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts the first pending invite when enabled and not in a party", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoAcceptPartyInvite: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleAcceptPartyInvite(
      session,
      partySnapshotWithInvite([
        {
          id: "invite-1",
          partyId: "p1",
          createdAt: "",
          sender: { id: "l1", name: "Leader" },
        },
      ])
    );

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_ACCEPT_INVITE,
      { inviteId: "invite-1" },
      { cooldownMs: 1000 }
    );
    expect(session.services.get<ToolsService>("tools").getAcceptedPartyInviteIds()).toEqual(["invite-1"]);
  });

  it("skips when already in a party", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoAcceptPartyInvite: true,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleAcceptPartyInvite(
      session,
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.PARTY_SNAPSHOT,
          data: {
            party: { members: [{ id: "member-1" }, { id: "member-2" }] },
            receivedInvites: [{ id: "invite-1", partyId: "p1", createdAt: "", sender: { id: "l1", name: "Leader" } }],
          },
        } as StonegyMessage,
        "{}"
      )
    );

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("skips when disabled", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: defaultSettings(),
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleAcceptPartyInvite(
      session,
      partySnapshotWithInvite([sampleInvite])
    );

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("skips invites that were already accepted", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoAcceptPartyInvite: true,
      },
    });
    session.services.get<ToolsService>("tools").seedRuntimeIds({ acceptedPartyInviteIds: ["invite-1"] });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleAcceptPartyInvite(
      session,
      partySnapshotWithInvite([sampleInvite])
    );

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("skips invites from senders outside the allowlist", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoAcceptPartyInvite: true,
        partyInviteAcceptMode: "allowlist",
        partyInviteAllowlistNames: ["Trusted Friend"],
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleAcceptPartyInvite(
      session,
      partySnapshotWithInvite([
        {
          id: "invite-1",
          partyId: "p1",
          createdAt: "",
          sender: { id: "l1", name: "Stranger" },
        },
      ])
    );

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("accepts invites from allowlisted senders", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoAcceptPartyInvite: true,
        partyInviteAcceptMode: "allowlist",
        partyInviteAllowlistNames: ["Trusted Friend"],
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleAcceptPartyInvite(
      session,
      partySnapshotWithInvite([
        {
          id: "invite-1",
          partyId: "p1",
          createdAt: "",
          sender: { id: "l1", name: "trusted friend" },
        },
      ])
    );

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_ACCEPT_INVITE,
      { inviteId: "invite-1" },
      { cooldownMs: 1000 }
    );
  });

  it("leaves hunt, waits 5s, then accepts when actively hunting", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoAcceptPartyInvite: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      party: { partyStatus: "hunting" },
      hunt: { activeHuntId: 42 },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    const pending = handleAcceptPartyInvite(
      session,
      partySnapshotWithInvite([sampleInvite])
    );

    await vi.runAllTimersAsync();
    await pending;

    expect(runSpy).toHaveBeenNthCalledWith(
      1,
      SendMessageTypes.LEAVE_HUNT,
      {},
      expect.objectContaining({ timeoutMs: 4000 })
    );
    expect(runSpy).toHaveBeenNthCalledWith(
      2,
      SendMessageTypes.PARTY_ACCEPT_INVITE,
      { inviteId: "invite-1" },
      { cooldownMs: 1000 }
    );
    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(session.services.get<ToolsService>("tools").getAcceptedPartyInviteIds()).toEqual(["invite-1"]);
  });

  it("finishes training, unsubscribes presence, waits 5s, then accepts", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoAcceptPartyInvite: true,
      },
    });
    session.view = patchSessionView(defaultSessionView(), {
      connection: { connected: true, readyState: 1 },
      party: { partyStatus: "training" },
      training: { activeTrainingId: "train-1" },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    const pending = handleAcceptPartyInvite(
      session,
      partySnapshotWithInvite([sampleInvite])
    );

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
      SendMessageTypes.PARTY_ACCEPT_INVITE,
      { inviteId: "invite-1" },
      { cooldownMs: 1000 }
    );
    expect(runSpy).toHaveBeenCalledTimes(3);
    expect(session.services.get<ToolsService>("tools").getAcceptedPartyInviteIds()).toEqual(["invite-1"]);
  });
});
