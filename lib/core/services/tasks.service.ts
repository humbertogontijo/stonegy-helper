import { featureCooldown } from "../commands/cooldown";
import { isPartyLeader, partyIdentity } from "../humanize";
import { ReceiveMessageTypes, SendMessageTypes } from "../../protocol";
import {
  findNextMonsterMission,
  formatActiveTask,
  getActiveTaskForQuest,
  isTaskComplete,
  resolveTaskHuntId,
} from "../../domain/tasks";
import { isInActiveHunt, hasQuestContextData, isPartyReady } from "../context-sync";
import { QUEST_PUSH_WAIT_MS, requestQuestSnapshot, waitForPartySnapshot } from "../readiness";
import type { GameEvent } from "../events/types";
import type { TaskerPhase } from "../../types";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { TasksState } from "./states/tasks.state";
import type { SessionState } from "./states/session.state";
import type { PartyState } from "./states/party.state";
import type { HuntControlResult, HuntService } from "./hunt.service";
import type { BattleService } from "./battle.service";

/** Align with existing TaskerPhase in lib/types.ts */
export type TasksFlowPhase = TaskerPhase;

export type TasksFlowState = {
  phase: TasksFlowPhase;
  status: string;
  targetHuntId: number | null;
  busy: boolean;
  pendingClaimMissionId: number | null;
  lastError: string | null;
};

export class TasksService extends Service {
  readonly id: FeatureId = "tasks";

  private flow: TasksFlowState = {
    phase: "idle",
    status: "",
    targetHuntId: null,
    busy: false,
    pendingClaimMissionId: null,
    lastError: null,
  };

