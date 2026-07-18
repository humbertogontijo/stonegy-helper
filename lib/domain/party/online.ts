/** Minimal party-member fields used for online/offline hunt gating. */
export type PartyMemberOnlineInfo = {
  id: string | null;
  name: string | null;
  /** `null` when the snapshot omitted the field — treated as online. */
  isOnline: boolean | null;
};

/**
 * Party members (excluding the local character) who are explicitly offline.
 * Solo / empty parties never block; unknown `isOnline` does not block.
 */
export function offlinePartyMembers(
  members: readonly PartyMemberOnlineInfo[],
  options: { excludeCharacterId?: string | null } = {}
): PartyMemberOnlineInfo[] {
  if (members.length <= 1) {
    return [];
  }

  const excludeId = options.excludeCharacterId ?? null;
  return members.filter((member) => {
    if (excludeId && member.id != null && member.id === excludeId) {
      return false;
    }
    return member.isOnline === false;
  });
}

/** True when every other party member is online (or online status is unknown). */
export function areAllPartyMembersOnline(
  members: readonly PartyMemberOnlineInfo[],
  options: { excludeCharacterId?: string | null } = {}
): boolean {
  return offlinePartyMembers(members, options).length === 0;
}

/** Human-readable wait reason for offline party members. */
export function waitingForPartyOnlineMessage(
  offline: readonly PartyMemberOnlineInfo[]
): string {
  const names = offline
    .map((member) => member.name?.trim() || member.id || "party member")
    .filter(Boolean);
  if (names.length === 0) {
    return "Waiting for party members to come online.";
  }
  if (names.length === 1) {
    return `Waiting for ${names[0]} to come online.`;
  }
  return `Waiting for party members to come online: ${names.join(", ")}.`;
}
