import { HELPER_BASE_URL } from "@stonegy/helper/helper-endpoint";
import {
  fetchHelperHealth,
  probeHelperHealth,
} from "@stonegy/helper/helper-probe";
import type { PartyMemberSummary, PartySummary } from "./types";
import { partyMembersById } from "./types";

export type { PartyMemberSummary as HelperPartyMember };
export { fetchHelperHealth, probeHelperHealth };

export async function fetchHelperParties(
  baseUrl: string = HELPER_BASE_URL
): Promise<PartySummary[]> {
  try {
    const res = await fetch(`${baseUrl}/v1/parties`);
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { parties?: PartySummary[] };
    return body.parties ?? [];
  } catch {
    return [];
  }
}

export async function fetchHelperManagedMembers(
  baseUrl: string = HELPER_BASE_URL
): Promise<Map<string, PartyMemberSummary>> {
  return partyMembersById(await fetchHelperParties(baseUrl));
}
