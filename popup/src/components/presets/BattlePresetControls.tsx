import type { ReactNode } from "react";
import {
  getBattleOptionImageUrl,
  type BattleOptionAssetKind,
} from "../../../../lib/battle-option-assets";
import type { InventoryEquipOption } from "../../../../lib/items";
import type { AutoEquipSlot } from "../../types/bot";
import { readPercent } from "../../utils/format";
import { StonegyToggle } from "../ui/StonegyToggle";

export function withSelectedOption(
  options: string[],
  selected: string | null | undefined
): string[] {
  if (!selected || options.includes(selected)) {
    return options;
  }
  return [...options, selected];
}

export function AssetIcon({
  src,
  alt,
  size = 24,
}: {
  src: string | null;
  alt: string;
  size?: number;
}) {
  if (!src) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-sm bg-[rgba(16,20,28,0.85)] text-[9px] text-[var(--text-muted)]"
        style={{ width: size, height: size }}
        aria-hidden
      >
        —
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      title={alt}
      width={size}
      height={size}
      className="pixel-art object-contain"
      style={{ imageRendering: "pixelated", width: size, height: size }}
      draggable={false}
    />
  );
}

/** Icon button with a visible name tooltip on hover (native title is flaky in extension popups). */
export function IconPickButton({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`group relative inline-flex size-7 items-center justify-center rounded-sm border p-0.5 ${
        selected
          ? "border-[var(--gold)] bg-[rgba(200,155,60,0.22)]"
          : "border-[var(--border-gold-soft)] bg-[rgba(16,20,28,0.7)] hover:border-[var(--gold-soft)]"
      }`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border-gold-soft)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] shadow-md group-hover:block"
      >
        {label}
      </span>
    </button>
  );
}

export function IconOptionPicker({
  kind,
  options,
  value,
  onChange,
  emptyTitle = "None",
}: {
  kind: BattleOptionAssetKind;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  emptyTitle?: string;
}) {
  const choices = options.filter(Boolean);
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      <IconPickButton label={emptyTitle} selected={!value} onClick={() => onChange("")}>
        <span className="text-[9px] text-[var(--text-muted)]">∅</span>
      </IconPickButton>
      {choices.map((name) => (
        <IconPickButton
          key={name}
          label={name}
          selected={value === name}
          onClick={() => onChange(name)}
        >
          <AssetIcon src={getBattleOptionImageUrl(kind, name)} alt={name} size={22} />
        </IconPickButton>
      ))}
    </div>
  );
}

export function PresetIconRow({
  label,
  kind,
  options,
  selectValue,
  onSelectChange,
  numberValue,
  onNumberChange,
  unit,
}: {
  label: string;
  kind: BattleOptionAssetKind;
  options: string[];
  selectValue: string;
  onSelectChange: (v: string) => void;
  numberValue?: string;
  onNumberChange?: (v: string) => void;
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
        {numberValue != null && onNumberChange ? (
          <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
            <input
              className="stonegy-input !w-12 !py-0.5 !px-1 !text-[11px]"
              type="number"
              min={unit === "min" ? -1 : 1}
              max={100}
              value={numberValue}
              onChange={(e) => onNumberChange(e.target.value)}
            />
            {unit}
          </label>
        ) : null}
      </div>
      <IconOptionPicker
        kind={kind}
        options={options}
        value={selectValue}
        onChange={onSelectChange}
      />
    </div>
  );
}

export function equipItemIdKey(value: string | number | null | undefined): string | null {
  if (value == null || value === "") {
    return null;
  }
  return String(value);
}

export function EquipItemPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: InventoryEquipOption[];
  value: string | number | null;
  onChange: (itemId: string | null) => void;
}) {
  const selectedKey = equipItemIdKey(value);
  const selected = selectedKey
    ? options.find((o) => String(o.itemId) === selectedKey)
    : null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1">
        <IconPickButton label="None" selected={!selectedKey} onClick={() => onChange(null)}>
          <span className="text-[9px] text-[var(--text-muted)]">∅</span>
        </IconPickButton>
        {options.map((option) => {
          const id = String(option.itemId);
          const label =
            option.amount > 0 ? `${option.name} ×${option.amount}` : option.name;
          return (
            <IconPickButton
              key={id}
              label={label}
              selected={selectedKey === id}
              onClick={() => onChange(id)}
            >
              <AssetIcon src={option.imageUrl} alt={option.name} size={22} />
            </IconPickButton>
          );
        })}
      </div>
      {selected ? (
        <span className="truncate text-[10px] text-[var(--text-muted)]">{selected.name}</span>
      ) : options.length === 0 ? (
        <span className="text-[10px] text-[var(--text-muted)]">No matching items in inventory</span>
      ) : null}
    </div>
  );
}

export function EquipSection({
  title,
  prefix,
  slot,
  equipOptions,
  onChange,
}: {
  title: string;
  prefix: "ring" | "neck";
  slot: AutoEquipSlot;
  equipOptions: InventoryEquipOption[];
  onChange: (slot: AutoEquipSlot) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <StonegyToggle
        id={`${prefix}-enabled`}
        label={title}
        className="gap-1.5! text-[11px]!"
        checked={slot.enabled}
        onChange={(e) => onChange({ ...slot, enabled: e.target.checked })}
      />
      <div className="grid grid-cols-1 gap-1.5">
        <EquipItemPicker
          label="Emergency"
          options={equipOptions}
          value={slot.emergencyItemId}
          onChange={(emergencyItemId) => onChange({ ...slot, emergencyItemId })}
        />
        <EquipItemPicker
          label="Default"
          options={equipOptions}
          value={slot.defaultItemId}
          onChange={(defaultItemId) => onChange({ ...slot, defaultItemId })}
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center text-[10px] text-[var(--text-muted)]">
        <label className="flex items-center gap-1">
          Equip ≤
          <input
            className="stonegy-input !w-12 !py-0.5 !px-1 !text-[11px]"
            type="number"
            min={1}
            max={100}
            value={slot.equipLifePercentLte}
            onChange={(e) =>
              onChange({ ...slot, equipLifePercentLte: readPercent(e.target.value, 50) })
            }
          />
          %
        </label>
        <label className="flex items-center gap-1">
          Restore ≥
          <input
            className="stonegy-input !w-12 !py-0.5 !px-1 !text-[11px]"
            type="number"
            min={1}
            max={100}
            value={slot.restoreLifePercentGte}
            onChange={(e) =>
              onChange({ ...slot, restoreLifePercentGte: readPercent(e.target.value, 80) })
            }
          />
          %
        </label>
      </div>
    </div>
  );
}
