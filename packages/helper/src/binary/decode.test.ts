import { describe, expect, it } from "vitest";
import { BinaryReader, decodeBase64ToBytes } from "./reader.ts";
import {
  STONEGY_BINARY_MAGIC,
  STONEGY_BINARY_VERSION,
  StonegyBinaryMessageType,
} from "./types.ts";
import {
  decodeBinaryMessage,
  isInventorySnapshot,
  isMarketSnapshot,
  summarizeBinaryMessage,
} from "./decode.ts";
import { findFirstMapBlob } from "./map-bootstrap.ts";
import { marketSnapshotBodyToData } from "./market-snapshot.ts";
import { parseEnvelope } from "./envelope.ts";
import {
  binaryFixtures,
  expectedInventoryDepotItemIds,
  expectedInventoryHeaderDuringHunt,
  expectedInventoryHeaderWithDepot,
  expectedInventoryItemsDuringHunt,
  expectedVisualUpdateLead1,
  expectedVisualUpdateLead3,
} from "./fixtures/session-traffic.ts";
import {
  huntWorldSnapshotFixture,
  expectedHuntWorldSnapshot,
} from "./fixtures/world-traffic.ts";
import {
  expectedAbilityCastFrontSweep,
  expectedAbilityCastBatchedMultiCast,
  expectedSupportAbilityCastUtitoTempo,
  expectedSupportAbilityCastUtamoMulti,
  expectedSupportAbilityCastUtamoTempoBurning,
  expectedSupportAbilityCastContinuationOnly,
  expectedSupportAbilityCastUtamoVitaByteA3,
  expectedHuntAnalyzerSnapshotFreshHunt,
  expectedCombatFloatHeal52,
  expectedCombatFloatMultiHit,
  expectedCombatFloatFire700,
  expectedCooldownUpdateAttackCast,
  expectedCooldownUpdatePotionAndHeal,
  expectedVitalsSingleBit0,
  expectedVitalsBits02,
  expectedVitalsMixed27,
  expectedVitalsSharedBit4,
  expectedHuntEntityUuidList,
  expectedHuntLootDrops,
  expectedHuntLootStarterItemGrant,
  expectedHuntAnalyzerSnapshotCompact,
  expectedXpSummaryReconnect,
  expectedSessionMetric,
  huntTrafficFixtures,
} from "./fixtures/hunt-traffic.ts";
import {
  binaryMarketSnapshotBrowse,
  expectedBinaryMarketSnapshotBrowse,
} from "./fixtures/market-traffic.ts";
import {
  expectedWinterCourt,
  winterCourtTrafficFixtures,
} from "./fixtures/winter-court-traffic.ts";

describe("binary envelope", () => {
  it("parses the SG header from a ping frame", () => {
    const bytes = decodeBase64ToBytes(binaryFixtures.ping);
    const envelope = parseEnvelope(bytes);

    expect(envelope.magic).toBe(STONEGY_BINARY_MAGIC);
    expect(envelope.version).toBe(STONEGY_BINARY_VERSION);
    expect(envelope.type).toBe(StonegyBinaryMessageType.Ping);
    expect(envelope.payloadOffset).toBe(4);
    expect(bytes.length).toBe(4);
  });

  it("rejects invalid magic bytes", () => {
    expect(() => parseEnvelope(new Uint8Array([0, 1, 2, 3]))).toThrow(/Invalid Stonegy binary magic/);
  });
});

describe("BinaryReader", () => {
  it("reads little-endian integers and ascii strings", () => {
    const bytes = decodeBase64ToBytes(binaryFixtures.speechExevoMasSan);
    const reader = new BinaryReader(bytes);
    reader.seek(4);

    expect(reader.u16()).toBe(1);
    expect(reader.u16()).toBe(258);
    expect(reader.u16()).toBe(0);
    expect(reader.u8()).toBe(0);
    expect(reader.u8()).toBe(13);
    expect(reader.u8()).toBe(0);
    expect(new TextDecoder().decode(reader.bytes(13))).toBe("exevh mas san");
    expect(reader.remaining).toBe(0);
  });

  it("formats uuid bytes into canonical strings", () => {
    const bytes = decodeBase64ToBytes(binaryFixtures.inventorySnapshotDuringHunt);
    const reader = new BinaryReader(bytes);
    reader.seek(23);

    expect(reader.uuid()).toBe("55555555-5555-7555-8555-000000000002");
  });
});

