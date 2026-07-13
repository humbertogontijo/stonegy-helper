import type { PartyLootSplitter, PartyLootSplitterMember } from "../../../protocol-messages";
import type {
  PartyLootSplitHistoryEntry,
  PartyProjection,
} from "../../projections/types";
import type { GameSession } from "../../session";
import { buildLootSplitFingerprint as buildFingerprintFromProjections } from "../../projections/loot-split-progress";

export const LOOT_SPLIT_HISTORY_LIMIT = 10;

/** Re-exported from projections so existing imports keep working. */
export { reconcileLootSplitProgress } from "../../projections/loot-split-progress";

export function buildLootSplitFingerprint(splitter: PartyLootSplitter): string {
  return buildFingerprintFromProjections(splitter);
}

export function getEffectiveLootSplitCompleted(
  party: PartyProjection
): Record<string, number> {
  const splitter = party.partyLootSplitter;
  const fingerprint = party.lootSplitProgressFingerprint;
  const completed = party.lootSplitCompletedByPlayerId ?? {};

  if (!splitter || !fingerprint) {
    return {};
  }

  if (fingerprint !== buildLootSplitFingerprint(splitter)) {
    return {};
  }

  return completed;
}

export function getRemainingLeaderTransfers(
  members: PartyLootSplitterMember[],
  completedByPlayerId: Record<string, number> = {}
): PartyLootSplitterMember[] {
  return members
    .filter((member) => !member.isLeader)
    .map((member) => {
      const completed = completedByPlayerId[member.playerId] ?? 0;
      const remaining = member.transferFromLeaderGold - completed;
      if (remaining <= 0) {
        return null;
      }

      return { ...member, transferFromLeaderGold: remaining };
    })
    .filter((member): member is PartyLootSplitterMember => member != null);
}

export function hasPendingLootSplitReset(party: PartyProjection): boolean {
  return Object.keys(getEffectiveLootSplitCompleted(party)).length > 0;
}

export function recordLootSplitTransfer(
  session: GameSession,
  splitter: PartyLootSplitter,
  playerId: string,
  amount: number
): void {
  const partyState = session.services.partyState;
  const fingerprint = buildLootSplitFingerprint(splitter);
  const effective = getEffectiveLootSplitCompleted(partyState.projection());
  const completedByPlayerId = {
    ...effective,
    [playerId]: (effective[playerId] ?? 0) + amount,
  };

  partyState.patchLootSplitProgress({
    lootSplitProgressFingerprint: fingerprint,
    lootSplitCompletedByPlayerId: completedByPlayerId,
  });
  session.notifyChange();
}

export function buildLootSplitHistoryEntry(
  splitter: PartyLootSplitter,
  completedByPlayerId: Record<string, number>,
  at = Date.now()
): PartyLootSplitHistoryEntry {
  const transfers = splitter.splitter.members
    .filter((member) => !member.isLeader)
    .map((member) => ({
      playerId: member.playerId,
      name: member.name,
      amount: completedByPlayerId[member.playerId] ?? 0,
    }))
    .filter((transfer) => transfer.amount > 0);

  return {
    at,
    totals: { ...splitter.totals },
    transfers,
    transferCount: transfers.length,
  };
}

export function recordLootSplitHistory(
  session: GameSession,
  splitter: PartyLootSplitter,
  completedByPlayerId: Record<string, number>
): void {
  const partyState = session.services.partyState;
  const entry = buildLootSplitHistoryEntry(splitter, completedByPlayerId);
  const history = [entry, ...(partyState.lootSplitHistory ?? [])].slice(
    0,
    LOOT_SPLIT_HISTORY_LIMIT
  );

  partyState.patchLootSplitProgress({ lootSplitHistory: history });
  session.notifyChange();
}

export function clearLootSplitProgress(session: GameSession): void {
  const partyState = session.services.partyState;
  const hasProgress =
    partyState.lootSplitProgressFingerprint != null ||
    Object.keys(partyState.lootSplitCompletedByPlayerId ?? {}).length > 0;

  if (!hasProgress) {
    return;
  }

  partyState.patchLootSplitProgress({
    lootSplitProgressFingerprint: null,
    lootSplitCompletedByPlayerId: {},
  });
  session.notifyChange();
}