  /** Timeout handle for the sync-wait guard. */
  private taskerSyncTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    ctx: ServiceContext,
    private readonly tasksState: TasksState,
    private readonly sessionState: SessionState,
    private readonly partyState: PartyState,
    private readonly hunt: HuntService,
    private readonly battle: BattleService
  ) {
    super(ctx);
    this.pullTaskerFlowFromSettings();
  }

  private identity() {
    return partyIdentity(this.sessionState.characterId, this.partyState);
  }

  /** Hydrate local flow from settings (external writers / tests). */
  private pullTaskerFlowFromSettings(): void {
    const s = this.ctx.settings.get();
    this.flow = {
      ...this.flow,
      phase: s.taskerPhase,
      status: s.taskerStatus ?? "",
      targetHuntId: s.taskerTargetHuntId ?? null,
      lastError: s.taskerPhase === "error" ? (s.taskerStatus ?? null) : this.flow.lastError,
    };
  }

  private setTaskerFlow(
    phase: TasksFlowPhase,
    status?: string,
    extra?: Partial<
      Pick<TasksFlowState, "targetHuntId" | "busy" | "pendingClaimMissionId" | "lastError">
    >
  ): void {
    const nextStatus = status !== undefined ? status : this.flow.status;
    this.flow = {
      ...this.flow,
      phase,
      status: nextStatus,
      ...extra,
    };
    this.ctx.session.updateSettings({
      taskerPhase: phase,
      ...(status !== undefined ? { taskerStatus: status } : {}),
      ...(extra?.targetHuntId !== undefined ? { taskerTargetHuntId: extra.targetHuntId } : {}),
    });
  }

  override stop(): void {
    this.clearTaskerSyncTimeout();
  }

  snapshot(): Record<string, unknown> {
    return { ...this.flow };
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind !== "json") {
      return;
    }

    this.pullTaskerFlowFromSettings();
    const settings = this.ctx.settings.get();
    if (!settings.autoTaskerEnabled && this.flow.phase === "idle") {
      return;
    }

    const message = event.message;

    if (message.type === ReceiveMessageTypes.HUNT_FINISHED) {
      await this.handleTaskerHuntFinishedInternal();
      return;
    }

    if (
      message.type === ReceiveMessageTypes.TASKS_SNAPSHOT ||
      message.type === ReceiveMessageTypes.QUEST_ACTION_RESULT
    ) {
      await this.handleTaskerEventInternal(event);
    }
  }

  private clearTaskerSyncTimeout(): void {
    if (this.taskerSyncTimeout != null) {
      clearTimeout(this.taskerSyncTimeout);
      this.taskerSyncTimeout = null;
    }
  }

  private scheduleTaskerSyncTimeout(): void {
    this.clearTaskerSyncTimeout();
    this.taskerSyncTimeout = setTimeout(() => {
      this.taskerSyncTimeout = null;
      void this.handleTaskerSyncTimeout();
    }, QUEST_PUSH_WAIT_MS);
  }

  private async handleTaskerSyncTimeout(): Promise<void> {
    await this.traceFlow("sync-timeout", async (trace) => {
      this.pullTaskerFlowFromSettings();
      const session = this.ctx.session;
      const enabled = session.settings.autoTaskerEnabled;
      const syncing = this.flow.phase === "syncing";
      trace.guard("auto_tasker_enabled", enabled);
      trace.guard("phase_syncing", syncing);
      if (!enabled || !syncing) {
        trace.finish("skipped");
        return;
      }

      this.setTaskerFlow("error", "Could not sync tasks.", { lastError: "Could not sync tasks." });
      session.updateSettings({
        autoTaskerEnabled: false,
        autoHuntEnabled: false,
      });
      trace.finish("timeout");
    });
  }

  private beginTaskerSync(status: string): void {
    this.setTaskerFlow("syncing", status);
    requestQuestSnapshot(this.ctx.session);
    this.scheduleTaskerSyncTimeout();
  }

  async advanceTasker(): Promise<void> {
    await this.traceFlow("advance", async (trace) => {
      this.pullTaskerFlowFromSettings();

      trace.guard("busy", !this.flow.busy);
      if (this.flow.busy) {
        trace.finish("skipped");
        return;
      }

      const session = this.ctx.session;
      const settings = session.settings;

      trace.guard("auto_tasker_enabled", settings.autoTaskerEnabled);
      if (!settings.autoTaskerEnabled) {
        trace.finish("skipped");
        return;
      }

      const blocked =
        this.flow.phase === "delivering" || this.flow.phase === "claiming";
      trace.guard("not_delivering_or_claiming", !blocked, this.flow.phase);
      if (blocked) {
        trace.finish("skipped");
        return;
      }

      this.flow = { ...this.flow, busy: true };
      trace.setPhase(this.flow.phase);

      try {
        const questId = settings.selectedTaskQuestId;
        if (questId == null) {
          this.setTaskerFlow("error", "Select a quest to run.", {
            lastError: "Select a quest to run.",
          });
          session.updateSettings({ autoTaskerEnabled: false });
          trace.finish("failed", { error: "Select a quest to run." });
          return;
        }

        const activeTask = getActiveTaskForQuest(this.tasksState.tasks, questId);

        if (!activeTask) {
          const phase = this.flow.phase;

          if (phase === "starting") {
            trace.finish("skipped", { result: "waiting_for_task" });
            return;
          }

          if (phase === "idle") {
            if (!hasQuestContextData(session) && !isInActiveHunt(session)) {
              this.beginTaskerSync("Syncing tasks…");
              trace.setPhase("syncing");
              return;
            }
            this.setTaskerFlow("syncing", "Syncing tasks…");
          } else if (phase !== "syncing") {
            trace.finish("skipped", { result: phase });
            return;
          }

          if (!hasQuestContextData(session)) {
            trace.finish("skipped", { result: "awaiting_quest_context" });
            return;
          }

          this.clearTaskerSyncTimeout();

          const nextMission = findNextMonsterMission(questId, {
            finishedTaskIds: this.sessionState.finishedTasks,
            level: this.sessionState.level,
            afterMissionId: this.flow.pendingClaimMissionId,
          });

          this.flow = { ...this.flow, pendingClaimMissionId: null };

          if (!nextMission) {
            this.setTaskerFlow("done", "All monster tasks complete for this quest.");
            session.updateSettings({
              autoTaskerEnabled: false,
              autoHuntEnabled: false,
            });
            return;
          }

          this.setTaskerFlow("starting", `Starting ${nextMission.title}…`);
          trace.setPhase("starting");
          const outcome = await session.commands.run(
            SendMessageTypes.QUEST_START_MONSTER_TASK,
            { questId, missionId: nextMission.id },
            { cooldownMs: featureCooldown("tasks.autoTasker") }
          );
          trace.command({
            type: SendMessageTypes.QUEST_START_MONSTER_TASK,
            success: outcome.success !== false,
            error: outcome.success === false ? outcome.errorMessage : undefined,
          });
          return;
        }

        this.clearTaskerSyncTimeout();

        if (!isTaskComplete(activeTask)) {
          const huntId = resolveTaskHuntId(activeTask, this.sessionState.level);
          if (huntId == null) {
            this.setTaskerFlow("error", "No hunt found for the current task.", {
              lastError: "No hunt found for the current task.",
            });
            session.updateSettings({
              autoTaskerEnabled: false,
              autoHuntEnabled: false,
            });
            trace.finish("failed", { error: "No hunt found for the current task." });
            return;
          }

          this.setTaskerFlow(
            "hunting",
            `Hunting ${formatActiveTask(activeTask)} at hunt #${huntId}`,
            { targetHuntId: huntId }
          );
          session.updateSettings({ autoHuntEnabled: true });
          this.battle.setSelectedHuntId(huntId);
          trace.setPhase("hunting");

          const identity = this.identity();
          if (!isInActiveHunt(session) && isPartyLeader(identity)) {
            await this.hunt.startHunt(huntId);
          } else if (
            isInActiveHunt(session) &&
            isPartyLeader(identity) &&
            this.battle.shouldAutoLockLure()
          ) {
            await this.battle.lockLureForHunt(huntId);
          }
          return;
        }

        if (isInActiveHunt(session)) {
          this.setTaskerFlow("hunting", "Task complete — finishing current hunt…");
          session.updateSettings({ autoHuntEnabled: false });
          trace.setPhase("hunting");
          return;
        }

        this.setTaskerFlow("delivering", "Delivering task…");
        session.updateSettings({ autoHuntEnabled: false });
        this.flow = { ...this.flow, pendingClaimMissionId: activeTask.missionId };
        trace.setPhase("delivering");
        const deliverOutcome = await session.commands.run(
          SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
          { questId: activeTask.questId, missionId: activeTask.missionId },
          { cooldownMs: featureCooldown("tasks.autoTasker") }
        );
        trace.command({
          type: SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
          success: deliverOutcome.success !== false,
          error:
            deliverOutcome.success === false ? deliverOutcome.errorMessage : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.setTaskerFlow("error", message, { lastError: message });
        this.ctx.session.updateSettings({
          autoTaskerEnabled: false,
          autoHuntEnabled: false,
        });
        throw error;
      } finally {
        this.flow = { ...this.flow, busy: false };
      }
    });
  }

  private async handleTaskerEventInternal(event: GameEvent): Promise<void> {
    if (event.kind !== "json") {
      return;
    }

    this.pullTaskerFlowFromSettings();
    const session = this.ctx.session;
    const settings = session.settings;
    const message = event.message;

    if (message.type === ReceiveMessageTypes.TASKS_SNAPSHOT) {
      if (this.flow.phase === "starting") {
        this.setTaskerFlow("syncing", "Task started — syncing…");
      }
      await this.advanceTasker();
      return;
    }

    if (message.type === ReceiveMessageTypes.QUEST_ACTION_RESULT) {
      const data = message.data ?? {};
      const action = data.action;
      const success = data.success === true;
      const resultMessage = typeof data.message === "string" ? data.message : "";

      if (!success) {
        this.setTaskerFlow("error", resultMessage || "Task action failed.", {
          lastError: resultMessage || "Task action failed.",
        });
        session.updateSettings({
          autoTaskerEnabled: false,
          autoHuntEnabled: false,
        });
        return;
      }

      if (action === "start_monster_task") {
        this.setTaskerFlow("starting", resultMessage || "Task started.");
        await this.advanceTasker();
        return;
      }

      if (action === "deliver_monster_task") {
        await this.traceFlow("claim", async (trace) => {
          const questId = settings.selectedTaskQuestId;
          const missionId = this.flow.pendingClaimMissionId;
          trace.guard("has_quest_id", questId != null);
          trace.guard("has_mission_id", missionId != null);
          if (questId == null || missionId == null) {
            trace.finish("skipped");
            await this.advanceTasker();
            return;
          }

          this.setTaskerFlow("claiming", resultMessage || "Claiming reward…");
          trace.setPhase("claiming");
          const outcome = await session.commands.run(
            SendMessageTypes.QUEST_CLAIM_REWARD,
            { questId, missionId, selectedChoiceId: null },
            { cooldownMs: featureCooldown("tasks.autoTasker") }
          );
          trace.command({
            type: SendMessageTypes.QUEST_CLAIM_REWARD,
            success: outcome.success !== false,
            error: outcome.success === false ? outcome.errorMessage : undefined,
          });
        });
        return;
      }

      if (action === "claim_reward") {
        this.beginTaskerSync(resultMessage || "Reward claimed — next task…");
      }
    }
  }

  private async handleTaskerHuntFinishedInternal(): Promise<void> {
    if (!this.ctx.session.settings.autoTaskerEnabled) {
      return;
    }
    this.beginTaskerSync("Hunt finished — syncing task…");
  }

  async handleTaskerHuntFinished(): Promise<void> {
    await this.handleTaskerHuntFinishedInternal();
  }

  async handleTaskerEvent(event: GameEvent): Promise<void> {
    await this.handleTaskerEventInternal(event);
  }

  async startAutoTasker(): Promise<void> {
    this.flow = { ...this.flow, pendingClaimMissionId: null };
    this.clearTaskerSyncTimeout();
    this.setTaskerFlow("idle", "Starting tasker…", {
      targetHuntId: this.flow.targetHuntId,
      lastError: null,
    });
    this.ctx.session.updateSettings({
      autoTaskerEnabled: true,
      autoHuntEnabled: false,
    });
    await this.advanceTasker();
  }

  stopAutoTasker(): void {
    this.flow = { ...this.flow, pendingClaimMissionId: null };
    this.clearTaskerSyncTimeout();
    this.setTaskerFlow("idle", "Tasker stopped.", {
      targetHuntId: null,
      lastError: null,
    });
    this.ctx.session.updateSettings({
      autoTaskerEnabled: false,
      autoHuntEnabled: false,
    });
  }

  /** Enable auto tasker: validates party/leader, then starts the tasker loop. */
  async enableAutoTasker(questId: number): Promise<HuntControlResult> {
    const session = this.ctx.session;

    if (!Number.isFinite(questId) || questId <= 0) {
      return { ok: false, error: "Select a quest line first." };
    }

    if (!session.connected) {
      return { ok: false, error: "Not connected to the game — open Stonegy and enter the world." };
    }

    if (session.settings.autoHuntEnabled && !session.settings.autoTaskerEnabled) {
      return {
        ok: false,
        error: "Stop auto hunt first — only one hunt automation can run at a time.",
      };
    }

    if (!isPartyReady(session)) {
      try {
        await waitForPartySnapshot(session);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Could not sync party status.",
        };
      }
    }

    if (!this.sessionState.characterId) {
      return {
        ok: false,
        error: "Character not synced — reload the game tab.",
      };
    }

    if (!this.partyState.partySnapshotSynced) {
      return { ok: false, error: "Could not sync party status — try Refresh hunt." };
    }

    if (!isPartyLeader(this.identity())) {
      return { ok: false, error: "Only the party leader can run auto tasker." };
    }

    session.updateSettings({ selectedTaskQuestId: questId });
    await this.startAutoTasker();

    this.pullTaskerFlowFromSettings();
    const nextState = session.botState;
    if (this.flow.phase === "error") {
      return {
        ok: false,
        error: this.flow.status || "Tasker failed to start.",
        state: nextState,
      };
    }

    return {
      ok: true,
      message: this.flow.status || "Auto tasker started.",
      state: nextState,
    };
  }

  /** Disable auto tasker: stops the loop and leaves an active hunt if needed. */
  async disableAutoTasker(): Promise<HuntControlResult> {
    const session = this.ctx.session;
    this.pullTaskerFlowFromSettings();
    const phase = this.flow.phase;
    if (phase === "delivering" || phase === "claiming") {
      return {
        ok: false,
        error:
          phase === "delivering"
            ? "Cannot stop while delivering a task — wait for delivery to finish."
            : "Cannot stop while claiming a reward — wait for the claim to finish.",
      };
    }

    if (!session.settings.autoTaskerEnabled) {
      return { ok: true, message: "Auto tasker is already off.", state: session.botState };
    }

    this.stopAutoTasker();

    if (isInActiveHunt(session)) {
      await this.hunt.leaveHuntIfActive();
    }

    return { ok: true, message: "Auto tasker stopped.", state: session.botState };
  }

  /** Manual "Task now" from the popup — one step without enabling the auto loop. */
  async runTaskNow(questId: number): Promise<HuntControlResult> {
    const session = this.ctx.session;

    if (!Number.isFinite(questId) || questId <= 0) {
      return { ok: false, error: "Select a quest line first." };
    }

    if (!session.connected) {
      return { ok: false, error: "Not connected to the game — open Stonegy and enter the world." };
    }

    if (this.flow.busy || this.flow.phase === "delivering" || this.flow.phase === "claiming") {
      return { ok: false, error: "Tasker is busy — wait for the current step to finish." };
    }

    if (!isPartyReady(session)) {
      try {
        await waitForPartySnapshot(session);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Could not sync party status.",
        };
      }
    }

    if (!this.sessionState.characterId) {
      return { ok: false, error: "Character not synced — reload the game tab." };
    }

    if (!isPartyLeader(this.identity())) {
      return { ok: false, error: "Only the party leader can run tasks." };
    }

    session.updateSettings({ selectedTaskQuestId: questId });

    if (!hasQuestContextData(session)) {
      requestQuestSnapshot(session);
      return { ok: false, error: "Syncing tasks — try Task now again in a moment." };
    }

    const activeTask = getActiveTaskForQuest(this.tasksState.tasks, questId);

    if (!activeTask) {
      const nextMission = findNextMonsterMission(questId, {
        finishedTaskIds: this.sessionState.finishedTasks,
        level: this.sessionState.level,
      });
      if (!nextMission) {
        return { ok: false, error: "All monster tasks complete for this quest." };
      }

      this.setTaskerFlow("starting", `Starting ${nextMission.title}…`);
      const outcome = await session.commands.run(
        SendMessageTypes.QUEST_START_MONSTER_TASK,
        { questId, missionId: nextMission.id },
        { force: true, cooldownMs: featureCooldown("tasks.autoTasker") }
      );
      if (outcome.success === false) {
        const error = outcome.errorMessage ?? "Failed to start task.";
        this.setTaskerFlow("error", error, { lastError: error });
        return { ok: false, error, state: session.botState };
      }
      return {
        ok: true,
        message: `Started ${nextMission.title}.`,
        state: session.botState,
      };
    }

    if (!isTaskComplete(activeTask)) {
      const huntId = resolveTaskHuntId(activeTask, this.sessionState.level);
      if (huntId == null) {
        return { ok: false, error: "No hunt found for the current task." };
      }

      this.battle.setSelectedHuntId(huntId);
      this.setTaskerFlow("hunting", `Hunting ${formatActiveTask(activeTask)} at hunt #${huntId}`, {
        targetHuntId: huntId,
      });

      if (isInActiveHunt(session)) {
        return {
          ok: true,
          message: "Already hunting for the current task.",
          state: session.botState,
        };
      }

      const result = await this.hunt.startHunt(huntId, { force: true });
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Failed to start hunt.", state: session.botState };
      }
      return {
        ok: true,
        message: `Started hunt #${huntId} for ${formatActiveTask(activeTask)}.`,
        state: session.botState,
      };
    }

    if (isInActiveHunt(session)) {
      return {
        ok: false,
        error: "Task complete — finish or leave the current hunt before delivering.",
      };
    }

    this.setTaskerFlow("delivering", "Delivering task…");
    this.flow = { ...this.flow, pendingClaimMissionId: activeTask.missionId };
    const deliverOutcome = await session.commands.run(
      SendMessageTypes.QUEST_DELIVER_MONSTER_TASK,
      { questId: activeTask.questId, missionId: activeTask.missionId },
      { force: true, cooldownMs: featureCooldown("tasks.autoTasker") }
    );
    if (deliverOutcome.success === false) {
      const error = deliverOutcome.errorMessage ?? "Failed to deliver task.";
      this.setTaskerFlow("error", error, { lastError: error });
      return { ok: false, error, state: session.botState };
    }
    return { ok: true, message: "Delivering task…", state: session.botState };
  }
}
