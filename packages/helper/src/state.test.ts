import { describe, expect, it } from "vitest";
import type { PartyLootSplitter } from "./protocol-messages";
import { defaultSettings, getHuntBattleSettings } from "./core/settings";
import { defaultSessionView } from "./core/projections/defaults";
import { patchSessionView } from "./core/projections/patch";
import { projectAfterEvent, projectAfterEvents } from "./core/projections/project-events";
import { toBotState } from "./core/projections/to-bot-state";
import { jsonEvent } from "./core/events/types";
import { ReceiveMessageTypes } from "./protocol";
import type { SessionView } from "./core/projections/types";
import type { StonegyMessage } from "./types";
import { parsePartyCharacterFields } from "./domain/party/fields";
import { readAppliedLureIdFromPayload } from "./domain/hunt/lure";
import {
  defaultState,
  isTerminalHuntLootSyncStatus,
  isTerminalMarketFullScanStatus,
  isTerminalMarketScanStatus,
  sanitizeHuntLootSyncStatusForPersistence,
  sanitizeMarketScanFieldsForPersistence,
  withBotState,
} from "./state";

async function botStateAfterMessage(
  message: StonegyMessage,
  view: SessionView = defaultSessionView(),
  settings = defaultSettings()
) {
  return toBotState(
    settings,
    await projectAfterEvents(jsonEvent("receive", message, "{}"), { initialView: view })
  );
}

const samplePartyLootSplitter: PartyLootSplitter = {
  leaderId: "leader-id",
  leaderName: "Leader",
  totals: { lootTotalValue: 0, suppliesGold: 0, balanceGold: 0 },
  splitter: { profitPerMember: 0, remainderToLeader: 0, members: [] },
};

describe("parsePartyCharacterFields", () => {
  it("extracts the logged-in member from party snapshot", () => {
    const fields = parsePartyCharacterFields({
      meId: "char-1",
      party: {
        status: "idle",
        leaderId: "char-1",
        members: [
          {
            id: "char-1",
            name: "HeroOne",
            level: 68,
            vocation: "PALADIN",
          },
        ],
      },
    });

    expect(fields).toEqual({
      characterId: "char-1",
      characterName: "HeroOne",
      level: 68,
      characterVocation: "PALADIN",
    });
  });

  it("returns meId when members are missing", () => {
    expect(parsePartyCharacterFields({ meId: "char-2", party: { status: "idle" } })).toEqual({
      characterId: "char-2",
      characterName: null,
      level: null,
      characterVocation: null,
    });
  });
});

describe("party snapshot state", () => {
  it("clears party fields when the snapshot has no members", async () => {
    const seededView = patchSessionView(defaultSessionView(), {
      character: { characterId: "char-1" },
      party: {
        partyStatus: "idle",
        partyLeaderId: "other",
        partyMemberCount: 2,
        partyMembers: [
          { id: "char-1", name: "Hero", isOnline: true },
          { id: "other", name: "Mate", isOnline: false },
        ],
      },
    });

    const next = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.PARTY_SNAPSHOT,
        data: { meId: "char-1", party: { status: "idle", members: [] } },
      },
      seededView
    );

    expect(next.party).toMatchObject({
      partySnapshotSynced: true,
      partyStatus: null,
      partyLeaderId: null,
      partyMemberCount: null,
      partyMembers: [],
      currentHuntId: null,
    });
  });

  it("tracks party member online status from snapshot", async () => {
    const next = await botStateAfterMessage({
      type: ReceiveMessageTypes.PARTY_SNAPSHOT,
      data: {
        meId: "char-1",
        party: {
          status: "idle",
          leaderId: "char-1",
          members: [
            { id: "char-1", name: "Hero", isOnline: true },
            { id: "mate-1", name: "AllyA", isOnline: false },
          ],
        },
      },
    });

    expect(next.party).toMatchObject({
      partyMemberCount: 2,
      partyMembers: [
        { id: "char-1", name: "Hero", isOnline: true },
        { id: "mate-1", name: "AllyA", isOnline: false },
      ],
    });
  });

  it("clears party fields when the snapshot party is null", async () => {
    const seededView = patchSessionView(defaultSessionView(), {
      character: { characterId: "char-1" },
      party: {
        partySnapshotSynced: true,
        partyStatus: "hunting",
        partyLeaderId: "other",
        partyMemberCount: 3,
        partyLootSplitter: samplePartyLootSplitter,
        lootSplitCompletedByPlayerId: { other: 100 },
        lootSplitProgressFingerprint: "fp-1",
      },
    });

    const next = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.PARTY_SNAPSHOT,
        data: { meId: "char-1", party: null },
      },
      seededView
    );

    expect(next.party).toEqual({
      partyStatus: null,
      currentHuntId: null,
      partyLeaderId: null,
      partyMemberCount: null,
      partyMembers: [],
      partySnapshotSynced: true,
      lastSnapshotAt: expect.any(Number),
      partyLootSplitter: null,
      lootSplitCompletedByPlayerId: {},
      lootSplitProgressFingerprint: null,
      lootSplitHistory: [],
      readyCheckId: null,
    });
  });
});