describe("decodeBinaryMessage", () => {
  it("decodes ping frames", () => {
    const message = decodeBinaryMessage(binaryFixtures.ping);

    expect(message.body.kind).toBe("ping");
    expect(summarizeBinaryMessage(message)).toBe("ping");
  });

  it("decodes inventory snapshots with backpack items", () => {
    const message = decodeBinaryMessage(binaryFixtures.inventorySnapshotDuringHunt);

    expect(isInventorySnapshot(message)).toBe(true);
    if (!isInventorySnapshot(message)) {
      throw new Error("expected inventory snapshot");
    }

    const { data } = message.body;
    expect(data.goldCoins).toBe(expectedInventoryHeaderDuringHunt.goldCoins);
    expect(data.depotItemCount).toBe(expectedInventoryHeaderDuringHunt.depotItemCount);
    expect(data.capacity).toBe(expectedInventoryHeaderDuringHunt.capacity);
    expect(data.usedSlots).toBe(expectedInventoryHeaderDuringHunt.usedSlots);
    expect(data.unknownByte).toBe(expectedInventoryHeaderDuringHunt.unknownByte);
    expect(data.items).toHaveLength(expectedInventoryHeaderDuringHunt.usedSlots);
    expect(data.items.map(({ itemId, amount }) => ({ itemId, amount })).slice(0, 9)).toEqual(
      expectedInventoryItemsDuringHunt
    );
    expect(data.items[0]?.uuid).toBe("55555555-5555-7555-8555-000000000002");
    expect(data.depot?.sectionType).toBe(20);
    expect(data.depot?.items).toHaveLength(9);
    expect(summarizeBinaryMessage(message)).toBe("inventory(13 items, 31476 gold, depot 9)");
  });

  it("decodes inventory snapshots with backpack and depot sections", () => {
    const message = decodeBinaryMessage(binaryFixtures.inventorySnapshotWithDepot);

    expect(isInventorySnapshot(message)).toBe(true);
    if (!isInventorySnapshot(message)) {
      throw new Error("expected inventory snapshot");
    }

    const { data } = message.body;
    expect(data.goldCoins).toBe(expectedInventoryHeaderWithDepot.goldCoins);
    expect(data.depotItemCount).toBe(expectedInventoryHeaderWithDepot.depotItemCount);
    expect(data.capacity).toBe(expectedInventoryHeaderWithDepot.capacity);
    expect(data.usedSlots).toBe(expectedInventoryHeaderWithDepot.usedSlots);
    expect(data.items).toHaveLength(27);
    expect(data.depot?.sectionType).toBe(20);
    expect(data.depot?.items).toHaveLength(9);
    expect(data.depot?.items.map(({ itemId }) => itemId)).toEqual([...expectedInventoryDepotItemIds]);
    expect(data.items.at(-1)?.itemId).toBe(1027);
    expect(summarizeBinaryMessage(message)).toBe("inventory(27/28 items, 97352 gold, depot 9)");
  });

  it("decodes speech frames", () => {
    const message = decodeBinaryMessage(binaryFixtures.speechExevoMasSan);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.Speech);
    expect(message.body.kind).toBe("speech");
    if (message.body.kind !== "speech") {
      throw new Error("expected speech body");
    }

    expect(message.body.data.entries).toEqual([
      { mode: 2, speakerIndex: 1, text: "exevh mas san" },
    ]);
  });

  it("decodes batched multi-speaker speech frames", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.speechBatchedParty);

    expect(message.body.kind).toBe("speech");
    if (message.body.kind !== "speech") {
      throw new Error("expected speech body");
    }

    expect(message.body.data.entries).toEqual([
      { mode: 2, speakerIndex: 1, text: "exori min" },
      { mode: 2, speakerIndex: 2, text: "exevo mas san" },
      { mode: 2, speakerIndex: 4, text: "exori flam" },
    ]);
    expect(summarizeBinaryMessage(message)).toBe(
      'speech(#1 "exori min", #2 "exevo mas san", #4 "exori flam")'
    );
  });

  it("decodes spell cast frames with embedded strings", () => {
    const message = decodeBinaryMessage(binaryFixtures.spellDivineCaldera);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.SpellCast);
    expect(message.body.kind).toBe("spell_cast");
    if (message.body.kind !== "spell_cast") {
      throw new Error("expected spell cast body");
    }

    expect(message.body.data.strings).toEqual(["Divine Caldera", "Carniphila"]);
    expect(message.body.data.actors).toEqual([
      {
        tag: 0x0f,
        runtimePlayerId: 1,
        abilityIndex: 0,
        abilityName: "Divine Caldera",
      },
    ]);
    const monsterHits = message.body.data.combatHits.filter(
      (hit) => hit.target === "monster"
    );
    expect(monsterHits).toHaveLength(4);
    expect(
      monsterHits.every(
        (hit) =>
          hit.attackerRuntimePlayerId === 1 &&
          hit.abilityName === "Divine Caldera" &&
          hit.school === 6 &&
          hit.monsterName === "Carniphila"
      )
    ).toBe(true);
  });

  it("decodes auto attack frames with embedded strings", () => {
    const message = decodeBinaryMessage(binaryFixtures.autoAttackElvishBow);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto attack body");
    }

    expect(message.body.data.strings).toEqual([
      "Auto-Attack",
      "/inventory/Elvish_Bow.gif",
      "Carniphila",
    ]);
    expect(message.body.data.combatHits).toHaveLength(2);
    expect(message.body.data.combatHits[1]).toMatchObject({
      target: "monster",
      amount: 96,
      school: 8,
      attackerRuntimePlayerId: 1,
      abilityName: "Auto-Attack",
      weaponName: "/inventory/Elvish_Bow.gif",
      monsterName: "Carniphila",
    });
  });

  it("decodes type-0x12 ability cast frames with the auto attack layout", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastElvishBow);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AbilityCast);
    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto attack body");
    }

    expect(message.body.data.strings).toEqual([
      "Auto-Attack",
      "/inventory/Elvish_Bow.gif",
      "Carniphila",
    ]);
    expect(message.body.data.combatHits.filter((hit) => hit.target === "monster")).toHaveLength(
      1
    );
  });

  it("decodes type-0x12 support ability casts without decode failures", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastSupportUtitoTempo);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AbilityCast);
    expect(message.body.kind).toBe("support_ability_cast");
    if (message.body.kind !== "support_ability_cast") {
      throw new Error("expected support_ability_cast body");
    }

    expect(message.body.data.strings).toEqual(expectedSupportAbilityCastUtitoTempo.strings);
    expect(message.body.data.entries).toEqual(expectedSupportAbilityCastUtitoTempo.entries);
    expect(message.body.data.effectTail).toEqual(expectedSupportAbilityCastUtitoTempo.effectTail);
    expect(message.body.data.rawTail.length).toBe(0);
    expect(summarizeBinaryMessage(message)).toBe(
      "support_ability(UTITO_TEMPO / Utito Tempo / Blood_Rage.gif)"
    );
  });

  it("decodes type-0x12 multi-buff support frames (Utamo Vita + Utamo Tempo)", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastSupportUtamoMulti);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AbilityCast);
    expect(message.body.kind).toBe("support_ability_cast");
    if (message.body.kind !== "support_ability_cast") {
      throw new Error("expected support_ability_cast body");
    }

    expect(message.body.data.strings).toEqual(expectedSupportAbilityCastUtamoMulti.strings);
    expect(message.body.data.entries).toEqual(expectedSupportAbilityCastUtamoMulti.entries);
    expect(message.body.data.effectTail?.extra).toBe(100);
    expect(message.body.data.rawTail.length).toBe(0);
    expect(summarizeBinaryMessage(message)).toBe(
      "support_ability(UTAMO_VITA / Magic Shield / Magic_Shield.gif; UTAMO_TEMPO / Utamo Tempo / Protector.gif)"
    );
  });

  it("decodes type-0x12 support frames with attached status effects (Burning)", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastSupportUtamoTempoBurning);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AbilityCast);
    expect(message.body.kind).toBe("support_ability_cast");
    if (message.body.kind !== "support_ability_cast") {
      throw new Error("expected support_ability_cast body");
    }

    expect(message.body.data.strings).toEqual(expectedSupportAbilityCastUtamoTempoBurning.strings);
    expect(message.body.data.entries).toEqual(expectedSupportAbilityCastUtamoTempoBurning.entries);
    expect(message.body.data.effectTail?.statusEffects).toEqual(
      expectedSupportAbilityCastUtamoTempoBurning.entries[0].statusEffects
    );
    expect(message.body.data.rawTail.length).toBe(0);
    expect(summarizeBinaryMessage(message)).toBe(
      "support_ability(UTAMO_TEMPO / Utamo Tempo / Protector.gif, status: Burning)"
    );
  });

  it("decodes handle-less effect area records (kind 0x00)", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.statusEffectClearShort);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.EffectArea);
    expect(message.body.kind).toBe("effect_area");
    if (message.body.kind !== "effect_area") {
      throw new Error("expected effect_area body");
    }

    expect(message.body.data).toEqual({
      records: [
        { kind: 0, centerX: -1, centerY: -1, tiles: [{ dx: 0, dy: 0 }] },
      ],
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "effect_area(1 records 0x0@(-1,-1)×1)"
    );
  });

  it("decodes multi-record effect area frames with kind-gated tails", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.effectAreaThreeRecords);

    expect(message.body.kind).toBe("effect_area");
    if (message.body.kind !== "effect_area") {
      throw new Error("expected effect_area body");
    }

    expect(message.body.data.records).toEqual([
      {
        kind: 0x01,
        centerX: 0,
        centerY: 0,
        tiles: [{ dx: 0, dy: 0 }],
        sourceHandle: "a218dbf9",
      },
      {
        kind: 0x41,
        centerX: 0,
        centerY: 0,
        tiles: [
          { dx: 1, dy: 1 },
          { dx: 0, dy: 1 },
          { dx: -1, dy: 1 },
          { dx: 1, dy: 0 },
          { dx: 0, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 1, dy: -1 },
          { dx: 0, dy: -1 },
          { dx: -1, dy: -1 },
        ],
        sourceHandle: "fef390e5",
        refId: 123,
        magnitude: expect.closeTo(0.3, 5),
      },
      {
        kind: 0x47,
        centerX: -2,
        centerY: 0,
        tiles: [{ dx: 0, dy: 1 }],
        sourceHandle: "fef390e5",
        targetHandle: "a3e84e76",
        targetDx: 0,
        targetDy: 1,
        refId: 123,
        magnitude: expect.closeTo(0.3, 5),
      },
    ]);
  });

  it("decodes continuation-only type-0x12 support frames (no strings)", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastSupportContinuationOnly);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AbilityCast);
    expect(message.body.kind).toBe("support_ability_cast");
    if (message.body.kind !== "support_ability_cast") {
      throw new Error("expected support_ability_cast body");
    }

    expect(message.body.data.entries).toEqual(
      expectedSupportAbilityCastContinuationOnly.entries
    );
    expect(message.body.data.strings).toEqual([]);
    expect(message.body.data.rawTail.length).toBe(0);
    expect(summarizeBinaryMessage(message)).toBe(
      "support_ability(refresh, duration=12000ms)"
    );
  });

  it("decodes entity uuid lists larger than 100 entries", () => {
    // Synthesized from a live 5173-byte capture: header + 136 × (u16 len + uuid).
    const uuidCount = 136;
    const header = new Uint8Array([0x53, 0x47, 0x05, 0x0a, 0x00, 0x00, 0x00, uuidCount, 0x00]);
    const chunks: number[] = [...header];
    for (let index = 0; index < uuidCount; index += 1) {
      const uuid = `019f760a-2f70-711e-83ce-${index.toString(16).padStart(12, "0")}`;
      chunks.push(36, 0, ...[...uuid].map((char) => char.charCodeAt(0)));
    }

    const message = decodeBinaryMessage(new Uint8Array(chunks));
    expect(message.body.kind).toBe("entity_uuid_list");
    if (message.body.kind !== "entity_uuid_list") {
      throw new Error("expected entity_uuid_list body");
    }
    expect(message.body.data.entityCount).toBe(uuidCount);
    expect(message.body.data.entityUuids).toHaveLength(uuidCount);
    expect(summarizeBinaryMessage(message)).toBe("entity_uuid_list(136 uuids)");
  });

  it("decodes fresh-hunt analyzer snapshots without a monster table", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.huntAnalyzerSnapshotFreshHunt);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.HuntAnalyzerSnapshot);
    expect(message.body.kind).toBe("hunt_analyzer_snapshot");
    if (message.body.kind !== "hunt_analyzer_snapshot") {
      throw new Error("expected hunt_analyzer_snapshot body");
    }

    const expected = expectedHuntAnalyzerSnapshotFreshHunt;
    expect(message.body.data).toMatchObject({
      totalKills: expected.totalKills,
      monsterCount: expected.monsterCount,
      primaryMonsterId: expected.primaryMonsterId,
      monsters: [],
      rawXp: expected.rawXp,
      lootBalanceGold: expected.lootBalanceGold,
      xp: expected.xp,
      suppliesGold: expected.suppliesGold,
      lootItems: [],
    });
    expect(
      message.body.data.partyMembers.map(({ playerId: _playerId, ...member }) => member)
    ).toEqual([...expected.partyMembers]);
    expect(message.body.data.partyLeaderTotals).toMatchObject(expected.partyLeaderTotals);
    expect(summarizeBinaryMessage(message)).toBe(
      "hunt_analyzer(kills=0, rawXp=964, xp=172828, party=4)"
    );
  });

  it("decodes training-idle analyzer snapshots with zero-valued party rows", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.huntAnalyzerSnapshotTrainingIdle);

    expect(message.body.kind).toBe("hunt_analyzer_snapshot");
    if (message.body.kind !== "hunt_analyzer_snapshot") {
      throw new Error("expected hunt_analyzer_snapshot body");
    }

    expect(message.body.data.partyLeaderTotals).toMatchObject({
      name: "Leader1",
      lootTotalValue: 0,
      suppliesGold: 216,
      profitGold: -216,
      profitPerMember: -54,
      remainderGold: 0,
    });
    expect(
      message.body.data.partyMembers.map(({ name, transferGold, receiveGold, payGold }) => ({
        name,
        transferGold,
        receiveGold,
        payGold,
      }))
    ).toEqual([
      { name: "Bravo", transferGold: 162, receiveGold: 162, payGold: 0 },
      { name: "Leader1", transferGold: -54, receiveGold: 0, payGold: 0 },
      { name: "Charlie", transferGold: -54, receiveGold: 0, payGold: 54 },
      { name: "Delta", transferGold: -54, receiveGold: 0, payGold: 54 },
    ]);
    expect(summarizeBinaryMessage(message)).toBe(
      "hunt_analyzer(kills=0, rawXp=0, xp=0, party=4)"
    );
  });

  it("decodes live party analyzer snapshots with an uneven loot split", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.huntAnalyzerLiveParty);

    expect(message.body.kind).toBe("hunt_analyzer_snapshot");
    if (message.body.kind !== "hunt_analyzer_snapshot") {
      throw new Error("expected hunt_analyzer_snapshot body");
    }

    const expected = expectedWinterCourt.huntAnalyzerLiveParty;
    expect(message.body.data.partyLeaderTotals).toEqual(expected.partyLeaderTotals);
    expect(
      message.body.data.partyMembers.map(({ playerId: _playerId, ...member }) => member)
    ).toEqual([...expected.partyMembers]);
    expect(summarizeBinaryMessage(message)).toBe(
      "hunt_analyzer(kills=958, rawXp=455616, xp=468109, party=4)"
    );
  });

  it("decodes type-0x12 Magic Shield with header.byteA=0x03", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastSupportUtamoVitaByteA3);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AbilityCast);
    expect(message.body.kind).toBe("support_ability_cast");
    if (message.body.kind !== "support_ability_cast") {
      throw new Error("expected support_ability_cast body");
    }

    expect(message.body.data.strings).toEqual(expectedSupportAbilityCastUtamoVitaByteA3.strings);
    expect(message.body.data.entries).toEqual(expectedSupportAbilityCastUtamoVitaByteA3.entries);
    expect(message.body.data.effectTail).toEqual(expectedSupportAbilityCastUtamoVitaByteA3.effectTail);
    expect(summarizeBinaryMessage(message)).toBe(
      "support_ability(UTAMO_VITA / Magic Shield / Magic_Shield.gif)"
    );
  });

  it("degrades truncated string-table attack frames to unknown", () => {
    // Claims 8 strings but the payload is cut after the fifth.
    const message = decodeBinaryMessage(
      "U0cFGQgLAEF1dG8tQXR0YWNrHgAvaW52ZW50b3J5L05pZ2h0bWFyZV9CbGFkZS5naWYVAFNvdWwtQnJva2VuIEhhcmJpbmdlch4AL2ludmVudG9yeS9XYW5kX09mX0luZmVybm8uZ2lmIgAvaW52ZW50b3J5L0RyYWdvbmljX01haWwuZ2lm"
    );

    expect(message.body.kind).toBe("unknown");
    if (message.body.kind !== "unknown") {
      throw new Error("expected unknown body");
    }
    expect(message.body.data.error).toBeTruthy();
  });

  it("decodes Front Sweep casts with eight combat records", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastFrontSweepEightTargets);

    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual(["Front Sweep", "Soul-Broken Harbinger"]);
    expect(message.body.data.combatHits).toHaveLength(8);
    expect(
      message.body.data.combatHits.filter((hit) => hit.target === "monster")
    ).toEqual([
      expect.objectContaining({
        amount: 210,
        school: 8,
        attackerRuntimePlayerId: 1,
        abilityName: "Front Sweep",
        monsterName: "Soul-Broken Harbinger",
      }),
    ]);
  });

  it("decodes multi-record Front Sweep casts with attributed hits", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastFrontSweep);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto attack body");
    }

    expect(message.body.data.strings).toEqual(expectedAbilityCastFrontSweep.strings);
    expect(message.body.data.combatHits).toHaveLength(
      expectedAbilityCastFrontSweep.combatHitCount
    );
    expect(
      message.body.data.combatHits.filter((hit) => hit.target === "monster")
    ).toEqual([expect.objectContaining(expectedAbilityCastFrontSweep.monsterHit)]);
    expect(summarizeBinaryMessage(message)).toBe(
      "auto_attack(Front Sweep / Soul-Broken Harbinger, 1 monster hits)"
    );
  });

  it("decodes batched multi-cast frames with per-caster attribution", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastBatchedMultiCast);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual(expectedAbilityCastBatchedMultiCast.strings);
    const dealtByAbility = message.body.data.combatHits
      .filter((hit) => hit.target === "monster")
      .reduce<Record<string, number>>((acc, hit) => {
        const key = `${hit.attackerRuntimePlayerId}:${hit.abilityName}`;
        acc[key] = (acc[key] ?? 0) + hit.amount;
        return acc;
      }, {});
    expect(dealtByAbility).toEqual(expectedAbilityCastBatchedMultiCast.dealtByAbility);
    expect(summarizeBinaryMessage(message)).toBe(
      "auto_attack(Fierce Berserk / Soul-Broken Harbinger / Terra Wave / Great Fire Wave, 6 monster hits)"
    );
  });

  it("decodes a second batched multi-cast frame", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastBatchedMultiCast2);

    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual(["Berserk", "Silencer", "Avalanche Rune"]);
    expect(message.body.data.combatHits).toHaveLength(6);
    expect(
      message.body.data.combatHits.filter((hit) => hit.target === "monster")
    ).toEqual([
      expect.objectContaining({
        amount: 143,
        school: 8,
        attackerRuntimePlayerId: 1,
        abilityName: "Berserk",
        monsterName: "Silencer",
      }),
      expect.objectContaining({
        amount: 10,
        school: 3,
        attackerRuntimePlayerId: 2,
        abilityName: "Avalanche Rune",
        monsterName: "Silencer",
      }),
    ]);
    expect(summarizeBinaryMessage(message)).toBe(
      "auto_attack(Berserk / Silencer / Avalanche Rune, 2 monster hits)"
    );
  });

  it("decodes client area selection frames on type 0x65", () => {
    const message = decodeBinaryMessage(binaryFixtures.clientAreaSelectStonegyHome);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.ClientAreaSelect);
    expect(message.body.kind).toBe("client_area");
    if (message.body.kind !== "client_area") {
      throw new Error("expected client_area body");
    }

    expect(message.body.data).toEqual({
      mapName: "stonegy-home",
      coordA: -3,
      coordB: -2,
      fieldC: 1,
      fieldD: 2,
    });
    expect(summarizeBinaryMessage(message)).toBe("client_area(stonegy-home, -3, -2)");
  });

  it("decodes market snapshot frames into sell and buy orders with an unmapped footer", () => {
    const message = decodeBinaryMessage(binaryMarketSnapshotBrowse);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.MarketSnapshot);
    expect(isMarketSnapshot(message)).toBe(true);
    if (!isMarketSnapshot(message)) {
      throw new Error("expected market snapshot");
    }

    const { data } = message.body;
    expect(data.page).toBe(expectedBinaryMarketSnapshotBrowse.page);
    expect(data.totalPages).toBe(expectedBinaryMarketSnapshotBrowse.totalPages);
    expect(data.requestedItemId).toBe(expectedBinaryMarketSnapshotBrowse.requestedItemId);
    expect(data.selectedItemTradableAmount).toBe(
      expectedBinaryMarketSnapshotBrowse.selectedItemTradableAmount
    );
    expect(data.sellOrders).toHaveLength(expectedBinaryMarketSnapshotBrowse.sellOrders.length);
    expect(data.buyOrders).toHaveLength(expectedBinaryMarketSnapshotBrowse.buyOrders.length);

    for (const [index, expected] of expectedBinaryMarketSnapshotBrowse.sellOrders.entries()) {
      expect(data.sellOrders[index]).toMatchObject({
        ...expected,
        tier: 0,
        isOwnOrder: false,
        isBuyOrder: false,
      });
      expect(data.sellOrders[index]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    for (const [index, expected] of expectedBinaryMarketSnapshotBrowse.buyOrders.entries()) {
      expect(data.buyOrders[index]).toMatchObject({
        ...expected,
        tier: 0,
        isBuyOrder: true,
      });
      expect(data.buyOrders[index]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const protocolData = marketSnapshotBodyToData(data);
    expect(protocolData.sellOrders?.[2]?.itemId).toBe(1346);
    expect(protocolData.sellOrders?.[2]?.eachPrice).toBe(77);
    expect(summarizeBinaryMessage(message)).toBe("market(page 1/463, 7 sells, 2 buys)");
    expect(data.sellOrderAnchors).toHaveLength(7);
    expect(data.buyOrderAnchors).toHaveLength(2);
    expect(data.trailingBytes?.length).toBeGreaterThan(0);
  });

  it("decodes map bootstrap frames into a section tree", () => {
    const message = decodeBinaryMessage(binaryFixtures.mapBootstrap);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.MapBootstrap);
    expect(message.body.kind).toBe("map_bootstrap");
    if (message.body.kind !== "map_bootstrap") {
      throw new Error("expected map_bootstrap body");
    }

    expect(message.body.data.mapId).toBe(65548);
    expect(message.body.data.schemaVersion).toBe(259);
    expect(message.body.data.sections).toHaveLength(1);
    expect(message.body.data.sections[0]?.key).toBe(2);
    expect(findFirstMapBlob(message.body.data.sections)?.blob?.length).toBe(1651);
    expect(summarizeBinaryMessage(message)).toBe("map(id=65548, schema=259, tileData=1651b)");
  });

  it("decodes xp summary batches from type 0x14 frames", () => {
    const message = decodeBinaryMessage(binaryFixtures.playerUpdate);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.XpSummary);
    expect(message.body.kind).toBe("xp_summary");
    if (message.body.kind !== "xp_summary") {
      throw new Error("expected xp_summary body");
    }

    expect(message.body.data.xpGain).toBe(125);
    expect(message.body.data.records).toHaveLength(3);
    expect(message.body.data.records[2]).toEqual({
      xpGain: 125,
      sessionXp: 841780,
      memberCount: 4,
      shares: [
        { memberIndex: 1, flag: 0 },
        { memberIndex: 2, flag: 0 },
        { memberIndex: 3, flag: 0 },
      ],
    });
  });

  it("decodes empty xp summary batches from type 0x14 frames", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.xpSummaryEmpty);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.XpSummary);
    expect(message.body.kind).toBe("xp_summary");
    if (message.body.kind !== "xp_summary") {
      throw new Error("expected xp_summary body");
    }

    expect(message.body.data).toEqual({ xpGain: 0, records: [] });
    expect(summarizeBinaryMessage(message)).toBe("xp_summary(latest=+0, 0 records)");
  });

  it("decodes entity move frames with move kind", () => {
    const message = decodeBinaryMessage(binaryFixtures.entityMoveLocal);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.EntityMove);
    expect(message.body.kind).toBe("entity_move");
    if (message.body.kind !== "entity_move") {
      throw new Error("expected entity_move body");
    }

    expect(message.body.data).toEqual({
      records: [{ moveKind: 2, name: "Local", delta: -7, reserved: 0, state: 4 }],
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "entity_move(Local: delta=-7, kind=2, state=4)"
    );
  });

  it("decodes moveKind=1 entity move records with an appearance block", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.entityMoveAppearance);

    expect(message.body.kind).toBe("entity_move");
    if (message.body.kind !== "entity_move") {
      throw new Error("expected entity_move body");
    }

    expect(message.body.data.records).toHaveLength(1);
    const [record] = message.body.data.records;
    expect(record).toMatchObject({
      moveKind: 1,
      name: "NearPlayer",
      delta: -8,
      reserved: 0,
      state: 3,
    });
    expect(record.appearance).toEqual({
      level: 65,
      fieldA: 2,
      fieldB: 6,
      looktype: 129,
      flag: 1,
      value: 0,
      reserved: 0,
      colors: [
        { marker: 1, r: 255, g: 170, b: 0 },
        { marker: 1, r: 0, g: 63, b: 191 },
        { marker: 1, r: 191, g: 106, b: 63 },
        { marker: 1, r: 109, g: 109, b: 109 },
      ],
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "entity_move(NearPlayer: delta=-8, kind=1, state=3, lvl=65)"
    );
  });

  it("decodes entity position frames for city entities", () => {
    const message = decodeBinaryMessage(binaryFixtures.entityPositionSample);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.EntityPosition);
    expect(message.body.kind).toBe("entity_position");
    if (message.body.kind !== "entity_position") {
      throw new Error("expected entity_position body");
    }

    expect(message.body.data).toEqual({
      records: [{ name: "AllyA", delta: -4, fieldA: 0, fieldB: 0, state: 4 }],
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "entity_position(AllyA: delta=-4, state=4)"
    );
  });

  it("decodes entity position frames with multiple records", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.entityPositionPair);

    expect(message.body.kind).toBe("entity_position");
    if (message.body.kind !== "entity_position") {
      throw new Error("expected entity_position body");
    }

    expect(message.body.data).toEqual({
      records: [
        { name: "Ally", delta: -8, fieldA: 0, fieldB: 0, state: 2 },
        { name: "AllyB", delta: -6, fieldA: -1, fieldB: 0, state: 2 },
      ],
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "entity_position(Ally: delta=-8, state=2; AllyB: delta=-6, state=2)"
    );
  });

  it("decodes hunt frame variants: ground drops, empty kills, item grant, and entity uuid list", () => {
    const emptyLoot = decodeBinaryMessage(huntTrafficFixtures.huntLootAnalyzerTick);
    expect(emptyLoot.body.kind).toBe("monster_loot");
    if (emptyLoot.body.kind !== "monster_loot") {
      throw new Error("expected monster_loot body");
    }
    expect(emptyLoot.body.data.dropCount).toBe(0);
    expect(emptyLoot.body.data.drops).toEqual([]);
    expect(emptyLoot.body.data.totalLootValue).toBe(9367);

    const drops = decodeBinaryMessage(huntTrafficFixtures.huntLootItemDrops);
    expect(drops.body.kind).toBe("monster_loot");
    if (drops.body.kind !== "monster_loot") {
      throw new Error("expected monster_loot body");
    }
    expect(drops.body.data.drops).toEqual([...expectedHuntLootDrops]);

    // Live capture: Small Enchanted Ruby + full-charge Ice Rapier (flagsA high word = 1).
    const iceRapierLoot = decodeBinaryMessage(
      "U0cFCgErfg0AAAAAAAIAJAA4ODg4ODg4OC04ODg4LTc4ODgtODg4OC0wMDAwMDAwMDAwMDb0AAAAAgAAAAIAAAAAACQAOTk5OTk5OTktOTk5OS03OTk5LTg5OTktMDAwMDAwMDAwMDA2OgAAAAEAAAACAAEAAAAAAA=="
    );
    expect(iceRapierLoot.body.kind).toBe("monster_loot");
    if (iceRapierLoot.body.kind !== "monster_loot") {
      throw new Error("expected monster_loot body");
    }
    expect(iceRapierLoot.body.data.drops).toEqual([
      {
        groundUuid: "88888888-8888-7888-8888-000000000006",
        itemId: 244,
        amount: 2,
        flagsA: 2,
        flagsB: 0,
        remainingUnits: 0,
      },
      {
        groundUuid: "99999999-9999-7999-8999-000000000006",
        itemId: 58,
        amount: 1,
        flagsA: 0x10002,
        flagsB: 0,
        remainingUnits: 1,
      },
    ]);

    const starterGrant = decodeBinaryMessage(huntTrafficFixtures.huntLootStarterItemGrant);
    expect(starterGrant.body.kind).toBe("item_grant");
    if (starterGrant.body.kind !== "item_grant") {
      throw new Error("expected item_grant body");
    }
    expect(starterGrant.body.data).toEqual({
      subType: 0,
      ...expectedHuntLootStarterItemGrant,
    });

    const entityList = decodeBinaryMessage(huntTrafficFixtures.huntEntityUuidList);
    expect(entityList.body.kind).toBe("entity_uuid_list");
    if (entityList.body.kind !== "entity_uuid_list") {
      throw new Error("expected entity_uuid_list body");
    }
    expect(entityList.body.data).toEqual({
      subType: 0,
      entityCount: 6,
      entityUuids: [...expectedHuntEntityUuidList],
    });
    expect(summarizeBinaryMessage(entityList)).toBe("entity_uuid_list(6 uuids)");
  });

  it("decodes short combat_float frames separately from auto attack strings", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.combatFloatHeal52);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("combat_float");
    if (message.body.kind !== "combat_float") {
      throw new Error("expected combat_float body");
    }
    expect(message.body.data).toEqual(expectedCombatFloatHeal52);
    expect(summarizeBinaryMessage(message)).toBe(
      "combat_float(1 hits: 52 on 1@(0,0) cat=2/0x604)"
    );
  });

  it("decodes batched multi-hit combat_float frames", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.combatFloatMultiHit);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("combat_float");
    if (message.body.kind !== "combat_float") {
      throw new Error("expected combat_float body");
    }
    expect(message.body.data).toEqual(expectedCombatFloatMultiHit);
  });

  it("decodes fire damage combat_float frames", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.combatFloatFire700);

    expect(message.body.kind).toBe("combat_float");
    if (message.body.kind !== "combat_float") {
      throw new Error("expected combat_float body");
    }
    expect(message.body.data).toEqual(expectedCombatFloatFire700);
    expect(summarizeBinaryMessage(message)).toBe(
      "combat_float(1 hits: 700 on 1@(0,0) cat=0/0x204)"
    );
  });

  it("decodes type-0x08 cooldown updates with paired spell/group expiries", () => {
    const attack = decodeBinaryMessage(huntTrafficFixtures.cooldownUpdateAttackCast);
    expect(attack.envelope.type).toBe(StonegyBinaryMessageType.CooldownUpdate);
    expect(attack.body.kind).toBe("cooldown_update");
    if (attack.body.kind !== "cooldown_update") {
      throw new Error("expected cooldown_update body");
    }
    expect(attack.body.data).toEqual(expectedCooldownUpdateAttackCast);
    expect(summarizeBinaryMessage(attack)).toBe(
      "cooldown_update(1 records g1:slot2@1784323007709, slot1@1784323005709)"
    );

    const mixed = decodeBinaryMessage(huntTrafficFixtures.cooldownUpdatePotionAndHeal);
    expect(mixed.body.kind).toBe("cooldown_update");
    if (mixed.body.kind !== "cooldown_update") {
      throw new Error("expected cooldown_update body");
    }
    expect(mixed.body.data).toEqual(expectedCooldownUpdatePotionAndHeal);
  });

  it("decodes type-0x09 masked vital updates across payload sizes", () => {
    const single = decodeBinaryMessage(huntTrafficFixtures.vitalsSingleBit0);
    expect(single.envelope.type).toBe(StonegyBinaryMessageType.Vitals);
    expect(single.body.kind).toBe("vitals");
    if (single.body.kind !== "vitals") {
      throw new Error("expected vitals body");
    }
    expect(single.body.data).toEqual(expectedVitalsSingleBit0);
    expect(summarizeBinaryMessage(single)).toBe("vitals(1 records 1:{bit0=1540})");

    const bits02 = decodeBinaryMessage(huntTrafficFixtures.vitalsBits02);
    expect(bits02.body.kind).toBe("vitals");
    if (bits02.body.kind !== "vitals") {
      throw new Error("expected vitals body");
    }
    expect(bits02.body.data).toEqual(expectedVitalsBits02);

    const mixed = decodeBinaryMessage(huntTrafficFixtures.vitalsMixed27);
    expect(mixed.body.kind).toBe("vitals");
    if (mixed.body.kind !== "vitals") {
      throw new Error("expected vitals body");
    }
    expect(mixed.body.data).toEqual(expectedVitalsMixed27);

    const shared = decodeBinaryMessage(huntTrafficFixtures.vitalsSharedBit4);
    expect(shared.body.kind).toBe("vitals");
    if (shared.body.kind !== "vitals") {
      throw new Error("expected vitals body");
    }
    expect(shared.body.data).toEqual(expectedVitalsSharedBit4);

    const winter = decodeBinaryMessage(winterCourtTrafficFixtures.vitals);
    expect(winter.body.kind).toBe("vitals");
    if (winter.body.kind !== "vitals") {
      throw new Error("expected vitals body");
    }
    expect(winter.body.data).toEqual(expectedWinterCourt.vitals);
  });

  it("decodes session metric and xp summary hunt frames", () => {
    const session = decodeBinaryMessage(huntTrafficFixtures.sessionMetric);
    expect(session.body.kind).toBe("session_metric");
    if (session.body.kind !== "session_metric") {
      throw new Error("expected session_metric body");
    }
    expect(session.body.data.staminaMs).toBe(expectedSessionMetric.staminaMs);

    const player = decodeBinaryMessage(huntTrafficFixtures.playerUpdate);
    expect(player.body.kind).toBe("xp_summary");
    if (player.body.kind !== "xp_summary") {
      throw new Error("expected xp_summary body");
    }
    expect(player.body.data).toEqual(expectedXpSummaryReconnect);
  });

  it("decodes hunt analyzer snapshot personal and party sections", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.huntAnalyzerSnapshot);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.HuntAnalyzerSnapshot);
    expect(message.body.kind).toBe("hunt_analyzer_snapshot");
    if (message.body.kind !== "hunt_analyzer_snapshot") {
      throw new Error("expected hunt_analyzer_snapshot body");
    }

    expect(message.body.data).toMatchObject({
      subType: 1,
      totalKills: 1533,
      monsterCount: 3,
      primaryMonsterId: 123,
      rawXp: 376_368,
      xp: 277_516,
      lootBalanceGold: -376_368,
      suppliesGold: -277_517,
      monsters: [
        { killCount: 594, monsterId: 124 },
        { killCount: 567, monsterId: 125 },
        { killCount: 372, monsterId: 0 },
      ],
    });

    expect(message.body.data.partyMembers.map((member) => member.name)).toEqual([
      "Delta",
      "Guild",
      "Member Primary",
      "Partner",
    ]);

    expect(message.body.data.partyLeaderTotals).toMatchObject({
      name: "Partner",
      lootTotalValue: 1_818_866,
      suppliesGold: 1_227_346,
      profitGold: 591_520,
      profitPerMember: 147_880,
      remainderGold: 0,
    });

    expect(message.body.data.partyMembers[0]).toMatchObject({
      name: "Delta",
      isLeaderRow: false,
      lootTotalValue: 1_452_050,
      suppliesGold: 344_574,
      profitGold: 1_107_476,
      transferGold: -959_596,
      receiveGold: 0,
      payGold: 959_596,
    });

    expect(message.body.data.partyMembers[3]).toMatchObject({
      name: "Partner",
      isLeaderRow: true,
      lootTotalValue: 366_816,
      suppliesGold: 206_196,
      profitGold: 160_620,
      transferGold: -12_740,
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "hunt_analyzer(kills=1533, rawXp=376368, xp=277516, party=4)"
    );
  });

  it("decodes compact hunt analyzer snapshots with loot items and party totals", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.huntAnalyzerSnapshotCompact);

    expect(message.body.kind).toBe("hunt_analyzer_snapshot");
    if (message.body.kind !== "hunt_analyzer_snapshot") {
      throw new Error("expected hunt_analyzer_snapshot body");
    }

    const expected = expectedHuntAnalyzerSnapshotCompact;
    expect(message.body.data).toMatchObject({
      totalKills: expected.totalKills,
      monsterCount: expected.monsterCount,
      primaryMonsterId: expected.primaryMonsterId,
      rawXp: expected.rawXp,
      xp: expected.xp,
      suppliesGold: expected.suppliesGold,
      lootBalanceGold: expected.lootBalanceGold,
      monsters: expected.monsters,
      lootItems: expected.lootItems,
    });

    expect(message.body.data.partyMembers.map((member) => member.name)).toEqual(
      expected.partyMembers
    );
    expect(message.body.data.partyLeaderTotals).toMatchObject(expected.partyLeaderTotals);
    expect(summarizeBinaryMessage(message)).toBe(
      "hunt_analyzer(kills=135, rawXp=287810, xp=345372, party=4)"
    );
  });
});

