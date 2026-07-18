/**
 * Combat records embedded in spell_cast (0x1c) and auto_attack (0x19/0x12)
 * frames. Verified byte-exact against live HARs (Summer Court party hunt,
 * Winter Court and Asura Vault fixtures).
 *
 * spell_cast (0x1c) payload after the string table:
 *   u8  actorCount
 *   actorCount × actor record:
 *     0x0f u8 runtimePlayerId u8 fieldA u8 abilityStringIdx            (spell)
 *     0x1f u8 runtimePlayerId u8 fieldA u8 abilityStringIdx u8 weaponStringIdx
 *   u16 recordCount
 *   recordCount × combat record:
 *     Player row (8 bytes), tag 0x80–0x87:
 *       u8 tag, u16 kind, u16 amount, i8 tileX, i8 tileY, u8 runtimePlayerId
 *       tag&0x7f: 0 damage / mana (kind lo bit3 = restore), 1 capacity sync,
 *                 2 heal, 4 magic-shield absorb
 *     Monster row (13 bytes), tag 0xf8:
 *       u8 tag, u16 kind, u16 amount, i8 tileX, i8 tileY,
 *       u16 monsterId, u16 remainingHp,
 *       u8 actorIndex   — index into the frame's actor list (the attacker)
 *       u8 monsterNameStringIdx
 *
 * auto_attack (0x19 / 0x12) payload after the string table:
 *   u16 recordCount
 *   recordCount × combat record:
 *     Player row (8 bytes), tag 0x00–0x07 — identical to combat_float rows
 *       (kind lo base 0x04, bit7 = restore).
 *     Monster row (14 + refCount bytes), tag 0x78 / 0xf8, kind lo 0x0f:
 *       u8 tag, u16 kind, u16 amount, i8 tileX, i8 tileY,
 *       u16 monsterId, u16 remainingHp,
 *       u8 attackerRuntimePlayerId,
 *       u8 refCount, refCount+1 × u8 string indices:
 *         [abilityIdx, (weaponIdx when refCount ≥ 2), monsterNameIdx]
 *
 * combat_float is the same 0x19 stream with an empty string table.
 *
 * `kind` hi byte is the combat school on every row. Confirmed element ids
 * (via known spells: Terra Wave/Terra Strike → 1, Great Fireball → 2,
 * Avalanche Rune → 3, Thunderstorm Rune → 4, Divine Caldera → 6, weapon
 * skills / monster melee → 8):
 *   1 Earth, 2 Fire, 3 Ice, 4 Energy, 5 Mana, 6 Holy, 7 capacity rows,
 *   8 Physical, 9 Life Drain
 */

import type { BinaryReader } from "./reader.ts";

export const ABILITY_SPELL_ACTOR_TAG = 0x0f;
export const ABILITY_MELEE_ACTOR_TAG = 0x1f;
/** Monster row carrying a weapon string index (auto-attack layout). */
export const ABILITY_MONSTER_HIT_TAG = 0xf8;
/** Monster row without a weapon string index (spell layout in 0x19 frames). */
export const ABILITY_MONSTER_HIT_TAG_SHORT = 0x78;

export const COMBAT_CATEGORY_DAMAGE = 0;
export const COMBAT_CATEGORY_CAPACITY = 1;
export const COMBAT_CATEGORY_HEAL = 2;
export const COMBAT_CATEGORY_SHIELD = 4;

export const ABILITY_MANA_SCHOOL = 5;
export const ABILITY_CAPACITY_SCHOOL = 7;

const MAX_ACTOR_COUNT = 32;
const MAX_RECORD_COUNT = 512;
const MAX_MONSTER_ROW_REF_COUNT = 4;

/** School / element from a combat hit `kind` word (hi byte). */
export function abilityHitSchool(kind: number): number {
  return (kind >> 8) & 0xff;
}

export interface CombatActor {
  tag: typeof ABILITY_SPELL_ACTOR_TAG | typeof ABILITY_MELEE_ACTOR_TAG;
  runtimePlayerId: number;
  /** Index into the frame's `strings` list. */
  abilityIndex: number;
  abilityName?: string;
  /** 0x1f actors only — weapon icon string index. */
  weaponIndex?: number;
  weaponName?: string;
}

