import { SendMessageTypes, parseMessage } from "@stonegy/helper/protocol";
import { HELPER_BASE_URL } from "@stonegy/helper/helper-endpoint";
import { probeHelperHealth } from "@stonegy/helper/helper-probe";

export interface CapturedCredentials {
  token: string;
  characterId?: string;
  worldId?: number;
}

export interface CredentialSyncPayload {
  token: string;
  characterId: string;
  characterName: string;
  worldId?: number;
}

const JWT_COOKIE_NAME = "jwtToken";
const JWT_COOKIE_URLS = [
  "https://stonegy-online.com/",
  "https://www.stonegy-online.com/",
  "https://api-stonegy.com/",
] as const;

/** Extract JWT + identity from a mirrored outbound game WS auth frame. */
export function parseAuthCredentialsFromWire(raw: string): CapturedCredentials | null {
  const parsed = parseMessage(raw);
  if (!parsed || parsed.type !== SendMessageTypes.AUTH) {
    return null;
  }
  const data = parsed.data as {
    tokenKey?: unknown;
    token?: unknown;
    characterId?: unknown;
    worldId?: unknown;
  };
  const tokenValue =
    typeof data.tokenKey === "string"
      ? data.tokenKey
      : typeof data.token === "string"
        ? data.token
        : null;
  if (!tokenValue?.trim()) {
    return null;
  }
  const result: CapturedCredentials = { token: tokenValue.trim() };
  if (typeof data.characterId === "string" && data.characterId.trim()) {
    result.characterId = data.characterId.trim();
  }
  if (typeof data.worldId === "number" && Number.isFinite(data.worldId)) {
    result.worldId = data.worldId;
  }
  return result;
}

/** Read the Stonegy account JWT from browser cookies (fallback when auth frame was missed). */
export async function readJwtFromCookies(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.cookies?.get) {
    return null;
  }
  try {
    for (const url of JWT_COOKIE_URLS) {
      const cookie = await chrome.cookies.get({ url, name: JWT_COOKIE_NAME });
      if (cookie?.value?.trim()) {
        return cookie.value.trim();
      }
    }
    const all = await chrome.cookies.getAll({ name: JWT_COOKIE_NAME });
    const match = all.find(
      (cookie) =>
        !!cookie.value?.trim() &&
        (!cookie.domain || cookie.domain.includes("stonegy"))
    );
    return match?.value?.trim() ?? null;
  } catch {
    return null;
  }
}

export function credentialSyncKey(payload: CredentialSyncPayload): string {
  return `${payload.token}\0${payload.characterId}\0${payload.characterName}\0${payload.worldId ?? ""}`;
}

export async function syncCredentialsToHelper(
  payload: CredentialSyncPayload,
  baseUrl: string = HELPER_BASE_URL
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/v1/credentials/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { probeHelperHealth, HELPER_BASE_URL };