describe("readAppliedLureIdFromPayload", () => {
  it("ignores hunt max lure fields from bootstrap", () => {
    expect(readAppliedLureIdFromPayload({ lureId: 7 })).toBeNull();
    expect(readAppliedLureIdFromPayload({ hunt: { id: 12, lureId: 5 } })).toBeNull();
    expect(readAppliedLureIdFromPayload({ analyzer: { lureId: 3 } })).toBeNull();
  });

  it("reads explicit applied lure fields", () => {
    expect(readAppliedLureIdFromPayload({ currentLureId: 2 })).toBe(2);
    expect(readAppliedLureIdFromPayload({ lureAmount: 4 })).toBe(4);
    expect(readAppliedLureIdFromPayload({ analyzer: { currentLureId: 1 } })).toBe(1);
  });
});

describe("market scan status persistence", () => {
  it("treats in-progress full scan messages as non-terminal", () => {
    expect(isTerminalMarketFullScanStatus("Scanning page 3…")).toBe(false);
    expect(isTerminalMarketFullScanStatus("Full scan paused at page 1 — timed out on page 1")).toBe(
      false
    );
    expect(isTerminalMarketFullScanStatus("Scanned page 12/40")).toBe(false);
  });

  it("keeps completed full scan messages", () => {
    expect(isTerminalMarketFullScanStatus("Full scan complete — 40 pages, 1,234 items cached")).toBe(
      true
    );
  });

  it("drops stale page-1 failures and in-progress interval status on persist", () => {
    expect(
      sanitizeMarketScanFieldsForPersistence({
        marketScanStatus: "Scanning page 1…",
        marketFullScanStatus: "Full scan paused at page 1 — timed out on page 1",
        marketFullScanTotalPages: null,
        marketFullScanCheckpointOrderId: null,
      })
    ).toEqual({
      marketScanStatus: "",
      marketFullScanStatus: "",
      marketFullScanTotalPages: null,
      marketFullScanCheckpointOrderId: null,
    });
  });

  it("keeps checkpoint for mid-scan pauses but drops volatile status text", () => {
    expect(
      sanitizeMarketScanFieldsForPersistence({
        marketScanStatus: "Scanner off",
        marketFullScanStatus: "Full scan paused at page 5/40 — disconnected",
        marketFullScanTotalPages: 40,
        marketFullScanCheckpointOrderId: "ref-5",
      })
    ).toEqual({
      marketScanStatus: "Scanner off",
      marketFullScanStatus: "",
      marketFullScanTotalPages: 40,
      marketFullScanCheckpointOrderId: "ref-5",
    });
  });

  it("treats stable interval scan outcomes as terminal", () => {
    expect(isTerminalMarketScanStatus("Scanned page 1/40")).toBe(true);
    expect(isTerminalMarketScanStatus("Scanner scheduled — page 1 every 30s")).toBe(true);
    expect(isTerminalMarketScanStatus("Page 1 scan timed out — retrying next tick")).toBe(false);
  });
});

