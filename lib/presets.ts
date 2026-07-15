import { DEFAULT_HUNT_SKILLS } from "./protocol";
import type {
  BattleConfigPayload,
  SelectArrowPayload,
  SelectHealPayload,
  SelectManaPotionPayload,
  SelectSkillsPayload,
} from "./protocol-messages";
import type { AutoEquipSlot, BattlePreset } from "./types";

export const EQUIP_ITEM_OPTIONS = [
  "",
  "Ring of Healing",
  "Life Ring",
  "Energy Ring",
  "Stealth Ring",
  "Time Ring",
  "Dwarven Ring",
  "Amulet of Loss",
  "Stone Skin Amulet",
  "Glacier Amulet",
  "Magma Amulet",
  "Lightning Amulet",
  "Terra Amulet",
];

const DEFAULT_AUTO_EQUIP_SLOT: AutoEquipSlot = {
  enabled: false,
  emergencyItemId: null,
  defaultItemId: null,
  equipLifePercentLte: 50,
  restoreLifePercentGte: 80,
};

export const DEFAULT_BATTLE_PRESET: BattlePreset = {
  selectedHeal: "Health Potion",
  selectedHealPercent: 45,
  selectedHealSecondary: "Light Healing",
  selectedHealPercentSecondary: 90,
  selectedHealTertiary: "Intense Healing",
  selectedHealPercentTertiary: 60,
  selectedHealQuaternary: "",
  selectedHealPercentQuaternary: 80,
  selectedManaPotion: "Strong Mana Potion",
  selectedManaPotionPercent: 20,
  selectedArrow: "Onyx Arrow",
  selectedSkills: ["Divine Caldera", "Ethereal Spear", "Avalanche Rune", null],
  selectedSkillsMinCreatures: {
    "Divine Caldera": 2,
    "Ethereal Spear": -1,
    "Avalanche Rune": 2,
  },
  selectedSupportSkills: [null, null],
  autoEquip: {
    ring: { ...DEFAULT_AUTO_EQUIP_SLOT },
    neck: { ...DEFAULT_AUTO_EQUIP_SLOT },
  },
};

export function createBattlePreset(patch: Partial<BattlePreset> = {}): BattlePreset {
  return {
    ...DEFAULT_BATTLE_PRESET,
    ...patch,
    selectedSkills: patch.selectedSkills ?? [...DEFAULT_BATTLE_PRESET.selectedSkills],
    selectedSkillsMinCreatures: {
      ...DEFAULT_BATTLE_PRESET.selectedSkillsMinCreatures,
      ...(patch.selectedSkillsMinCreatures ?? {}),
    },
    selectedSupportSkills:
      patch.selectedSupportSkills ?? [...DEFAULT_BATTLE_PRESET.selectedSupportSkills],
    autoEquip: {
      ring: { ...DEFAULT_AUTO_EQUIP_SLOT, ...(patch.autoEquip?.ring ?? {}) },
      neck: { ...DEFAULT_AUTO_EQUIP_SLOT, ...(patch.autoEquip?.neck ?? {}) },
    },
  };
}

/** Prefer a user-configured preset; otherwise use the character's live in-game preset. */
export function resolveBattlePreset(
  configured: BattlePreset | null | undefined,
  characterPreset: BattlePreset
): BattlePreset {
  return configured ?? characterPreset;
}

export function parseBattleConfigFromGame(data: BattleConfigPayload | Record<string, unknown>): BattlePreset {
  const skills = Array.isArray(data.selectedSkills)
    ? data.selectedSkills.map((skill) => (typeof skill === "string" ? skill : null))
    : DEFAULT_BATTLE_PRESET.selectedSkills;

  const minCreatures =
    data.selectedSkillsMinCreatures && typeof data.selectedSkillsMinCreatures === "object"
      ? (data.selectedSkillsMinCreatures as Record<string, number>)
      : DEFAULT_BATTLE_PRESET.selectedSkillsMinCreatures;

  const autoEquipRaw = (data.autoEquip ?? {}) as Record<string, unknown>;
  const ring = (autoEquipRaw.ring ?? {}) as Record<string, unknown>;
  const neck = (autoEquipRaw.neck ?? {}) as Record<string, unknown>;

  return createBattlePreset({
    selectedHeal: stringOrDefault(data.selectedHeal, DEFAULT_BATTLE_PRESET.selectedHeal),
    selectedHealPercent: numberOrDefault(
      data.selectedHealPercent,
      DEFAULT_BATTLE_PRESET.selectedHealPercent
    ),
    selectedHealSecondary: stringOrDefault(
      data.selectedHealSecondary,
      DEFAULT_BATTLE_PRESET.selectedHealSecondary
    ),
    selectedHealPercentSecondary: numberOrDefault(
      data.selectedHealPercentSecondary,
      DEFAULT_BATTLE_PRESET.selectedHealPercentSecondary
    ),
    selectedHealTertiary: stringOrDefault(
      data.selectedHealTertiary,
      DEFAULT_BATTLE_PRESET.selectedHealTertiary
    ),
    selectedHealPercentTertiary: numberOrDefault(
      data.selectedHealPercentTertiary,
      DEFAULT_BATTLE_PRESET.selectedHealPercentTertiary
    ),
    selectedHealQuaternary: stringOrDefault(
      data.selectedHealQuaternary,
      DEFAULT_BATTLE_PRESET.selectedHealQuaternary
    ),
    selectedHealPercentQuaternary: numberOrDefault(
      data.selectedHealPercentQuaternary,
      DEFAULT_BATTLE_PRESET.selectedHealPercentQuaternary
    ),
    selectedManaPotion: stringOrDefault(
      data.selectedManaPotion,
      DEFAULT_BATTLE_PRESET.selectedManaPotion
    ),
    selectedManaPotionPercent: numberOrDefault(
      data.selectedManaPotionPercent,
      DEFAULT_BATTLE_PRESET.selectedManaPotionPercent
    ),
    selectedArrow:
      typeof data.selectedArrow === "string" || data.selectedArrow === null
        ? data.selectedArrow
        : DEFAULT_BATTLE_PRESET.selectedArrow,
    selectedSkills: skills,
    selectedSkillsMinCreatures: minCreatures,
    selectedSupportSkills: Array.isArray(data.selectedSupportSkills)
      ? data.selectedSupportSkills.map((skill) => (typeof skill === "string" ? skill : null))
      : DEFAULT_BATTLE_PRESET.selectedSupportSkills,
    autoEquip: {
      ring: parseAutoEquipSlot(ring),
      neck: parseAutoEquipSlot(neck),
    },
  });
}

