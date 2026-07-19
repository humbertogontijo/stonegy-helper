import { describe, expect, it } from "vitest";
import { buildMessage, SendMessageTypes } from "@stonegy/helper/protocol";
import {
  credentialSyncKey,
  parseAuthCredentialsFromWire,
} from "./credential-sync";

describe("parseAuthCredentialsFromWire", () => {
  it("extracts tokenKey characterId and worldId from auth frames", () => {
    const raw = buildMessage(SendMessageTypes.AUTH, {
      tokenKey: "  jwt-abc  ",
      characterId: "char-1",
      worldId: 3,
      clientDeviceType: "web",
    });
    expect(parseAuthCredentialsFromWire(raw)).toEqual({
      token: "jwt-abc",
      characterId: "char-1",
      worldId: 3,
    });
  });

  it("returns null for non-auth messages", () => {
    const raw = buildMessage(SendMessageTypes.PING, { t: 1 });
    expect(parseAuthCredentialsFromWire(raw)).toBeNull();
  });

  it("accepts token as an alias for tokenKey", () => {
    expect(
      parseAuthCredentialsFromWire(
        JSON.stringify({
          type: SendMessageTypes.AUTH,
          data: { token: "jwt-from-token-field", characterId: "c1" },
        })
      )
    ).toEqual({
      token: "jwt-from-token-field",
      characterId: "c1",
    });
  });

  it("returns null when tokenKey is missing or empty", () => {
    expect(
      parseAuthCredentialsFromWire(
        JSON.stringify({ type: SendMessageTypes.AUTH, data: { characterId: "c1" } })
      )
    ).toBeNull();
    expect(
      parseAuthCredentialsFromWire(
        JSON.stringify({ type: SendMessageTypes.AUTH, data: { tokenKey: "   " } })
      )
    ).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseAuthCredentialsFromWire("not-json")).toBeNull();
  });
});

describe("credentialSyncKey", () => {
  it("changes when identity or token changes", () => {
    const base = {
      token: "jwt",
      characterId: "c1",
      characterName: "Alice",
      worldId: 1,
    };
    expect(credentialSyncKey(base)).toBe(credentialSyncKey({ ...base }));
    expect(credentialSyncKey(base)).not.toBe(
      credentialSyncKey({ ...base, token: "other" })
    );
    expect(credentialSyncKey(base)).not.toBe(
      credentialSyncKey({ ...base, characterName: "Bob" })
    );
  });
});
