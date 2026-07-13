import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyLootSplitter } from "../../../protocol-messages";
import { SendMessageTypes } from "../../../protocol";
import { GameSession } from "../../session";
import { defaultSettings } from "../../settings";
import { defaultSessionView } from "../../projections/defaults";
import { patchSessionView } from "../../projections/patch";
import type { Transport } from "../../transport";
import {
  collectLeaderTransfers,
  executeLootSplit,
  shouldExecuteLootSplit,
  splitLootNow,
} from "./loot-splitter";
import {
  buildLootSplitFingerprint,
  getRemainingLeaderTransfers,
} from "./loot-split-progress";
import { partyIdentity } from "../../humanize";
import { toBotState } from "../../projections/to-bot-state";

function splitSkip(
  state: ReturnType<typeof toBotState>,
  splitter: PartyLootSplitter | null = state.party.partyLootSplitter
) {
  return shouldExecuteLootSplit(
    partyIdentity(state.character.characterId, state.party),
    state.character.goldCoins,
    splitter,
    state.party
  );
}

class MockTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(): void {}
  onConnectionChange(): void {}
  close(): void {}
}

const LEADER_ID = "leader-id";
const MEMBER_A_ID = "member-a";
const MEMBER_B_ID = "member-b";

const sampleSplitter: PartyLootSplitter = {
  leaderId: LEADER_ID,
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
        playerId: MEMBER_B_ID,
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
        playerId: LEADER_ID,
        name: "Delta",
        isLeader: true,
        lootTotalValue: 1_806_597,
        suppliesGold: 243_639,
        balanceGold: 1_562_958,
        settlementDeltaGold: -1_213_231,
        transferFromLeaderGold: 0,
        owedToLeaderGold: 0,
      },
      {
        playerId: MEMBER_A_ID,
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

function leaderSession(splitter: PartyLootSplitter | null = sampleSplitter): GameSession {
  const session = new GameSession(new MockTransport(), { settings: defaultSettings() });
  session.view = patchSessionView(defaultSessionView(), {
    character: {
      ...defaultSessionView().character,
      characterId: LEADER_ID,
      goldCoins: 2_000_000,
    },
    party: {
      ...defaultSessionView().party,
      partySnapshotSynced: true,
      partyLeaderId: LEADER_ID,
      partyMemberCount: 3,
      partyLootSplitter: splitter,
    },
  });
  session.commands.run = vi.fn().mockResolvedValue({ sent: true, success: true });
  return session;
}

describe("loot splitter helpers", () => {
  it("collects non-leader transfers with positive amounts", () => {
    const transfers = collectLeaderTransfers(sampleSplitter.splitter.members);
    expect(transfers).toHaveLength(2);
    expect(transfers.map((member) => member.name)).toEqual(["Guild", "Member"]);
  });

  it("skips when not party leader", () => {
    const session = leaderSession();
    session.view = patchSessionView(session.view, {
      character: { ...session.view.character, characterId: MEMBER_A_ID },
    });
    const state = toBotState(session.settings, session.view);
    expect(splitSkip(state, sampleSplitter)).toBe("not_leader");
  });

  it("skips solo party", () => {
    const session = leaderSession();
    session.view = patchSessionView(session.view, {
      party: { ...session.view.party, partyMemberCount: 1 },
    });
    const state = toBotState(session.settings, session.view);
    expect(splitSkip(state, sampleSplitter)).toBe("solo_party");
  });

  it("skips when splitter data is missing", () => {
    const session = leaderSession(null);
    const state = toBotState(session.settings, session.view);
    expect(splitSkip(state, null)).toBe("no_splitter");
  });

  it("skips when leader gold is insufficient", () => {
    const session = leaderSession();
    session.view = patchSessionView(session.view, {
      character: { ...session.view.character, goldCoins: 100_000 },
    });
    const state = toBotState(session.settings, session.view);
    expect(splitSkip(state, sampleSplitter)).toBe("insufficient_gold");
  });
});

describe("executeLootSplit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends gold transfers and reset for party leader", async () => {
    const session = leaderSession();
    const result = await executeLootSplit(session);

    expect(result).toEqual({ ok: true, transferCount: 2 });
    expect(session.commands.run).toHaveBeenCalledTimes(3);
    expect(session.commands.run).toHaveBeenNthCalledWith(
      1,
      SendMessageTypes.GOLD_TRANSFER,
      expect.objectContaining({ targetName: "Guild", amount: 572_614, requestId: expect.any(String) }),
      { cooldownMs: 2500, goldTransferRequestId: expect.any(String) }
    );
    expect(session.commands.run).toHaveBeenNthCalledWith(
      2,
      SendMessageTypes.GOLD_TRANSFER,
      expect.objectContaining({ targetName: "Member", amount: 640_617, requestId: expect.any(String) }),
      { cooldownMs: 2500, goldTransferRequestId: expect.any(String) }
    );
    expect(session.commands.run).toHaveBeenNthCalledWith(
      3,
      SendMessageTypes.PARTY_LOOT_SPLITTER_RESET,
      {},
      { cooldownMs: 2500 }
    );
    expect(session.view.party.lootSplitHistory).toHaveLength(1);
    expect(session.view.party.lootSplitHistory[0]).toMatchObject({
      transferCount: 2,
      totals: sampleSplitter.totals,
      transfers: [
        { playerId: MEMBER_B_ID, name: "Guild", amount: 572_614 },
        { playerId: MEMBER_A_ID, name: "Member", amount: 640_617 },
      ],
    });
    expect(session.view.party.lootSplitCompletedByPlayerId).toEqual({});
    expect(session.view.party.lootSplitProgressFingerprint).toBeNull();
  });

  it("skips for non-leader", async () => {
    const session = leaderSession();
    session.view = patchSessionView(session.view, {
      character: { ...session.view.character, characterId: MEMBER_A_ID },
    });

    const result = await executeLootSplit(session);

    expect(result).toMatchObject({ ok: false, reason: "not_leader" });
    expect(session.commands.run).not.toHaveBeenCalled();
  });

  it("skips solo party", async () => {
    const session = leaderSession();
    session.view = patchSessionView(session.view, {
      party: { ...session.view.party, partyMemberCount: 1 },
    });

    const result = await executeLootSplit(session);

    expect(result).toMatchObject({ ok: false, reason: "solo_party" });
    expect(session.commands.run).not.toHaveBeenCalled();
  });

  it("continues transfers when one member fails", async () => {
    const session = leaderSession();
    let transferIndex = 0;
    vi.mocked(session.commands.run).mockImplementation(async (type) => {
      if (type === SendMessageTypes.GOLD_TRANSFER) {
        transferIndex += 1;
        if (transferIndex === 1) {
          return { sent: true, success: false, errorMessage: "Insufficient gold" };
        }
      }
      return { sent: true, success: true };
    });

    const result = await executeLootSplit(session);

    expect(result).toEqual({ ok: true, transferCount: 1 });
    expect(session.commands.run).toHaveBeenCalledTimes(3);
  });

  it("skips when leader gold is insufficient", async () => {
    const session = leaderSession();
    session.view = patchSessionView(session.view, {
      character: { ...session.view.character, goldCoins: 100_000 },
    });

    const result = await executeLootSplit(session);

    expect(result).toEqual({
      ok: false,
      reason: "insufficient_gold",
      requiredGold: 1_213_231,
      availableGold: 100_000,
    });
    expect(session.commands.run).not.toHaveBeenCalled();
  });

  it("skips when splitter is empty", async () => {
    const session = leaderSession(null);

    const result = await executeLootSplit(session);

    expect(result).toMatchObject({ ok: false, reason: "no_splitter" });
    expect(session.commands.run).not.toHaveBeenCalled();
  });

  it(
    "retries only remaining transfers after a partial split",
    async () => {
    const session = leaderSession();
    let transferCalls = 0;

    vi.mocked(session.commands.run).mockImplementation(async (type) => {
      if (type === SendMessageTypes.GOLD_TRANSFER) {
        transferCalls += 1;
        if (transferCalls === 1) {
          return { sent: true, success: true };
        }
        return { sent: true, success: false, errorMessage: "Transfer failed" };
      }
      return { sent: true, success: false, errorMessage: "Reset failed" };
    });

    const firstResult = await executeLootSplit(session);
    expect(firstResult).toEqual({ ok: false, transferCount: 1 });
    expect(transferCalls).toBe(2);
    expect(session.commands.run).toHaveBeenCalledTimes(3);

    vi.mocked(session.commands.run).mockImplementation(async (type) => {
      if (type === SendMessageTypes.GOLD_TRANSFER) {
        transferCalls += 1;
        return { sent: true, success: true };
      }
      return { sent: true, success: true };
    });

    const secondResult = await executeLootSplit(session);
    expect(secondResult).toEqual({ ok: true, transferCount: 1 });
    expect(transferCalls).toBe(3);
    expect(session.commands.run).toHaveBeenCalledTimes(5);
    expect(session.commands.run).toHaveBeenNthCalledWith(
      4,
      SendMessageTypes.GOLD_TRANSFER,
      expect.objectContaining({ targetName: "Member", amount: 640_617 }),
      expect.any(Object)
    );
    const okabeTransferCalls = vi
      .mocked(session.commands.run)
      .mock.calls.filter(
        ([type, payload]) =>
          type === SendMessageTypes.GOLD_TRANSFER &&
          typeof payload === "object" &&
          payload != null &&
          "targetName" in payload &&
          payload.targetName === "Guild"
      );
    expect(okabeTransferCalls).toHaveLength(1);
  },
  15_000
  );

  it("resets splitter when transfers were already completed", async () => {
    const session = leaderSession();
    session.view = patchSessionView(session.view, {
      party: {
        ...session.view.party,
        lootSplitProgressFingerprint: buildLootSplitFingerprint(sampleSplitter),
        lootSplitCompletedByPlayerId: {
          [MEMBER_B_ID]: 572_614,
          [MEMBER_A_ID]: 640_617,
        },
      },
    });

    const remaining = getRemainingLeaderTransfers(
      sampleSplitter.splitter.members,
      session.view.party.lootSplitCompletedByPlayerId
    );
    expect(remaining).toHaveLength(0);

    const result = await executeLootSplit(session);

    expect(result).toEqual({ ok: true, transferCount: 0 });
    expect(session.commands.run).toHaveBeenCalledTimes(1);
    expect(session.commands.run).toHaveBeenCalledWith(
      SendMessageTypes.PARTY_LOOT_SPLITTER_RESET,
      {},
      { cooldownMs: 2500 }
    );
    expect(session.view.party.lootSplitHistory[0]?.transferCount).toBe(2);
  });

  it("keeps member gold in history when reset clears live progress", async () => {
    const session = leaderSession();
    vi.mocked(session.commands.run).mockImplementation(async (type) => {
      if (type === SendMessageTypes.PARTY_LOOT_SPLITTER_RESET) {
        session.view = patchSessionView(session.view, {
          party: {
            ...session.view.party,
            partyLootSplitter: null,
            lootSplitCompletedByPlayerId: {},
            lootSplitProgressFingerprint: null,
          },
        });
      }
      return { sent: true, success: true };
    });

    const result = await executeLootSplit(session);

    expect(result).toEqual({ ok: true, transferCount: 2 });
    expect(session.view.party.lootSplitHistory[0]).toMatchObject({
      transferCount: 2,
      totals: sampleSplitter.totals,
      transfers: [
        { playerId: MEMBER_B_ID, name: "Guild", amount: 572_614 },
        { playerId: MEMBER_A_ID, name: "Member", amount: 640_617 },
      ],
    });
  });
});

describe("splitLootNow", () => {
  it("sets splitting_loot while running then returns to idling", async () => {
    const session = leaderSession();
    const states: string[] = [];
    const originalSetPlayerState = session.services.setPlayerState.bind(session.services);
    session.services.setPlayerState = (state, detail) => {
      originalSetPlayerState(state, detail);
      states.push(state);
    };

    const result = await splitLootNow(session);

    expect(result.ok).toBe(true);
    expect(states).toContain("splitting_loot");
    expect(session.view.playerState).toBe("idling");
  });
});
