import type { ReactNode } from "react";

interface FeatureInputsProps {
  children: ReactNode;
}

export function FeatureInputs({ children }: FeatureInputsProps) {
  return (
    <div className="h-full rounded-md border border-[var(--border-gold-soft)] bg-[rgba(200,155,60,0.06)] px-2 py-2">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
