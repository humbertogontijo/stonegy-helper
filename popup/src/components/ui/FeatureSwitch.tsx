interface FeatureSwitchProps {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** Short scope label shown beside the switch (e.g. Auto). */
  label?: string;
  /** Visual accent — green for feature master, gold for sub-feature. */
  accent?: "success" | "gold";
  title?: string;
}

export function FeatureSwitch({
  id,
  checked,
  disabled = false,
  onChange,
  label,
  accent = "success",
  title,
}: FeatureSwitchProps) {
  const onTrack =
    accent === "gold"
      ? "border-[var(--gold)]/55 bg-[rgba(200,155,60,0.28)]"
      : "border-[var(--success)]/50 bg-[rgba(161,222,83,0.18)]";
  const onKnob =
    accent === "gold"
      ? "translate-x-4 bg-[var(--gold)] shadow-[0_0_8px_rgba(200,155,60,0.5)]"
      : "translate-x-4 bg-[var(--success)] shadow-[0_0_8px_rgba(161,222,83,0.5)]";
  const labelOn = accent === "gold" ? "text-[var(--gold)]" : "text-[var(--success)]";

  return (
    <label
      htmlFor={id}
      className={`flex shrink-0 items-center gap-1.5 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      title={title}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {label ? (
        <span
          className={`text-[9px] font-bold uppercase tracking-[0.14em] ${
            checked ? labelOn : "text-[var(--text-muted)]"
          }`}
        >
          {label}
        </span>
      ) : null}
      <span className="relative inline-flex h-5 w-9 items-center">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`h-5 w-9 rounded-full border transition-colors ${
            checked ? onTrack : "border-[var(--border-gold-soft)] bg-[rgba(28,36,39,0.85)]"
          } peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--gold-soft)]`}
        />
        <span
          className={`pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform ${
            checked ? onKnob : "translate-x-0 bg-[var(--text-muted)]"
          }`}
        />
      </span>
    </label>
  );
}