describe("visual update (type 0x1b)", () => {
  it("surfaces the stable entity handle and preserves the unmapped payload (lead 1)", () => {
    const message = decodeBinaryMessage(binaryFixtures.visualUpdateLead1);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.VisualUpdate);
    expect(message.body.kind).toBe("visual_update");
    if (message.body.kind !== "visual_update") {
      throw new Error("expected visual_update body");
    }

    const expected = expectedVisualUpdateLead1;
    expect(message.body.data.leadByte).toBe(expected.leadByte);
    expect(message.body.data.entityHandle).toBe(expected.entityHandle);
    expect(message.body.data.raw.length).toBe(expected.rawLength);
    expect(summarizeBinaryMessage(message)).toBe(
      "visual_update(lead=1, entity=a218dbf9, 24 raw bytes)"
    );
  });

  it("decodes the same entity handle regardless of lead byte (lead 3)", () => {
    const message = decodeBinaryMessage(binaryFixtures.visualUpdateLead3);

    expect(message.body.kind).toBe("visual_update");
    if (message.body.kind !== "visual_update") {
      throw new Error("expected visual_update body");
    }

    const expected = expectedVisualUpdateLead3;
    expect(message.body.data.leadByte).toBe(expected.leadByte);
    expect(message.body.data.entityHandle).toBe(expected.entityHandle);
    expect(message.body.data.raw.length).toBe(expected.rawLength);
    expect(summarizeBinaryMessage(message)).toBe(
      "visual_update(lead=3, entity=a218dbf9, 98 raw bytes)"
    );
  });
});

