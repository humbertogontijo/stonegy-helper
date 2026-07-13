import { describe, expect, it } from "vitest";
import type { PartyLootSplitter } from "../../../protocol-messages";
import { defaultSessionView } from "../../projections/defaults";
import { patchSessionView } from "../../projections/patch";
import {
  buildLootSplitFingerprint,
  buildLootSplitHistoryEntry,
  getEffectiveLootSplitCompleted,
  getRemainingLeaderTransfers,
  reconcileLootSplitProgress,
} from "./loot-split-progress";

const sampleSplitter: PartyLootSplitter = {
  leaderId: "leader-id",
  leaderName: "Delta",
  totals: {
    lootTotalValue: 1_806_597,
    suppliesGold: 757_418,
    balanceGold: 1_049_179,
  },
  splitter: {
    profitPerMember: 349_726,
    remainderToLeader: 1,
    members: [
      {
        playerId: "member-b",
        name: "Guild",
        isLeader: false,
        lootTotalValue: 0,
        suppliesGold: 222_888,
        balanceGold: -222_888,
        settlementDeltaGold: 572_614,
        transferFromLeaderGold: 572_614,
        owedToLeaderGold: 0,
      },
      {
        playerId: "member-a",
        name: "Member",
        isLeader: false,
        lootTotalValue: 0,
        suppliesGold: 290_891,
        balanceGold: -290_891,
        settlementDeltaGold: 640_617,
        transferFromLeaderGold: 640_617,
        owedToLeaderGold: 0,
      },
    ],
  },
};

describe("loot split progress", () => {
  it("deducts completed transfers from remaining amounts", () => {
    const remaining = getRemainingLeaderTransfers(sampleSplitter.splitter.members, {
      "member-b": 572_614,
    });

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.name).toBe("Member");
    expect(remaining[0]?.transferFromLeaderGold).toBe(640_617);
  });

  it("ignores stale progress when splitter fingerprint changes", () => {
    const party = patchSessionView(defaultSessionView(), {
      party: {
        ...defaultSessionView().party,
        partyLootSplitter: sampleSplitter,
        lootSplitProgressFingerprint: buildLootSplitFingerprint(sampleSplitter),
        lootSplitCompletedByPlayerId: { "member-b": 572_614 },
      },
    }).party;

    const nextSplitter: PartyLootSplitter = {
      ...sampleSplitter,
      totals: { ...sampleSplitter.totals, balanceGold: 900_000 },
    };

    const reconciled = reconcileLootSplitProgress(party, nextSplitter);
    expect(reconciled.lootSplitCompletedByPlayerId).toEqual({});
    expect(reconciled.lootSplitProgressFingerprint).toBeNull();
    expect(getEffectiveLootSplitCompleted({ ...party, partyLootSplitter: nextSplitter })).toEqual(
      {}
    );
  });

  it("builds history entry from completed transfers only", () => {
    const entry = buildLootSplitHistoryEntry(sampleSplitter, {
      "member-b": 572_614,
    });

    expect(entry.transferCount).toBe(1);
    expect(entry.transfers).toEqual([
      { playerId: "member-b", name: "Guild", amount: 572_614 },
    ]);
    expect(entry.totals).toEqual(sampleSplitter.totals);
  });
});
