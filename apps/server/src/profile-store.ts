import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HelperProfile {
  token: string;
  characterId: string;
  characterName: string;
  worldId?: number;
  updatedAt: string;
}

export interface ProfilesFile {
  version: 1;
  profiles: HelperProfile[];
  lastAccountToken?: string;
}

export type HelperProfileInput = Omit<HelperProfile, "updatedAt"> & {
  updatedAt?: string;
};

const DEFAULT_CONFIG_DIR = join(homedir(), ".stonegy-helper");

let configDirOverride: string | undefined;

/** Test-only: override the config directory. Pass `undefined` to reset. */
export function setConfigDirForTests(dir: string | undefined): void {
  configDirOverride = dir;
}

export function helperConfigDir(): string {
  return configDirOverride ?? DEFAULT_CONFIG_DIR;
}

function profilesPath(): string {
  return join(helperConfigDir(), "profiles.json");
}

function authPath(): string {
  return join(helperConfigDir(), "auth.json");
}

function emptyProfiles(): ProfilesFile {
  return { version: 1, profiles: [] };
}

/** Account id from a Stonegy JWT (`user.id`), if the token is a parseable JWT. */
export function accountIdFromToken(token: string): string | undefined {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    return undefined;
  }
  try {
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const json = Buffer.from(padded, "base64url").toString("utf8");
    const data = JSON.parse(json) as { user?: { id?: unknown } };
    return typeof data.user?.id === "string" && data.user.id.trim()
      ? data.user.id.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

/** True when both tokens belong to the same Stonegy account. */
export function tokensShareAccount(a: string, b: string): boolean {
  const idA = accountIdFromToken(a);
  const idB = accountIdFromToken(b);
  if (idA && idB) {
    return idA === idB;
  }
  return a === b;
}

export async function loadProfiles(): Promise<ProfilesFile> {
  try {
    const raw = await readFile(profilesPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ProfilesFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) {
      return emptyProfiles();
    }
    const profiles: HelperProfile[] = [];
    for (const entry of parsed.profiles) {
      if (
        entry &&
        typeof entry.token === "string" &&
        typeof entry.characterId === "string" &&
        typeof entry.characterName === "string" &&
        typeof entry.updatedAt === "string"
      ) {
        // Legacy keepOnline on disk is ignored and not written back.
        profiles.push({
          token: entry.token,
          characterId: entry.characterId,
          characterName: entry.characterName,
          worldId: typeof entry.worldId === "number" ? entry.worldId : undefined,
          updatedAt: entry.updatedAt,
        });
      }
    }
    const file: ProfilesFile = { version: 1, profiles };
    if (typeof parsed.lastAccountToken === "string" && parsed.lastAccountToken.trim()) {
      file.lastAccountToken = parsed.lastAccountToken.trim();
    }
    return file;
  } catch {
    return emptyProfiles();
  }
}

export async function saveProfiles(file: ProfilesFile): Promise<void> {
  const dir = helperConfigDir();
  await mkdir(dir, { recursive: true });
  const path = profilesPath();
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  try {
    await chmod(path, 0o600);
  } catch {
    // best-effort on platforms that ignore chmod
  }
}

export async function upsertProfile(input: HelperProfileInput): Promise<HelperProfile> {
  const file = await loadProfiles();
  const profile: HelperProfile = {
    token: input.token.trim(),
    characterId: input.characterId,
    characterName: input.characterName,
    worldId: input.worldId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
  if (!profile.token) {
    throw new Error("Cannot store an empty auth token");
  }
  const idx = file.profiles.findIndex((p) => p.characterId === profile.characterId);
  if (idx >= 0) {
    file.profiles[idx] = profile;
  } else {
    file.profiles.push(profile);
  }
  file.lastAccountToken = profile.token;
  await saveProfiles(file);
  return profile;
}

export async function removeProfile(characterId: string): Promise<boolean> {
  const file = await loadProfiles();
  const before = file.profiles.length;
  file.profiles = file.profiles.filter((p) => p.characterId !== characterId);
  if (file.profiles.length === before) {
    return false;
  }
  await saveProfiles(file);
  return true;
}

export async function getProfile(characterId: string): Promise<HelperProfile | undefined> {
  const file = await loadProfiles();
  return file.profiles.find((p) => p.characterId === characterId);
}

export interface CredentialSyncInput {
  token: string;
  characterId: string;
  characterName: string;
  worldId?: number;
}

export interface CredentialSyncResult {
  profile: HelperProfile;
  /** Same-account profiles whose token changed — reconnect if currently owned. */
  reconnectCharacterIds: string[];
  created: boolean;
  /** False when the live profile already had this token/name/worldId. */
  changed: boolean;
}

/**
 * Accept credentials from the browser extension (game WS auth tokenKey).
 * Upserts the live character. Refreshes JWTs only on profiles that already
 * belong to the same Stonegy account (JWT `user.id`) — never fan out via
 * lastAccountToken (that stamped one account's JWT onto unrelated characters).
 */
export async function syncCredentialsFromExtension(
  input: CredentialSyncInput
): Promise<CredentialSyncResult> {
  const token = input.token.trim();
  if (!token) {
    throw new Error("Cannot store an empty auth token");
  }
  if (!input.characterId.trim() || !input.characterName.trim()) {
    throw new Error("characterId and characterName required");
  }

  const file = await loadProfiles();
  const now = new Date().toISOString();
  const existingIdx = file.profiles.findIndex((p) => p.characterId === input.characterId);
  const existing = existingIdx >= 0 ? file.profiles[existingIdx] : undefined;
  const created = !existing;
  const newAccountId = accountIdFromToken(token);
  // Opaque-token fallback: only replace this character's previous token, never
  // lastAccountToken (which may belong to a different account).
  const previousToken = existing?.token?.trim();

  const reconnectCharacterIds: string[] = [];
  let siblingsChanged = false;
  for (const profile of file.profiles) {
    if (profile.characterId === input.characterId) {
      continue;
    }
    const profileAccountId = accountIdFromToken(profile.token);
    const sameAccount = newAccountId
      ? profileAccountId === newAccountId
      : profile.token === token ||
        (!!previousToken && profile.token === previousToken);
    if (!sameAccount) {
      continue;
    }
    if (profile.token !== token) {
      reconnectCharacterIds.push(profile.characterId);
      profile.token = token;
      profile.updatedAt = now;
      siblingsChanged = true;
    }
  }

  const nextName = input.characterName.trim();
  const nextWorldId =
    typeof input.worldId === "number" ? input.worldId : existing?.worldId;
  const liveChanged =
    created ||
    !existing ||
    existing.token !== token ||
    existing.characterName !== nextName ||
    existing.worldId !== nextWorldId;

  const profile: HelperProfile = {
    token,
    characterId: input.characterId,
    characterName: nextName,
    worldId: nextWorldId,
    updatedAt: liveChanged ? now : (existing?.updatedAt ?? now),
  };
  if (existing && existing.token !== token) {
    reconnectCharacterIds.push(input.characterId);
  }

  const changed = liveChanged || siblingsChanged;
  if (!changed) {
    return { profile: existing ?? profile, reconnectCharacterIds, created, changed: false };
  }

  if (existingIdx >= 0) {
    file.profiles[existingIdx] = profile;
  } else {
    file.profiles.push(profile);
  }

  file.lastAccountToken = token;
  await saveProfiles(file);

  return { profile, reconnectCharacterIds, created, changed: true };
}

/**
 * If profiles.json is missing and auth.json exists, create an empty profiles
 * file seeded with lastAccountToken from the legacy auth store.
 * Does not delete auth.json.
 */
export async function migrateFromAuthJson(): Promise<ProfilesFile> {
  try {
    await readFile(profilesPath(), "utf8");
    return loadProfiles();
  } catch {
    // profiles.json missing — continue migration
  }

  let lastAccountToken: string | undefined;
  try {
    const raw = await readFile(authPath(), "utf8");
    const parsed = JSON.parse(raw) as { token?: string };
    if (typeof parsed.token === "string" && parsed.token.trim()) {
      lastAccountToken = parsed.token.trim();
    }
  } catch {
    // no auth.json
  }

  const file: ProfilesFile = emptyProfiles();
  if (lastAccountToken) {
    file.lastAccountToken = lastAccountToken;
  }
  await saveProfiles(file);
  return file;
}
