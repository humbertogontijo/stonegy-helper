import type { PartyLootSplitter } from "../../protocol-messages";
import type { PartyProjection } from "./types";

/** Pure function — used by party projection / loot-split progress. Also re-exported from the feature module. */
export function buildLootSplitFingerprint(splitter: PartyLootSplitter): string {
  const members = splitter.splitter.members
    .map(
      (member) =>
        `${member.playerId}:${member.transferFromLeaderGold}:${member.settlementDeltaGold}`
    )
    .sort()
    .join("|");

  return `${splitter.totals.balanceGold}:${splitter.splitter.profitPerMember}:${members}`;
}

export function reconcileLootSplitProgress(
  party: PartyProjection,
  nextSplitter: PartyLootSplitter | null
): Pick<PartyProjection, "lootSplitCompletedByPlayerId" | "lootSplitProgressFingerprint"> {
  if (!nextSplitter) {
    return {
      lootSplitCompletedByPlayerId: {},
      lootSplitProgressFingerprint: null,
    };
  }

  const fingerprint = party.lootSplitProgressFingerprint;
  if (!fingerprint || fingerprint !== buildLootSplitFingerprint(nextSplitter)) {
    return {
      lootSplitCompletedByPlayerId: {},
      lootSplitProgressFingerprint: null,
    };
  }

  return {
    lootSplitCompletedByPlayerId: party.lootSplitCompletedByPlayerId ?? {},
    lootSplitProgressFingerprint: fingerprint,
  };
}
