import { describe, expect, it } from "vitest";
import {
  formatPartyInviteAllowlist,
  isPartyInviteSenderAllowed,
  normalizeCharacterName,
  parsePartyInviteAllowlist,
} from "./invite-filter";

describe("party invite filter", () => {
  it("normalizes character names for comparison", () => {
    expect(normalizeCharacterName("  Alice  ")).toBe("alice");
  });

  it("parses allowlist entries from newlines and commas", () => {
    expect(parsePartyInviteAllowlist("Alice\nBob, Carol;Dave")).toEqual([
      "Alice",
      "Bob",
      "Carol",
      "Dave",
    ]);
  });

  it("deduplicates allowlist entries case-insensitively", () => {
    expect(parsePartyInviteAllowlist("Alice\nalice, BOB")).toEqual(["Alice", "BOB"]);
  });

  it("formats allowlist names one per line", () => {
    expect(formatPartyInviteAllowlist(["Alice", "Bob"])).toBe("Alice\nBob");
  });

  it("allows any sender in anyone mode", () => {
    expect(isPartyInviteSenderAllowed("Stranger", "anyone", [])).toBe(true);
  });

  it("allows only allowlisted senders in allowlist mode", () => {
    expect(isPartyInviteSenderAllowed("Alice", "allowlist", ["Alice", "Bob"])).toBe(true);
    expect(isPartyInviteSenderAllowed(" alice ", "allowlist", ["Alice"])).toBe(true);
    expect(isPartyInviteSenderAllowed("Carol", "allowlist", ["Alice", "Bob"])).toBe(false);
    expect(isPartyInviteSenderAllowed(undefined, "allowlist", ["Alice"])).toBe(false);
  });
});
