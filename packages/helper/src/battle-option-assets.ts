import { getItemByName, getItemImageUrl } from "./items";

const GAME_ORIGIN = "https://stonegy-online.com";

/** Spell name → filename under /assets/spells/ (from the game client). */
const SPELL_IMAGE_BY_NAME: Record<string, string> = {
  Buzz: "Buzz.gif",
  "Lesser Ethereal Spear": "Lesser_Ethereal_Spear.gif",
  "Lesser Front Sweep": "Lesser_Front_Sweep.gif",
  "Mud Attack": "Mud_Attack.gif",
  "Magic Shield": "Magic_Shield.gif",
  "Brutal Strike": "Brutal_Strike.gif",
  "Ethereal Spear": "Ethereal_Spear.gif",
  "Stone Shower Rune": "Stone_Shower_Rune.gif",
  "Thunderstorm Rune": "Thunderstorm_Rune.gif",
  "Whirlwind Throw": "Whirlwind_Throw.gif",
  "Great Energy Beam": "Great_Energy_Beam.gif",
  "Avalanche Rune": "Avalanche_Rune.gif",
  "Great Fireball Rune": "Great_Fireball_Rune.gif",
  Groundshaker: "Groundshaker.gif",
  Berserk: "Berserk.gif",
  "Energy Wave": "Energy_Wave.gif",
  "Great Fire Wave": "Great_Fire_Wave.gif",
  "Terra Wave": "Terra_Wave.gif",
  "Divine Missile": "Divine_Missile.gif",
  "Strong Ice Wave": "Strong_Ice_Wave.gif",
  "Sudden Death Rune": "Sudden_Death_Rune.gif",
  "Divine Caldera": "Divine_Caldera.gif",
  "Rage of the Skies": "Rage_of_the_Skies.gif",
  "Utamo Tempo": "Protector.gif",
  "Wrath of Nature": "Wrath_of_Nature.gif",
  Sharpshooter: "Sharpshooter.gif",
  "Utito Tempo": "Blood_Rage.gif",
  "Front Sweep": "Front_Sweep.gif",
  "Strong Flame Strike": "Strong_Flame_Strike.png",
  "Strong Terra Strike": "Strong_Terra_Strike.png",
  "Fierce Berserk": "Fierce_Berserk.gif",
  "Strong Ethereal Spear": "Strong_Ethereal_Spear.gif",
  "Ultimate Flame Strike": "Ultimate_Flame_Strike.png",
  "Ultimate Terra Strike": "Ultimate_Terra_Strike.png",
  "Ultimate Energy Strike": "Ultimate_Energy_Strike.png",
  "Ultimate Ice Strike": "Ultimate_Ice_Strike.png",
  Annihilation: "Annihilation.gif",
  "Chivalrous Challenge": "Chivalrous_Challenge.gif",
  "Divine Dazzle": "Divine_Dazzle.gif",
  "Expose Weakness": "Expose_Weakness.gif",
  "Sap Strength": "Sap_Strength.gif",
};

function nameToAssetFile(name: string, ext = ".gif"): string {
  return `${name.replace(/ /g, "_")}${ext}`;
}

function inventoryAssetUrl(file: string): string {
  return `${GAME_ORIGIN}/assets/inventory/${file}`;
}

function healsAssetUrl(file: string): string {
  return `${GAME_ORIGIN}/assets/heals/${file}`;
}

function spellsAssetUrl(file: string): string {
  return `${GAME_ORIGIN}/assets/spells/${file}`;
}

export type BattleOptionAssetKind = "heal" | "mana" | "ammo" | "spell";

/** Resolve a CDN image URL for a battle-preset option name. */
export function getBattleOptionImageUrl(
  kind: BattleOptionAssetKind,
  name: string | null | undefined
): string | null {
  if (!name) {
    return null;
  }

  if (kind === "spell") {
    const file = SPELL_IMAGE_BY_NAME[name] ?? nameToAssetFile(name);
    return spellsAssetUrl(file);
  }

  if (kind === "heal") {
    const item = getItemByName(name);
    if (item?.id) {
      const fromItem = getItemImageUrl(item.id);
      if (fromItem) {
        return fromItem;
      }
    }
    return healsAssetUrl(nameToAssetFile(name));
  }

  // mana + ammo live under inventory assets
  const item = getItemByName(name);
  if (item?.id) {
    const fromItem = getItemImageUrl(item.id);
    if (fromItem) {
      return fromItem;
    }
  }
  return inventoryAssetUrl(nameToAssetFile(name));
}
