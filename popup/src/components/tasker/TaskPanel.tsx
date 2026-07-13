import { useMemo } from "react";
import {
  formatActiveTask,
  getActiveTaskForQuest,
  getMission,
  listMonsterTaskQuests,
  resolveTaskHuntId,
} from "../../../../lib/domain/tasks";
import { getHuntById } from "../../../../lib/hunts";
import { sendBot } from "../../api/bot";
import type { BotState } from "../../types/bot";
import { useFeatureMasterWithStop } from "../../hooks/useFeatureMasterWithStop";
import { useLeaveHuntToggleCooldown } from "../../hooks/useLeaveHuntToggleCooldown";
import { usePersistedField } from "../../hooks/usePersistedField";
import { FeaturePanelLayout } from "../layout/FeaturePanelLayout";
import { FeatureInputs } from "../ui/FeatureInputs";
import { SplitSubFeatureDetail } from "../ui/FeatureHubNavigator";
import { RefreshIconButton } from "../ui/RefreshIconButton";
import { StonegyPanel } from "../ui/StonegyPanel";
import { StonegySelect } from "../ui/StonegySelect";
import type { SubFeatureBadge } from "../ui/FeatureHubNavigator";

interface TaskPanelProps {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => Promise<void>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

const quests = listMonsterTaskQuests();

export function TaskPanel({ state, runAction, saveSettings, showFeedback }: TaskPanelProps) {
  const [selectedQuestId, setSelectedQuestId] = usePersistedField(
    state?.settings.selectedTaskQuestId != null ? String(state.settings.selectedTaskQuestId) : undefined,
    "6"
  );

  const questOptions = useMemo(
    () =>
      quests.map((quest) => ({
        value: String(quest.id),
        label: `#${quest.id} · ${quest.title} (${quest.monsterMissionCount} tasks)`,
      })),
    []
  );

  const activeTask =
    state && state.settings.selectedTaskQuestId != null
      ? getActiveTaskForQuest(state.quests.activeMonsterTasks, state.settings.selectedTaskQuestId)
      : null;

  const mission =
    activeTask && state?.settings.selectedTaskQuestId != null
      ? getMission(state.settings.selectedTaskQuestId, activeTask.missionId)
      : undefined;

  const targetHuntId =
    activeTask && state ? resolveTaskHuntId(activeTask, state.character.level) : state?.settings.taskerTargetHuntId;
  const targetHunt = targetHuntId != null ? getHuntById(targetHuntId) : undefined;

  const saveQuest = (questId: string) => {
    void saveSettings({ selectedTaskQuestId: Number(questId) || null });
  };

  const { toggleDisabled: leaveHuntToggleDisabled, runStopAfterLeaveHunt } =
    useLeaveHuntToggleCooldown();

  const { masterOn, subsDisabled, handleMasterChange } = useFeatureMasterWithStop("tasks", {
    state,
    saveSettings,
    runAction,
    showFeedback,
  });

  const handleTaskerToggle = (enabled: boolean) => {
    if (!state?.connection.connected) {
      showFeedback("Not connected to the game — open Stonegy and enter the world.", "error");
      return;
    }
    if (enabled) {
      void runAction(() =>
        sendBot("bot:start-auto-tasker", { questId: Number(selectedQuestId) || 6 })
      );
      return;
    }
    void runStopAfterLeaveHunt(state, runAction, () => sendBot("bot:stop-auto-tasker"));
  };

  const taskerBadge: SubFeatureBadge = state?.settings.autoTaskerEnabled
    ? "live"
    : masterOn
      ? "armed"
      : "off";

  return (
    <FeaturePanelLayout
      featureId="tasks"
      masterOn={masterOn}
      onMasterChange={handleMasterChange}
      showFeedback={showFeedback}
      subsDisabled={subsDisabled}
      setup={
        <FeatureInputs>
          <StonegySelect
            label="Quest line"
            value={selectedQuestId}
            options={questOptions}
            disabled={!!state?.settings.autoTaskerEnabled}
            onChange={(event) => {
              setSelectedQuestId(event.target.value);
              saveQuest(event.target.value);
            }}
          />
        </FeatureInputs>
      }
      subFeatures={[
        {
          id: "auto-tasker",
          label: "Auto tasker",
          order: 1,
          badge: taskerBadge,
          toggle: {
            checked: !!state?.settings.autoTaskerEnabled,
            disabled: !state?.connection.connected || subsDisabled || leaveHuntToggleDisabled,
            onChange: handleTaskerToggle,
          },
          action: {
            label: "Task now",
            disabled: !state?.connection.connected,
            onClick: () =>
              void runAction(() =>
                sendBot("bot:task-now", { questId: Number(selectedQuestId) || 6 })
              ),
          },
          content: (
            <SplitSubFeatureDetail
              status={
                <StonegyPanel
                  title="Task status"
                  action={
                    <RefreshIconButton
                      label="Refresh tasks"
                      disabled={!state?.connection.connected}
                      onClick={() => void runAction(() => sendBot("bot:refresh-tasks"))}
                    />
                  }
                >
                  <dl className="grid gap-2 text-xs">
                    <div>
                      <dt className="text-[var(--text-muted)]">Status</dt>
                      <dd>{state?.settings.taskerStatus || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Active task</dt>
                      <dd>{formatActiveTask(activeTask)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Target hunt</dt>
                      <dd>
                        {targetHunt
                          ? `#${targetHunt.id} · ${targetHunt.title}`
                          : targetHuntId != null
                            ? `#${targetHuntId}`
                            : "—"}
                      </dd>
                    </div>
                    {mission ? (
                      <div>
                        <dt className="text-[var(--text-muted)]">Mission</dt>
                        <dd>{mission.title}</dd>
                      </div>
                    ) : null}
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
