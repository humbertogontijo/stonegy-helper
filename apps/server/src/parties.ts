import type { BotState } from "@stonegy/helper/types";
import type { HelperProfile } from "./profile-store";

export interface PartyMemberSummary {
  characterId: string;
  name: string;
  isOnline: boolean | null;
  managed: boolean;
  connected: boolean;
  extensionLive: boolean;
}

export interface PartySummary {
  partyKey: string;
  members: PartyMemberSummary[];
}

/** Stable party identity: leader id, else sorted member ids. */
export function partyKeyFromState(state: BotState): string {
  const leader = state.party.partyLeaderId?.trim();
  if (leader) {
    return `leader:${leader}`;
  }
  const ids = state.party.partyMembers
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort();
  if (ids.length === 0) {
    const self = state.character.characterId;
    return self ? `solo:${self}` : "solo:unknown";
  }
  return `members:${ids.join(",")}`;
}

function ingestState(
  characterId: string,
  state: BotState,
  ownedIds: ReadonlySet<string>,
  extensionLive: ReadonlyMap<string, string>,
  profileById: Map<string, HelperProfile>,
  byKey: Map<string, Map<string, PartyMemberSummary>>,
  seenIds: Set<string>
): void {
  const key = partyKeyFromState(state);
  let members = byKey.get(key);
  if (!members) {
    members = new Map();
    byKey.set(key, members);
  }

  const roster =
    state.party.partyMembers.length > 0
      ? state.party.partyMembers
      : [
          {
            id: state.character.characterId ?? characterId,
            name: state.character.characterName ?? characterId,
            isOnline: true as boolean | null,
          },
        ];

  for (const member of roster) {
    const id = member.id ?? "";
    if (!id) {
      continue;
    }
    const profile = profileById.get(id);
    const existing = members.get(id);
    const connected = ownedIds.has(id);
    const summary: PartyMemberSummary = {
      characterId: id,
      name: member.name ?? profile?.characterName ?? extensionLive.get(id) ?? id,
      isOnline: member.isOnline ?? (connected || extensionLive.has(id) ? true : null),
      managed: !!profile,
      connected,
      extensionLive: extensionLive.has(id),
    };
    if (!existing || connected || (summary.extensionLive && !existing.extensionLive)) {
      members.set(id, summary);
    }
    seenIds.add(id);
  }
}

export function buildPartySummaries(
  ownedStates: Map<string, BotState>,
  profiles: HelperProfile[],
  extensionLive: ReadonlyMap<string, string> = new Map(),
  extensionStates: ReadonlyMap<string, BotState> = new Map()
): PartySummary[] {
  const profileById = new Map(profiles.map((p) => [p.characterId, p]));
  const byKey = new Map<string, Map<string, PartyMemberSummary>>();
  const seenIds = new Set<string>();
  const ownedIds = new Set(ownedStates.keys());

  for (const [characterId, state] of ownedStates) {
    ingestState(
      characterId,
      state,
      ownedIds,
      extensionLive,
      profileById,
      byKey,
      seenIds
    );
  }

  for (const [characterId, state] of extensionStates) {
    if (ownedIds.has(characterId)) {
      continue;
    }
    ingestState(
      characterId,
      state,
      ownedIds,
      extensionLive,
      profileById,
      byKey,
      seenIds
    );
  }

  for (const [id, name] of extensionLive) {
    if (seenIds.has(id)) {
      for (const members of byKey.values()) {
        const existing = members.get(id);
        if (existing && !existing.extensionLive) {
          members.set(id, {
            ...existing,
            extensionLive: true,
            isOnline: existing.isOnline ?? true,
          });
        }
      }
      continue;
    }
    const profile = profileById.get(id);
    const members = new Map<string, PartyMemberSummary>();
    members.set(id, {
      characterId: id,
      name: name || profile?.characterName || id,
      isOnline: true,
      managed: !!profile,
      connected: false,
      extensionLive: true,
    });
    byKey.set(`solo:${id}`, members);
  }

  return [...byKey.entries()]
    .map(([partyKey, members]) => ({
      partyKey,
      members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.partyKey.localeCompare(b.partyKey));
}
