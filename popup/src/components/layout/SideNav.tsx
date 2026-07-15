import type { ReactNode } from "react";
import type { BotState } from "../../../../lib/types";
import type { AppTab } from "../../types/bot";
import { FEATURES, FEATURE_TAB_ORDER, getFeatureStatus, getTabBadge, type FeatureId } from "../../features";
import type { FeatureMasterMap } from "../../hooks/featureMasterStorage";
import {
  BattleTabIcon,
  DebugTabIcon,
  HuntTabIcon,
  LootTabIcon,
  MarketTabIcon,
  TasksTabIcon,
  ToolsTabIcon,
} from "../icons/TabIcons";
import { TabBadge } from "../ui/TabBadge";
import { TAB_STORAGE_KEY } from "../../utils/format";

interface SideNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  state: BotState | null;
  featureMasters: FeatureMasterMap;
}

interface TabConfig {
  id: AppTab;
  label: string;
  icon: ReactNode;
}

const TAB_ICONS: Record<(typeof FEATURE_TAB_ORDER)[number], ReactNode> = {
  market: <MarketTabIcon />,
  loot: <LootTabIcon />,
  battle: <BattleTabIcon />,
  hunt: <HuntTabIcon />,
  tasks: <TasksTabIcon />,
  tools: <ToolsTabIcon />,
};

const TABS: TabConfig[] = FEATURE_TAB_ORDER.map((id) => ({
  id,
  label: FEATURES[id].label,
  icon: TAB_ICONS[id],
}));

const ALL_TABS: TabConfig[] = [
  ...TABS,
  { id: "debug", label: "Debug", icon: <DebugTabIcon /> },
];

export function SideNav({ activeTab, onTabChange, state, featureMasters }: SideNavProps) {
  return (
    <nav
      className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-[var(--border-gold)] bg-[rgba(1,4,7,0.72)] px-1.5 py-1"
      role="tablist"
      aria-label="Bot features"
    >
      {ALL_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const isFeatureTab = tab.id !== "debug";
        const status = isFeatureTab ? getFeatureStatus(tab.id as FeatureId, state) : { summary: "Dev traffic inspector" };
        const masterOn = isFeatureTab ? featureMasters[tab.id as FeatureId] : false;
        const badge = isFeatureTab ? getTabBadge(tab.id as FeatureId, masterOn) : null;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            title={status.summary}
            onClick={() => {
              onTabChange(tab.id);
              localStorage.setItem(TAB_STORAGE_KEY, tab.id);
            }}
            className="group flex min-w-[44px] shrink-0 flex-col items-center rounded-md px-0.5 py-0.5 transition-colors cursor-pointer"
          >
            <div
              className={`feature-tab-frame ${isActive ? "feature-tab-frame-active" : ""} ${
                masterOn ? "feature-tab-frame-running" : ""
              }`}
            >
              <div
                className={`feature-tab-icon ${isActive ? "text-[var(--gold-soft)]" : "text-[#5b5a56] group-hover:text-[var(--text-body)]"}`}
              >
                {tab.icon}
              </div>
            </div>
            {badge ? (
              <TabBadge active={badge.active}>{badge.label}</TabBadge>
            ) : (
              <span className="h-[12px]" aria-hidden />
            )}
          </button>
        );
      })}
    </nav>
  );
}

const VALID_TABS: AppTab[] = [...FEATURE_TAB_ORDER, "debug"];

export function restoreActiveTab(): AppTab {
  const saved = localStorage.getItem(TAB_STORAGE_KEY);
  if (saved === "cavebot") {
    return "market";
  }
  if (saved === "settings") {
    return "tools";
  }
  if (VALID_TABS.includes(saved as AppTab)) {
    return saved as AppTab;
  }
  return "market";
}
