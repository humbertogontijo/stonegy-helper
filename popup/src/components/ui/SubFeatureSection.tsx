import type { ReactNode } from "react";

interface SubFeatureSectionProps {
  order?: number;
  title?: string;
  description?: string;
  hideTitle?: boolean;
  /** Tighter padding/gaps for dense sub-feature control columns. */
  compact?: boolean;
  disabled?: boolean;
  /** When true, settings are visually locked (master automation off). */
  lockAutomation?: boolean;
  children?: ReactNode;
}

export function SubFeatureSection({
  order,
  title,
  description,
  hideTitle = false,
  compact = false,
  disabled = false,
  lockAutomation = false,
  children,
}: SubFeatureSectionProps) {
  const bodyLocked = disabled || lockAutomation;

  return (
    <section
      className={`rounded-md border border-[var(--border-gold-soft)] bg-[rgba(28,36,39,0.45)] ${
        compact ? "px-2 py-1.5" : "px-2.5 py-2.5"
      }`}
    >
      {!hideTitle && title ? (
        <div className={compact ? "mb-1.5" : "mb-2"}>
          <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-[var(--text-primary)]">
            {order != null ? `${order}. ` : ""}
            {title}
          </h3>
          {description ? (
            <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">{description}</p>
          ) : null}
        </div>
      ) : null}

      {children ? (
        <div
          className={`${compact ? "flex flex-col gap-1.5" : "flex flex-col gap-2"} ${
            bodyLocked ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
