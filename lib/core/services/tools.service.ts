import { featureCooldown, LONG_COOLDOWN, BURST_COOLDOWN, delay } from "../commands/cooldown";
import { isPartyLeader, partyIdentity, readPartyMemberCount } from "../humanize";
import { SendMessageTypes, ReceiveMessageTypes } from "../../protocol";
import type { PartySnapshotPayload, SkillToTrain } from "../../protocol-messages";
import {
  INTERACTIVE_COMMAND_TIMEOUT_MS,
  isInActiveHunt,
  isInActiveTraining,
} from "../context-sync";
import type { GameEvent } from "../events/types";
import { canRunIdleAutomation } from "../player-state";
import { isPartyInviteSenderAllowed } from "../../domain/party/invite-filter";
import {
  defaultAutoTrainingSkill,
  shouldCancelAutoTrainingIdleCheck,
} from "../../domain/tools/auto-training";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { TrainingState } from "./states/training.state";
import type { PartyState } from "./states/party.state";
import type { SessionState } from "./states/session.state";
import type { HuntService } from "./hunt.service";

export const DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC = 5;

export type ToolsFlowPhase =
  | "idle"
  | "preparing"
  | "confirming_ready"
  | "accepting_invite"
  | "waiting_idle"
  | "starting_training"
  | "training_active"
  | "failed";

export type ToolsFlowState = {
  phase: ToolsFlowPhase;
  startedAt: number | null;
  lastError: string | null;
};

const ACTIVE_TASKER_PHASES = new Set([
  "syncing",
  "starting",
  "hunting",
  "delivering",
  "claiming",
]);

const AUTO_TRAINING_IDLE_EVENTS: ReadonlySet<string> = new Set([
  ReceiveMessageTypes.HUNT_FINISHED,
  ReceiveMessageTypes.TRAINING_FINISHED,
  ReceiveMessageTypes.TRAINING_BOOTSTRAP,
  ReceiveMessageTypes.PARTY_SNAPSHOT,
]);

function isJsonEvent(event: GameEvent, type: string): boolean {
  return event.kind === "json" && event.message.type === type;
}

export { shouldCancelAutoTrainingIdleCheck, defaultAutoTrainingSkill };

export class ToolsService extends Service {
  readonly id: FeatureId = "tools";

  private flow: ToolsFlowState = {
    phase: "idle",
    startedAt: null,
    lastError: null,
  };