describe("hunt loot sync status persistence", () => {
  it("treats in-progress sync messages as non-terminal", () => {
    expect(isTerminalHuntLootSyncStatus("Fetching prices 22/37: Crown Armor…")).toBe(false);
    expect(isTerminalHuntLootSyncStatus("Starting sync (0/37)…")).toBe(false);
    expect(sanitizeHuntLootSyncStatusForPersistence("Checking sell route 3/37: Gold Coin…")).toBe(
      ""
    );
  });

  it("keeps completed or failed sync messages", () => {
    expect(isTerminalHuntLootSyncStatus("Done — synced 37 hunt items")).toBe(true);
    expect(isTerminalHuntLootSyncStatus("Sync failed: timeout")).toBe(true);
    expect(isTerminalHuntLootSyncStatus("No loot items for this hunt")).toBe(true);
    expect(sanitizeHuntLootSyncStatusForPersistence("Done — synced 37 hunt items")).toBe(
      "Done — synced 37 hunt items"
    );
  });
});

describe("projectAfterEvents lure tracking", () => {
  it("tracks current lure separately from selected lure preference", async () => {
    const settings = {
      ...defaultSettings(),
      selectedHuntId: 1,
      huntBattleByHuntId: {
        1: {
          partyPositionX: null,
          partyPositionY: null,
          selectedLureId: 7,
          battlePreset: null,
        },
      },
    };

    const afterUpdate = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.HUNT_UPDATE_LURE,
        data: { lureId: 5 },
      },
      defaultSessionView(),
      settings
    );

    expect(afterUpdate.hunt.currentLureId).toBe(5);
    expect(getHuntBattleSettings(afterUpdate.settings, 1).selectedLureId).toBe(7);
  });

  it("does not treat bootstrap max lure as the active lure amount", async () => {
    const hunting = await botStateAfterMessage({
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 12 }, lureId: 6 },
    });

    expect(hunting.hunt.currentLureId).toBeNull();
    expect(hunting.hunt.activeHuntId).toBe(12);
  });

  it("tracks applied lure from bootstrap when explicitly provided", async () => {
    const hunting = await botStateAfterMessage({
      type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
      data: { hunt: { id: 12 }, currentLureId: 2 },
    });

    expect(hunting.hunt.currentLureId).toBe(2);
  });

  it("does not overwrite party identity from hunt bootstrap analyzer", async () => {
    const view = patchSessionView(defaultSessionView(), {
      party: {
        ...defaultSessionView().party,
        partySnapshotSynced: true,
        partyStatus: "idle",
        partyLeaderId: "leader-from-snapshot",
        partyMemberCount: 2,
      },
    });

    const hunting = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
        data: {
          hunt: { id: 12 },
          analyzer: {
            party: {
              leaderId: "leader-from-analyzer",
              members: [{ id: "solo-from-analyzer" }],
            },
          },
        },
      },
      view
    );

    expect(hunting.party.partyLeaderId).toBe("leader-from-snapshot");
    expect(hunting.party.partyMemberCount).toBe(2);
    expect(hunting.party.partyStatus).toBe("idle");
    expect(hunting.hunt.activeHuntId).toBe(12);
  });

  it("clears lure state when hunt finishes", async () => {
    const huntingView = await projectAfterEvent(
      jsonEvent(
        "receive",
        {
          type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
          data: { hunt: { id: 12 }, currentLureId: 6 },
        },
        "{}"
      )
    );

    const finished = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.HUNT_FINISHED,
        data: {},
      },
      huntingView
    );

    expect(finished.hunt.currentLureId).toBeNull();
    expect(finished.hunt.activeHuntId).toBeNull();
  });

  it("clears stale hunt projection when hunt finishes", async () => {
    const huntingView = patchSessionView(defaultSessionView(), {
      hunt: {
        activeHuntId: 12,
        currentLureId: 3,
        currentPartyTileX: 2,
        currentPartyTileY: 0,
        lastBootstrapHuntId: 12,
        pendingHuntLootSell: false,
      },
    });

    const finished = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.HUNT_FINISHED,
        data: {},
      },
      huntingView
    );

    // Domain-only projection leaves battle-owned lastBootstrapHuntId unchanged;
    // BattleService clears it on the live dispatch path (see auto-hunt.test).
    expect(finished.hunt).toMatchObject({
      activeHuntId: null,
      currentLureId: null,
      currentPartyTileX: null,
      currentPartyTileY: null,
      lastBootstrapHuntId: 12,
      pendingHuntLootSell: false,
      pendingHuntLootSellAt: null,
    });
  });

  it("clears hunt projection when bootstrap has no hunt", async () => {
    const huntingView = patchSessionView(defaultSessionView(), {
      party: { partyStatus: "hunting" },
      hunt: {
        activeHuntId: 12,
        currentLureId: 3,
        currentPartyTileX: 2,
        currentPartyTileY: 0,
        lastBootstrapHuntId: 12,
        pendingHuntLootSell: true,
      },
    });

    const idle = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
        data: { hunt: null },
      },
      huntingView
    );

    // Domain-only projection leaves battle-owned lastBootstrapHuntId unchanged.
    expect(idle.hunt).toMatchObject({
      activeHuntId: null,
      currentLureId: null,
      currentPartyTileX: null,
      currentPartyTileY: null,
      lastBootstrapHuntId: 12,
      pendingHuntLootSell: true,
    });
    expect(typeof idle.hunt.pendingHuntLootSellAt).toBe("number");
  });
});

