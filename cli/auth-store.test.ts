import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const homedir = vi.fn(() => "/tmp/stonegy-helper-auth-test-home");

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => homedir(),
  };
});

describe("auth-store", () => {
  let root: string;

  afterEach(async () => {
    vi.resetModules();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("saves and loads a token", async () => {
    root = await mkdtemp(join(tmpdir(), "stonegy-auth-"));
    homedir.mockReturnValue(root);

    const { saveAuthToken, loadStoredAuthToken, authStorePath } = await import("./auth-store");

    expect(await loadStoredAuthToken()).toBeUndefined();
    await saveAuthToken(" jwt-from-login ");
    expect(await loadStoredAuthToken()).toBe("jwt-from-login");

    const raw = await readFile(authStorePath(), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ token: "jwt-from-login" });
  });

  it("clears a stored token", async () => {
    root = await mkdtemp(join(tmpdir(), "stonegy-auth-"));
    homedir.mockReturnValue(root);

    const { saveAuthToken, loadStoredAuthToken, clearStoredAuthToken } = await import(
      "./auth-store"
    );

    await saveAuthToken("to-clear");
    await clearStoredAuthToken();
    expect(await loadStoredAuthToken()).toBeUndefined();
  });
});
