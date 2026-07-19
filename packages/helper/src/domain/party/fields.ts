import type { PartySnapshotPayload } from "../../protocol-messages";
import type { PartyMemberOnlineInfo } from "./online";

export function readId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** Normalize party:snapshot members for online gating / projections. */
export function parsePartyMembers(
  party: { members?: unknown[] } | null | undefined
): PartyMemberOnlineInfo[] {
  const members = party?.members;
  if (!Array.isArray(members)) {
    return [];
  }

  return members.map((raw) => {
    const member = raw as {
      id?: unknown;
      name?: unknown;
      isOnline?: unknown;
    };
    return {
      id: readId(member?.id),
      name: typeof member?.name === "string" ? member.name : null,
      isOnline: typeof member?.isOnline === "boolean" ? member.isOnline : null,
    };
  });
}

export function parsePartyCharacterFields(data: PartySnapshotPayload | undefined): {
  characterId: string | null;
  characterName: string | null;
  level: number | null;
  characterVocation: string | null;
} {
  const meId = readId(data?.meId);
  if (!meId) {
    return {
      characterId: null,
      characterName: null,
      level: null,
      characterVocation: null,
    };
  }

  const members = data?.party?.members;
  if (!Array.isArray(members)) {
    return {
      characterId: meId,
      characterName: null,
      level: null,
      characterVocation: null,
    };
  }

  const me = members.find((member) => readId(member?.id) === meId);
  return {
    characterId: meId,
    characterName: typeof me?.name === "string" ? me.name : null,
    level: typeof me?.level === "number" ? me.level : null,
    characterVocation: typeof me?.vocation === "string" ? me.vocation : null,
  };
}