describe("projectAfterEvents activity state", () => {
  it("sets idle when hunt bootstrap has no hunt", async () => {
    const huntingView = patchSessionView(defaultSessionView(), {
      party: { partyStatus: "hunting" },
      hunt: { activeHuntId: 12 },
    });

    const idle = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.HUNT_BOOTSTRAP,
        data: { hunt: null },
      },
      huntingView
    );

    expect(idle.party.partyStatus).toBe("idle");
    expect(idle.hunt.activeHuntId).toBeNull();
  });

  it("sets training when training bootstrap has active training", async () => {
    const next = await botStateAfterMessage({
      type: ReceiveMessageTypes.TRAINING_BOOTSTRAP,
      data: {
        training: {
          activeTraining: { id: "train-1" },
        },
      },
    } as StonegyMessage);

    expect(next.party.partyStatus).toBe("training");
    expect(next.training.activeTrainingId).toBe("train-1");
  });

  it("sets idle when training bootstrap has no training", async () => {
    const trainingView = patchSessionView(defaultSessionView(), {
      party: { partyStatus: "training" },
      training: { activeTrainingId: "train-1" },
    });

    const idle = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.TRAINING_BOOTSTRAP,
        data: { training: null },
      },
      trainingView
    );

    expect(idle.party.partyStatus).toBe("idle");
    expect(idle.training.activeTrainingId).toBeNull();
  });

  it("sets idle when training finishes", async () => {
    const trainingView = patchSessionView(defaultSessionView(), {
      party: { partyStatus: "training" },
      training: { activeTrainingId: "train-1" },
    });

    const idle = await botStateAfterMessage(
      {
        type: ReceiveMessageTypes.TRAINING_FINISHED,
        data: { success: true },
      },
      trainingView
    );

    expect(idle.party.partyStatus).toBe("idle");
    expect(idle.training.activeTrainingId).toBeNull();
  });
});

describe("defaultState", () => {
  it("starts from nested defaults", () => {
    expect(defaultState).toEqual(withBotState({}));
  });
});
