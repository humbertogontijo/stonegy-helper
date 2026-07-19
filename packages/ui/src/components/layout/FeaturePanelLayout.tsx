import type { ReactNode } from "react";
import { useState } from "react";
import type { FeatureId } from "../../features";
import { FEATURES } from "../../features";
import { FeatureHeader } from "../ui/FeatureHeader";
import { FeatureHubNavigator, type SubFeatureEntry } from "../ui/FeatureHubNavigator";

interface FeaturePanelLayoutProps {
  featureId: FeatureId;
  masterOn: boolean;
  masterDisabled?: boolean;
  onMasterChange: (enabled: boolean) => void;
  showFeedback: (msg: string, type?: "success" | "error") => void;
  subsDisabled?: boolean;
  controlledByParent?: boolean;
  parentLabel?: string;
  setup: ReactNode;
  subFeatures: SubFeatureEntry[];
}

export function FeaturePanelLayout({
  featureId,
  masterOn,
  masterDisabled = false,
  onMasterChange,
  showFeedback,
  subsDisabled = false,
  controlledByParent = false,
  parentLabel = "Tasks",
  setup,
  subFeatures,
}: FeaturePanelLayoutProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const feature = FEATURES[featureId];

  const entries = subFeatures.map((entry) => {
    const locked = entry.locked ?? (subsDisabled || controlledByParent);
    let lockedMessage = entry.lockedMessage;
    if (!lockedMessage && locked) {
      if (controlledByParent) {
        lockedMessage = `Controlled by ${parentLabel}.`;
      } else if (subsDisabled) {
        lockedMessage = `Enable ${feature.label} automation first.`;
      }
    }
    return { ...entry, locked, lockedMessage };
  });

  const active = entries.find((entry) => entry.id === activeId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FeatureHeader
        featureId={featureId}
        title={active?.label}
        masterOn={masterOn}
        masterDisabled={masterDisabled}
        onMasterChange={onMasterChange}
        showBack={active != null}
        onBack={() => setActiveId(null)}
        subToggle={
          active?.toggle
            ? {
                checked: active.toggle.checked,
                disabled: active.locked || active.toggle.disabled,
                onChange: active.toggle.onChange,
              }
            : undefined
        }
        onSubToggleLocked={
          active
            ? () => showFeedback(active.lockedMessage ?? "This sub-feature is locked.", "error")
            : undefined
        }
        leadingAction={active?.leadingAction}
        action={active?.action}
      />
      <FeatureHubNavigator
        activeId={activeId}
        onActiveIdChange={setActiveId}
        setup={setup}
        subFeatures={entries}
        onLockedTap={(message) => showFeedback(message, "error")}
      />
    </div>
  );
}
