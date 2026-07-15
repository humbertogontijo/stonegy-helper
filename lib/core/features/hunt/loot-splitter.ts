import { delay, featureCooldown } from "../../commands/cooldown";
import { isPartyLeader, partyIdentity, type PartyIdentity } from "../../humanize";
import { SendMessageTypes } from "../../../protocol";
import type { PartyLootSplitterMember } from "../../../protocol-messages";
import type { PartyProjection } from "../../projections/types";
import type { GameSession } from "../../session";
import { updatePlayerState, isHandlingLoot } from "../../player-state";
import {
  clearLootSplitProgress,
  getEffectiveLootSplitCompleted,
  getRemainingLeaderTransfers,
  hasPendingLootSplitReset,
  recordLootSplitHistory,
  recordLootSplitTransfer,
} from "./loot-split-progress";

export type LootSplitSkipReason =
  | "not_leader"
  | "solo_party"
  | "no_splitter"
  | "nothing_to_split"
  | "insufficient_gold"
  | "members_owe_leader";

export interface LootSplitResult {
  ok: boolean;
  reason?: LootSplitSkipReason;
  transferCount?: number;
  requiredGold?: number;
  availableGold?: number;
}

export interface SplitLootNowResult {
  ok: boolean;
  error?: string;
  message?: string;
  result?: LootSplitResult;
}

export interface ExecuteLootSplitOptions {
  /** Refresh party snapshot before reading splitter data (e.g. after hunt finish). */
  refreshParty?: boolean;
}

