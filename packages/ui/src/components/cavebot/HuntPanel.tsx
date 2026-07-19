import { getHuntById, isStartableHuntId } from "@stonegy/helper/hunts";
import type { BotState } from "@stonegy/helper/types";
import { isHuntControlledByParent } from "../../features";
import { useFeatureMasterWithStop } from "../../hooks/useFeatureMasterWithStop";
import { useBotTransport } from "../../transport/context";
import { FeaturePanelLayout } from "../layout/FeaturePanelLayout";
import { FeatureInputs } from "../ui/FeatureInputs";
import type { SubFeatureBadge } from "../ui/FeatureHubNavigator";
import { SplitSubFeatureDetail } from "../ui/FeatureHubNavigator";
import { RefreshIconButton } from "../ui/RefreshIconButton";
import { StonegyPanel } from "../ui/StonegyPanel";

interface HuntPanelProps {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => Promise<void>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

export function HuntPanel({ state, runAction, saveSettings, showFeedback }: HuntPanelProps) {
  const { send: sendBot } = useBotTransport();
  const controlledByTasks = isHuntControlledByParent(state);

  const saveCavebot = (overrides?: Record<string, unknown>) => saveSettings({ ...overrides });

  const { masterOn, subsDisabled, handleMasterChange } = useFeatureMasterWithStop("hunt", {
    state,
    saveSettings: saveCavebot,
    runAction,
    showFeedback,
  });

  const selectedHuntId = state?.settings.selectedHuntId;
  const activeHuntId = state?.hunt.activeHuntId ?? state?.party.currentHuntId ?? selectedHuntId;
  const hunt = activeHuntId != null ? getHuntById(activeHuntId) : undefined;

  const handleAutoHuntToggle = (enabled: boolean) => {
    if (controlledByTasks) {
      showFeedback("Controlled by Tasks.", "error");
      return;
    }
    if (!state?.connection.connected) {
      showFeedback("Not connected to the game — open Stonegy and enter the world.", "error");
      return;
    }
    if (enabled) {
      if (!selectedHuntId) {
        showFeedback("Select a hunt on the Battle tab first", "error");
        return;
      }
      if (!isStartableHuntId(selectedHuntId)) {
        showFeedback(
          "Boss/quest maps can't be auto-started. Pick a catalog hunt on Battle.",
          "error"
        );
        return;
      }
      void runAction(() => sendBot("bot:start-auto-hunt", { huntId: selectedHuntId }));
      return;
    }
    void runAction(() => sendBot("bot:stop-auto-hunt"));
  };

  const autoHuntBadge: SubFeatureBadge = controlledByTasks
    ? "locked"
    : state?.settings.autoHuntEnabled
      ? "live"
      : masterOn
        ? "armed"
        : "off";

  return (
    <FeaturePanelLayout
      featureId="hunt"
      masterOn={masterOn}
      masterDisabled={controlledByTasks}
      onMasterChange={handleMasterChange}
      showFeedback={showFeedback}
      subsDisabled={subsDisabled}
      controlledByParent={controlledByTasks}
      setup={<FeatureInputs>{null}</FeatureInputs>}
      subFeatures={[
        {
          id: "auto-hunt",
          label: "Auto Hunt",
          order: 1,
          badge: autoHuntBadge,
          locked: controlledByTasks,
          toggle: {
            checked: !!state?.settings.autoHuntEnabled,
            disabled: controlledByTasks || !state?.connection.connected || subsDisabled,
            onChange: handleAutoHuntToggle,
          },
          action: {
            label: "Hunt now",
            disabled: controlledByTasks || !state?.connection.connected,
            onClick: () => {
              if (controlledByTasks) {
                showFeedback("Controlled by Tasks.", "error");
                return;
              }
              if (!selectedHuntId) {
                showFeedback("Select a hunt on the Battle tab first", "error");
                return;
              }
              if (!isStartableHuntId(selectedHuntId)) {
                showFeedback(
                  "Boss/quest maps can't be started here. Pick a catalog hunt on Battle.",
                  "error"
                );
                return;
              }
              void runAction(() => sendBot("bot:start-hunt", { huntId: selectedHuntId }));
            },
          },
          content: (
            <SplitSubFeatureDetail
              status={
                <StonegyPanel
                  title="Hunt status"
                  action={
                    <RefreshIconButton
                      label="Refresh hunt"
                      disabled={!state?.connection.connected}
                      onClick={() => void runAction(() => sendBot("bot:refresh-hunt"))}
                    />
                  }
                >
                  <dl className="grid gap-1 text-xs">
                    <div>
                      <dt className="text-[var(--text-muted)]">Party</dt>
                      <dd>{state?.party.partyStatus || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Hunt</dt>
                      <dd>
                        {hunt
                          ? `#${hunt.id} · ${hunt.title}`
                          : activeHuntId != null
                            ? `#${activeHuntId}`
                            : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Auto hunt</dt>
                      <dd>{state?.settings.autoHuntEnabled ? "Running" : "Off"}</dd>
                    </div>
                  </dl>
                </StonegyPanel>
              }
            />
          ),
        },
      ]}
    />
  );
}
