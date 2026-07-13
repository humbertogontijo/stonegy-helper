import type { SelectHTMLAttributes } from "react";

interface StonegySelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export function StonegySelect({ label, id, options, className = "", ...props }: StonegySelectProps) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      {label ? (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
      ) : null}
      <select id={id} className={`stonegy-select ${className}`} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
