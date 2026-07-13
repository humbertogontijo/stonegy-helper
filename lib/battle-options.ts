import { BATTLE_OPTIONS } from "./data/battle-options";
import { getHuntById } from "./hunts";

export type Vocation = "DRUID" | "KNIGHT" | "PALADIN" | "SORCERER";

export interface BattleOptionFilter {
  vocation?: Vocation | string | null;
  level?: number | null;
  magicLevel?: number | null;
  huntRecommendedLevel?: number | null;
}

const EMPTY_OPTION = "";

function normalizeVocation(vocation: string | null | undefined): Vocation | null {
  if (vocation === "DRUID" || vocation === "KNIGHT" || vocation === "PALADIN" || vocation === "SORCERER") {
    return vocation;
  }
  return null;
}

function withEmptyOption(values: string[]): string[] {
  const unique = [...new Set(values.filter(Boolean))];
  return [EMPTY_OPTION, ...unique];
}

function isSmallHealthPotionAllowed(recommendedLevel: number | null | undefined): boolean {
  if (recommendedLevel == null || !Number.isFinite(recommendedLevel)) {
    return true;
  }
  return recommendedLevel <= 8;
}

function isSpellUnlocked(
  spell: (typeof BATTLE_OPTIONS.spells)[number],
  level: number,
  magicLevel: number
): boolean {
  return level >= spell.minLevel && magicLevel >= spell.minMagicLevel;
}

export function getHealOptions(filter: BattleOptionFilter = {}): string[] {
  const vocation = normalizeVocation(filter.vocation ?? null);
  const level = filter.level ?? null;
  const allowSmallHealthPotion = isSmallHealthPotionAllowed(filter.huntRecommendedLevel);

  const names = BATTLE_OPTIONS.heals
    .filter((heal) => {
      if (heal.name === "Small Health Potion" && !allowSmallHealthPotion) {
        return false;
      }
      if (vocation && !heal.vocation.includes(vocation)) {
        return false;
      }
      if (level != null && heal.levelMin > level) {
        return false;
      }
      return true;
    })
    .map((heal) => heal.name);

  return withEmptyOption(names);
}

export function getAttackSpellOptions(filter: BattleOptionFilter = {}): string[] {
  const vocation = normalizeVocation(filter.vocation ?? null);
  const level = filter.level ?? 0;
  const magicLevel = filter.magicLevel ?? 0;

  const names = BATTLE_OPTIONS.spells
    .filter((spell) => spell.category !== "SUPPORT")
    .filter((spell) => (vocation ? spell.vocation === vocation : true))
    .filter((spell) => isSpellUnlocked(spell, level, magicLevel))
    .map((spell) => spell.name);

  return withEmptyOption(names);
}

export function getSupportSpellOptions(filter: BattleOptionFilter = {}): string[] {
  const vocation = normalizeVocation(filter.vocation ?? null);
  const level = filter.level ?? 0;
  const magicLevel = filter.magicLevel ?? 0;

  const names = BATTLE_OPTIONS.spells
    .filter((spell) => spell.category === "SUPPORT")
    .filter((spell) => (vocation ? spell.vocation === vocation : true))
    .filter((spell) => isSpellUnlocked(spell, level, magicLevel))
    .map((spell) => spell.name);

  return withEmptyOption(names);
}

export function getManaPotionOptions(filter: BattleOptionFilter = {}): string[] {
  const vocation = normalizeVocation(filter.vocation ?? null);
  const level = filter.level ?? null;

  const names = BATTLE_OPTIONS.manaPotions
    .filter((potion) => (vocation ? potion.vocation.includes(vocation) : true))
    .filter((potion) => (level == null ? true : potion.levelMin <= level))
    .map((potion) => potion.name);

  return withEmptyOption(names);
}

export function getAmmoOptions(filter: BattleOptionFilter = {}): string[] {
  const vocation = normalizeVocation(filter.vocation ?? null);
  const level = filter.level ?? null;

  if (vocation && vocation !== "PALADIN") {
    return [EMPTY_OPTION];
  }

  const ammo = [...BATTLE_OPTIONS.arrows, ...BATTLE_OPTIONS.bolts]
    .filter((entry) => (level == null ? true : entry.levelMin <= level))
    .map((entry) => entry.name);

  return withEmptyOption(ammo);
}

export function resolveBattleOptionFilter(
  state: {
    character?: { characterVocation?: string | null; level?: number | null };
    settings?: { selectedHuntId?: number | null };
    hunt?: { activeHuntId?: number | null };
    party?: { currentHuntId?: number | null };
    characterVocation?: string | null;
    level?: number | null;
    selectedHuntId?: number | null;
    activeHuntId?: number | null;
    currentHuntId?: number | null;
  },
  huntRecommendedLevel?: number | null
): BattleOptionFilter {
  const huntId =
    state.hunt?.activeHuntId ??
    state.settings?.selectedHuntId ??
    state.party?.currentHuntId ??
    state.activeHuntId ??
    state.selectedHuntId ??
    state.currentHuntId ??
    null;
  const hunt = huntId != null ? getHuntById(huntId) : undefined;

  return {
    vocation: state.character?.characterVocation ?? state.characterVocation ?? null,
    level: state.character?.level ?? state.level ?? null,
    huntRecommendedLevel: huntRecommendedLevel ?? hunt?.recommendedLevel ?? null,
  };
}

export function isAllowedBattleSelection(
  value: string,
  options: string[]
): boolean {
  if (!value) {
    return true;
  }
  return options.includes(value);
}
