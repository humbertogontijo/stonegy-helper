import type { ReactNode } from "react";
import { FeatureSwitch } from "./FeatureSwitch";

export type SubFeatureBadge = "on" | "off" | "armed" | "live" | "locked";

export interface SubFeatureToggle {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export interface SubFeatureAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

export interface SubFeatureEntry {
  id: string;
  label: string;
  order?: number;
  badge?: SubFeatureBadge;
  toggle?: SubFeatureToggle;
  /** Optional control rendered before the primary header action (e.g. refresh). */
  leadingAction?: ReactNode;
  /** Header "now" action when this sub-feature is open. */
  action?: SubFeatureAction;
  locked?: boolean;
  lockedMessage?: string;
  content: ReactNode;
}

const BADGE_STYLES: Record<SubFeatureBadge, string> = {
  on: "border-[var(--success)]/40 text-[var(--success)] bg-[rgba(161,222,83,0.08)]",
  off: "border-[var(--border-gold-soft)] text-[var(--text-muted)] bg-[rgba(28,36,39,0.6)]",
  armed: "border-[var(--border-gold-soft)] text-[var(--gold-soft)] bg-[rgba(200,155,60,0.08)]",
  live: "border-[var(--success)]/40 text-[var(--success)] bg-[rgba(161,222,83,0.12)]",
  locked: "border-[var(--teal)]/40 text-[var(--teal)] bg-[rgba(10,200,185,0.08)]",
};

const BADGE_LABELS: Record<SubFeatureBadge, string> = {
  on: "On",
  off: "Off",
  armed: "Armed",
  live: "Live",
  locked: "Locked",
};

function SubFeatureBadgePill({ badge }: { badge: SubFeatureBadge }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${BADGE_STYLES[badge]}`}
    >
      {BADGE_LABELS[badge]}
    </span>
  );
}

interface SubFeatureOverviewListProps {
  entries: SubFeatureEntry[];
  onSelect: (id: string) => void;
  onLockedTap?: (message: string) => void;
}

function SubFeatureOverviewList({ entries, onSelect, onLockedTap }: SubFeatureOverviewListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {entries.map((entry, index) => {
        const order = entry.order ?? index + 1;
        return (
          <button
            key={entry.id}
            type="button"
            className={`flex min-h-[40px] w-full items-center gap-1.5 rounded-md border border-[var(--border-gold-soft)] bg-[rgba(28,36,39,0.45)] px-2 py-1.5 text-left transition-colors hover:border-[var(--gold-soft)] ${
              entry.locked ? "opacity-60" : "cursor-pointer"
            }`}
            onClick={() => {
              if (entry.locked) {
                onLockedTap?.(entry.lockedMessage ?? "This sub-feature is locked.");
                return;
              }
              onSelect(entry.id);
            }}
          >
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
              {order}. {entry.label}
            </span>
            {entry.toggle ? (
              <span
                className="shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  if (entry.locked) {
                    onLockedTap?.(entry.lockedMessage ?? "This sub-feature is locked.");
                  }
                }}
              >
                <FeatureSwitch
                  id={`sub-feature-toggle-${entry.id}`}
                  checked={entry.toggle.checked}
                  disabled={entry.locked || entry.toggle.disabled}
                  accent="gold"
                  onChange={(checked) => {
                    if (entry.locked) {
                      onLockedTap?.(entry.lockedMessage ?? "This sub-feature is locked.");
                      return;
                    }
                    entry.toggle?.onChange(checked);
                  }}
                />
              </span>
            ) : entry.badge ? (
              <SubFeatureBadgePill badge={entry.badge} />
            ) : null}
            <span className="shrink-0 text-sm text-[var(--text-muted)]" aria-hidden>
              ›
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface FeatureHubNavigatorProps {
  activeId: string | null;
  onActiveIdChange: (id: string | null) => void;
  setup: ReactNode;
  subFeatures: SubFeatureEntry[];
  onLockedTap?: (message: string) => void;
}

export function FeatureHubNavigator({
  activeId,
  onActiveIdChange,
  setup,
  subFeatures,
  onLockedTap,
}: FeatureHubNavigatorProps) {
  const active = subFeatures.find((entry) => entry.id === activeId);

  if (active) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">{active.content}</div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-0.5">{setup}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pr-0.5">
        <SubFeatureOverviewList
          entries={subFeatures}
          onSelect={onActiveIdChange}
          onLockedTap={onLockedTap}
        />
      </div>
    </div>
  );
}

/** Side-by-side layout for controls + status readout in a sub-feature detail view. */
export function SplitSubFeatureDetail({
  controls,
  status,
}: {
  controls?: ReactNode;
  status: ReactNode;
}) {
  if (controls == null) {
    return <div className="min-w-0">{status}</div>;
  }

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">{controls}</div>
      <div className="min-w-0 flex-1">{status}</div>
    </div>
  );
}