describe("hunt world snapshot (type 0x1f)", () => {
  it("decodes the entity list with names and position deltas", () => {
    const message = decodeBinaryMessage(huntWorldSnapshotFixture);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.HuntWorldSnapshot);
    expect(message.body.kind).toBe("hunt_world_snapshot");
    if (message.body.kind !== "hunt_world_snapshot") {
      throw new Error("expected hunt_world_snapshot body");
    }

    const expected = expectedHuntWorldSnapshot;
    expect(message.body.data.entityCount).toBe(expected.entityCount);
    expect(message.body.data.entities).toHaveLength(expected.entityCount);
    expect(message.body.data.entities.map((entity) => entity.name)).toEqual(
      expected.entityNames
    );

    const [first] = message.body.data.entities;
    expect(first).toMatchObject(expected.firstEntity);
    expect(first.raw.length).toBe(35);
    expect(message.body.data.tail.length).toBeGreaterThan(0);
    expect(summarizeBinaryMessage(message)).toBe(
      "world_snapshot(32/32 entities, +3565 tail bytes)"
    );
  });
});

describe("gold balance (type 0x0d)", () => {
  it("decodes gold wallet pushes used as quick-sell acks", () => {
    const winter = decodeBinaryMessage(winterCourtTrafficFixtures.goldBalance);
    expect(winter.envelope.type).toBe(StonegyBinaryMessageType.GoldBalance);
    expect(winter.body.kind).toBe("gold_balance");
    if (winter.body.kind !== "gold_balance") {
      throw new Error("expected gold_balance body");
    }
    expect(winter.body.data.goldCoins).toBe(expectedWinterCourt.goldBalance.goldCoins);
    expect(summarizeBinaryMessage(winter)).toBe(
      `gold(${expectedWinterCourt.goldBalance.goldCoins})`
    );

    // Live quick-sell capture: balance 4614941 after selling rope belts.
    const afterSell = decodeBinaryMessage("U0cFDR1rRgAAAAAA");
    expect(afterSell.body.kind).toBe("gold_balance");
    if (afterSell.body.kind !== "gold_balance") {
      throw new Error("expected gold_balance body");
    }
    expect(afterSell.body.data.goldCoins).toBe(4_614_941);
    expect(summarizeBinaryMessage(afterSell)).toBe("gold(4614941)");
  });
});

