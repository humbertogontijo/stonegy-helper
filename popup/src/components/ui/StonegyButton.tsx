import type { ButtonHTMLAttributes, ReactNode } from "react";

interface StonegyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  children: ReactNode;
  fullWidth?: boolean;
  small?: boolean;
}

export function StonegyButton({
  variant = "primary",
  children,
  fullWidth = false,
  small = false,
  className = "",
  disabled,
  ...props
}: StonegyButtonProps) {
  const outerClass =
    variant === "primary" ? "stonegy-btn-primary-outer" : "stonegy-btn-secondary-outer";
  const innerClass =
    variant === "primary" ? "stonegy-btn-primary-inner" : "stonegy-btn-secondary-inner";

  return (
    <div className={`${outerClass} ${fullWidth ? "w-full" : ""} ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        type="button"
        className={`${innerClass} ${small ? "!py-1 !px-2 !text-[10px]" : ""} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    </div>
  );
}
