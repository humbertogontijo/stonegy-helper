import type { InventoryEquipOption } from "../../../../lib/items";
import type { AutoEquipSlot, BattlePreset } from "../../../../lib/types";
import { readPercent } from "../../utils/format";
import { SubFeatureSection } from "../ui/SubFeatureSection";
import {
  EquipSection,
  PresetIconRow,
  withSelectedOption,
} from "./BattlePresetControls";

interface BattlePresetEditorProps {
  healOptions: string[];
  manaPotionOptions: string[];
  ammoOptions: string[];
  attackSpellOptions: string[];
  supportSpellOptions: string[];
  ringOptions: InventoryEquipOption[];
  neckOptions: InventoryEquipOption[];
  preset: BattlePreset;
  spellMins: string[];
  showAmmo: boolean;
  disabled?: boolean;
  updatePreset: (patch: Partial<BattlePreset>) => void;
  updateSkill: (index: number, value: string) => void;
  updateSpellMin: (index: number, value: string) => void;
  updateAutoEquip: (prefix: "ring" | "neck", slot: AutoEquipSlot) => void;
}

export function BattlePresetEditor({
  healOptions,
  manaPotionOptions,
  ammoOptions,
  attackSpellOptions,
  supportSpellOptions,
  ringOptions,
  neckOptions,
  preset,
  spellMins,
  showAmmo,
  disabled = false,
  updatePreset,
  updateSkill,
  updateSpellMin,
  updateAutoEquip,
}: BattlePresetEditorProps) {
  return (
    <SubFeatureSection hideTitle compact lockAutomation={disabled}>
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Healing
        </span>
        <PresetIconRow
          label="Primary"
          kind="heal"
          selectValue={preset.selectedHeal}
          onSelectChange={(v) => updatePreset({ selectedHeal: v })}
          options={withSelectedOption(healOptions, preset.selectedHeal)}
          numberValue={String(preset.selectedHealPercent)}
          onNumberChange={(v) => updatePreset({ selectedHealPercent: readPercent(v, 45) })}
          unit="%"
        />
        <PresetIconRow
          label="Secondary"
          kind="heal"
          selectValue={preset.selectedHealSecondary}
          onSelectChange={(v) => updatePreset({ selectedHealSecondary: v })}
          options={withSelectedOption(healOptions, preset.selectedHealSecondary)}
          numberValue={String(preset.selectedHealPercentSecondary)}
          onNumberChange={(v) => updatePreset({ selectedHealPercentSecondary: readPercent(v, 90) })}
          unit="%"
        />
        <PresetIconRow
          label="Tertiary"
          kind="heal"
          selectValue={preset.selectedHealTertiary}
          onSelectChange={(v) => updatePreset({ selectedHealTertiary: v })}
          options={withSelectedOption(healOptions, preset.selectedHealTertiary)}
          numberValue={String(preset.selectedHealPercentTertiary)}
          onNumberChange={(v) => updatePreset({ selectedHealPercentTertiary: readPercent(v, 60) })}
          unit="%"
        />
        <PresetIconRow
          label="Quaternary"
          kind="heal"
          selectValue={preset.selectedHealQuaternary}
          onSelectChange={(v) => updatePreset({ selectedHealQuaternary: v })}
          options={withSelectedOption(healOptions, preset.selectedHealQuaternary)}
          numberValue={String(preset.selectedHealPercentQuaternary)}
          onNumberChange={(v) => updatePreset({ selectedHealPercentQuaternary: readPercent(v, 80) })}
          unit="%"
        />
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Mana
        </span>
        <PresetIconRow
          label="Potion"
          kind="mana"
          selectValue={preset.selectedManaPotion}
          onSelectChange={(v) => updatePreset({ selectedManaPotion: v })}
          options={withSelectedOption(manaPotionOptions, preset.selectedManaPotion)}
          numberValue={String(preset.selectedManaPotionPercent)}
          onNumberChange={(v) => updatePreset({ selectedManaPotionPercent: readPercent(v, 20) })}
          unit="%"
        />
      </div>

      {showAmmo ? (
        <div className="flex flex-col gap-2 mt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Ammo
          </span>
          <PresetIconRow
            label="Arrow / bolt"
            kind="ammo"
            selectValue={preset.selectedArrow ?? ""}
            onSelectChange={(v) => updatePreset({ selectedArrow: v })}
            options={withSelectedOption(ammoOptions, preset.selectedArrow)}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 mt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Attack spells
        </span>
        {(["Slot 1", "Slot 2", "Slot 3", "Slot 4"] as const).map((label, i) => (
          <PresetIconRow
            key={label}
            label={label}
            kind="spell"
            selectValue={preset.selectedSkills[i] ?? ""}
            onSelectChange={(v) => updateSkill(i, v)}
            options={withSelectedOption(attackSpellOptions, preset.selectedSkills[i])}
            numberValue={spellMins[i]}
            onNumberChange={(v) => updateSpellMin(i, v)}
            unit="min"
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Defensive spells
        </span>
        <PresetIconRow
          label="Slot 1"
          kind="spell"
          selectValue={preset.selectedSupportSkills[0] ?? ""}
          onSelectChange={(v) => {
            const s = [...preset.selectedSupportSkills];
            s[0] = v || null;
            updatePreset({ selectedSupportSkills: s });
          }}
          options={withSelectedOption(supportSpellOptions, preset.selectedSupportSkills[0])}
        />
        <PresetIconRow
          label="Slot 2"
          kind="spell"
          selectValue={preset.selectedSupportSkills[1] ?? ""}
          onSelectChange={(v) => {
            const s = [...preset.selectedSupportSkills];
            s[1] = v || null;
            updatePreset({ selectedSupportSkills: s });
          }}
          options={withSelectedOption(supportSpellOptions, preset.selectedSupportSkills[1])}
        />
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <EquipSection
          title="Ring auto-equip"
          prefix="ring"
          slot={preset.autoEquip.ring}
          equipOptions={ringOptions}
          onChange={(ring) => updateAutoEquip("ring", ring)}
        />
        <EquipSection
          title="Amulet auto-equip"
          prefix="neck"
          slot={preset.autoEquip.neck}
          equipOptions={neckOptions}
          onChange={(neck) => updateAutoEquip("neck", neck)}
        />
      </div>
    </SubFeatureSection>
  );
}