describe("binary packet tails", () => {
  it("fully decodes inventory, spell, and auto-attack payloads without trailing bytes", () => {
    const samples = [
      binaryFixtures.inventorySnapshotDuringHunt,
      binaryFixtures.spellDivineCaldera,
      binaryFixtures.autoAttackElvishBow,
    ];

    for (const sample of samples) {
      const message = decodeBinaryMessage(sample);
      expect(message.body.kind).not.toBe("unknown");
      const serialized = JSON.stringify(message.body);
      expect(serialized).not.toContain('"__bytes"');
    }
  });
});

describe("binary decode containment", () => {
  it("degrades truncated frames to unknown instead of throwing", () => {
    const full = decodeBase64ToBytes(binaryFixtures.autoAttackElvishBow);
    const truncated = full.slice(0, Math.min(8, full.length));
    const message = decodeBinaryMessage(truncated);
    expect(message.body.kind).toBe("unknown");
    if (message.body.kind !== "unknown") {
      throw new Error("expected unknown body");
    }
    expect(message.body.data.error).toBeTruthy();
  });

  it("degrades invalid magic to unknown", () => {
    const message = decodeBinaryMessage(new Uint8Array([0x00, 0x01, 0x05, 0x12]));
    expect(message.body.kind).toBe("unknown");
    if (message.body.kind !== "unknown") {
      throw new Error("expected unknown body");
    }
    expect(String(message.body.data.error)).toMatch(/magic/i);
  });

  it("degrades unsupported version to unknown", () => {
    const message = decodeBinaryMessage(
      new Uint8Array([
        STONEGY_BINARY_MAGIC.charCodeAt(0),
        STONEGY_BINARY_MAGIC.charCodeAt(1),
        0xff,
        StonegyBinaryMessageType.Ping,
      ])
    );
    expect(message.body.kind).toBe("unknown");
    if (message.body.kind !== "unknown") {
      throw new Error("expected unknown body");
    }
    expect(String(message.body.data.error)).toMatch(/version/i);
  });
});

