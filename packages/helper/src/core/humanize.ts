/** Minimal party + character fields for leadership checks. */
export type PartyIdentity = {
  characterId: string | null;
  partySnapshotSynced: boolean;
  partyMemberCount: number | null;
  partyLeaderId: string | null;
};

/** Build identity from character id + party projection fields. */
export function partyIdentity(
  characterId: string | null,
  party: {
    partySnapshotSynced: boolean;
    partyMemberCount: number | null;
    partyLeaderId: string | null;
  }
): PartyIdentity {
  return {
    characterId,
    partySnapshotSynced: party.partySnapshotSynced,
    partyMemberCount: party.partyMemberCount,
    partyLeaderId: party.partyLeaderId,
  };
}

export function readPartyMemberCount(
  party: { members?: unknown[] } | null | undefined
): number | null {
  const members = party?.members;
  if (!Array.isArray(members)) {
    return null;
  }
  return members.length;
}

/** Party position tiles only apply when hunting with 2+ players. */
export function canChangePartyPosition(partyMemberCount: number | null): boolean {
  return (partyMemberCount ?? 0) > 1;
}

export function isInParty(partyMemberCount: number | null): boolean {
  return (partyMemberCount ?? 0) > 0;
}

export function isPartyLeader(identity: PartyIdentity): boolean {
  if (!identity.characterId) {
    return false;
  }

  if (!identity.partySnapshotSynced) {
    return false;
  }

  if (!isInParty(identity.partyMemberCount)) {
    return true;
  }

  if (!identity.partyLeaderId) {
    return true;
  }

  return identity.partyLeaderId === identity.characterId;
}

export function isActivelyHunting(
  partyStatus: string | null,
  activeHuntId: number | null
): boolean {
  return partyStatus === "hunting" || activeHuntId != null;
}
