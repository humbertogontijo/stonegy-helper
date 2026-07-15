import type { ReactNode } from "react";
import type { FeatureId } from "../../features";
import { FEATURES } from "../../features";
import {
  BattleTabIcon,
  HuntTabIcon,
  LootTabIcon,
  MarketTabIcon,
  TasksTabIcon,
  ToolsTabIcon,
} from "../icons/TabIcons";
import { FeatureSwitch } from "./FeatureSwitch";
import { StonegyButton } from "./StonegyButton";
import type { SubFeatureAction, SubFeatureToggle } from "./FeatureHubNavigator";

interface FeatureHeaderProps {
  featureId: FeatureId;
  /** When set (sub-feature open), shown as the current page in the breadcrumb. */
  title?: string;
  masterOn?: boolean;
  masterDisabled?: boolean;
  onMasterChange?: (enabled: boolean) => void;
  showBack?: boolean;
  onBack?: () => void;
  /** Sub-feature enable switch — shown when drilled in. */
  subToggle?: SubFeatureToggle;
  onSubToggleLocked?: () => void;
  leadingAction?: ReactNode;
  action?: SubFeatureAction;
}

const FEATURE_HEADER_ICONS: Record<FeatureId, ReactNode> = {
  market: <MarketTabIcon className="inline-block h-3.5 w-3.5 shrink-0 text-[var(--gold-soft)]" />,
  loot: <LootTabIcon className="inline-block h-3.5 w-3.5 shrink-0 text-[var(--gold-soft)]" />,
  battle: <BattleTabIcon className="inline-block h-3.5 w-3.5 shrink-0 text-[var(--gold-soft)]" />,
  hunt: <HuntTabIcon className="inline-block h-3.5 w-3.5 shrink-0 text-[var(--gold-soft)]" />,
  tasks: <TasksTabIcon className="inline-block h-3.5 w-3.5 shrink-0 text-[var(--gold-soft)]" />,
  tools: <ToolsTabIcon className="inline-block h-3.5 w-3.5 shrink-0 text-[var(--gold-soft)]" />,
};

export function FeatureHeader({
  featureId,
  title,
  masterOn = false,
  masterDisabled = false,
  onMasterChange,
  showBack = false,
  onBack,
  subToggle,
  onSubToggleLocked,
  leadingAction,
  action,
}: FeatureHeaderProps) {
  const feature = FEATURES[featureId];
  const inSubFeature = showBack && title != null;

  return (
    <div className="mb-1 flex shrink-0 items-center justify-between gap-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {showBack && onBack ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-gold-soft)] bg-[rgba(28,36,39,0.55)] text-sm text-[var(--gold-soft)] transition-colors hover:border-[var(--gold-soft)] hover:text-[var(--text-primary)]"
            onClick={onBack}
            aria-label={`Back to ${feature.label}`}
          >
            ←
          </button>
        ) : null}

        <h2 className="m-0 flex min-w-0 items-center gap-1 truncate font-[family-name:var(--font-heading)] text-xs font-extrabold uppercase tracking-wide text-[var(--text-primary)]">
          {FEATURE_HEADER_ICONS[featureId]}
          {inSubFeature ? (
            <>
              <button
                type="button"
                className="shrink-0 border-0 bg-transparent p-0 font-[family-name:var(--font-heading)] text-xs font-extrabold uppercase tracking-wide text-[var(--text-primary)] transition-colors hover:text-[var(--gold-soft)]"
                onClick={onBack}
              >
                {feature.label}
              </button>
              <span className="shrink-0 text-[var(--text-muted)]" aria-hidden>
                ›
              </span>
              <span className="min-w-0 truncate font-[family-name:var(--font-heading)] text-xs font-extrabold uppercase tracking-wide text-[var(--text-primary)]">
                {title}
              </span>
            </>
          ) : (
            feature.label
          )}
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {leadingAction}
        {action ? (
          <StonegyButton
            variant={action.variant ?? "secondary"}
            small
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </StonegyButton>
        ) : null}

        {inSubFeature && subToggle ? (
          <FeatureSwitch
            id={`feature-sub-${featureId}`}
            checked={subToggle.checked}
            disabled={subToggle.disabled}
            accent="gold"
            title={`Enable ${title}`}
            onChange={(checked) => {
              if (subToggle.disabled) {
                onSubToggleLocked?.();
                return;
              }
              subToggle.onChange(checked);
            }}
          />
        ) : null}

        {!inSubFeature && onMasterChange != null ? (
          <FeatureSwitch
            id={`feature-master-${featureId}`}
            checked={masterOn}
            disabled={masterDisabled}
            label="Auto"
            accent="success"
            title={`Enable ${feature.label} automation`}
            onChange={onMasterChange}
          />
        ) : null}
      </div>
    </div>
  );
}