describe("ground_item_update", () => {
  it("decodes short tile updates with related entity + extra", () => {
    const winter = decodeBinaryMessage(winterCourtTrafficFixtures.groundItemUpdate);
    expect(winter.body.kind).toBe("ground_item_update");
    if (winter.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }
    expect(winter.body.data.entityRef?.hex).toBe(expectedWinterCourt.groundItemUpdate.entityRef);
    expect(winter.body.data.subType).toBe(expectedWinterCourt.groundItemUpdate.subType);
    expect(winter.body.data.count).toBe(expectedWinterCourt.groundItemUpdate.count);
    expect(winter.body.data.extra).toBe(expectedWinterCourt.groundItemUpdate.extra);
    expect(winter.body.data.items).toBeUndefined();
    expect(summarizeBinaryMessage(winter)).toContain("extra=12000");

    const short = decodeBinaryMessage(winterCourtTrafficFixtures.groundItemUpdateShortTileAlt);
    expect(short.body.kind).toBe("ground_item_update");
    if (short.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }
    expect(short.body.data.subType).toBe(1);
    expect(short.body.data.count).toBe(1);
    expect(short.body.data.extra).toBe(11000);
    expect(short.body.data.items).toBeUndefined();
  });

  it("decodes compact short tile updates with a shorter appearance block", () => {
    const compact = decodeBinaryMessage(winterCourtTrafficFixtures.groundItemUpdateCompactTile);
    expect(compact.body.kind).toBe("ground_item_update");
    if (compact.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }

    const expected = expectedWinterCourt.groundItemUpdateCompactTile;
    expect(compact.body.data.entityRef?.hex).toBe(expected.entityRef);
    expect(compact.body.data.subType).toBe(expected.subType);
    expect(compact.body.data.count).toBe(expected.count);
    expect(compact.body.data.appearance).toHaveLength(expected.appearanceLength);
    expect(compact.body.data.extra).toBe(expected.extra);
    expect(compact.body.data.items).toBeUndefined();
    expect(summarizeBinaryMessage(compact)).toContain("extra=11000");
  });

  it("decodes inventory slot deltas from long ground_item frames", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.groundItemUpdateInventory);
    expect(message.body.kind).toBe("ground_item_update");
    if (message.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }

    const { items, count, extra } = message.body.data;
    expect(count).toBe(expectedWinterCourt.groundItemUpdateInventory.count);
    expect(extra).toBe(expectedWinterCourt.groundItemUpdateInventory.extra);
    expect(items?.map((item) => item.itemId)).toEqual(
      expectedWinterCourt.groundItemUpdateInventory.itemIds
    );
    expect(items?.map((item) => item.amount)).toEqual(
      expectedWinterCourt.groundItemUpdateInventory.amounts
    );
    expect(summarizeBinaryMessage(message)).toContain("items=2");
    expect(summarizeBinaryMessage(message)).toContain("125x1");
  });

  it("decodes zero-prefixed ref/value list frames without entityRef", () => {
    const single = decodeBinaryMessage(huntTrafficFixtures.groundItemRefValueSingle);
    expect(single.body.kind).toBe("ground_item_update");
    if (single.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }
    expect(single.body.data).toEqual({
      subType: 0,
      count: 1,
      refValues: [{ ref: 104, value: 688 }],
    });
    expect(summarizeBinaryMessage(single)).toBe(
      "ground_item(sub=0, count=1, refs=[104=688])"
    );

    const pair = decodeBinaryMessage(huntTrafficFixtures.groundItemRefValuePair);
    expect(pair.body.kind).toBe("ground_item_update");
    if (pair.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }
    expect(pair.body.data.refValues).toEqual([
      { ref: 115, value: 1786 },
      { ref: 118, value: 2106 },
    ]);

    const withFlag = decodeBinaryMessage(huntTrafficFixtures.groundItemRefValueWithFlag);
    expect(withFlag.body.kind).toBe("ground_item_update");
    if (withFlag.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }
    expect(withFlag.body.data.refValues).toEqual([{ ref: 1148, value: 2008 }]);
    expect(withFlag.body.data.refFlags).toEqual([{ ref: 1149, flag: 1 }]);
    expect(summarizeBinaryMessage(withFlag)).toBe(
      "ground_item(sub=0, count=1, refs=[1148=2008], flags=[1149:1])"
    );
  });

  it("decodes count=0 ref list frames that carry only flags", () => {
    const flags3 = decodeBinaryMessage(huntTrafficFixtures.groundItemRefFlags3);
    expect(flags3.body.kind).toBe("ground_item_update");
    if (flags3.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }
    expect(flags3.body.data).toEqual({
      subType: 0,
      count: 0,
      refFlags: [
        { ref: 1644, flag: 0 },
        { ref: 1641, flag: 0 },
        { ref: 1643, flag: 0 },
      ],
    });
    expect(summarizeBinaryMessage(flags3)).toBe(
      "ground_item(sub=0, count=0, flags=[1644:0, 1641:0, 1643:0])"
    );

    const flags4 = decodeBinaryMessage(huntTrafficFixtures.groundItemRefFlags4);
    expect(flags4.body.kind).toBe("ground_item_update");
    if (flags4.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }
    expect(flags4.body.data.refFlags).toEqual([
      { ref: 1711, flag: 0 },
      { ref: 1712, flag: 0 },
      { ref: 1710, flag: 0 },
      { ref: 1707, flag: 0 },
    ]);
  });

  it("decodes 9-byte drop notify frames without entityRef", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.groundItemDropNotify);
    expect(message.body.kind).toBe("ground_item_update");
    if (message.body.kind !== "ground_item_update") {
      throw new Error("expected ground_item_update");
    }

    const expected = expectedWinterCourt.groundItemDropNotify;
    expect(message.body.data.entityRef).toBeUndefined();
    expect(message.body.data.count).toBe(expected.amount);
    expect(message.body.data.item?.itemId).toBe(expected.itemId);
    expect(message.body.data.item?.amount).toBe(expected.amount);
    expect(summarizeBinaryMessage(message)).toContain("867x1");
  });
});

