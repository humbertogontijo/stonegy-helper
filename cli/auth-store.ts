import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR } from "./config";

export interface StoredAuth {
  token: string;
  updatedAt: string;
}

const AUTH_PATH = join(CONFIG_DIR, "auth.json");

export function authStorePath(): string {
  return AUTH_PATH;
}

export async function loadStoredAuthToken(): Promise<string | undefined> {
  try {
    const raw = await readFile(AUTH_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof parsed.token === "string" && parsed.token.trim()) {
      return parsed.token.trim();
    }
  } catch {
    // missing or unreadable store
  }
  return undefined;
}

export async function saveAuthToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Cannot store an empty auth token");
  }

  await mkdir(CONFIG_DIR, { recursive: true });
  const payload: StoredAuth = {
    token: trimmed,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(AUTH_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    await chmod(AUTH_PATH, 0o600);
  } catch {
    // best-effort on platforms that ignore chmod
  }
}

export async function clearStoredAuthToken(): Promise<void> {
  try {
    await unlink(AUTH_PATH);
  } catch {
    // already gone
  }
}
