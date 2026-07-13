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
  expectedCombatDamage52,
  expectedCompactCombatDamage0,
  expectedHuntEntityUuidList,
  expectedHuntLootDrops,
  expectedHuntLootStarterItemGrant,
  expectedHuntAnalyzerSnapshotCompact,
  expectedPlayerVitals,
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

    expect(reader.uuid()).toBe("019f3d13-fc21-722a-9070-22028dfdf2b7");
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
    expect(data.items[0]?.uuid).toBe("019f3d13-fc21-722a-9070-22028dfdf2b7");
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

    expect(message.body.data.text).toBe("exevh mas san");
    expect(message.body.data.channel).toBe(1);
  });

  it("decodes spell cast frames with embedded strings", () => {
    const message = decodeBinaryMessage(binaryFixtures.spellDivineCaldera);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.SpellCast);
    expect(message.body.kind).toBe("spell_cast");
    if (message.body.kind !== "spell_cast") {
      throw new Error("expected spell cast body");
    }

    expect(message.body.data.strings).toEqual(["Divine Caldera", "Carniphila"]);
    expect(message.body.data.header.effectId).toBe(271);
    expect(message.body.data.effects).toHaveLength(5);
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
    expect(message.body.data.targetCount).toBe(2);
    expect(message.body.data.targets).toHaveLength(2);
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
    expect(message.body.data.targetCount).toBe(2);
    expect(message.body.data.targets).toHaveLength(2);
  });

  it("decodes type-0x12 support ability casts without decode failures", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastSupportUtitoTempo);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AbilityCast);
    expect(message.body.kind).toBe("support_ability_cast");
    if (message.body.kind !== "support_ability_cast") {
      throw new Error("expected support_ability_cast body");
    }

    expect(message.body.data.strings).toEqual(expectedSupportAbilityCastUtitoTempo.strings);
    expect(message.body.data.effectTail).toEqual(expectedSupportAbilityCastUtitoTempo.effectTail);
    expect(message.body.data.rawTail.length).toBe(0);
    expect(summarizeBinaryMessage(message)).toBe(
      "support_ability(UTITO_TEMPO / Utito Tempo / Blood_Rage.gif)"
    );
  });

  it("decodes equipment-heavy auto attacks without decode failures", () => {
    const message = decodeBinaryMessage(
      "U0cFGQgLAEF1dG8tQXR0YWNrHgAvaW52ZW50b3J5L05pZ2h0bWFyZV9CbGFkZS5naWYVAFNvdWwtQnJva2VuIEhhcmJpbmdlch4AL2ludmVudG9yeS9XYW5kX09mX0luZmVybm8uZ2lmIgAvaW52ZW50b3J5L0RyYWdvbmljX01haWwuZ2lm"
    );

    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual([
      "Auto-Attack",
      "/inventory/Nightmare_Blade.gif",
      "Soul-Broken Harbinger",
      "/inventory/Wand_Of_Inferno.gif",
    ]);
    expect(summarizeBinaryMessage(message)).toContain("Nightmare_Blade.gif");
  });

  it("decodes equipment-heavy auto attacks with a 0x07 string-layout lead byte", () => {
    const message = decodeBinaryMessage(
      "U0cFGQcLAEF1dG8tQXR0YWNrHgAvaW52ZW50b3J5L05pZ2h0bWFyZV9CbGFkZS5naWYVAFNvdWwtQnJva2VuIEhhcmJpbmdlch4AL2ludmVudG9yeS9XYW5kX09mX0luZmVybm8uZ2lmIgAvaW52ZW50b3J5L0RyYWdvbmljX01haWwuZ2lm"
    );

    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual([
      "Auto-Attack",
      "/inventory/Nightmare_Blade.gif",
      "Soul-Broken Harbinger",
      "/inventory/Wand_Of_Inferno.gif",
    ]);
    expect(message.body.data.effects).toHaveLength(2);
  });

  it("decodes Front Sweep casts with eight hybrid-sized targets", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastFrontSweepEightTargets);

    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual(["Front Sweep", "Soul-Broken Harbinger"]);
    expect(message.body.data.targetCount).toBe(8);
    expect(message.body.data.targets).toHaveLength(8);
    expect(message.body.data.effects).toHaveLength(0);
  });

  it("decodes multi-target ability casts without a timestamp", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastFrontSweep);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto attack body");
    }

    expect(message.body.data.strings).toEqual(expectedAbilityCastFrontSweep.strings);
    expect(message.body.data.targetCount).toBe(expectedAbilityCastFrontSweep.targetCount);
    expect(message.body.data.timestamp).toBe(0);
    expect(message.body.data.targets).toEqual(expectedAbilityCastFrontSweep.targets);
    expect((message.body.data as { rawTail?: Uint8Array }).rawTail).toBeUndefined();
    expect(summarizeBinaryMessage(message)).toBe(
      "auto_attack(Front Sweep / Soul-Broken Harbinger)"
    );
  });

  it("decodes batched multi-cast frames with fully decoded target records", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastBatchedMultiCast);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual(expectedAbilityCastBatchedMultiCast.strings);
    expect(message.body.data.targets.length).toBeGreaterThan(0);
    expect(message.body.data.batchLead).toBe(16);
    expect(summarizeBinaryMessage(message)).toBe(
      "auto_attack(Fierce Berserk / Soul-Broken Harbinger / Terra Wave / Great Fire Wave)"
    );
  });

  it("decodes a second batched multi-cast frame with timestamp tail", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.abilityCastBatchedMultiCast2);

    expect(message.body.kind).toBe("auto_attack");
    if (message.body.kind !== "auto_attack") {
      throw new Error("expected auto_attack body");
    }

    expect(message.body.data.strings).toEqual(["Berserk", "Silencer", "Avalanche Rune"]);
    expect(message.body.data.targetCount).toBe(6);
    expect(message.body.data.timestamp).toBeGreaterThan(0);
    expect(summarizeBinaryMessage(message)).toBe(
      "auto_attack(Berserk / Silencer / Avalanche Rune)"
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

  it("decodes market snapshot frames into sell and buy orders", () => {
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
        createdAt: "",
      });
    }

    for (const [index, expected] of expectedBinaryMarketSnapshotBrowse.buyOrders.entries()) {
      expect(data.buyOrders[index]).toMatchObject({
        ...expected,
        tier: 0,
        isBuyOrder: true,
        createdAt: "",
      });
    }

    const protocolData = marketSnapshotBodyToData(data);
    expect(protocolData.sellOrders?.[2]?.itemId).toBe(1346);
    expect(protocolData.sellOrders?.[2]?.eachPrice).toBe(77);
    expect(summarizeBinaryMessage(message)).toBe("market(page 1/463, 7 sells, 2 buys)");
    expect(data.sellOrderAnchors).toHaveLength(7);
    expect(data.buyOrderAnchors).toHaveLength(2);
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

  it("preserves opaque payloads for player update frames", () => {
    const message = decodeBinaryMessage(binaryFixtures.playerUpdate);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.PlayerUpdate);
    expect(message.body.kind).toBe("player_update");
    if (message.body.kind !== "player_update") {
      throw new Error("expected player_update body");
    }

    expect(message.body.data.currentMana).toBe(108);
    expect(message.body.data.raw.length).toBe(61);
  });

  it("decodes entity move frames with move kind", () => {
    const message = decodeBinaryMessage(binaryFixtures.entityMoveLocal);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.EntityMove);
    expect(message.body.kind).toBe("entity_move");
    if (message.body.kind !== "entity_move") {
      throw new Error("expected entity_move body");
    }

    expect(message.body.data).toEqual({
      entityIndex: 1,
      moveKind: 2,
      name: "Local",
      delta: -7,
      reserved: 0,
      state: 4,
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "entity_move(Local, delta=-7, kind=2, state=4)"
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
      entityIndex: 1,
      name: "AllyA",
      delta: -4,
      fieldA: 0,
      fieldB: 0,
      state: 4,
    });
    expect(summarizeBinaryMessage(message)).toBe(
      "entity_position(AllyA, delta=-4, state=4)"
    );
  });

  it("decodes hunt frame variants: ground drops, item grant, and entity uuid list", () => {
    const unsupportedTick = decodeBinaryMessage(huntTrafficFixtures.huntLootAnalyzerTick);
    expect(unsupportedTick.body.kind).toBe("unknown");

    const drops = decodeBinaryMessage(huntTrafficFixtures.huntLootItemDrops);
    expect(drops.body.kind).toBe("ground_loot");
    if (drops.body.kind !== "ground_loot") {
      throw new Error("expected ground_loot body");
    }
    expect(drops.body.data.drops).toEqual(
      expectedHuntLootDrops.map(({ itemId, amount, groundUuid }) => ({
        itemId,
        amount,
        groundUuid,
      }))
    );

    const starterGrant = decodeBinaryMessage(huntTrafficFixtures.huntLootStarterItemGrant);
    expect(starterGrant.body.kind).toBe("item_grant");
    if (starterGrant.body.kind !== "item_grant") {
      throw new Error("expected item_grant body");
    }
    expect(starterGrant.body.data).toMatchObject(expectedHuntLootStarterItemGrant);

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

  it("decodes short combat damage frames separately from auto attack strings", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.combatDamage52);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.AutoAttack);
    expect(message.body.kind).toBe("combat_damage");
    if (message.body.kind !== "combat_damage") {
      throw new Error("expected combat_damage body");
    }
    expect(message.body.data).toEqual(expectedCombatDamage52);
  });

  it("decodes compact type-0x09 combat hits as combat_damage", () => {
    const message = decodeBinaryMessage(huntTrafficFixtures.compactCombatDamage0);

    expect(message.envelope.type).toBe(StonegyBinaryMessageType.VitalDelta);
    expect(message.body.kind).toBe("combat_damage");
    if (message.body.kind !== "combat_damage") {
      throw new Error("expected combat_damage body");
    }
    expect(message.body.data).toEqual(expectedCompactCombatDamage0);
    expect(summarizeBinaryMessage(message)).toBe("damage(0 from 1 to 1)");
  });

  it("decodes session metric and player vitals hunt frames", () => {
    const session = decodeBinaryMessage(huntTrafficFixtures.sessionMetric);
    expect(session.body.kind).toBe("session_metric");
    if (session.body.kind !== "session_metric") {
      throw new Error("expected session_metric body");
    }
    expect(session.body.data.staminaMs).toBe(expectedSessionMetric.staminaMs);

    const player = decodeBinaryMessage(huntTrafficFixtures.playerUpdate);
    expect(player.body.kind).toBe("player_update");
    if (player.body.kind !== "player_update") {
      throw new Error("expected player_update body");
    }
    expect(player.body.data.currentMana).toBe(expectedPlayerVitals.currentMana);
    expect(player.body.data.currentHp).toBe(expectedPlayerVitals.currentHp);
    expect(player.body.data.huntTimeMs).toBe(expectedPlayerVitals.huntTimeMs);
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
      "Partner",
      "Delta",
      "Guild",
      "Member Primary",
    ]);

    expect(message.body.data.partyMembers[0]).toMatchObject({
      name: "Partner",
      lootTotalValue: 1_818_866,
      suppliesGold: 1_227_346,
      profitGold: 591_520,
      balanceGold: 147_880,
    });

    expect(message.body.data.partyMembers[1]).toMatchObject({
      name: "Delta",
      lootTotalValue: 1_452_050,
      suppliesGold: 344_574,
      profitGold: 1_107_476,
    });

    expect(message.body.data.partyLeaderTotals?.name).toBe("Partner");
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
  it("fully decodes inventory, market, spell, and auto-attack payloads without trailing bytes", () => {
    const samples = [
      binaryFixtures.inventorySnapshotDuringHunt,
      binaryMarketSnapshotBrowse,
      binaryFixtures.spellDivineCaldera,
      binaryFixtures.autoAttackElvishBow,
    ];

    for (const sample of samples) {
      const message = decodeBinaryMessage(sample);
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
