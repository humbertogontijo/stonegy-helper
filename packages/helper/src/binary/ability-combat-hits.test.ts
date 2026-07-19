import { describe, expect, it } from "vitest";
import { decodeBinaryMessage } from "./decode";
import {
  ABILITY_MELEE_ACTOR_TAG,
  ABILITY_SPELL_ACTOR_TAG,
  abilityCombatHitsToDealt,
  abilityCombatHitsToTaken,
  isMonsterCombatHit,
  type AbilityCombatHit,
} from "./ability-combat-hits";
import { huntTrafficFixtures } from "./fixtures/hunt-traffic";
import { winterCourtTrafficFixtures } from "./fixtures/winter-court-traffic";

function decodeCombatFrame(fixture: string) {
  const message = decodeBinaryMessage(fixture);
  if (message.body.kind !== "spell_cast" && message.body.kind !== "auto_attack") {
    throw new Error(`expected combat frame, got ${message.body.kind}`);
  }
  return message.body;
}

describe("spell_cast combat records", () => {
  it("parses 0x1f melee actors with ability + weapon string references", () => {
    const body = decodeCombatFrame(huntTrafficFixtures.spellCastAutoAttackHits);
    if (body.kind !== "spell_cast") throw new Error("expected spell_cast");

    expect(body.data.actors).toEqual([
      {
        tag: ABILITY_MELEE_ACTOR_TAG,
        runtimePlayerId: 2,
        abilityIndex: 0,
        abilityName: "Auto-Attack",
        weaponIndex: 1,
        weaponName: "/inventory/Mycological_Bow.gif",
      },
      {
        tag: ABILITY_MELEE_ACTOR_TAG,
        runtimePlayerId: 3,
        abilityIndex: 0,
        abilityName: "Auto-Attack",
        weaponIndex: 4,
        weaponName: "/inventory/Spike_Sword.gif",
      },
      {
        tag: ABILITY_MELEE_ACTOR_TAG,
        runtimePlayerId: 4,
        abilityIndex: 0,
        abilityName: "Auto-Attack",
        weaponIndex: 5,
        weaponName: "/inventory/Dream_Blossom_Staff.gif",
      },
    ]);
  });

  it("attributes monster hits through the actor index byte", () => {
    const body = decodeCombatFrame(huntTrafficFixtures.spellCastAutoAttackHits);
    if (body.kind !== "spell_cast") throw new Error("expected spell_cast");

    const monsterHits = body.data.combatHits.filter(isMonsterCombatHit);
    expect(monsterHits).toHaveLength(6);
    // Bow user (id 2) lands four physical arrows; sword (3) and staff (4) one each.
    const byAttacker = monsterHits.reduce<Record<number, number>>((acc, hit) => {
      const key = hit.attackerRuntimePlayerId ?? 0;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    expect(byAttacker).toEqual({ 2: 4, 3: 1, 4: 1 });
    expect(monsterHits.every((hit) => hit.monsterName?.includes("Asura"))).toBe(true);

    const staffHit = monsterHits.find((hit) => hit.attackerRuntimePlayerId === 4);
    expect(staffHit).toMatchObject({
      school: 4, // Energy from the staff
      weaponName: "/inventory/Dream_Blossom_Staff.gif",
    });
  });

  it("attributes AOE spell hits to the 0x0f caster, not the monster's target", () => {
    const body = decodeCombatFrame(huntTrafficFixtures.spellCastThunderstormTerraWave);
    if (body.kind !== "spell_cast") throw new Error("expected spell_cast");

    expect(body.data.actors).toEqual([
      expect.objectContaining({
        tag: ABILITY_SPELL_ACTOR_TAG,
        runtimePlayerId: 2,
        abilityName: "Thunderstorm Rune",
      }),
      expect.objectContaining({
        tag: ABILITY_SPELL_ACTOR_TAG,
        runtimePlayerId: 3,
        abilityName: "Thunderstorm Rune",
      }),
      expect.objectContaining({
        tag: ABILITY_SPELL_ACTOR_TAG,
        runtimePlayerId: 4,
        abilityName: "Terra Wave",
      }),
    ]);

    const dealt = abilityCombatHitsToDealt(body.data.combatHits);
    const bySchoolAndPlayer = dealt.reduce<Record<string, number>>((acc, hit) => {
      const key = `${hit.runtimePlayerId}:${hit.school}`;
      acc[key] = (acc[key] ?? 0) + hit.amount;
      return acc;
    }, {});

    // Energy (4) only from the two Thunderstorm casters; Earth (1) only from Terra Wave.
    expect(Object.keys(bySchoolAndPlayer).sort()).toEqual(["2:4", "3:4", "4:1"]);
    expect(dealt.every((hit) => hit.runtimePlayerId !== 0)).toBe(true);
  });
});

describe("auto_attack combat records", () => {
  it("reads inline attacker ids and weapon/monster string refs", () => {
    const body = decodeCombatFrame(huntTrafficFixtures.autoAttackMonsterHits);
    if (body.kind !== "auto_attack") throw new Error("expected auto_attack");

    const monsterHits = body.data.combatHits.filter(isMonsterCombatHit);
    expect(monsterHits).toEqual([
      expect.objectContaining({
        attackerRuntimePlayerId: 1,
        weaponName: "/inventory/Gnome_Sword.gif",
        school: 8,
        amount: 13,
      }),
      expect.objectContaining({
        attackerRuntimePlayerId: 1,
        weaponName: "/inventory/Gnome_Sword.gif",
        school: 4,
        amount: 87,
      }),
      expect.objectContaining({
        attackerRuntimePlayerId: 3,
        weaponName: "/inventory/Spike_Sword.gif",
        school: 8,
        amount: 3,
      }),
      expect.objectContaining({
        attackerRuntimePlayerId: 4,
        weaponName: "/inventory/Dream_Blossom_Staff.gif",
        school: 4,
        amount: 67,
      }),
    ]);
    expect(monsterHits.every((hit) => hit.monsterName === "True Dawnfire Asura")).toBe(true);
  });

  it("attributes batched multi-spell frames per caster", () => {
    const body = decodeCombatFrame(winterCourtTrafficFixtures.batchedFourSpells);
    if (body.kind !== "auto_attack") throw new Error("expected auto_attack");

    const monsterHits = body.data.combatHits.filter(isMonsterCombatHit);
    expect(monsterHits).toEqual([
      expect.objectContaining({
        attackerRuntimePlayerId: 1,
        abilityName: "Fierce Berserk",
        school: 8,
        amount: 216,
      }),
      expect.objectContaining({
        attackerRuntimePlayerId: 2,
        abilityName: "Ethereal Spear",
        school: 8,
        amount: 126,
      }),
      expect.objectContaining({
        attackerRuntimePlayerId: 3,
        abilityName: "Terra Strike",
        school: 1,
        amount: 151,
      }),
    ]);
  });
});

describe("abilityCombatHitsToDealt", () => {
  it("keeps unresolvable attackers as runtimePlayerId 0", () => {
    const hits: AbilityCombatHit[] = [
      {
        target: "monster",
        tag: 0xf8,
        kind: 0x0800,
        school: 8,
        amount: 371,
        tileX: 0,
        tileY: 0,
        monsterId: 83,
        remainingHp: 100,
        attackerRuntimePlayerId: undefined,
        monsterName: "Silencer",
      },
    ];

    expect(abilityCombatHitsToDealt(hits)).toEqual([
      {
        runtimePlayerId: 0,
        amount: 371,
        school: 8,
        abilityName: undefined,
        monsterName: "Silencer",
      },
    ]);
  });
});

describe("abilityCombatHitsToTaken", () => {
  const playerHit = (overrides: Partial<AbilityCombatHit> & { kind: number }) =>
    ({
      target: "player",
      tag: 0x80,
      category: 0,
      school: (overrides.kind >> 8) & 0xff,
      amount: 100,
      tileX: 0,
      tileY: 0,
      runtimePlayerId: 1,
      isRestore: false,
      ...overrides,
    }) as AbilityCombatHit;

  it("keeps HP damage and magic-shield rows; skips mana/heal/capacity/restore", () => {
    const hits: AbilityCombatHit[] = [
      // Physical hit on the tank.
      playerHit({ kind: 0x0800, amount: 403 }),
      // Fire hit.
      playerHit({ kind: 0x0200, amount: 612 }),
      // Magic-shield absorption (Utamo Vita) — counts as taken.
      playerHit({ kind: 0x0200, amount: 269, category: 4, tag: 0x84 }),
      // Mana restore — excluded (school 5 + restore bit).
      playerHit({ kind: 0x0508, amount: 66, isRestore: true }),
      // HP heal — excluded (category 2).
      playerHit({ kind: 0x0600, amount: 948, category: 2, tag: 0x82 }),
      // Capacity sync — excluded (school 7).
      playerHit({ kind: 0x0700, amount: 8703, category: 1, tag: 0x81 }),
    ];

    expect(abilityCombatHitsToTaken(hits)).toEqual([
      { runtimePlayerId: 1, amount: 403, school: 8 },
      { runtimePlayerId: 1, amount: 612, school: 2 },
      { runtimePlayerId: 1, amount: 269, school: 2 },
    ]);
  });

  it("ignores monster rows", () => {
    const hits: AbilityCombatHit[] = [
      {
        target: "monster",
        tag: 0xf8,
        kind: 0x0400,
        school: 4,
        amount: 163,
        tileX: 1,
        tileY: 1,
        monsterId: 143,
        remainingHp: 0,
        attackerRuntimePlayerId: 1,
      },
    ];

    expect(abilityCombatHitsToTaken(hits)).toEqual([]);
  });
});
