import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accountIdFromToken,
  loadProfiles,
  migrateFromAuthJson,
  removeProfile,
  setConfigDirForTests,
  syncCredentialsFromExtension,
  upsertProfile,
} from "./profile-store";

describe("profile-store", () => {
  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "stonegy-profiles-"));
    setConfigDirForTests(dir);
  });

  afterEach(() => {
    setConfigDirForTests(undefined);
  });

  it("round-trips profiles", async () => {
    await upsertProfile({
      token: "jwt-1",
      characterId: "char-a",
      characterName: "Alice",
      worldId: 1,
    });
    const file = await loadProfiles();
    expect(file.version).toBe(1);
    expect(file.profiles).toHaveLength(1);
    expect(file.profiles[0]).toMatchObject({
      token: "jwt-1",
      characterId: "char-a",
      characterName: "Alice",
      worldId: 1,
    });
    expect(file.profiles[0]).not.toHaveProperty("keepOnline");
    expect(file.lastAccountToken).toBe("jwt-1");
  });

  it("upsert replaces by characterId", async () => {
    await upsertProfile({
      token: "jwt-1",
      characterId: "char-a",
      characterName: "Alice",
    });
    await upsertProfile({
      token: "jwt-2",
      characterId: "char-a",
      characterName: "Alice Renamed",
    });
    await upsertProfile({
      token: "jwt-3",
      characterId: "char-b",
      characterName: "Bob",
    });
    const file = await loadProfiles();
    expect(file.profiles).toHaveLength(2);
    const alice = file.profiles.find((p) => p.characterId === "char-a");
    expect(alice).toMatchObject({
      token: "jwt-2",
      characterName: "Alice Renamed",
    });
  });

  it("loads legacy profiles that still have keepOnline on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stonegy-legacy-"));
    setConfigDirForTests(dir);
    await writeFile(
      join(dir, "profiles.json"),
      JSON.stringify({
        version: 1,
        profiles: [
          {
            token: "jwt-1",
            characterId: "char-a",
            characterName: "Alice",
            keepOnline: true,
            updatedAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      }),
      "utf8"
    );
    const file = await loadProfiles();
    expect(file.profiles).toHaveLength(1);
    expect(file.profiles[0]).toMatchObject({
      token: "jwt-1",
      characterId: "char-a",
      characterName: "Alice",
    });
    expect(file.profiles[0]).not.toHaveProperty("keepOnline");
  });

  it("removeProfile", async () => {
    await upsertProfile({
      token: "jwt-1",
      characterId: "char-a",
      characterName: "Alice",
    });
    expect(await removeProfile("char-a")).toBe(true);
    expect(await removeProfile("char-a")).toBe(false);
    expect((await loadProfiles()).profiles).toHaveLength(0);
  });

  it("syncCredentialsFromExtension refreshes same-account tokens", async () => {
    await upsertProfile({
      token: "old-jwt",
      characterId: "char-alt",
      characterName: "Alt",
    });
    await upsertProfile({
      token: "old-jwt",
      characterId: "char-live",
      characterName: "Live Old",
    });

    const result = await syncCredentialsFromExtension({
      token: "new-jwt",
      characterId: "char-live",
      characterName: "Live",
      worldId: 2,
    });

    expect(result.created).toBe(false);
    expect(result.profile).toMatchObject({
      token: "new-jwt",
      characterId: "char-live",
      characterName: "Live",
      worldId: 2,
    });
    expect(result.reconnectCharacterIds.sort()).toEqual(["char-alt", "char-live"]);

    const file = await loadProfiles();
    expect(file.lastAccountToken).toBe("new-jwt");
    expect(file.profiles.every((p) => p.token === "new-jwt")).toBe(true);
  });

  it("syncCredentialsFromExtension creates a new live profile without fanning out", async () => {
    await upsertProfile({
      token: "old-jwt",
      characterId: "char-alt",
      characterName: "Alt",
    });

    const result = await syncCredentialsFromExtension({
      token: "new-jwt",
      characterId: "char-live",
      characterName: "Live",
    });

    expect(result.created).toBe(true);
    // New character must not fan out via lastAccountToken onto unrelated profiles.
    expect(result.reconnectCharacterIds).toEqual([]);
    const file = await loadProfiles();
    expect(file.profiles.find((p) => p.characterId === "char-alt")?.token).toBe(
      "old-jwt"
    );
  });

  it("syncCredentialsFromExtension does not stamp a new account JWT onto lastAccountToken holders", async () => {
    function fakeJwt(userId: string): string {
      const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ user: { id: userId }, iat: 1 })
      ).toString("base64url");
      return `${header}.${payload}.sig`;
    }

    await upsertProfile({
      token: fakeJwt("account-a"),
      characterId: "char-a",
      characterName: "Alice",
    });

    const result = await syncCredentialsFromExtension({
      token: fakeJwt("account-b"),
      characterId: "char-b",
      characterName: "Bob",
    });

    expect(result.created).toBe(true);
    expect(result.reconnectCharacterIds).toEqual([]);
    const file = await loadProfiles();
    expect(accountIdFromToken(file.profiles.find((p) => p.characterId === "char-a")!.token)).toBe(
      "account-a"
    );
    expect(accountIdFromToken(file.profiles.find((p) => p.characterId === "char-b")!.token)).toBe(
      "account-b"
    );
  });

  it("syncCredentialsFromExtension is a no-op reconnect when token unchanged", async () => {
    await upsertProfile({
      token: "same-jwt",
      characterId: "char-a",
      characterName: "Alice",
    });

    const result = await syncCredentialsFromExtension({
      token: "same-jwt",
      characterId: "char-a",
      characterName: "Alice",
    });

    expect(result.created).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.reconnectCharacterIds).toEqual([]);
  });

  it("syncCredentialsFromExtension does not overwrite other-account profile tokens", async () => {
    await upsertProfile({
      token: "account-a-jwt",
      characterId: "char-a",
      characterName: "Alice",
    });
    await upsertProfile({
      token: "account-b-jwt",
      characterId: "char-b",
      characterName: "Bob",
    });

    const result = await syncCredentialsFromExtension({
      token: "account-a-jwt-refreshed",
      characterId: "char-a",
      characterName: "Alice",
    });

    expect(result.reconnectCharacterIds).toEqual(["char-a"]);
    const file = await loadProfiles();
    const alice = file.profiles.find((p) => p.characterId === "char-a");
    const bob = file.profiles.find((p) => p.characterId === "char-b");
    expect(alice?.token).toBe("account-a-jwt-refreshed");
    expect(bob?.token).toBe("account-b-jwt");
    expect(file.lastAccountToken).toBe("account-a-jwt-refreshed");
  });

  it("migration seeds lastAccountToken from auth.json", async () => {
    const dir = join(tmpdir(), `stonegy-mig-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    setConfigDirForTests(dir);
    await writeFile(
      join(dir, "auth.json"),
      JSON.stringify({ token: "legacy-jwt", updatedAt: "2020-01-01T00:00:00.000Z" }),
      "utf8"
    );

    const migrated = await migrateFromAuthJson();
    expect(migrated.profiles).toEqual([]);
    expect(migrated.lastAccountToken).toBe("legacy-jwt");

    const raw = await readFile(join(dir, "profiles.json"), "utf8");
    const written = JSON.parse(raw) as { lastAccountToken?: string };
    expect(written.lastAccountToken).toBe("legacy-jwt");

    // auth.json must remain
    const authRaw = await readFile(join(dir, "auth.json"), "utf8");
    expect(JSON.parse(authRaw).token).toBe("legacy-jwt");

    // second migration is a no-op (profiles already exist)
    await upsertProfile({
      token: "new-jwt",
      characterId: "c1",
      characterName: "C",
    });
    const again = await migrateFromAuthJson();
    expect(again.profiles).toHaveLength(1);
  });
});
