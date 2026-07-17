import { hasAllBlessings, nextAffordableBlessing } from "../../domain/bless";
import { canAutoHuntClaimIdle } from "../../domain/hunt/guards";
import { isStartableHuntId } from "../../hunts";
import { featureCooldown, LONG_COOLDOWN, BURST_COOLDOWN, delay } from "../commands/cooldown";
import { isPartyLeader, partyIdentity, readPartyMemberCount } from "../humanize";
import { SendMessageTypes, ReceiveMessageTypes } from "../../protocol";
import type { PartySnapshotPayload, SkillToTrain } from "../../protocol-messages";
import {
  INTERACTIVE_COMMAND_TIMEOUT_MS,
  isInActiveHunt,
  isInActiveTraining,
} from "../context-sync";
import { requestBlessSnapshot } from "../readiness";
import type { GameEvent } from "../events/types";
import {
  canRunIdleAutomation,
  isPlayerIdling,
  updatePlayerState,
} from "../player-state";
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
import type { BlessState } from "./states/bless.state";
import type { BattleService } from "./battle.service";
import type { HuntService } from "./hunt.service";

export const DEFAULT_AUTO_TRAINING_IDLE_DELAY_SEC = 5;

export type ToolsFlowPhase =
  | "idle"
  | "preparing"
  | "confirming_ready"
  | "buying_bless"
  | "accepting_invite"
  | "disbanding_party"
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
  /** True after we've seen 2+ members; used so creating a solo party to invite isn't disbanded. */
  private hadMultiplePartyMembers = false;

  /**
   * Ready-check id waiting on blessings (sync / auto-buy / manual buy).
   * Cleared after confirm, decline, or when the party ready-check disappears.
   */
  private pendingReadyCheckId: string | null = null;

  /** Prevents overlapping auto-buy runs from snapshot + ready-check kickoffs. */
  private buyingBlessings = false;

  constructor(
    ctx: ServiceContext,
    private readonly trainingState: TrainingState,
    private readonly partyState: PartyState,
    private readonly sessionState: SessionState,
    private readonly blessState: BlessState
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
      pendingReadyCheckId: this.pendingReadyCheckId,
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

  getPendingReadyCheckId(): string | null {
    return this.pendingReadyCheckId;
  }

  /** Seed runtime IDs (tests / migration). */
  seedRuntimeIds(options: {
    confirmedReadyCheckIds?: string[];
    acceptedPartyInviteIds?: string[];
    pendingReadyCheckId?: string | null;
  }): void {
    if (options.confirmedReadyCheckIds) {
      this.confirmedReadyCheckIds = [...options.confirmedReadyCheckIds];
    }
    if (options.acceptedPartyInviteIds) {
      this.acceptedPartyInviteIds = [...options.acceptedPartyInviteIds];
    }
    if (options.pendingReadyCheckId !== undefined) {
      this.pendingReadyCheckId = options.pendingReadyCheckId;
    }
  }

  start(): void {
    this.syncAutoTrainingFromSettings();
  }

  stop(): void {
    this.cancelAutoTrainingCheck();
  }

  /** Schedule or cancel the idle timer when auto-training is toggled. */
  syncAutoTrainingFromSettings(): void {
    if (this.ctx.settings.get().autoTrainingEnabled) {
      this.scheduleAutoTrainingCheck(this.resolveAutoTrainingIdleDelayMs(), {
        restart: true,
      });
      return;
    }
    this.cancelAutoTrainingCheck();
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind === "player_state_changed") {
      if (event.playerState === "idling" && this.pendingReadyCheckId) {
        // Confirm is deferred off this dispatch so the PARTY_SNAPSHOT ack can land.
        this.ctx.session.deferFromWire(() => this.tryFulfillPendingReadyCheck());
      }
      return;
    }

    if (event.kind !== "json") {
      return;
    }

    const settings = this.ctx.settings.get();

    if (isJsonEvent(event, ReceiveMessageTypes.BLESS_SNAPSHOT)) {
      this.ctx.session.deferFromWire(async () => {
        if (settings.autoBuyBless) {
          await this.buyMissingBlessings();
        }
        await this.tryFulfillPendingReadyCheck();
      });
    }

    if (
      settings.autoBuyBless &&
      isJsonEvent(event, ReceiveMessageTypes.PARTY_SNAPSHOT) &&
      !this.playerHasAllBlessings()
    ) {
      if (!this.blessState.blessSnapshotSynced) {
        requestBlessSnapshot(this.ctx.session);
      } else {
        this.ctx.session.deferFromWire(async () => {
          await this.buyMissingBlessings();
          await this.tryFulfillPendingReadyCheck();
        });
      }
    }

    if (
      isJsonEvent(event, ReceiveMessageTypes.PARTY_SNAPSHOT) &&
      this.shouldAutoConfirmPartyHunt()
    ) {
      await this.handleReadyCheck(event);
    }

    if (settings.autoAcceptPartyInvite && isJsonEvent(event, ReceiveMessageTypes.PARTY_SNAPSHOT)) {
      await this.handleAcceptPartyInvite(event);
    }

    if (settings.autoDisbandSoloParty) {
      if (isJsonEvent(event, ReceiveMessageTypes.PARTY_SNAPSHOT)) {
        const data = event.message.data as PartySnapshotPayload | undefined;
        this.notePartyMemberCount(readPartyMemberCount(data?.party));
        await this.handleDisbandPartyWhenAlone({
          memberCount: readPartyMemberCount(data?.party),
          status: typeof data?.party?.status === "string" ? data.party.status : null,
        });
      } else if (
        isJsonEvent(event, ReceiveMessageTypes.HUNT_FINISHED) ||
        isJsonEvent(event, ReceiveMessageTypes.TRAINING_FINISHED)
      ) {
        await this.handleDisbandPartyWhenAlone({
          memberCount: this.partyState.partyMemberCount,
          status: this.partyState.partyStatus,
        });
      }
    }

    if (settings.autoTrainingEnabled && AUTO_TRAINING_IDLE_EVENTS.has(event.message.type)) {
      await this.handleAutoTraining(event);
    } else if (!settings.autoTrainingEnabled) {
      this.cancelAutoTrainingCheck();
    }
  }

  /**
   * Confirm a remembered ready-check when idle with all blessings.
   * Otherwise leave pending and wait for player_state_changed / bless updates.
   */
  async tryFulfillPendingReadyCheck(): Promise<void> {
    const readyCheckId = this.pendingReadyCheckId;
    if (!readyCheckId || !this.shouldAutoConfirmPartyHunt()) {
      return;
    }
    if (this.confirmedReadyCheckIds.includes(readyCheckId)) {
      this.pendingReadyCheckId = null;
      return;
    }
    if (!this.blessState.blessSnapshotSynced) {
      requestBlessSnapshot(this.ctx.session);
      return;
    }
    if (!this.playerHasAllBlessings()) {
      if (this.ctx.settings.get().autoBuyBless) {
        await this.buyMissingBlessings();
        if (!this.playerHasAllBlessings()) {
          return;
        }
      } else {
        return;
      }
    }
    if (!isPlayerIdling(this.ctx.session)) {
      return;
    }

    await this.scheduleReadyCheckConfirm(readyCheckId);
  }

  private playerHasAllBlessings(): boolean {
    return hasAllBlessings(this.blessState.projection());
  }

  /**
   * Buy unowned blessings cheapest-first while gold allows.
   * Public so HuntService can call it before START_HUNT when autoBuyBless is on.
   */
  async buyMissingBlessings(): Promise<{ ok: boolean; error?: string; bought?: number }> {
    if (!this.ctx.settings.get().autoBuyBless) {
      return { ok: false, error: "Auto buy bless is off." };
    }
    if (this.buyingBlessings) {
      return { ok: true, bought: 0 };
    }
    if (this.playerHasAllBlessings()) {
      return { ok: true, bought: 0 };
    }
    if (!this.blessState.blessSnapshotSynced) {
      requestBlessSnapshot(this.ctx.session);
      return { ok: false, error: "awaiting_bless_sync", bought: 0 };
    }

    this.buyingBlessings = true;
    updatePlayerState(this.ctx.session, "buying_bless", "Buying blessings…");
    try {
      return await this.run("bless", () =>
        this.traceFlow("auto-buy-bless", async (trace) => {
          if (this.playerHasAllBlessings()) {
            trace.finish("skipped", { error: "already blessed" });
            return { ok: true as const, bought: 0 };
          }

          this.setFlowPhase("buying_bless", { startedAt: Date.now(), lastError: null });
          trace.setPhase("buying_bless");

          let bought = 0;
          let remainingGold = this.sessionState.goldCoins;
          while (!this.playerHasAllBlessings()) {
            const next = nextAffordableBlessing(this.blessState.blessings, remainingGold);
            trace.guard("has_affordable_blessing", next != null);
            if (!next) {
              const owned = this.blessState.ownedCount ?? 0;
              const error = `Not enough gold for remaining blessings (${owned}/7).`;
              this.setFlowPhase("failed", { lastError: error });
              this.setFlowPhase("idle", { startedAt: null });
              trace.finish("failed", { error });
              return { ok: false as const, error, bought };
            }

            const outcome = await this.ctx.session.commands.run(
              SendMessageTypes.BLESS_BUY,
              { blessingId: next.id },
              { cooldownMs: featureCooldown("tools.autoBuyBless") }
            );
            trace.command({
              type: SendMessageTypes.BLESS_BUY,
              success: outcome.success !== false && !outcome.skipped,
              skipped: outcome.skipped,
              skipReason: outcome.skipReason,
              error: outcome.success === false ? outcome.errorMessage : undefined,
            });

            if (outcome.skipped || outcome.success === false) {
              const error = outcome.errorMessage ?? "Bless buy failed.";
              this.setFlowPhase("failed", { lastError: error });
              this.setFlowPhase("idle", { startedAt: null });
              trace.finish("failed", { error });
              return { ok: false as const, error, bought };
            }

            this.blessState.markOwned(next.id);
            if (remainingGold != null) {
              remainingGold = Math.max(0, remainingGold - next.cost);
            }
            bought += 1;
          }

          void this.ctx.session.syncBlessContext({ force: true, waitForResponse: false });
          this.setFlowPhase("idle", { startedAt: null, lastError: null });
          trace.finish("ok", { result: { bought } });
          return { ok: true as const, bought };
        })
      );
    } finally {
      this.buyingBlessings = false;
      if (this.ctx.session.services.getPlayerState().playerState === "buying_bless") {
        updatePlayerState(
          this.ctx.session,
          "idling",
          this.playerHasAllBlessings() ? "Blessings ready" : "Bless buy stopped"
        );
      }
    }
  }

  /**
   * Confirm ready-checks when the Tools toggle is on, or when Hunt is mid start/restart
   * (so auto-hunt is not blocked by a party ready-check with the Tools toggle off).
   */
  private shouldAutoConfirmPartyHunt(): boolean {
    if (this.ctx.settings.get().autoConfirmPartyHunt) {
      return true;
    }
    const hunt = this.ctx.session.services.tryGet<HuntService>("hunt");
    return hunt?.isAwaitingHuntStart() === true;
  }

  /** Unresolved ready-check the helper should eventually confirm (blessings may still be missing). */
  private unresolvedReadyCheckId(data: PartySnapshotPayload | undefined): string | null {
    if (!this.shouldAutoConfirmPartyHunt()) {
      return null;
    }

    const readyCheck = data?.party?.readyCheck;
    const meId = data?.meId ?? this.sessionState.characterId;

    if (!readyCheck || typeof readyCheck.id !== "string" || !meId) {
      return null;
    }

    if (this.confirmedReadyCheckIds.includes(readyCheck.id)) {
      return null;
    }

    const memberStatuses = readyCheck.memberStatuses ?? {};
    const myStatus = memberStatuses[String(meId)];

    // Already resolved — nothing to do.
    if (myStatus === "confirmed" || myStatus === "declined") {
      return null;
    }

    // pending, absent, or any other unresolved status — eligible (leader or member).
    return readyCheck.id;
  }

  private async scheduleReadyCheckConfirm(readyCheckId: string): Promise<void> {
    // Claim immediately so duplicate snapshots don't schedule a second confirm.
    this.confirmedReadyCheckIds = [readyCheckId, ...this.confirmedReadyCheckIds].slice(0, 20);
    this.pendingReadyCheckId = null;

    // Off the wire chain so the confirm's PARTY_SNAPSHOT ack can be processed.
    this.ctx.session.deferFromWire(() =>
      this.run("party", async () => {
        await this.traceFlow("ready-check-confirm", async (confirmTrace) => {
          // Safety net — tryFulfill only runs while idle, so this is usually a no-op.
          if (isInActiveTraining(this.ctx.session)) {
            await this.finishTrainingIfActive();
            await delay(LONG_COOLDOWN);
          }

          this.setFlowPhase("confirming_ready");
          confirmTrace.setPhase("confirming_ready");

          const outcome = await this.ctx.session.commands.run(
            SendMessageTypes.PARTY_READY_CHECK_CONFIRM,
            { readyCheckId },
            { cooldownMs: featureCooldown("tools.confirmPartyHunt") }
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
            this.pendingReadyCheckId = readyCheckId;
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

  /** Track multi-member parties so we only auto-disband after others leave (not on create). */
  private notePartyMemberCount(memberCount: number | null): void {
    if (memberCount == null || memberCount <= 0) {
      this.hadMultiplePartyMembers = false;
      return;
    }
    if (memberCount >= 2) {
      this.hadMultiplePartyMembers = true;
    }
  }

  private shouldDisbandPartyWhenAlone(options: {
    memberCount: number | null;
    status: string | null | undefined;
  }): boolean {
    if (!this.ctx.settings.get().autoDisbandSoloParty) {
      return false;
    }
    if (options.memberCount !== 1 || !this.hadMultiplePartyMembers) {
      return false;
    }
    if (!isPartyLeader(this.identity())) {
      return false;
    }
    if (options.status === "hunting" || options.status === "training") {
      return false;
    }
    if (isInActiveHunt(this.ctx.session) || isInActiveTraining(this.ctx.session)) {
      return false;
    }
    return true;
  }

  private async finishTrainingIfActive(): Promise<{ finished: boolean; error?: string }> {
    if (!isInActiveTraining(this.ctx.session)) {
      return { finished: false };
    }

    return this.run("training", async () => {
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

      // Clear locally so idle gates / ready-check can proceed before TRAINING_FINISHED arrives.
      this.trainingState.applyTrainingPatch({ activeTrainingId: null });
      if (this.partyState.partyStatus === "training") {
        this.partyState.setPartyStatus("idle");
      }
      this.cancelAutoTrainingCheck();
      this.setFlowPhase("idle", { startedAt: null, lastError: null });
      updatePlayerState(this.ctx.session, "idling", "Left training");

      return { finished: true };
    });
  }

  /** Leave training when hunt (or another feature) needs the character idle. */
  async leaveTrainingIfActive(): Promise<{ finished: boolean; error?: string }> {
    return this.finishTrainingIfActive();
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
      const readyCheckId = this.unresolvedReadyCheckId(data);
      trace.guard("unresolved_ready_check", readyCheckId != null);

      if (!readyCheckId) {
        // Ready-check ended or was resolved — drop any remembered wait.
        if (data?.party != null && data.party.readyCheck == null) {
          this.pendingReadyCheckId = null;
        }
        trace.finish("skipped");
        return;
      }

      // Remember until idle + blessings are ready (player_state_changed retries).
      this.pendingReadyCheckId = readyCheckId;

      if (!this.blessState.blessSnapshotSynced) {
        requestBlessSnapshot(this.ctx.session);
        trace.guard("bless_synced", false);
        trace.finish("skipped", { error: "awaiting_bless_sync" });
        return;
      }

      if (!this.playerHasAllBlessings()) {
        trace.guard("has_all_blessings", false);
        if (this.ctx.settings.get().autoBuyBless) {
          this.ctx.session.deferFromWire(async () => {
            await this.buyMissingBlessings();
            await this.tryFulfillPendingReadyCheck();
          });
          trace.finish("ok", { result: { deferred: true, buyingBless: true, readyCheckId } });
          return;
        }
        trace.finish("skipped", { error: "missing_blessings" });
        return;
      }

      if (!isPlayerIdling(this.ctx.session)) {
        trace.guard("player_idling", false);
        // Leave training so we become idle; loot/buy_bless wait for their own state change.
        if (isInActiveTraining(this.ctx.session)) {
          this.ctx.session.deferFromWire(() =>
            this.run("party", async () => {
              this.setFlowPhase("preparing", { startedAt: Date.now() });
              await this.finishTrainingIfActive();
              await delay(LONG_COOLDOWN);
              await this.tryFulfillPendingReadyCheck();
            })
          );
          trace.finish("ok", { result: { deferred: true, leavingTraining: true, readyCheckId } });
          return;
        }
        trace.finish("skipped", { error: "awaiting_idle" });
        return;
      }

      trace.guard("player_idling", true);
      await this.tryFulfillPendingReadyCheck();
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

  private async handleDisbandPartyWhenAlone(options: {
    memberCount: number | null;
    status: string | null | undefined;
  }): Promise<void> {
    await this.traceFlow("disband-when-alone", async (trace) => {
      const shouldDisband = this.shouldDisbandPartyWhenAlone(options);
      trace.guard("should_disband", shouldDisband);
      if (!shouldDisband) {
        trace.finish("skipped");
        return;
      }

      await this.run("party", async () => {
        const current = {
          memberCount: this.partyState.partyMemberCount,
          status: this.partyState.partyStatus,
        };
        if (!this.shouldDisbandPartyWhenAlone(current)) {
          trace.finish("skipped");
          return;
        }

        this.setFlowPhase("disbanding_party", { startedAt: Date.now(), lastError: null });
        trace.setPhase("disbanding_party");

        const outcome = await this.ctx.session.commands.run(
          SendMessageTypes.PARTY_DISBAND,
          {},
          { cooldownMs: featureCooldown("tools.autoDisbandSoloParty") }
        );
        trace.command({
          type: SendMessageTypes.PARTY_DISBAND,
          success: outcome.success !== false,
          error: outcome.success === false ? outcome.errorMessage : undefined,
        });

        if (outcome.success === false) {
          this.setFlowPhase("failed", {
            lastError: outcome.errorMessage ?? "Disband party failed",
          });
          this.setFlowPhase("idle", { startedAt: null });
          trace.finish("failed", { error: outcome.errorMessage });
          return;
        }

        this.hadMultiplePartyMembers = false;
        this.setFlowPhase("idle", { startedAt: null, lastError: null });
        trace.finish("ok");
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

        if (
          this.hasActionablePartyInvite(data) ||
          this.unresolvedReadyCheckId(data) != null ||
          this.shouldDisbandPartyWhenAlone({
            memberCount: readPartyMemberCount(data?.party),
            status: typeof data?.party?.status === "string" ? data.party.status : null,
          })
        ) {
          // Party work pending — push the idle timer out.
          this.scheduleAutoTrainingCheck(LONG_COOLDOWN, { restart: true });
          trace.finish("skipped", { result: "defer_for_party_action" });
          return;
        }

        // Snapshots stream continuously (esp. on reload). Keep the existing idle
        // countdown instead of resetting it on every party_snapshot.
        this.scheduleAutoTrainingCheck(this.resolveAutoTrainingIdleDelayMs(), {
          restart: false,
        });
        trace.finish("ok", { result: "ensure_idle_timer" });
        return;
      }

      // Hunt/training finished (or idle training bootstrap) — start a fresh idle wait.
      this.scheduleAutoTrainingCheck(this.resolveAutoTrainingIdleDelayMs(), {
        restart: true,
      });
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

  /**
   * @param restart When false, leave an already-pending idle timer alone so
   *   frequent party snapshots cannot starve auto-training.
   */
  scheduleAutoTrainingCheck(
    delayMs = this.resolveAutoTrainingIdleDelayMs(),
    options: { restart?: boolean } = {}
  ): void {
    if (!this.ctx.settings.get().autoTrainingEnabled) {
      this.cancelAutoTrainingCheck();
      return;
    }

    const restart = options.restart !== false;
    if (!restart && this.autoTrainingTimer != null) {
      return;
    }

    this.cancelAutoTrainingCheck();
    this.setFlowPhase("waiting_idle", { startedAt: Date.now(), lastError: null });
    this.autoTrainingTimer = setTimeout(() => {
      this.autoTrainingTimer = null;
      void this.tryStartAutoTraining();
    }, delayMs);
  }

  /**
   * True when auto-hunt will actually claim idle time (startable hunt + leader +
   * blessings ready or auto-buy can proceed). Missing/unaffordable blessings must
   * not starve auto-training.
   */
  private willAutoHuntClaimIdle(): boolean {
    const session = this.ctx.session;
    const settings = session.settings;
    const selectedHuntId =
      session.services.tryGet<BattleService>("battle")?.selectedHuntId ??
      settings.selectedHuntId;

    return canAutoHuntClaimIdle({
      autoHuntEnabled: settings.autoHuntEnabled,
      autoTaskerEnabled: settings.autoTaskerEnabled,
      isLeader: isPartyLeader(this.identity()),
      selectedHuntId,
      huntStartable: selectedHuntId != null && isStartableHuntId(selectedHuntId),
      blessSnapshotSynced: this.blessState.blessSnapshotSynced,
      autoBuyBless: !!settings.autoBuyBless,
      goldCoins: this.sessionState.goldCoins,
      blessings: this.blessState.blessings,
      ownedCount: this.blessState.ownedCount,
    });
  }

  private hasPendingPostHuntWork(): boolean {
    const session = this.ctx.session;

    if (session.settings.autoTaskerEnabled) {
      return true;
    }

    if (this.willAutoHuntClaimIdle()) {
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
