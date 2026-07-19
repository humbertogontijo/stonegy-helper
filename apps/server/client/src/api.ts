import { HELPER_BASE_URL } from "@stonegy/ui/transport/http";
import type { PartyMemberSummary, PartySummary } from "@stonegy/ui/helper/types";

export const BASE = HELPER_BASE_URL;

export type { PartyMemberSummary, PartySummary };

export interface PublicProfile {
  characterId: string;
  characterName: string;
  worldId?: number;
  updatedAt: string;
  hasToken: boolean;
}

export interface CharacterOption {
  id: string;
  name: string;
  worldId?: number;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchHealth(): Promise<{ ok: boolean; version: string }> {
  return json("/v1/health");
}

export function fetchProfiles(): Promise<{
  profiles: PublicProfile[];
  hasLastAccountToken: boolean;
}> {
  return json("/v1/profiles");
}

export function fetchParties(): Promise<{ parties: PartySummary[] }> {
  return json("/v1/parties");
}

export function removeProfile(characterId: string) {
  return json<{ ok: boolean }>(`/v1/profiles/${encodeURIComponent(characterId)}`, {
    method: "DELETE",
  });
}

export function connectSession(characterId: string) {
  return json<{ ok: boolean; connecting?: boolean; connected?: boolean }>(
    `/v1/sessions/${encodeURIComponent(characterId)}/connect`,
    { method: "POST", body: "{}" }
  );
}

export function disconnectSession(characterId: string) {
  return json<{ ok: boolean }>(
    `/v1/sessions/${encodeURIComponent(characterId)}/disconnect`,
    { method: "POST", body: "{}" }
  );
}

export function addProfile(body: {
  token: string;
  characterId: string;
  characterName: string;
  worldId?: number;
}) {
  return json<{ ok: boolean }>("/v1/profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function loginBrowser() {
  return json<{ ok: boolean; token?: string; error?: string }>("/v1/login", {
    method: "POST",
    body: "{}",
  });
}

export function listCharacters(token?: string) {
  const path =
    typeof token === "string" && token
      ? `/v1/characters?token=${encodeURIComponent(token)}`
      : "/v1/characters";
  return json<{ ok: boolean; characters: CharacterOption[]; token?: string; error?: string }>(
    path
  );
}
