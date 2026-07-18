import { describe, expect, it } from "vitest";
import { binaryFixtures } from "../../binary/fixtures/session-traffic";
import { binaryMarketSnapshotBrowse } from "../../binary/fixtures/market-traffic";
import { encodeBytesToBase64 } from "../../binary/reader";
import { STONEGY_BINARY_VERSION, StonegyBinaryMessageType } from "../../binary/types";
import {
  clearActiveFlow,
  clearDebugTelemetry,
  clearFlowTraces,
  countForDirection,
  emptyDebugTelemetry,
  lastByTypeKey,
  recordDebugCommand,
  recordDebugWireMessage,
  recordFlowTrace,
  sanitizeDebugTelemetry,
  upsertActiveFlow,
} from "./debug-telemetry";
import {
  isKnownMessageType,
  validateMessagePayload,
} from "./schemas";

describe("message payload schemas", () => {
  it("derives known send types from the schema registry", () => {
    expect(isKnownMessageType("party_get_snapshot", "send")).toBe(true);
    expect(isKnownMessageType("totally_unknown_event", "send")).toBe(false);
  });

  it("derives known receive types from the schema registry", () => {
    expect(isKnownMessageType("update_levelinfo", "receive")).toBe(true);
    expect(isKnownMessageType("update_levelinfo", "send")).toBe(false);
    expect(isKnownMessageType("equipment:patch", "receive")).toBe(true);
  });

  it("accepts bless_buy, death_modal_ack, bless:action_result, and player_death", () => {
    expect(isKnownMessageType("bless_buy", "send")).toBe(true);
    expect(isKnownMessageType("death_modal_ack", "send")).toBe(true);
    expect(isKnownMessageType("bless:action_result", "receive")).toBe(true);
    expect(isKnownMessageType("player_death", "receive")).toBe(true);

    expect(validateMessagePayload("bless_buy", "send", { blessingId: 8 }).status).toBe("valid");
    expect(validateMessagePayload("death_modal_ack", "send", {}).status).toBe("valid");
    expect(
      validateMessagePayload("bless:action_result", "receive", {
        action: "buy",
        success: true,
        message: "Blood of the Mountain adquirida.",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("player_death", "receive", {
        expLost: 4652655,
        levelBefore: 196,
        levelAfter: 194,
        itemsDeathLost: [],
        blessingsBeforeDeathCount: 0,
        hadAolEquipped: false,
        aolConsumed: false,
        mode: "hunt",
        deathAt: "2026-07-15T00:15:27.985Z",
        killedByMonsterId: 215,
      }).status
    ).toBe("valid");
  });

  it("allows market_create_order without tier and quest_claim_reward string choice ids", () => {
    expect(
      validateMessagePayload("market_create_order", "send", {
        itemId: 883,
        eachPrice: 2499,
        itemAmount: 45,
        isBuyOrder: false,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("quest_claim_reward", "send", {
        questId: 12,
        missionId: 1,
        selectedChoiceId: "justice-seeker",
      }).status
    ).toBe("valid");
  });

  it("validates equipment patch payloads", () => {
    const result = validateMessagePayload(
      "equipment:patch",
      "receive",
      {
        slots: {
          HAND: {
            extraAttributes: ["imbuement_slot_1=basic_void|7728485"],
          },
        },
      }
    );

    expect(result.status).toBe("valid");
  });

  it("accepts null equipment slots when unequipped", () => {
    const result = validateMessagePayload("equipment:patch", "receive", {
      slots: { NECK: null },
      totalBonusFromEquips: { arm: 32, atk: 46 },
    });

    expect(result.status).toBe("valid");
  });

  it("accepts party action_result cooldownRemainingMs", () => {
    const result = validateMessagePayload("party:action_result", "receive", {
      action: "change_position",
      success: false,
      message: "Aguarde 60s para trocar de posição novamente.",
      cooldownRemainingMs: 59790,
    });

    expect(result.status).toBe("valid");
  });

  it("flags extra fields on strict payloads", () => {
    const result = validateMessagePayload("ping", "send", { t: 1, surprise: true });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.issues.some((issue) => issue.keys?.includes("surprise"))).toBe(true);
    }
  });

  it("accepts passthrough fields on loose payloads", () => {
    const result = validateMessagePayload("session_bootstrap", "receive", { newField: 1 });
    expect(result.status).toBe("valid");
  });

  it("accepts update_levelinfo fields from live traffic", () => {
    const result = validateMessagePayload("update_levelinfo", "receive", {
      level: 155,
      xp: 60672381,
      goldCoins: 210781,
      infos: {
        level: 155,
        expToNextLevel: 1178200,
        remainingExpToNextLevel: 211619,
        percentageToNextLevel: 82.04,
      },
      xpGainrate: 120,
      xpRateBreakdown: {
        baseRate: 100,
        premiumRateAdd: 20,
        xpBoostRateAdd: 0,
        totalRate: 120,
        xpBoostRemainingMs: 0,
      },
      xpBoostRemainingMs: 0,
      skills: {
        magic: 68,
        magicPercent: 3.78489288,
        fist: 10,
        fistPercent: 0,
        shielding: 25,
        shieldingPercent: 37.38172917,
        axe: 10,
        axePercent: 0,
        club: 10,
        clubPercent: 0,
        sword: 10,
        swordPercent: 0,
        distance: 10,
        distancePercent: 10,
      },
    });

    expect(result.status).toBe("valid");
  });

  it("accepts house:snapshot with null characterHouse", () => {
    const result = validateMessagePayload("house:snapshot", "receive", {
      characterHouse: null,
      unlockedHouses: [],
      goldCoins: 210781,
    });
    expect(result.status).toBe("valid");
  });

  it("accepts party:snapshot with string currentHuntId", () => {
    const result = validateMessagePayload("party:snapshot", "receive", {
      meId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      party: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        leaderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        members: [],
        maxMembers: 20,
        status: "hunting",
        currentHuntId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        lootSplitter: null,
        readyCheck: null,
      },
      receivedInvites: [],
    });
    expect(result.status).toBe("valid");
  });

  it("accepts party:snapshot readyCheck metadata from live traffic", () => {
    const result = validateMessagePayload("party:snapshot", "receive", {
      meId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      party: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        leaderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        members: [],
        maxMembers: 20,
        status: "idle",
        currentHuntId: null,
        lootSplitter: null,
        readyCheck: {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          mode: "hunt",
          startedAt: "2026-07-09T14:46:21.698Z",
          expiresAt: "2026-07-09T14:46:51.698Z",
          initiatedBy: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          memberStatuses: {
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": "confirmed",
          },
        },
      },
      receivedInvites: [],
    });
    expect(result.status).toBe("valid");
  });

  it("accepts coin_market:snapshot pagination objects from live traffic", () => {
    const result = validateMessagePayload("coin_market:snapshot", "receive", {
      worldId: 1,
      buyOrders: [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          worldId: 1,
          side: "BUY",
          amount: 20,
          remainingAmount: 20,
          unitGoldPrice: 11700,
          totalGold: 234000,
          createdAt: "2026-07-09T14:06:29.689Z",
          isOwn: false,
          isOwnCharacter: false,
        },
      ],
      sellOrders: [],
      myOrders: [],
      buyPage: { page: 1, pageSize: 6, totalOrders: 91, totalPages: 16 },
      sellPage: { page: 1, pageSize: 6, totalOrders: 15, totalPages: 3 },
      myPage: { page: 1, pageSize: 6, totalOrders: 0, totalPages: 1 },
      limits: {
        maxOrderAmount: 100000,
        maxUnitGoldPrice: 1000000000,
        maxTotalGold: 1000000000,
      },
    });

    expect(result.status).toBe("valid");
  });

  it("accepts ranking:snapshot from live traffic", () => {
    const result = validateMessagePayload("ranking:snapshot", "receive", {
      requestId: "ranking-1783606297237-1t5vgn",
      ranking: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          top: 1,
          totalExp: 403462320,
          level: 291,
          name: "RankedOne",
          vocation: "PALADIN",
        },
      ],
      nextUpdate: { hours: 1, minutes: 49 },
    });

    expect(result.status).toBe("valid");
  });

  it("accepts get_tasks, ranking_get_snapshot, and wheel_of_destiny_get_snapshot send types", () => {
    expect(validateMessagePayload("get_tasks", "send", {}).status).toBe("valid");
    expect(
      validateMessagePayload("ranking_get_snapshot", "send", {
        requestId: "ranking-1783606297237-1t5vgn",
        searchText: "",
      }).status
    ).toBe("valid");
    expect(validateMessagePayload("wheel_of_destiny_get_snapshot", "send", {}).status).toBe(
      "valid"
    );
  });

  it("accepts outfit and auto-finish hunt send types from live traffic", () => {
    expect(
      validateMessagePayload("outfit_save", "send", {
        headColor: { b: 63, g: 106, r: 191 },
        bodyColor: { b: 95, g: 159, r: 191 },
        armColor: { b: 0, g: 127, r: 127 },
        characterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        legColor: { r: 72, g: 72, b: 68 },
        outfitSelected: 128,
        isMale: false,
        mountId: null,
        displayAddon1: false,
        displayAddon2: false,
        avatarId: 1,
        requestId: "outfit_save_1783607429179_nlgqx7j",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("set_auto_finish_hunt_by_capacity", "send", { enabled: true }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("set_auto_finish_hunt_by_gold", "send", { enabled: true }).status
    ).toBe("valid");
  });

  it("accepts outfit receive types from live traffic", () => {
    expect(
      validateMessagePayload("outfit:action_result", "receive", {
        action: "save",
        success: true,
        message: "success",
        requestId: "outfit_save_1783607429179_nlgqx7j",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("outfit:snapshot", "receive", {
        outfits: [{ id: 128, name: "Citizen", isFree: true, hasAddon1: true, hasAddon2: true }],
        unlockedOutfits: [],
        mounts: [{ id: 728, name: "Batcat", isFree: false, isStore: true }],
        unlockedMount: [],
        requestId: "outfit_save_1783607429179_nlgqx7j",
      }).status
    ).toBe("valid");
  });

  it("accepts update_battle_config fields from live traffic", () => {
    const result = validateMessagePayload("update_battle_config", "receive", {
      selectedHeal: "Light Healing",
      selectedHealPercent: 90,
      selectedHealSecondary: "Intense Healing",
      selectedHealPercentSecondary: 80,
      selectedHealTertiary: "Heal Friend",
      selectedHealPercentTertiary: 70,
      selectedHealQuaternary: "",
      selectedHealPercentQuaternary: 80,
      selectedManaPotion: "Ultimate Mana Potion",
      selectedManaPotionPercent: 60,
      selectedArrow: null,
      selectedSkills: ["Wrath of Nature"],
      selectedSkillsMinCreatures: { "Wrath of Nature": 5 },
      selectedSupportSkill: null,
      selectedSupportSkills: [null, "Magic Shield"],
      autoEquip: {
        ring: {
          enabled: true,
          emergencyItemId: 705,
          defaultItemId: 239,
          equipLifePercentLte: 99,
          restoreLifePercentGte: 100,
        },
        neck: {
          enabled: false,
          emergencyItemId: null,
          defaultItemId: null,
          equipLifePercentLte: 50,
          restoreLifePercentGte: 80,
        },
      },
      autoFinishHuntByGold: true,
      autoFinishHuntByCapacity: true,
      quickSellDeselectedItemIds: [],
      homeMapPreference: "default",
      lootFilterExcludedItemIds: [2, 4],
      homeTutorialRewards: { freeExerciseWeaponClaimed: true },
      guideTutorialProgress: {
        home_level_2: { status: "completed", step: null, updatedAt: 1782993991629 },
      },
      initialOnboardingChoice: { choice: "tutorial", decidedAt: 1782993624149 },
    });
    expect(result.status).toBe("valid");
  });

  it("accepts coin market resolve and action result messages from live traffic", () => {
    expect(
      validateMessagePayload("coin_market_resolve_order", "send", {
        orderId: "22222222-2222-4222-8222-222222222222",
        amount: 23,
        buyPage: 1,
        sellPage: 1,
        myPage: 1,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("coin_market:action_result", "receive", {
        action: "resolve_order",
        success: true,
        message: "Venda de coins concluida com sucesso.",
      }).status
    ).toBe("valid");
  });

  it("accepts npc item shop send and receive types from live traffic", () => {
    expect(
      validateMessagePayload("npc_buy_item", "send", {
        itemId: 5,
        quantity: 1,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("npc:item_shop_purchase_result", "receive", {
        success: true,
        message: "Compra realizada.",
        itemId: 5,
        quantity: 1,
        price: 30,
        totalPrice: 30,
      }).status
    ).toBe("valid");
  });

  it("accepts appearance shop, depot, and house messages from live traffic", () => {
    expect(
      validateMessagePayload("appearance_shop_buy", "send", {
        shopId: "city-stylist",
        offerId: "citizen-addon-1",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("appearance_shop:purchase_result", "receive", {
        shopId: "city-stylist",
        offerId: "citizen-addon-1",
        success: true,
        message: "Compra realizada.",
        rewardType: "addon1",
        outfitId: 128,
        goldCost: 0,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("character:patch", "receive", {
        unlockedAddons1: [128],
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("depot_move_item", "send", {
        inventoryId: "33333333-3333-4333-8333-333333333333",
        toDepot: true,
        depotBoxIndex: 0,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("depot:patch", "receive", {
        boxIndex: 0,
        upserts: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            characterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            itemId: 704,
            amount: 1,
            equipedSlot: null,
            createdAt: "2026-07-09T12:20:37.149Z",
            isUnique: false,
            charges: null,
            rarity: null,
            extraAttributes: [],
            tier: 0,
          },
        ],
        depotCount: 12,
        depotLimit: 1000,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("house_public_snapshot", "send", {
        houseId: 12,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("house:public_snapshot", "receive", {
        houseId: 12,
        publicHouse: null,
        top: [],
      }).status
    ).toBe("valid");
  });

  it("accepts quick_sell_items with deselectedItemIds from live traffic", () => {
    expect(
      validateMessagePayload("quick_sell_items", "send", {
        itemIds: [5],
        deselectedItemIds: [1244, 704, 276, 130],
      }).status
    ).toBe("valid");
  });

  it("accepts daily boss send and boss rotation receive types from live traffic", () => {
    expect(
      validateMessagePayload("add_daily_boss", "send", {
        bossId: 34,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("start_boss_fight", "send", {
        bossId: 20,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("boss_rotation:update", "receive", {
        availableBosses: [38, 16, 20, 6, 34],
        killedBosses: [12, 35, 16, 6],
        bosses: [
          {
            id: 38,
            monsterId: 274,
            rarity: 100,
            bossType: "Bane",
            recommendedLevel: 200,
            monster: { id: 274, name: "Latrivan", hp: 25000 },
          },
        ],
        nextRotations: { hours: 16, minutes: 44 },
        resetAt: "2026-07-10T08:00:00.000Z",
        serverTime: "2026-07-09T15:15:35.622Z",
      }).status
    ).toBe("valid");
  });

  it("accepts bosstiary and hunt phase update receive types from live traffic", () => {
    expect(
      validateMessagePayload("bosstiary:update", "receive", {
        bossId: 22,
        killCount: 2,
        bossPoints: 0,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("hunt:phase_update", "receive", {
        mode: "boss",
        phase: "victory_outro",
        phaseStartedAt: 1784134744256,
        phaseEndsAt: 1784134746256,
      }).status
    ).toBe("valid");
  });

  it("accepts weapon mastery select-perk send and action-result receive types", () => {
    expect(
      validateMessagePayload("weapon_mastery_select_perk", "send", {
        weaponKey: "weapon_27",
        tier: 3,
        perkId: "weapon_27:3:composite_hornbow_3_type_auto_atk_critical_chance_1",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("weapon_mastery:action_result", "receive", {
        action: "select_perk",
        success: true,
        message: "Perk selecionada com sucesso.",
      }).status
    ).toBe("valid");
  });

  it("accepts forge, loot filter, ready-check cancel, and trade protocol types", () => {
    expect(validateMessagePayload("forge_history", "send", { page: 0 }).status).toBe("valid");
    expect(
      validateMessagePayload("hunt_set_loot_filter", "send", {
        excludedItemIds: [49, 54, 169],
      }).status
    ).toBe("valid");
    expect(validateMessagePayload("party_ready_check_cancel", "send", {}).status).toBe("valid");
    expect(
      validateMessagePayload("trade_invite", "send", {
        targetCharacterId: "44444444-4444-4444-8444-444444444444",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("trade_respond_invite", "send", {
        inviteId: "55555555-5555-4555-8555-555555555555",
        accept: true,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("trade_set_offer", "send", {
        tradeId: "66666666-6666-4666-8666-666666666666",
        goldCoins: 0,
        items: [{ inventoryId: "77777777-7777-4777-8777-777777777777", amount: 1 }],
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("trade_set_confirm", "send", {
        tradeId: "66666666-6666-4666-8666-666666666666",
        confirmed: true,
        expectedOfferVersion: 1,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("weapon_mastery_reset_perks", "send", {
        weaponKey: "weapon_884",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("trade:action_result", "receive", {
        action: "completed",
        success: true,
        message: "Trade concluído com sucesso.",
      }).status
    ).toBe("valid");
  });

  it("accepts select_* preset requests from live traffic", () => {
    expect(
      validateMessagePayload("select_arrow", "send", {
        selectedArrow: "Diamond Arrow",
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("select_heal", "send", {
        selectedHeal: "Light Healing",
        selectedHealPercent: 90,
        healIdx: 4,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("select_mana_potion", "send", {
        selectedManaPotionPercent: 75,
      }).status
    ).toBe("valid");
    expect(
      validateMessagePayload("select_skills", "send", {
        selectedSkills: [
          "Divine Caldera",
          "Great Fireball Rune",
          "Strong Ethereal Spear",
          "Ethereal Spear",
        ],
        selectedSupportSkill: null,
        selectedSupportSkills: [null, null],
        selectedSkillsMinCreatures: {
          "Divine Caldera": 2,
          "Great Fireball Rune": 2,
          "Strong Ethereal Spear": -1,
          "Ethereal Spear": -1,
        },
      }).status
    ).toBe("valid");
  });
});

describe("debug-telemetry", () => {
  it("records json events with timestamps and last-by-type", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "send",
        opcode: 1,
        data: JSON.stringify({ type: "ping", data: { t: 123 } }),
      },
      snapshot
    );

    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.at).toEqual(expect.any(Number));
    expect(snapshot.events[0]?.eventKey).toBe("ping");
    expect(snapshot.lastByType[lastByTypeKey("ping", "send")]?.summary).toBe("ping");
    expect(snapshot.countsByType.ping).toEqual({ send: 1, receive: 0 });
  });

  it("tracks separate last events and counts per direction", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "send",
        opcode: 1,
        data: JSON.stringify({ type: "ping", data: { t: 1 } }),
      },
      snapshot
    );
    recordDebugWireMessage(
      {
        direction: "send",
        opcode: 1,
        data: JSON.stringify({ type: "ping", data: { t: 2 } }),
      },
      snapshot
    );
    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 1,
        data: JSON.stringify({ type: "pong", data: { t: 2 } }),
      },
      snapshot
    );

    expect(countForDirection(snapshot.countsByType, "ping", "send")).toBe(2);
    expect(countForDirection(snapshot.countsByType, "pong", "receive")).toBe(1);
    expect(snapshot.lastByType[lastByTypeKey("ping", "send")]?.parsed).toBeTruthy();
    expect(snapshot.lastByType[lastByTypeKey("pong", "receive")]?.eventKey).toBe("pong");
  });

  it("records unknown json parse failures", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      { direction: "receive", opcode: 1, data: "not-json" },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(1);
    expect(snapshot.unknownEvents[0]?.parseFailed).toBe(true);
  });

  it("records unknown message types", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 1,
        data: JSON.stringify({ type: "server_surprise", data: { foo: 1 } }),
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(1);
    expect(snapshot.unknownEvents[0]?.unknownType).toBe(true);
  });

  it("keeps distinct unknown types when one type floods the buffer", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "send",
        opcode: 1,
        data: JSON.stringify({ type: "server_surprise_client", data: { page: 0 } }),
      },
      snapshot
    );

    for (let i = 0; i < 150; i += 1) {
      recordDebugWireMessage(
        {
          direction: "receive",
          opcode: 1,
          data: JSON.stringify({ type: "server_surprise", data: { n: i } }),
        },
        snapshot
      );
    }

    expect(
      snapshot.lastByType[lastByTypeKey("server_surprise_client", "send")]?.unknownType
    ).toBe(true);
    expect(
      snapshot.unknownEvents.some(
        (event) => event.eventKey === "server_surprise_client" && event.direction === "send"
      )
    ).toBe(true);
    expect(
      snapshot.unknownEvents.filter((event) => event.eventKey === "server_surprise")
    ).toHaveLength(1);
  });

  it("does not flag equipment patch as unknown", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 1,
        data: JSON.stringify({
          type: "equipment:patch",
          data: {
            slots: {
              HAND: {
                extraAttributes: ["imbuement_slot_1=basic_void|7728485"],
              },
            },
          },
        }),
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.events[0]?.eventKey).toBe("equipment:patch");
    expect(snapshot.events[0]?.unknownType).toBeUndefined();
  });

  it("records type-0x09 vital updates without decode failures", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: "U0cFCQEBAQQGAAA=",
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.events[0]?.eventKey).toBe("binary:vitals");
    expect(snapshot.events[0]?.parseFailed).toBeUndefined();
    expect(snapshot.events[0]?.summary).toBe("vitals(1 records 1:{bit0=1540})");
  });

  it("keeps nested vitals field values when serializing parsed events", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: "U0cFCQMCBG4MAAABBMcDAAADBIMPAAA=",
      },
      snapshot
    );

    const parsed = snapshot.events[0]?.parsed as {
      body: { data: { records: unknown[] } };
    };

    expect(parsed.body.data.records).toEqual([
      { entityIndex: 2, fieldMask: 4, fields: [{ bit: 2, value: 3182 }] },
      { entityIndex: 1, fieldMask: 4, fields: [{ bit: 2, value: 967 }] },
      { entityIndex: 3, fieldMask: 4, fields: [{ bit: 2, value: 3971 }] },
    ]);
  });

  it("records compact type-0x0c counter triplets without decode failures", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: "U0cFDH0AAABLAgAAiwEAAA==",
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.events[0]?.eventKey).toBe("binary:counter_triplet");
    expect(snapshot.events[0]?.parseFailed).toBeUndefined();
  });

  it("records equipment-heavy auto attacks without decode failures", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: "U0cFGQULAEF1dG8tQXR0YWNrGgAvaW52ZW50b3J5L0dub21lX1N3b3JkLmdpZhMAVHJ1ZSBEYXduZmlyZSBBc3VyYRoAL2ludmVudG9yeS9TcGlrZV9Td29yZC5naWYiAC9pbnZlbnRvcnkvRHJlYW1fQmxvc3NvbV9TdGFmZi5naWYFAPgPCA0AAQCNAi8EAQIAAQL4DwRXAAEAjQIvBAECAAEC+A8IAwABAI0CLAQDAgADAvgPBEMAAQCNAukDBAIABAIABAhyAQAAAQ==",
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.events[0]?.eventKey).toBe("binary:auto_attack");
    expect(snapshot.events[0]?.parseFailed).toBeUndefined();
  });

  it("records type-0x12 support ability casts without decode failures", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: "U0cFEgEBAQALAFVUSVRPX1RFTVBPCwBVdGl0byBUZW1wbw4AQmxvb2RfUmFnZS5naWahHQAAAAAAAQHgLgAADAAAAAcAAAANAAAAIAAAACwBAACmAAAA",
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.events[0]?.eventKey).toBe("binary:support_ability_cast");
    expect(snapshot.events[0]?.parseFailed).toBeUndefined();
    expect(snapshot.events[0]?.trailingBytes).toBeUndefined();
  });

  it("does not flag outfit messages as unknown", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "send",
        opcode: 1,
        data: JSON.stringify({
          type: "outfit_save",
          data: {
            headColor: { b: 63, g: 106, r: 191 },
            bodyColor: { b: 95, g: 159, r: 191 },
            armColor: { b: 0, g: 127, r: 127 },
            characterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            legColor: { r: 72, g: 72, b: 68 },
            outfitSelected: 128,
            isMale: false,
            mountId: null,
            displayAddon1: false,
            displayAddon2: false,
            avatarId: 1,
            requestId: "outfit_save_1783607429179_nlgqx7j",
          },
        }),
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.events[0]?.eventKey).toBe("outfit_save");
    expect(snapshot.events[0]?.unknownType).toBeUndefined();
  });

  it("records schema mismatches for strict payloads", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 1,
        data: JSON.stringify({
          type: "training_finished",
          data: { success: true, bonusXp: 50 },
        }),
      },
      snapshot
    );

    expect(snapshot.schemaMismatchEvents).toHaveLength(1);
    expect(snapshot.schemaMismatchEvents[0]?.extraFields).toEqual(["bonusXp"]);
    expect(snapshot.schemaMismatchEvents[0]?.schemaIssues?.length).toBeGreaterThan(0);
  });

  it("flags undersized hunt analyzer frames as decode failures", () => {
    const snapshot = emptyDebugTelemetry();
    const huntAnalyzerFrame = encodeBytesToBase64(
      new Uint8Array([0x53, 0x47, STONEGY_BINARY_VERSION, StonegyBinaryMessageType.HuntAnalyzerSnapshot, 1, 2, 3])
    );

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: huntAnalyzerFrame,
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(1);
    expect(snapshot.events[0]?.eventKey).toBe("binary:unknown");
    expect(snapshot.events[0]?.unknownType).toBe(true);
    expect(snapshot.events[0]?.binaryType).toBe(StonegyBinaryMessageType.HuntAnalyzerSnapshot);
  });

  it("stores full wire payloads while keeping previews truncated", () => {
    const snapshot = emptyDebugTelemetry();
    const payload = `${binaryFixtures.ping}${"A".repeat(200)}`;

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: payload,
      },
      snapshot
    );

    expect(snapshot.events[0]?.wireData).toBe(payload);
    expect(snapshot.events[0]?.preview?.endsWith("…")).toBe(true);
    expect(snapshot.events[0]?.preview?.length).toBeLessThan(payload.length);
  });

  it("records parsed binary events", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: binaryFixtures.ping,
      },
      snapshot
    );

    expect(snapshot.events[0]?.opcode).toBe(2);
    expect(snapshot.events[0]?.binaryType).toBe(0x11);
    expect(snapshot.events[0]?.summary).toBe("ping");
    expect(snapshot.events[0]?.parsed).toBeTruthy();
    expect(snapshot.lastByType[lastByTypeKey("binary:ping", "receive")]).toBeTruthy();
  });

  it("records market binary snapshots", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "receive",
        opcode: 2,
        data: binaryMarketSnapshotBrowse,
      },
      snapshot
    );

    expect(snapshot.events[0]?.summary).toContain("market(");
    expect(snapshot.events[0]?.parsed).toBeTruthy();
  });

  it("records client area selection without decode failures", () => {
    const snapshot = emptyDebugTelemetry();

    recordDebugWireMessage(
      {
        direction: "send",
        opcode: 2,
        data: binaryFixtures.clientAreaSelectStonegyHome,
      },
      snapshot
    );

    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.events[0]?.eventKey).toBe("binary:client_area");
    expect(snapshot.events[0]?.parseFailed).toBeUndefined();
  });

  it("clears debug telemetry", () => {
    const snapshot = emptyDebugTelemetry();
    recordDebugWireMessage(
      {
        direction: "send",
        opcode: 1,
        data: JSON.stringify({ type: "ping", data: { t: 1 } }),
      },
      snapshot
    );

    clearDebugTelemetry(snapshot);
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.lastByType).toEqual({});
    expect(snapshot.countsByType).toEqual({});
    expect(snapshot.unknownEvents).toHaveLength(0);
    expect(snapshot.schemaMismatchEvents).toHaveLength(0);
    expect(snapshot.lastCommands).toHaveLength(0);
    expect(snapshot.flowTraces).toHaveLength(0);
    expect(snapshot.activeFlows).toHaveLength(0);
  });

  it("records last commands with sent and response payloads", () => {
    const snapshot = emptyDebugTelemetry();
    recordDebugCommand(snapshot, {
      at: 10,
      finishedAt: 40,
      commandId: "party_get_snapshot",
      expectedResponseType: "party:snapshot",
      sent: { type: "party_get_snapshot", data: {} },
      response: { type: "party:snapshot", data: { meId: "1" } },
      status: "ok",
      success: true,
      attempt: 1,
    });
    recordDebugCommand(snapshot, {
      at: 50,
      finishedAt: 250,
      commandId: "quest_get_snapshot",
      expectedResponseType: "tasks_snapshot",
      sent: { type: "quest_get_snapshot", data: {} },
      status: "timeout",
      success: false,
      errorMessage: "Timed out waiting for tasks_snapshot (quest_get_snapshot)",
      attempt: 1,
    });

    expect(snapshot.lastCommands).toHaveLength(2);
    expect(snapshot.lastCommands[0]?.commandId).toBe("quest_get_snapshot");
    expect(snapshot.lastCommands[0]?.status).toBe("timeout");
    expect(snapshot.lastCommands[0]?.response).toBeUndefined();
    expect(snapshot.lastCommands[1]?.sent).toEqual({
      type: "party_get_snapshot",
      data: {},
    });
    expect(snapshot.lastCommands[1]?.response).toEqual({
      type: "party:snapshot",
      data: { meId: "1" },
    });

    clearDebugTelemetry(snapshot);
    expect(snapshot.lastCommands).toHaveLength(0);
  });

  it("records and clears flow traces", () => {
    const snapshot = emptyDebugTelemetry();
    recordFlowTrace(snapshot, {
      id: "flow-1",
      serviceId: "loot",
      flow: "hunt_loot_sell",
      startedAt: 1,
      finishedAt: 2,
      guards: [{ name: "pending", passed: true }],
      commands: [],
      outcome: "ok",
    });
    expect(snapshot.flowTraces).toHaveLength(1);
    expect(snapshot.flowTraces[0]?.id).toBe("flow-1");

    clearFlowTraces(snapshot);
    expect(snapshot.flowTraces).toHaveLength(0);
    expect(snapshot.activeFlows).toHaveLength(0);
  });

  it("tracks active flows until they finish", () => {
    const snapshot = emptyDebugTelemetry();

    upsertActiveFlow(snapshot, {
      id: "active-1",
      serviceId: "loot",
      flow: "sell-loot",
      startedAt: 1,
      phase: "syncing_prices",
      guards: [],
      commands: [],
    });
    expect(snapshot.activeFlows).toHaveLength(1);

    recordFlowTrace(snapshot, {
      id: "active-1",
      serviceId: "loot",
      flow: "sell-loot",
      startedAt: 1,
      finishedAt: 2,
      phase: "selling",
      guards: [],
      commands: [],
      outcome: "ok",
    });
    expect(snapshot.activeFlows).toHaveLength(0);
    expect(snapshot.flowTraces[0]?.id).toBe("active-1");

    clearActiveFlow(snapshot, "missing");
  });

  it("sanitizes cyclic flow-trace results so BotState can JSON.stringify", () => {
    const snapshot = emptyDebugTelemetry();
    const cyclicTrace = {
      id: "flow-cycle",
      serviceId: "hunt",
      flow: "enable-auto-hunt",
      startedAt: 1,
      finishedAt: 2,
      guards: [] as [],
      commands: [] as [],
      outcome: "ok" as const,
      result: { ok: true, state: { debug: snapshot, settings: { autoHuntEnabled: true } } },
    };
    // Pre-fix shape: result.state.debug points at the live telemetry that holds this trace.
    snapshot.flowTraces = [cyclicTrace];

    expect(() => JSON.stringify(snapshot)).toThrow(/circular|cyclic/i);

    sanitizeDebugTelemetry(snapshot);

    expect(() => JSON.stringify(snapshot)).not.toThrow();
    const stored = snapshot.flowTraces[0]?.result as Record<string, unknown>;
    expect(stored?.ok).toBe(true);
    const serialized = JSON.stringify(stored);
    expect(serialized).toContain("[circular]");
    expect(serialized).toContain('"ok":true');
  });

  it("clones flow-trace results on record so embedding botState cannot create a cycle", () => {
    const snapshot = emptyDebugTelemetry();
    const state = {
      debug: snapshot,
      settings: { autoHuntEnabled: true },
    };

    recordFlowTrace(snapshot, {
      id: "flow-safe",
      serviceId: "hunt",
      flow: "enable-auto-hunt",
      startedAt: 1,
      finishedAt: 2,
      guards: [],
      commands: [],
      outcome: "ok",
      result: { ok: true, state },
    });

    expect(() => JSON.stringify(snapshot)).not.toThrow();
    // Stored result must not keep a live reference to telemetry.
    expect(
      (snapshot.flowTraces[0]?.result as { state?: { debug?: unknown } })?.state?.debug
    ).not.toBe(snapshot);
  });
});
