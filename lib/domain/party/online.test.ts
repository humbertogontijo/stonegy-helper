import { describe, expect, it } from "vitest";
import {
  areAllPartyMembersOnline,
  offlinePartyMembers,
  waitingForPartyOnlineMessage,
} from "./online";

describe("offlinePartyMembers / areAllPartyMembersOnline", () => {
  it("does not block solo or empty parties", () => {
    expect(areAllPartyMembersOnline([])).toBe(true);
    expect(
      areAllPartyMembersOnline([{ id: "hero-1", name: "Hero", isOnline: false }])
    ).toBe(true);
  });

  it("ignores the local character and unknown online status", () => {
    const members = [
      { id: "hero-1", name: "Hero", isOnline: true },
      { id: "mate-1", name: "Mate", isOnline: null },
    ];
    expect(areAllPartyMembersOnline(members, { excludeCharacterId: "hero-1" })).toBe(
      true
    );
    expect(offlinePartyMembers(members, { excludeCharacterId: "hero-1" })).toEqual([]);
  });

  it("reports other members who are explicitly offline", () => {
    const members = [
      { id: "hero-1", name: "Hero", isOnline: true },
      { id: "mate-1", name: "AllyA", isOnline: false },
    ];
    expect(areAllPartyMembersOnline(members, { excludeCharacterId: "hero-1" })).toBe(
      false
    );
    expect(offlinePartyMembers(members, { excludeCharacterId: "hero-1" })).toEqual([
      { id: "mate-1", name: "AllyA", isOnline: false },
    ]);
  });
});

describe("waitingForPartyOnlineMessage", () => {
  it("names offline members", () => {
    expect(
      waitingForPartyOnlineMessage([{ id: "m1", name: "AllyA", isOnline: false }])
    ).toBe("Waiting for AllyA to come online.");
    expect(
      waitingForPartyOnlineMessage([
        { id: "m1", name: "A", isOnline: false },
        { id: "m2", name: "B", isOnline: false },
      ])
    ).toBe("Waiting for party members to come online: A, B.");
  });
});