export interface PlayerCombatHit {
  target: "player";
  tag: number;
  /** 0 damage/mana, 1 capacity, 2 heal, 4 magic shield. */
  category: number;
  kind: number;
  school: number;
  amount: number;
  tileX: number;
  tileY: number;
  runtimePlayerId: number;
  /** Restore popup (mana/HP gain) rather than damage. */
  isRestore: boolean;
}

export interface MonsterCombatHit {
  target: "monster";
  tag: number;
  kind: number;
  school: number;
  amount: number;
  tileX: number;
  tileY: number;
  /** Monster handle (u16) — matches world snapshot entity ids. */
  monsterId: number;
  remainingHp: number;
  /** Resolved attacker; undefined when attribution failed. */
  attackerRuntimePlayerId?: number;
  abilityName?: string;
  weaponName?: string;
  monsterName?: string;
}

export type AbilityCombatHit = PlayerCombatHit | MonsterCombatHit;

export function isMonsterCombatHit(hit: AbilityCombatHit): hit is MonsterCombatHit {
  return hit.target === "monster";
}

export function isPlayerCombatHit(hit: AbilityCombatHit): hit is PlayerCombatHit {
  return hit.target === "player";
}

/** Actor list from a spell_cast (0x1c) frame: u8 count + records. */
export function parseCombatActors(
  reader: BinaryReader,
  strings: readonly string[]
): CombatActor[] {
  const count = reader.u8();
  if (count > MAX_ACTOR_COUNT) {
    throw new RangeError(`Implausible combat actor count: ${count}`);
  }

  const actors: CombatActor[] = [];
  for (let index = 0; index < count; index += 1) {
    const tag = reader.u8();
    if (tag !== ABILITY_SPELL_ACTOR_TAG && tag !== ABILITY_MELEE_ACTOR_TAG) {
      throw new RangeError(`Unknown combat actor tag 0x${tag.toString(16)}`);
    }
    const runtimePlayerId = reader.u8();
    reader.u8(); // fieldA — 1 for spells, 2 for weapon swings
    const abilityIndex = reader.u8();
    const actor: CombatActor = {
      tag,
      runtimePlayerId,
      abilityIndex,
      abilityName: strings[abilityIndex],
    };
    if (tag === ABILITY_MELEE_ACTOR_TAG) {
      const weaponIndex = reader.u8();
      actor.weaponIndex = weaponIndex;
      actor.weaponName = strings[weaponIndex];
    }
    actors.push(actor);
  }
  return actors;
}

function playerRowRestore(kind: number): boolean {
  // spell_cast rows use lo bit3 (0x08); auto_attack/float rows use bit7 (0x84).
  return (kind & 0x88) !== 0;
}

function readPlayerRow(reader: BinaryReader, tag: number): PlayerCombatHit {
  const kind = reader.u16();
  return {
    target: "player",
    tag,
    category: tag & 0x7f,
    kind,
    school: abilityHitSchool(kind),
    amount: reader.u16(),
    tileX: reader.i8(),
    tileY: reader.i8(),
    runtimePlayerId: reader.u8(),
    isRestore: playerRowRestore(kind),
  };
}

function readMonsterRowHead(reader: BinaryReader, tag: number) {
  const kind = reader.u16();
  return {
    tag,
    kind,
    school: abilityHitSchool(kind),
    amount: reader.u16(),
    tileX: reader.i8(),
    tileY: reader.i8(),
    monsterId: reader.u16(),
    remainingHp: reader.u16(),
  };
}

/**
 * spell_cast (0x1c) combat records. Monster rows are attributed through the
 * frame's actor list (actorIndex byte).
 */
export function parseSpellCastCombatRecords(
  reader: BinaryReader,
  strings: readonly string[],
  actors: readonly CombatActor[]
): AbilityCombatHit[] {
  const recordCount = reader.u16();
  if (recordCount > MAX_RECORD_COUNT) {
    throw new RangeError(`Implausible spell_cast record count: ${recordCount}`);
  }

  const hits: AbilityCombatHit[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const tag = reader.u8();

    if (tag >= 0x80 && tag <= 0x87) {
      hits.push(readPlayerRow(reader, tag));
      continue;
    }

    if (tag === ABILITY_MONSTER_HIT_TAG) {
      const head = readMonsterRowHead(reader, tag);
      const actorIndex = reader.u8();
      const monsterNameIndex = reader.u8();
      const actor = actors[actorIndex];
      hits.push({
        target: "monster",
        ...head,
        attackerRuntimePlayerId: actor?.runtimePlayerId,
        abilityName: actor?.abilityName,
        weaponName: actor?.weaponName,
        monsterName: strings[monsterNameIndex],
      });
      continue;
    }

    throw new RangeError(
      `Unknown spell_cast combat record tag 0x${tag.toString(16)} (record ${index + 1}/${recordCount})`
    );
  }
  return hits;
}