  /** Runtime-only — not user preferences. */
  private confirmedReadyCheckIds: string[] = [];
  private acceptedPartyInviteIds: string[] = [];
  private autoTrainingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    ctx: ServiceContext,
    private readonly trainingState: TrainingState,
    private readonly partyState: PartyState,
    private readonly sessionState: SessionState
  ) {
    super(ctx);
  }

  private identity() {
    return partyIdentity(this.sessionState.characterId, this.partyState);
  }

  private setFlowPhase(
    phase: ToolsFlowPhase,
    patch: Partial<Pick<ToolsFlowState, "startedAt" | "lastError">> = {}
  ): void {
    this.flow = {
      phase,
      startedAt: patch.startedAt !== undefined ? patch.startedAt : this.flow.startedAt,
      lastError: patch.lastError !== undefined ? patch.lastError : this.flow.lastError,
    };
  }

  snapshot(): Record<string, unknown> {
    return {
      toolsFlow: { ...this.flow },
      confirmedReadyCheckIds: [...this.confirmedReadyCheckIds],
      acceptedPartyInviteIds: [...this.acceptedPartyInviteIds],
      autoTrainingPending: this.autoTrainingTimer != null,
    };
  }

  /** Test/helper accessors for runtime ID lists. */
  getConfirmedReadyCheckIds(): string[] {
    return [...this.confirmedReadyCheckIds];
  }

  getAcceptedPartyInviteIds(): string[] {
    return [...this.acceptedPartyInviteIds];
  }

  /** Seed runtime IDs (tests / migration). */
  seedRuntimeIds(options: {
    confirmedReadyCheckIds?: string[];
    acceptedPartyInviteIds?: string[];
  }): void {
    if (options.confirmedReadyCheckIds) {
      this.confirmedReadyCheckIds = [...options.confirmedReadyCheckIds];
    }
    if (options.acceptedPartyInviteIds) {
      this.acceptedPartyInviteIds = [...options.acceptedPartyInviteIds];
    }
  }

  stop(): void {
    this.cancelAutoTrainingCheck();
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind !== "json") {
      return;
    }

    const settings = this.ctx.settings.get();

    if (
      isJsonEvent(event, ReceiveMessageTypes.PARTY_SNAPSHOT) &&
      this.shouldAutoConfirmReadyCheck()
    ) {
      await this.handleReadyCheck(event);
    }

    if (settings.autoAcceptPartyInvite && isJsonEvent(event, ReceiveMessageTypes.PARTY_SNAPSHOT)) {
      await this.handleAcceptPartyInvite(event);
    }

    if (settings.autoTrainingEnabled && AUTO_TRAINING_IDLE_EVENTS.has(event.message.type)) {
      await this.handleAutoTraining(event);
    } else if (!settings.autoTrainingEnabled) {
      this.cancelAutoTrainingCheck();
    }
  }

  /**
   * Confirm ready-checks when the Tools toggle is on, or when Hunt is mid start/restart
   * (so auto-hunt is not blocked by a party ready-check with the Tools toggle off).
   */
  private shouldAutoConfirmReadyCheck(): boolean {
    if (this.ctx.settings.get().autoConfirmReadyCheck) {
      return true;
    }
    const hunt = this.ctx.session.services.tryGet<HuntService>("hunt");
    return hunt?.isAwaitingHuntStart() === true;
  }

  private hasActionableReadyCheck(data: PartySnapshotPayload | undefined): boolean {
    if (!this.shouldAutoConfirmReadyCheck()) {
      return false;
    }

    const readyCheck = data?.party?.readyCheck;
    const meId = data?.meId ?? this.sessionState.characterId;

    if (!readyCheck || typeof readyCheck.id !== "string" || !meId) {
      return false;
    }

    if (this.confirmedReadyCheckIds.includes(readyCheck.id)) {
      return false;
    }

    const memberStatuses = readyCheck.memberStatuses ?? {};
    const myStatus = memberStatuses[String(meId)];

    // Already resolved — nothing to do.
    if (myStatus === "confirmed" || myStatus === "declined") {
      return false;
    }

    // pending, absent, or any other unresolved status — confirm (leader or member).
    return true;
  }

  private findPendingPartyInvite(data: PartySnapshotPayload | undefined) {
    const settings = this.ctx.settings.get();
    const invites = data?.receivedInvites ?? [];
    return (
      invites.find(
        (invite) =>
          typeof invite.id === "string" &&
          invite.id.length > 0 &&
          !this.acceptedPartyInviteIds.includes(invite.id) &&
          isPartyInviteSenderAllowed(
            invite.sender?.name,
            settings.partyInviteAcceptMode,
            settings.partyInviteAllowlistNames
          )
      ) ?? null
    );
  }

  private hasActionablePartyInvite(data: PartySnapshotPayload | undefined): boolean {
    if (!this.ctx.settings.get().autoAcceptPartyInvite) {
      return false;
    }
    const memberCount = readPartyMemberCount(data?.party);
    if (memberCount != null && memberCount > 0) {
      return false;
    }
    return this.findPendingPartyInvite(data) != null;
  }

  private async finishTrainingIfActive(): Promise<{ finished: boolean; error?: string }> {
    if (!isInActiveTraining(this.ctx.session)) {
      return { finished: false };
    }

    const trainingId = this.trainingState.activeTrainingId;
    const outcome = await this.ctx.session.commands.run(SendMessageTypes.FINISH_TRAINING, {}, {
      timeoutMs: INTERACTIVE_COMMAND_TIMEOUT_MS,
      cooldownMs: featureCooldown("tools.autoTraining"),
    });

    if (outcome.success === false) {
      return { finished: false, error: outcome.errorMessage ?? "Failed to finish training." };
    }

    if (trainingId) {
      await this.ctx.session.commands.run(
        SendMessageTypes.TRAINING_PRESENCE_UNSUBSCRIBE,
        { trainingId },
        { cooldownMs: BURST_COOLDOWN }
      );
    }

    return { finished: true };
  }

  private async leaveActivityBeforePartyAction(options: {
    leaveHunt?: boolean;
  } = {}): Promise<void> {
    const session = this.ctx.session;
    const leaveHunt = options.leaveHunt !== false;
    if (leaveHunt && isInActiveHunt(session)) {
      await session.services.get<HuntService>("hunt").leaveHuntIfActive();
      return;
    }

    if (isInActiveTraining(session)) {
      await this.finishTrainingIfActive();
    }
  }

  private async prepareForPartyAction(options: { leaveHunt?: boolean } = {}): Promise<void> {
    const session = this.ctx.session;
    const leaveHunt = options.leaveHunt !== false;
    const needsHuntPrep = leaveHunt && isInActiveHunt(session);
    const needsTrainingPrep = isInActiveTraining(session);
    if (!needsHuntPrep && !needsTrainingPrep) {
      return;
    }

    this.setFlowPhase("preparing", { startedAt: Date.now() });
    await this.leaveActivityBeforePartyAction({ leaveHunt });
    await delay(LONG_COOLDOWN);
  }

  private async handleReadyCheck(event: GameEvent): Promise<void> {
    if (event.kind !== "json") {
      return;
    }

    await this.traceFlow("ready-check", async (trace) => {
      const data = event.message.data as PartySnapshotPayload | undefined;
      const actionable = this.hasActionableReadyCheck(data);
      trace.guard("actionable_ready_check", actionable);
      if (!actionable) {
        trace.finish("skipped");
        return;
      }

      const readyCheck = data?.party?.readyCheck;
      if (!readyCheck || typeof readyCheck.id !== "string") {
        trace.finish("skipped");
        return;
      }

      // Confirm off the wire chain so the confirm's PARTY_SNAPSHOT ack can be processed.
      const readyCheckId = readyCheck.id;
      // Claim immediately so duplicate snapshots don't schedule a second confirm.
      this.confirmedReadyCheckIds = [readyCheckId, ...this.confirmedReadyCheckIds].slice(0, 20);
      this.ctx.session.deferFromWire(() =>
        this.run("party", async () => {
          await this.traceFlow("ready-check-confirm", async (confirmTrace) => {
            await this.prepareForPartyAction({ leaveHunt: false });
            this.setFlowPhase("confirming_ready");
            confirmTrace.setPhase("confirming_ready");

            const outcome = await this.ctx.session.commands.run(
              SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
              { readyCheckId },
              { cooldownMs: featureCooldown("tools.readyCheck") }
            );
            confirmTrace.command({
              type: SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
              success: outcome.success !== false,
              error: outcome.success === false ? outcome.errorMessage : undefined,
            });

            if (outcome.success === false) {
              this.confirmedReadyCheckIds = this.confirmedReadyCheckIds.filter(
                (id) => id !== readyCheckId
              );
              this.setFlowPhase("failed", {
                lastError: outcome.errorMessage ?? "Ready check confirm failed",
              });
              this.setFlowPhase("idle", { startedAt: null });
              confirmTrace.finish("failed", { error: outcome.errorMessage });
              return;
            }

            this.setFlowPhase("idle", { startedAt: null, lastError: null });
          });
        })
      );

      trace.finish("ok", { result: { deferred: true, readyCheckId } });
    });
  }

  private async handleAcceptPartyInvite(event: GameEvent): Promise<void> {
    if (event.kind !== "json") {
      return;
    }

    await this.traceFlow("accept-invite", async (trace) => {
      const data = event.message.data as PartySnapshotPayload | undefined;
      const memberCount = readPartyMemberCount(data?.party);
      const notInParty = memberCount == null || memberCount <= 0;
      trace.guard("not_in_party", notInParty);
      if (!notInParty) {
        trace.finish("skipped");
        return;
      }

      const pending = this.findPendingPartyInvite(data);
      trace.guard("has_pending_invite", pending != null);
      if (!pending) {
        trace.finish("skipped");
        return;
      }

      await this.run("party", async () => {
        await this.prepareForPartyAction();
        this.setFlowPhase("accepting_invite");
        trace.setPhase("accepting_invite");

        const outcome = await this.ctx.session.commands.run(
          SendMessageTypes.PARTY_ACCEPT_INVITE,
          { inviteId: pending.id },
          { cooldownMs: featureCooldown("tools.acceptPartyInvite") }
        );
        trace.command({
          type: SendMessageTypes.PARTY_ACCEPT_INVITE,
          success: outcome.success !== false,
          error: outcome.success === false ? outcome.errorMessage : undefined,
        });

        if (outcome.success === false) {
          this.setFlowPhase("failed", {
            lastError: outcome.errorMessage ?? "Accept invite failed",
          });
          this.setFlowPhase("idle", { startedAt: null });
          trace.finish("failed", { error: outcome.errorMessage });
          return;
        }

        this.acceptedPartyInviteIds = [pending.id, ...this.acceptedPartyInviteIds].slice(0, 20);
        this.setFlowPhase("idle", { startedAt: null, lastError: null });
      });
    });
  }

  private async handleAutoTraining(event: GameEvent): Promise<void> {
    if (event.kind !== "json" || !this.ctx.settings.get().autoTrainingEnabled) {
      this.cancelAutoTrainingCheck();
      return;
    }

    await this.traceFlow("auto-training", async (trace) => {
      const messageType = event.message.type;
      const trainingPresent =
        messageType === ReceiveMessageTypes.TRAINING_BOOTSTRAP &&
        event.message.data?.training != null;

      const cancel = shouldCancelAutoTrainingIdleCheck(messageType, trainingPresent);
      trace.guard("should_cancel", !cancel);
      if (cancel) {
        this.cancelAutoTrainingCheck();
        this.setFlowPhase("idle", { startedAt: null });
        trace.finish("skipped", { result: "cancel_idle_check" });
        return;
      }

      if (isJsonEvent(event, ReceiveMessageTypes.PARTY_SNAPSHOT)) {
        const data = event.message.data as PartySnapshotPayload | undefined;
        const status = data?.party?.status;
        if (status === "hunting" || status === "training") {
          this.cancelAutoTrainingCheck();
          this.setFlowPhase(
            status === "training" ? "training_active" : "idle",
            { startedAt: null }
          );
          trace.finish("skipped", { result: status });
          return;
        }

        if (this.hasActionablePartyInvite(data) || this.hasActionableReadyCheck(data)) {
          this.scheduleAutoTrainingCheck(LONG_COOLDOWN);
          trace.finish("skipped", { result: "defer_for_party_action" });
          return;
        }
      }

      this.scheduleAutoTrainingCheck();
    });
  }

  resolveAutoTrainingIdleDelayMs(): number {
    const seconds =
      this.ctx.settings.get().autoTrainingIdleDelaySec ?? DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC;
    return Math.max(1, seconds) * 1_000;
  }

  cancelAutoTrainingCheck(): void {
    if (this.autoTrainingTimer != null) {
      clearTimeout(this.autoTrainingTimer);
      this.autoTrainingTimer = null;
    }
    if (this.flow.phase === "waiting_idle") {
      this.setFlowPhase("idle", { startedAt: null });
    }
  }

  scheduleAutoTrainingCheck(delayMs = this.resolveAutoTrainingIdleDelayMs()): void {
    if (!this.ctx.settings.get().autoTrainingEnabled) {
      this.cancelAutoTrainingCheck();
      return;
    }

    this.cancelAutoTrainingCheck();
    this.setFlowPhase("waiting_idle", { startedAt: Date.now(), lastError: null });
    this.autoTrainingTimer = setTimeout(() => {
      this.autoTrainingTimer = null;
      void this.tryStartAutoTraining();
    }, delayMs);
  }

  private hasPendingPostHuntWork(): boolean {
    const session = this.ctx.session;

    if (session.settings.autoTaskerEnabled) {
      return true;
    }

    if (
      session.settings.autoHuntEnabled &&
      !session.settings.autoTaskerEnabled &&
      isPartyLeader(this.identity())
    ) {
      return true;
    }

    if (ACTIVE_TASKER_PHASES.has(session.settings.taskerPhase)) {
      return true;
    }

    if (!canRunIdleAutomation(session)) {
      return true;
    }

    return false;
  }

  canAutoTrain(): boolean {
    const session = this.ctx.session;
    if (!session.connected) {
      return false;
    }
    if (!session.settings.autoTrainingEnabled) {
      return false;
    }

    if (isInActiveHunt(session) || isInActiveTraining(session)) {
      return false;
    }

    if (this.hasPendingPostHuntWork()) {
      return false;
    }

    return true;
  }

  async tryStartAutoTraining(): Promise<void> {
    await this.traceFlow("start-training", async (trace) => {
      const canTrain = this.canAutoTrain();
      const alreadyStarting = this.flow.phase === "starting_training";
      trace.guard("can_auto_train", canTrain);
      trace.guard("not_already_starting", !alreadyStarting);
      if (!canTrain || alreadyStarting) {
        if (this.flow.phase === "waiting_idle") {
          this.setFlowPhase("idle", { startedAt: null });
        }
        trace.finish("skipped");
        return;
      }

      await this.run("training", async () => {
        if (!this.canAutoTrain() || this.flow.phase === "starting_training") {
          trace.finish("skipped");
          return;
        }

        this.setFlowPhase("starting_training", { startedAt: Date.now() });
        trace.setPhase("starting_training");
        let leftStartingPhase = false;
        try {
          if (!this.canAutoTrain()) {
            this.setFlowPhase("idle", { startedAt: null });
            leftStartingPhase = true;
            trace.finish("skipped");
            return;
          }

          const skillToTrain: SkillToTrain =
            this.ctx.settings.get().autoTrainingSkillToTrain ?? defaultAutoTrainingSkill();

          const outcome = await this.ctx.session.commands.run(
            SendMessageTypes.START_TRAINING,
            {
              trainingType: "DEFAULT",
              exerciseWeaponBoostId: null,
              skillToTrain,
            },
            {
              timeoutMs: INTERACTIVE_COMMAND_TIMEOUT_MS,
              cooldownMs: featureCooldown("tools.autoTraining"),
            }
          );
          trace.command({
            type: SendMessageTypes.START_TRAINING,
            success: outcome.success !== false,
            error: outcome.success === false ? outcome.errorMessage : undefined,
          });

          if (outcome.success === false) {
            this.setFlowPhase("failed", {
              lastError: outcome.errorMessage ?? "Start training failed",
            });
            this.setFlowPhase("idle", { startedAt: null });
            leftStartingPhase = true;
            trace.finish("failed", { error: outcome.errorMessage });
            return;
          }

          const trainingId = this.trainingState.activeTrainingId;
          if (trainingId) {
            const sub = await this.ctx.session.commands.run(
              SendMessageTypes.TRAINING_PRESENCE_SUBSCRIBE,
              { trainingId },
              { cooldownMs: BURST_COOLDOWN }
            );
            trace.command({
              type: SendMessageTypes.TRAINING_PRESENCE_SUBSCRIBE,
              success: sub.success !== false,
              error: sub.success === false ? sub.errorMessage : undefined,
            });
          }

          this.setFlowPhase("training_active", { lastError: null });
          leftStartingPhase = true;
        } finally {
          if (!leftStartingPhase) {
            this.setFlowPhase("idle", { startedAt: null });
          }
        }
      });
    });
  }
}
