import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GameSession } from "../../session";
import { defaultSettings } from "../../settings";
import { ReceiveMessageTypes, SendMessageTypes } from "../../../protocol";
import type { Transport } from "../../transport";
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

function partySnapshot(members: Array<{ id: string; name?: string }>, leaderId = "hero-1") {
  return jsonEvent(
    "receive",
    {
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        meId: "hero-1",
        party: {
          status: "idle",
          leaderId,
          members,
        },
      },
    } as StonegyMessage,
    "{}"
  );
}

async function handleEvent(session: GameSession, event: GameEvent) {
  await session.services.applyDomains(event);
  await session.services.get<ToolsService>("tools").onEvent(event);
}

describe("auto disband solo party", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disbands after party drops from multiple members to one", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoDisbandSoloParty: true,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleEvent(
      session,
      partySnapshot([
        { id: "hero-1", name: "Hero" },
        { id: "other-1", name: "Other" },
      ])
    );
    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.PARTY_DISBAND,
      expect.anything(),
      expect.anything()
    );

    await handleEvent(session, partySnapshot([{ id: "hero-1", name: "Hero" }]));

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_DISBAND,
      {},
      { cooldownMs: 1000 }
    );
  });

  it("does not disband a newly created solo party", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoDisbandSoloParty: true,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleEvent(session, partySnapshot([{ id: "hero-1", name: "Hero" }]));

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("skips when the setting is off", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoDisbandSoloParty: false,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleEvent(
      session,
      partySnapshot([
        { id: "hero-1", name: "Hero" },
        { id: "other-1", name: "Other" },
      ])
    );
    await handleEvent(session, partySnapshot([{ id: "hero-1", name: "Hero" }]));

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("skips while hunting", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoDisbandSoloParty: true,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleEvent(
      session,
      partySnapshot([
        { id: "hero-1", name: "Hero" },
        { id: "other-1", name: "Other" },
      ])
    );

    await handleEvent(
      session,
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.PARTY_SNAPSHOT,
          data: {
            meId: "hero-1",
            party: {
              status: "hunting",
              leaderId: "hero-1",
              currentHuntId: 42,
              members: [{ id: "hero-1", name: "Hero" }],
            },
          },
        } as StonegyMessage,
        "{}"
      )
    );

    expect(runSpy).not.toHaveBeenCalledWith(
      SendMessageTypes.PARTY_DISBAND,
      expect.anything(),
      expect.anything()
    );
  });

  it("disbands after hunt finishes while left alone", async () => {
    const session = new GameSession(new RelayTransport(), {
      settings: {
        ...defaultSettings(),
        autoDisbandSoloParty: true,
      },
    });

    const runSpy = vi.spyOn(session.commands, "run").mockResolvedValue({ sent: true });

    await handleEvent(
      session,
      partySnapshot([
        { id: "hero-1", name: "Hero" },
        { id: "other-1", name: "Other" },
      ])
    );

    await handleEvent(
      session,
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.PARTY_SNAPSHOT,
          data: {
            meId: "hero-1",
            party: {
              status: "hunting",
              leaderId: "hero-1",
              currentHuntId: 42,
              members: [{ id: "hero-1", name: "Hero" }],
            },
          },
        } as StonegyMessage,
        "{}"
      )
    );

    await handleEvent(
      session,
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.HUNT_FINISHED,
          data: {},
        } as StonegyMessage,
        "{}"
      )
    );

    expect(runSpy).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_DISBAND,
      {},
      { cooldownMs: 1000 }
    );
  });
});
