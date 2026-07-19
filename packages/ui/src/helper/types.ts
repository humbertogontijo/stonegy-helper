export interface PartyMemberSummary {
  characterId: string;
  name: string;
  isOnline: boolean | null;
  managed: boolean;
  connected: boolean;
  /** True while the browser extension holds the game WebSocket for this character. */
  extensionLive: boolean;
}

export interface PartySummary {
  partyKey: string;
  members: PartyMemberSummary[];
}

export interface HelperConnectionSnapshot {
  online: boolean;
  version: string | null;
  parties: PartySummary[];
}

export function partyMembersById(
  parties: PartySummary[]
): Map<string, PartyMemberSummary> {
  const map = new Map<string, PartyMemberSummary>();
  for (const party of parties) {
    for (const member of party.members) {
      map.set(member.characterId, member);
    }
  }
  return map;
}