function parseAutoEquipSlot(slot: Record<string, unknown>): AutoEquipSlot {
  return {
    enabled: !!slot.enabled,
    emergencyItemId: parseItemId(slot.emergencyItemId),
    defaultItemId: parseItemId(slot.defaultItemId),
    equipLifePercentLte: numberOrDefault(slot.equipLifePercentLte, 50),
    restoreLifePercentGte: numberOrDefault(slot.restoreLifePercentGte, 80),
  };
}

function parseItemId(value: unknown): string | null {
  if (typeof value === "string") {
    return value || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function resolveHuntSkills(preset?: BattlePreset | null): Array<string | null> {
  const skills = preset?.selectedSkills;
  if (skills?.some((skill) => skill)) {
    return skills;
  }

  return [...DEFAULT_HUNT_SKILLS];
}

/** Heal slots sent via `select_heal` (1-based healIdx). */
export function buildSelectHealPayloads(preset: BattlePreset): SelectHealPayload[] {
  return [
    {
      selectedHeal: preset.selectedHeal,
      selectedHealPercent: preset.selectedHealPercent,
      healIdx: 1,
    },
    {
      selectedHeal: preset.selectedHealSecondary,
      selectedHealPercent: preset.selectedHealPercentSecondary,
      healIdx: 2,
    },
    {
      selectedHeal: preset.selectedHealTertiary,
      selectedHealPercent: preset.selectedHealPercentTertiary,
      healIdx: 3,
    },
    {
      selectedHeal: preset.selectedHealQuaternary,
      selectedHealPercent: preset.selectedHealPercentQuaternary,
      healIdx: 4,
    },
  ];
}

export function buildSelectArrowPayload(preset: BattlePreset): SelectArrowPayload {
  return { selectedArrow: preset.selectedArrow };
}

export function buildSelectManaPotionPayload(preset: BattlePreset): SelectManaPotionPayload {
  return {
    selectedManaPotion: preset.selectedManaPotion,
    selectedManaPotionPercent: preset.selectedManaPotionPercent,
  };
}

export function buildSelectSkillsPayload(preset: BattlePreset): SelectSkillsPayload {
  const skills = preset.selectedSkills;
  const minCreatures = { ...preset.selectedSkillsMinCreatures };

  for (const skill of skills) {
    if (skill && minCreatures[skill] === undefined) {
      minCreatures[skill] = -1;
    }
  }

  return {
    selectedSkills: skills,
    selectedSupportSkill: preset.selectedSupportSkills[0] ?? null,
    selectedSupportSkills: preset.selectedSupportSkills,
    selectedSkillsMinCreatures: minCreatures,
  };
}

export function healSlotDiffers(
  desired: BattlePreset,
  current: BattlePreset,
  healIdx: number
): boolean {
  switch (healIdx) {
    case 1:
      return (
        desired.selectedHeal !== current.selectedHeal ||
        desired.selectedHealPercent !== current.selectedHealPercent
      );
    case 2:
      return (
        desired.selectedHealSecondary !== current.selectedHealSecondary ||
        desired.selectedHealPercentSecondary !== current.selectedHealPercentSecondary
      );
    case 3:
      return (
        desired.selectedHealTertiary !== current.selectedHealTertiary ||
        desired.selectedHealPercentTertiary !== current.selectedHealPercentTertiary
      );
    case 4:
      return (
        desired.selectedHealQuaternary !== current.selectedHealQuaternary ||
        desired.selectedHealPercentQuaternary !== current.selectedHealPercentQuaternary
      );
    default:
      return true;
  }
}

export function arrowDiffers(desired: BattlePreset, current: BattlePreset): boolean {
  return desired.selectedArrow !== current.selectedArrow;
}

export function manaPotionDiffers(desired: BattlePreset, current: BattlePreset): boolean {
  return (
    desired.selectedManaPotion !== current.selectedManaPotion ||
    desired.selectedManaPotionPercent !== current.selectedManaPotionPercent
  );
}

export function skillsDiffers(desired: BattlePreset, current: BattlePreset): boolean {
  return (
    JSON.stringify(buildSelectSkillsPayload(desired)) !==
    JSON.stringify(buildSelectSkillsPayload(current))
  );
}