describe("hunt_entity_spawn", () => {
  it("decodes live monsters and corpses", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.huntEntitySpawnLiveAndCorpses);
    expect(message.body.kind).toBe("hunt_entity_spawn");
    if (message.body.kind !== "hunt_entity_spawn") {
      throw new Error("expected hunt_entity_spawn");
    }

    const expected = expectedWinterCourt.huntEntitySpawnLiveAndCorpses;
    const { entities, corpses, tiles, rawTail } = message.body.data;
    expect(entities).toHaveLength(expected.entityCount);
    expect(corpses).toHaveLength(expected.corpseCount);
    // Empty third section is u16 tileCount=0 (+ optional zero pad), not tail drift.
    expect(tiles).toEqual([]);
    expect(rawTail.length).toBe(0);

    const first = entities[0]!;
    expect(first.runtimeIndex).toBe(expected.first.runtimeIndex);
    expect(first.uuid).toBe(expected.first.uuid);
    expect(first.monsterId).toBe(expected.first.monsterId);
    expect(first.currentHp).toBe(expected.first.currentHp);
    expect(first.maxHp).toBe(expected.first.maxHp);
    expect(first.dx).toBe(expected.first.dx);
    expect(first.dy).toBe(expected.first.dy);
    expect(first.direction).toBe(expected.first.direction);

    expect(corpses.map((c) => ({ monsterId: c.monsterId, corpseId: c.corpseId, dx: c.dx, dy: c.dy }))).toEqual(
      expected.corpses
    );
    expect(summarizeBinaryMessage(message)).toBe("hunt_spawn(6 entities, 2 corpses)");
  });

  it("decodes corpse-only spawn frames with a nearby tile neighbourhood", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.huntEntitySpawnFailed);
    expect(message.body.kind).toBe("hunt_entity_spawn");
    if (message.body.kind !== "hunt_entity_spawn") {
      throw new Error("expected hunt_entity_spawn");
    }

    const expected = expectedWinterCourt.huntEntitySpawnCorpsesOnly;
    expect(message.body.data.entities).toHaveLength(expected.entityCount);
    expect(message.body.data.corpses).toHaveLength(expected.corpseCount);
    expect(message.body.data.corpses.map((c) => ({ monsterId: c.monsterId, corpseId: c.corpseId }))).toEqual(
      expected.corpses
    );
    expect(message.body.data.tiles).toEqual(expected.tiles);
    expect(message.body.data.tileFooter?.flag).toBe(expected.tileFooter.flag);
    expect(message.body.data.tileFooter?.extra).toBe(expected.tileFooter.extra);
    expect(message.body.data.rawTail.length).toBe(0);
    expect(summarizeBinaryMessage(message)).toBe("hunt_spawn(0 entities, 4 corpses, 8 tiles)");
  });

  it("decodes 7-corpse spawn frames with a 7-tile neighbourhood footer", () => {
    const message = decodeBinaryMessage(winterCourtTrafficFixtures.huntEntitySpawnCorpsesAndTiles);
    expect(message.body.kind).toBe("hunt_entity_spawn");
    if (message.body.kind !== "hunt_entity_spawn") {
      throw new Error("expected hunt_entity_spawn");
    }

    const expected = expectedWinterCourt.huntEntitySpawnCorpsesAndTiles;
    expect(message.body.data.entities).toHaveLength(expected.entityCount);
    expect(message.body.data.corpses).toHaveLength(expected.corpseCount);
    expect(
      message.body.data.corpses.map((c) => ({
        monsterId: c.monsterId,
        corpseId: c.corpseId,
        dx: c.dx,
        dy: c.dy,
      }))
    ).toEqual(expected.corpses);
    expect(message.body.data.tiles).toEqual(expected.tiles);
    expect(message.body.data.tileFooter?.flag).toBe(expected.tileFooter.flag);
    expect(message.body.data.tileFooter?.extra).toBe(expected.tileFooter.extra);
    expect(message.body.data.rawTail.length).toBe(0);
    expect(summarizeBinaryMessage(message)).toBe("hunt_spawn(0 entities, 7 corpses, 7 tiles)");
  });
});
