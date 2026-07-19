import { describe, expect, it } from "vitest";
import { ReceiveMessageTypes } from "../../protocol";
import { replayWireCapture, type ReplayCaptureRecord } from "./harness";

describe("replayWireCapture", () => {
  it("replays a synthetic party snapshot and syncs party/character", async () => {
    const partyPayload = {
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        party: {
          status: "idle",
          members: [{ id: "hero-1", name: "Hero", level: 42 }],
          leaderId: "hero-1",
        },
        meId: "hero-1",
      },
    };

    const capture: ReplayCaptureRecord[] = [
      {
        direction: "receive",
        opcode: 1,
        data: JSON.stringify({
          type: ReceiveMessageTypes.SESSION_BOOTSTRAP,
          data: {
            character: {
              id: "hero-1",
              nickname: "Hero",
              finishedTasks: [],
              activeMonsterTasks: [],
            },
          },
        }),
      },
      {
        direction: "receive",
        opcode: 1,
        data: JSON.stringify(partyPayload),
      },
    ];

    const { view, botState } = await replayWireCapture(capture);

    expect(view.party.partySnapshotSynced).toBe(true);
    expect(view.party.partyStatus).toBe("idle");
    expect(view.character.characterId).toBe("hero-1");
    expect(botState.party.partySnapshotSynced).toBe(true);
    expect(botState.character.characterId).toBe("hero-1");
  });

  it("ignores outbound send records in a capture", async () => {
    const capture: ReplayCaptureRecord[] = [
      {
        direction: "send",
        opcode: 1,
        data: JSON.stringify({ type: "party_get_snapshot", data: {} }),
      },
      {
        direction: "receive",
        opcode: 1,
        data: JSON.stringify({
          type: ReceiveMessageTypes.PARTY_SNAPSHOT,
          data: {
            party: { status: "idle", members: [{ id: "p1", name: "P" }], leaderId: "p1" },
            meId: "p1",
          },
        }),
      },
    ];

    const { view, transport } = await replayWireCapture(capture);

    expect(view.party.partySnapshotSynced).toBe(true);
    expect(view.character.characterId).toBe("p1");
    expect(transport.sent).toHaveLength(0);
  });
});