function goldTransferRequestId(): string {
  return `gold_transfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatGold(amount: number): string {
  return amount.toLocaleString();
}

export function collectLeaderTransfers(
  members: PartyLootSplitterMember[]
): PartyLootSplitterMember[] {
  return members.filter((member) => !member.isLeader && member.transferFromLeaderGold > 0);
}

/** True when a non-leader still owes gold to the leader (not automated yet). */
export function hasMembersOwingLeader(members: PartyLootSplitterMember[]): boolean {
  return members.some((member) => !member.isLeader && member.owedToLeaderGold > 0);
}

export function totalSplitTransferGold(members: PartyLootSplitterMember[]): number {
  return collectLeaderTransfers(members).reduce(
    (sum, member) => sum + member.transferFromLeaderGold,
    0
  );
}

export function shouldExecuteLootSplit(
  identity: PartyIdentity,
  goldCoins: number | null,
  splitter: PartyProjection["partyLootSplitter"],
  party: PartyProjection
): LootSplitSkipReason | null {
  if (!isPartyLeader(identity)) {
    return "not_leader";
  }
  if ((identity.partyMemberCount ?? 0) < 2) {
    return "solo_party";
  }
  if (!splitter) {
    return "no_splitter";
  }
  if (hasMembersOwingLeader(splitter.splitter.members)) {
    return "members_owe_leader";
  }

  const completedByPlayerId = getEffectiveLootSplitCompleted(party);
  const remainingTransfers = getRemainingLeaderTransfers(
    splitter.splitter.members,
    completedByPlayerId
  );

  if (
    !remainingTransfers.length &&
    !hasPendingLootSplitReset(party) &&
    splitter.totals.balanceGold === 0
  ) {
    return "nothing_to_split";
  }

  if (remainingTransfers.length > 0) {
    const requiredGold = totalSplitTransferGold(remainingTransfers);
    const availableGold = goldCoins ?? 0;
    if (availableGold < requiredGold) {
      return "insufficient_gold";
    }
  }

  return null;
}

export async function executeLootSplit(
  session: GameSession,
  options: ExecuteLootSplitOptions = {}
): Promise<LootSplitResult> {
  if (options.refreshParty) {
    await session.syncPartyContext({ force: true, waitForResponse: true });
  }

  const { partyState, sessionState } = session.services;
  const party = partyState.projection();
  const splitter = party.partyLootSplitter;
  const completedByPlayerId = getEffectiveLootSplitCompleted(party);
  const skipReason = shouldExecuteLootSplit(
    partyIdentity(sessionState.characterId, partyState),
    sessionState.goldCoins,
    splitter,
    party
  );
  if (skipReason) {
    const remainingTransfers = splitter
      ? getRemainingLeaderTransfers(splitter.splitter.members, completedByPlayerId)
      : [];
    return {
      ok: false,
      reason: skipReason,
      requiredGold: remainingTransfers.length
        ? totalSplitTransferGold(remainingTransfers)
        : undefined,
      availableGold: sessionState.goldCoins ?? 0,
    };
  }

  const remainingTransfers = getRemainingLeaderTransfers(
    splitter!.splitter.members,
    completedByPlayerId
  );
  let transferCount = 0;

  for (const member of remainingTransfers) {
    const requestId = goldTransferRequestId();
    const outcome = await session.commands.run(
      SendMessageTypes.GOLD_TRANSFER,
      {
        targetName: member.name,
        amount: member.transferFromLeaderGold,
        requestId,
      },
      {
        cooldownMs: featureCooldown("loot.lootSplit"),
      }
    );
    if (outcome.success !== false) {
      transferCount += 1;
      recordLootSplitTransfer(
        session,
        splitter!,
        member.playerId,
        member.transferFromLeaderGold
      );
    }
  }

  if (transferCount === 0 && remainingTransfers.length > 0) {
    return { ok: false, reason: "nothing_to_split", transferCount: 0 };
  }

  // Capture before reset: the party snapshot after PARTY_LOOT_SPLITTER_RESET
  // reconciles progress away (fingerprint mismatch / null splitter).
  const historyCompleted = getEffectiveLootSplitCompleted(partyState.projection());

  await delay(featureCooldown("loot.lootSplit"));

  const resetOutcome = await session.commands.run(
    SendMessageTypes.PARTY_LOOT_SPLITTER_RESET,
    {},
    { cooldownMs: featureCooldown("loot.lootSplit") }
  );
  if (resetOutcome.success === false) {
    return { ok: false, transferCount };
  }

  recordLootSplitHistory(session, splitter!, historyCompleted);
  clearLootSplitProgress(session);
  return { ok: true, transferCount };
}

/** Manual "Split now" from the popup — updates player state around the split. */
export async function splitLootNow(session: GameSession): Promise<SplitLootNowResult> {
  if (isHandlingLoot(session)) {
    return { ok: false, error: "Already selling or splitting loot." };
  }

  const { partyState, sessionState } = session.services;
  const previewParty = partyState.projection();
  const previewSplitter = previewParty.partyLootSplitter;
  const previewCompleted = getEffectiveLootSplitCompleted(previewParty);
  const skipReason = shouldExecuteLootSplit(
    partyIdentity(sessionState.characterId, partyState),
    sessionState.goldCoins,
    previewSplitter,
    previewParty
  );

  if (skipReason === "insufficient_gold" && previewSplitter) {
    const requiredGold = totalSplitTransferGold(
      getRemainingLeaderTransfers(previewSplitter.splitter.members, previewCompleted)
    );
    const availableGold = sessionState.goldCoins ?? 0;
    const message = `Not enough gold to split — need ${formatGold(requiredGold)} gp, have ${formatGold(availableGold)} gp`;
    updatePlayerState(session, "idling", message);
    return { ok: false, error: message };
  }

  if (skipReason && skipReason !== "nothing_to_split" && skipReason !== "insufficient_gold") {
    const errorByReason: Record<string, string> = {
      not_leader: "Only the party leader can split loot.",
      solo_party: "Loot split requires a party with 2+ members.",
      no_splitter: "No loot split data in party state.",
      members_owe_leader:
        "Loot split skipped — members still owe the leader (only leader transfers are automated).",
    };
    const error = errorByReason[skipReason] ?? "Loot split skipped.";
    updatePlayerState(session, "idling", error);
    return { ok: false, error };
  }

  const transfers = previewSplitter
    ? getRemainingLeaderTransfers(previewSplitter.splitter.members, previewCompleted)
    : [];
  if (!transfers.length && !hasPendingLootSplitReset(previewParty)) {
    updatePlayerState(session, "idling", "Nothing to split");
    return { ok: false, error: "Nothing to split." };
  }

  updatePlayerState(
    session,
    "splitting_loot",
    transfers.length
      ? `Splitting loot to ${transfers.length} member(s)…`
      : "Resetting loot splitter…"
  );

  try {
    const result = await executeLootSplit(session);

    if (!result.ok) {
      if (result.reason === "insufficient_gold") {
        const message = `Not enough gold to split — need ${formatGold(result.requiredGold ?? 0)} gp, have ${formatGold(result.availableGold ?? 0)} gp`;
        updatePlayerState(session, "idling", message);
        return { ok: false, error: message, result };
      }

      const message =
        result.reason === "nothing_to_split" ? "Nothing to split." : "Loot split failed.";
      updatePlayerState(session, "idling", message);
      return { ok: false, error: message, result };
    }

    const message =
      result.transferCount && result.transferCount > 0
        ? `Split sent to ${result.transferCount} member(s) and reset.`
        : "Loot splitter reset.";
    updatePlayerState(session, "idling", message);
    return { ok: true, message, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updatePlayerState(session, "idling", `Loot split failed: ${message}`);
    return { ok: false, error: `Loot split failed: ${message}` };
  }
}
