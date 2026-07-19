import type { PartyInviteAcceptMode } from "../../core/settings";

export function normalizeCharacterName(name: string): string {
  return name.trim().toLowerCase();
}

export function parsePartyInviteAllowlist(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const entry of raw.split(/[\n,;]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeCharacterName(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(trimmed);
  }

  return names;
}

export function formatPartyInviteAllowlist(names: string[]): string {
  return names.join("\n");
}

export function isPartyInviteSenderAllowed(
  senderName: string | undefined,
  mode: PartyInviteAcceptMode,
  allowlistNames: string[]
): boolean {
  if (mode === "anyone") {
    return true;
  }

  if (!senderName?.trim()) {
    return false;
  }

  const normalizedSender = normalizeCharacterName(senderName);
  return allowlistNames.some((name) => normalizeCharacterName(name) === normalizedSender);
}
