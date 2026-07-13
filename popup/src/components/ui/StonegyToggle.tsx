import type { InputHTMLAttributes, ReactNode } from "react";

interface StonegyToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
}

export function StonegyToggle({ label, id, className = "", ...props }: StonegyToggleProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-2.5 text-[13px] cursor-pointer select-none ${className}`}
    >
      <input
        id={id}
        type="checkbox"
        className="accent-[var(--gold)] w-4 h-4 shrink-0"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
