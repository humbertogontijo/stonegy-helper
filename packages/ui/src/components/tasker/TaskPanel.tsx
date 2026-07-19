import { useMemo } from "react";
import {
  formatMonsterTaskProgress,
  isMissionTasksComplete,
  isStaleClaimTaskerStatus,
  listMonsterTaskQuests,
  previewTaskerHunt,
} from "@stonegy/helper/domain/tasks";
import { getHuntById } from "@stonegy/helper/hunts";
import type { BotState } from "@stonegy/helper/types";
import { useFeatureMasterWithStop } from "../../hooks/useFeatureMasterWithStop";
import { usePersistedField } from "../../hooks/usePersistedField";
import { useBotTransport } from "../../transport/context";
import { FeaturePanelLayout } from "../layout/FeaturePanelLayout";
import { FeatureInputs } from "../ui/FeatureInputs";
import { SplitSubFeatureDetail } from "../ui/FeatureHubNavigator";
import { RefreshIconButton } from "../ui/RefreshIconButton";
import { StonegyPanel } from "../ui/StonegyPanel";
import { StonegySelect } from "../ui/StonegySelect";
import { StonegyToggle } from "../ui/StonegyToggle";
import { SubFeatureSection } from "../ui/SubFeatureSection";
import type { SubFeatureBadge } from "../ui/FeatureHubNavigator";

interface TaskPanelProps {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => Promise<void>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

const quests = listMonsterTaskQuests();

export function TaskPanel({ state, runAction, saveSettings, showFeedback }: TaskPanelProps) {
  const { send: sendBot } = useBotTransport();
  const [selectedQuestId, setSelectedQuestId] = usePersistedField(
    state?.settings.selectedTaskQuestId != null ? String(state.settings.selectedTaskQuestId) : undefined,
    "6"
  );
  const [taskerMaxLure, setTaskerMaxLure] = usePersistedField(
    state?.settings.taskerMaxLure,
    true
  );

  const questOptions = useMemo(
    () =>
      quests.map((quest) => ({
        value: String(quest.id),
        label: `#${quest.id} · ${quest.title} (${quest.monsterMissionCount} tasks)`,
      })),
    []
  );

  const questIdNum = Number(selectedQuestId) || 6;

  const preview = useMemo(
    () =>
      previewTaskerHunt(questIdNum, {
        activeTasks: state?.quests.activeMonsterTasks ?? [],
        finishedTaskIds: state?.character.finishedTasks ?? [],
        level: state?.character.level ?? null,
      }),
    [
      questIdNum,
      state?.quests.activeMonsterTasks,
      state?.character.finishedTasks,
      state?.character.level,
    ]
  );

  const { activeTasks, mission } = preview;
  const hasActiveTasks = activeTasks.length > 0;
  const targetHuntId = preview.huntId ?? state?.settings.taskerTargetHuntId ?? null;
  const targetHunt = targetHuntId != null ? getHuntById(targetHuntId) : undefined;
  const huntIsPreview = !hasActiveTasks && preview.huntId != null;

  const statusDisplay = useMemo(() => {
    const raw = state?.settings.taskerStatus || "";
    const phase = state?.settings.taskerPhase;
    const incomplete = hasActiveTasks && !isMissionTasksComplete(activeTasks);
    const claimingOrDelivering = phase === "claiming" || phase === "delivering";

    if (incomplete && !claimingOrDelivering && isStaleClaimTaskerStatus(raw)) {
      return state?.settings.autoTaskerEnabled ? "Hunting for task" : "In progress";
    }

    return raw || "—";
  }, [
    activeTasks,
    hasActiveTasks,
    state?.settings.autoTaskerEnabled,
    state?.settings.taskerPhase,
    state?.settings.taskerStatus,
  ]);

  const saveQuest = (questId: string) => {
    void saveSettings({ selectedTaskQuestId: Number(questId) || null });
  };

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
    void runAction(() => sendBot("bot:stop-auto-tasker"));
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
          <p className="m-0 text-[11px] leading-snug text-[var(--text-muted)]">
            {huntIsPreview ? "Next hunt" : "Target hunt"}:{" "}
            <span className="text-[var(--text-body)]">
              {targetHunt
                ? `#${targetHunt.id} · ${targetHunt.title}`
                : targetHuntId != null
                  ? `#${targetHuntId}`
                  : "—"}
            </span>
            {mission && !hasActiveTasks ? (
              <>
                {" "}
                · {mission.title}
              </>
            ) : null}
          </p>
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
            disabled: !state?.connection.connected || subsDisabled,
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
              controls={
                <SubFeatureSection hideTitle lockAutomation={subsDisabled}>
                  <StonegyToggle
                    id="tasker-max-lure"
                    label="Max lure"
                    checked={taskerMaxLure}
                    disabled={subsDisabled}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setTaskerMaxLure(checked);
                      void saveSettings({ taskerMaxLure: checked });
                    }}
                  />
                </SubFeatureSection>
              }
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
                      <dd>{statusDisplay}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">
                        {hasActiveTasks ? "Mission" : "Next mission"}
                      </dt>
                      <dd>{mission?.title ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Active task</dt>
                      <dd>
                        {hasActiveTasks ? (
                          <ul className="m-0 list-none p-0">
                            {activeTasks.map((task) => (
                              <li key={`${task.missionId}-${task.monsterId ?? "x"}`}>
                                {formatMonsterTaskProgress(task)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "No active task"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">
                        {huntIsPreview ? "Next hunt" : "Target hunt"}
                      </dt>
                      <dd>
                        {targetHunt
                          ? `#${targetHunt.id} · ${targetHunt.title}`
                          : targetHuntId != null
                            ? `#${targetHuntId}`
                            : "—"}
                      </dd>
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