/**
 * auto_attack (0x19/0x12) combat records — also the combat_float layout.
 * Monster rows carry the attacker runtimePlayerId inline plus string indices
 * for the ability, optional weapon, and monster name.
 */
export function parseAutoAttackCombatRecords(
  reader: BinaryReader,
  strings: readonly string[]
): AbilityCombatHit[] {
  const recordCount = reader.u16();
  if (recordCount > MAX_RECORD_COUNT) {
    throw new RangeError(`Implausible auto_attack record count: ${recordCount}`);
  }

  const hits: AbilityCombatHit[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const tag = reader.u8();

    if (tag <= 0x07) {
      hits.push(readPlayerRow(reader, tag));
      continue;
    }

    if (tag === ABILITY_MONSTER_HIT_TAG || tag === ABILITY_MONSTER_HIT_TAG_SHORT) {
      const head = readMonsterRowHead(reader, tag);
      const attackerRuntimePlayerId = reader.u8();
      const refCount = reader.u8();
      if (refCount < 1 || refCount > MAX_MONSTER_ROW_REF_COUNT) {
        throw new RangeError(`Implausible monster row ref count: ${refCount}`);
      }
      const refs: number[] = [];
      for (let ref = 0; ref < refCount + 1; ref += 1) {
        refs.push(reader.u8());
      }
      const abilityIndex = refs[0];
      const monsterNameIndex = refs[refs.length - 1];
      const weaponIndex = refs.length >= 3 ? refs[1] : undefined;
      hits.push({
        target: "monster",
        ...head,
        attackerRuntimePlayerId,
        abilityName: strings[abilityIndex],
        weaponName: weaponIndex != null ? strings[weaponIndex] : undefined,
        monsterName: strings[monsterNameIndex],
      });
      continue;
    }

    throw new RangeError(
      `Unknown auto_attack combat record tag 0x${tag.toString(16)} (record ${index + 1}/${recordCount})`
    );
  }
  return hits;
}

export interface DealtDamageHit {
  /** 0 when the attacker could not be resolved. */
  runtimePlayerId: number;
  amount: number;
  school: number;
  abilityName?: string;
  monsterName?: string;
}

/** Monster damage dealt, attributed per attacker. */
export function abilityCombatHitsToDealt(
  hits: readonly AbilityCombatHit[]
): DealtDamageHit[] {
  const dealt: DealtDamageHit[] = [];
  for (const hit of hits) {
    if (!isMonsterCombatHit(hit) || hit.amount <= 0) {
      continue;
    }
    dealt.push({
      runtimePlayerId: hit.attackerRuntimePlayerId ?? 0,
      amount: hit.amount,
      school: hit.school,
      abilityName: hit.abilityName,
      monsterName: hit.monsterName,
    });
  }
  return dealt;
}

export interface TakenDamageHit {
  runtimePlayerId: number;
  amount: number;
  school: number;
}

/**
 * Damage taken by party members from player rows embedded in cast frames.
 * Includes HP damage (category 0) and magic-shield absorption (category 4).
 * These popups are bundled with the frame instead of a separate combat_float,
 * so counting them does not double-count. Mana restore / capacity / heal rows
 * are excluded.
 */
export function abilityCombatHitsToTaken(
  hits: readonly AbilityCombatHit[]
): TakenDamageHit[] {
  const taken: TakenDamageHit[] = [];
  for (const hit of hits) {
    if (!isPlayerCombatHit(hit) || hit.amount <= 0) {
      continue;
    }
    const isHpDamage = hit.category === COMBAT_CATEGORY_DAMAGE && !hit.isRestore;
    const isShieldAbsorb = hit.category === COMBAT_CATEGORY_SHIELD;
    if (!isHpDamage && !isShieldAbsorb) {
      continue;
    }
    if (hit.school === ABILITY_MANA_SCHOOL || hit.school === ABILITY_CAPACITY_SCHOOL) {
      continue;
    }
    taken.push({
      runtimePlayerId: hit.runtimePlayerId,
      amount: hit.amount,
      school: hit.school,
    });
  }
  return taken;
}
