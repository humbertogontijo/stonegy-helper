import { describe, expect, it } from "vitest";
import type { BotState } from "@stonegy/helper/types";
import { defaultSettings } from "@stonegy/helper/core/settings";
import { defaultSessionView } from "@stonegy/helper/core/projections/defaults";
import { toBotState } from "@stonegy/helper/core/projections/to-bot-state";
import { buildPartySummaries } from "./parties";
import type { HelperProfile } from "./profile-store";

function stateWithParty(
  characterId: string,
  name: string,
  members: Array<{ id: string; name: string; isOnline: boolean | null }>
): BotState {
  const view = defaultSessionView();
  view.character.characterId = characterId;
  view.character.characterName = name;
  view.connection.connected = true;
  view.party.partyMembers = members;
  view.party.partySnapshotSynced = true;
  return toBotState(
    { ...defaultSettings(), characterId, characterName: name },
    view
  );
}

function profile(id: string, name: string): HelperProfile {
  return {
    token: "tok",
    characterId: id,
    characterName: name,
    updatedAt: new Date(0).toISOString(),
  };
}

describe("buildPartySummaries extensionLive", () => {
  it("adds a solo party for extension-live characters with no owned session", () => {
    const parties = buildPartySummaries(
      new Map(),
      [profile("char-a", "Alice")],
      new Map([["char-a", "Alice"]])
    );
    expect(parties).toHaveLength(1);
    expect(parties[0]!.partyKey).toBe("solo:char-a");
    expect(parties[0]!.members).toEqual([
      expect.objectContaining({
        characterId: "char-a",
        name: "Alice",
        extensionLive: true,
        connected: false,
        managed: true,
      }),
    ]);
  });

  it("marks roster mates as extensionLive when claimed", () => {
    const states = new Map([
      [
        "char-b",
        stateWithParty("char-b", "Bob", [
          { id: "char-b", name: "Bob", isOnline: true },
          { id: "char-a", name: "Alice", isOnline: true },
        ]),
      ],
    ]);
    const parties = buildPartySummaries(
      states,
      [profile("char-a", "Alice"), profile("char-b", "Bob")],
      new Map([["char-a", "Alice"]])
    );
    expect(parties).toHaveLength(1);
    const alice = parties[0]!.members.find((m) => m.characterId === "char-a");
    expect(alice).toMatchObject({
      extensionLive: true,
      connected: false,
      managed: true,
    });
    const bob = parties[0]!.members.find((m) => m.characterId === "char-b");
    expect(bob).toMatchObject({
      extensionLive: false,
      connected: true,
    });
  });

  it("builds party roster from extension state without marking connected", () => {
    const extensionStates = new Map([
      [
        "char-a",
        stateWithParty("char-a", "Alice", [
          { id: "char-a", name: "Alice", isOnline: true },
          { id: "char-b", name: "Bob", isOnline: true },
        ]),
      ],
    ]);
    const parties = buildPartySummaries(
      new Map(),
      [profile("char-a", "Alice"), profile("char-b", "Bob")],
      new Map([["char-a", "Alice"]]),
      extensionStates
    );
    expect(parties).toHaveLength(1);
    expect(parties[0]!.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          characterId: "char-a",
          extensionLive: true,
          connected: false,
        }),
        expect.objectContaining({
          characterId: "char-b",
          connected: false,
          extensionLive: false,
        }),
      ])
    );
  });
});
