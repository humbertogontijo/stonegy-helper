import type { InputHTMLAttributes } from "react";

interface StonegyInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function StonegyInput({ label, id, className = "", ...props }: StonegyInputProps) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      {label ? (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
      ) : null}
      <input id={id} className={`stonegy-input ${className}`} {...props} />
    </label>
  );
}
