import { hasAllBlessings } from "../../domain/bless";
import { waitForFeatureEventMessage } from "../../domain/feature-enable";
import { isStartableHuntId } from "../../hunts";
import {
  canRestartHunt,
  enableAutoHuntBlockReason,
  isAutoHuntRestartEnabled as isAutoHuntRestartEnabledGuard,
  isPostHuntLootBlocking,
  shouldDeferHuntRestartForLootFinish,
} from "../../domain/hunt/guards";
import { isLootSellEnabled } from "../../domain/loot-sell";
import { featureCooldown, PIPELINE_COOLDOWNS, delay } from "../commands/cooldown";
import { isPartyLeader, partyIdentity } from "../humanize";
import { resolveStartHuntSkills } from "../../presets";
import { getHuntBattleSettings } from "../settings";
import { SendMessageTypes, ReceiveMessageTypes } from "../../protocol";
import {
  INTERACTIVE_COMMAND_TIMEOUT_MS,
  isInActiveHunt,
  isInActiveTraining,
  resolveStartHuntTimeoutMs,
} from "../context-sync";
import { requestBlessSnapshot, requestPartySnapshot } from "../readiness";
import { isHandlingLoot, updatePlayerState } from "../player-state";
import type { BotState } from "../../types";
import type { FlowTraceRecorder } from "../events/flow-trace";
import type { GameEvent } from "../events/types";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { HuntState } from "./states/hunt.state";
import type { PartyState } from "./states/party.state";
import type { SessionState } from "./states/session.state";
import type { BlessState } from "./states/bless.state";
import type { BattleService } from "./battle.service";
import type { LootService } from "./loot.service";
import type { ToolsService } from "./tools.service";

export type HuntFlowPhase =
  | "idle"
  | "starting"
  | "awaiting_ready"
  | "active"
  | "leaving"
  | "restarting"
  | "failed";

export interface HuntFlowState {
  phase: HuntFlowPhase;
  startedAt: number | null;
  lastError: string | null;
}

export interface HuntControlResult {
  ok: boolean;
  error?: string;
  message?: string;
  state?: BotState;
}

export class HuntService extends Service {
  readonly id: FeatureId = "hunt";

  private flow: HuntFlowState = {
    phase: "idle",
    startedAt: null,
    lastError: null,
  };

  /** True after a ready-check id was observed while in awaiting_ready (cleared on exit). */
  private sawReadyCheckWhileAwaiting = false;

  constructor(
    ctx: ServiceContext,
    private readonly huntState: HuntState,
    private readonly partyState: PartyState,
    private readonly sessionState: SessionState,
    private readonly blessState: BlessState,
    private readonly battle: BattleService
  ) {
    super(ctx);
  }

  private identity() {
    return partyIdentity(this.sessionState.characterId, this.partyState);
  }

  private isHunting(): boolean {
    return this.huntState.isActivelyHunting();
  }

  private playerHasAllBlessings(): boolean {
    return hasAllBlessings(this.blessState.projection());
  }

  /**
   * Sync blessings (and auto-buy when enabled) before START_HUNT.
   * Auto-hunt / auto-tasker must not enter a hunt without all 7.
   */
  private async ensureAllBlessingsForHunt(
    trace?: FlowTraceRecorder
  ): Promise<{ ok: boolean; error?: string; deferred?: boolean }> {
    if (!this.blessState.blessSnapshotSynced) {
      requestBlessSnapshot(this.ctx.session);
      trace?.guard("bless_synced", false, "awaiting_bless_sync");
      return { ok: false, deferred: true, error: "awaiting_bless_sync" };
    }

    if (this.playerHasAllBlessings()) {
      trace?.guard("has_all_blessings", true);
      return { ok: true };
    }

    if (this.ctx.settings.get().autoBuyBless) {
      const tools = this.ctx.session.services.tryGet("tools") as
        | { buyMissingBlessings: () => Promise<{ ok: boolean; error?: string }> }
        | undefined;
      if (tools) {
        const bought = await tools.buyMissingBlessings();
        // Snapshot still syncing — buy deferred; BLESS_SNAPSHOT will retry hunt start.
        if (bought?.error === "awaiting_bless_sync") {
          trace?.guard("bless_synced", false, "awaiting_bless_sync");
          return { ok: false, deferred: true, error: "awaiting_bless_sync" };
        }
      }
    }

    const ready = this.playerHasAllBlessings();
    trace?.guard("has_all_blessings", ready);
    if (ready) {
      return { ok: true };
    }

    const owned = this.blessState.ownedCount ?? 0;
    return {
      ok: false,
      error: `Need all 7 blessings before starting a hunt (have ${owned}/7).`,
    };
  }

  private setFlowPhase(
    phase: HuntFlowPhase,
    patch: Partial<Pick<HuntFlowState, "startedAt" | "lastError">> = {}
  ): void {
    this.flow = {
      phase,
      startedAt:
        patch.startedAt !== undefined
          ? patch.startedAt
          : phase === "idle"
            ? null
            : (this.flow.startedAt ?? Date.now()),
      lastError: patch.lastError !== undefined ? patch.lastError : this.flow.lastError,
    };
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.sessionOverlay(),
      huntFlow: { ...this.flow },
    };
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind === "loot_pipeline_finished") {
      if (this.isAutoHuntRestartEnabled()) {
        // Off the wire stack: must not hold applyCores / messageChain while awaiting START_HUNT.
        this.ctx.session.deferFromWire(() =>
          this.run("hunt", () => this.tryAutoRestartAfterLoot())
        );
      }
      return;
    }

    if (event.kind !== "json") {
      return;
    }

    const message = event.message;

    if (message.type === ReceiveMessageTypes.PLAYER_DEATH) {
      this.stopAutoHuntOnDeath();
      return;
    }

    if (message.type === ReceiveMessageTypes.PARTY_ACTION_RESULT) {
      this.handleReadyCheckActionResult(message.data);
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP) {
      this.handleHuntBootstrapWhileAwaitingReady();
    }

    if (message.type === ReceiveMessageTypes.PARTY_SNAPSHOT) {
      this.reconcileAwaitingReadyFromSnapshot();
    }

    // Terminal hunt-finish reasons stop automation even when tasker owns the hunt loop
    // (isAutoHuntRestartEnabled is false while autoTaskerEnabled).
    if (message.type === ReceiveMessageTypes.HUNT_FINISHED) {
      const reason =
        typeof message.data?.reason === "string" ? message.data.reason : undefined;
      if (reason === "insufficient_gold" || reason === "stamina_depleted") {
        this.ctx.session.deferFromWire(() =>
          this.run("hunt", () => this.handleTerminalHuntFinishReason(reason))
        );
        return;
      }
    }

    // Auto-hunt restart: only when restart mode is active (autoHuntEnabled && !autoTaskerEnabled).
    if (
      (message.type === ReceiveMessageTypes.HUNT_FINISHED ||
        message.type === ReceiveMessageTypes.PARTY_SNAPSHOT) &&
      this.isAutoHuntRestartEnabled()
    ) {
      this.ctx.session.deferFromWire(() =>
        this.run("hunt", () => this.handleAutoHuntEventInternal(event))
      );
    }

    // After reload, party_snapshot often arrives before bless sync — retry once blessings land.
    if (
      message.type === ReceiveMessageTypes.BLESS_SNAPSHOT &&
      this.isAutoHuntRestartEnabled()
    ) {
      this.ctx.session.deferFromWire(() =>
        this.run("hunt", () => this.tryAutoRestartAfterLoot())
      );
    }
  }

  /** Ready-check expired / cancelled — leave awaiting_ready so a later restart can try again. */
  private handleReadyCheckActionResult(data: {
    action?: string;
    success?: boolean;
    message?: string;
  } | undefined): void {
    if (data?.action !== "ready_check_cancel") {
      return;
    }
    if (this.flow.phase !== "awaiting_ready") {
      return;
    }
    this.leaveAwaitingReady("failed", data.message ?? "Ready check cancelled");
  }

  private handleHuntBootstrapWhileAwaitingReady(): void {
    if (this.flow.phase !== "awaiting_ready" && this.flow.phase !== "starting") {
      return;
    }
    if (this.isHunting()) {
      this.sawReadyCheckWhileAwaiting = false;
      this.setFlowPhase("active");
    }
  }

  /**
   * Leave awaiting_ready once a ready-check we already saw disappears without a hunt.
   * Do not clear on snapshots that arrive before the ready-check is published.
   */
  private reconcileAwaitingReadyFromSnapshot(): void {
    if (this.flow.phase !== "awaiting_ready") {
      return;
    }
    if (this.isHunting()) {
      this.sawReadyCheckWhileAwaiting = false;
      this.setFlowPhase("active");
      return;
    }
    if (this.partyState.readyCheckId != null) {
      this.sawReadyCheckWhileAwaiting = true;
      return;
    }
    if (this.sawReadyCheckWhileAwaiting) {
      this.leaveAwaitingReady("idle");
    }
  }

  private isAwaitingPartyReady(): boolean {
    return (
      this.flow.phase === "awaiting_ready" || this.partyState.readyCheckId != null
    );
  }

  private enterAwaitingReady(trace?: FlowTraceRecorder): {
    ok: true;
    deferred: true;
  } {
    this.sawReadyCheckWhileAwaiting = this.partyState.readyCheckId != null;
    this.setFlowPhase("awaiting_ready");
    updatePlayerState(this.ctx.session, "idling", "Waiting for party ready…");
    trace?.setPhase("awaiting_ready");
    trace?.finish("ok", { result: { deferred: true, awaitingReady: true } });
    return { ok: true, deferred: true };
  }

  private leaveAwaitingReady(
    next: "idle" | "failed",
    lastError?: string
  ): void {
    this.sawReadyCheckWhileAwaiting = false;
    if (next === "failed") {
      this.setFlowPhase("failed", { lastError: lastError ?? "Ready check cancelled" });
    }
    this.setFlowPhase("idle");
  }

  /** Death ends the hunt loop; tasker owns its own stop path when it is controlling hunt. */
  private stopAutoHuntOnDeath(): void {
    const settings = this.ctx.settings.get();
    if (settings.autoHuntEnabled && !settings.autoTaskerEnabled) {
      this.ctx.session.updateSettings({ autoHuntEnabled: false });
    }
    this.sawReadyCheckWhileAwaiting = false;
    if (this.flow.phase !== "idle") {
      this.setFlowPhase("idle");
    }
  }

  private isLootBlockingRestart(): boolean {
    const loot = this.ctx.session.services.tryGet<LootService>("loot");
    return isPostHuntLootBlocking({
      playerHandlingLoot: isHandlingLoot(this.ctx.session),
      lootFlowBusy: loot?.isBusyWithPostHuntLoot() === true,
    });
  }

  /** Leave training when auto-hunt has a startable hunt ready to claim idle. */
  private async leaveTrainingIfAutoHuntClaims(options: {
    isLeader: boolean;
    huntValid: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    if (
      !isInActiveTraining(this.ctx.session) ||
      !isAutoHuntRestartEnabledGuard(this.ctx.settings.get()) ||
      !options.isLeader ||
      !options.huntValid
    ) {
      return { ok: true };
    }

    const left = await this.ctx.session.services
      .tryGet<ToolsService>("tools")
      ?.leaveTrainingIfActive();
    if (left && left.finished === false && left.error) {
      return { ok: false, error: left.error };
    }
    return { ok: true };
  }

  private async tryAutoRestartAfterLoot(): Promise<void> {
    await this.traceFlow("auto-restart", async (trace) => {
      const settings = this.ctx.settings.get();
      const isLeader = isPartyLeader(this.identity());
      const selectedHuntId = this.battle.selectedHuntId;
      const huntValid = selectedHuntId != null && isStartableHuntId(selectedHuntId);

      const leftTraining = await this.leaveTrainingIfAutoHuntClaims({ isLeader, huntValid });
      trace.guard("left_training", leftTraining.ok, leftTraining.error);
      if (!leftTraining.ok) {
        trace.finish("failed", { error: leftTraining.error });
        return;
      }

      const alreadyHunting =
        this.isHunting() || this.partyState.partyStatus === "hunting";
      const awaitingReady = this.isAwaitingPartyReady();
      const handlingLoot = this.isLootBlockingRestart();

      const canRestart = canRestartHunt({
        isLeader,
        selectedHuntId,
        autoHuntEnabled: settings.autoHuntEnabled,
        autoTaskerEnabled: settings.autoTaskerEnabled,
        handlingLoot,
        alreadyHunting: alreadyHunting || awaitingReady,
        // Blessings are synced/bought inside startHuntInternal — don't block restart
        // when the snapshot is still missing after a game reload.
      });

      trace.guard("handling_loot", !handlingLoot, handlingLoot ? "blocked" : undefined);
      trace.guard("can_restart", canRestart);
      trace.guard("is_leader", isLeader);
      trace.guard("hunt_valid", huntValid);
      trace.guard("not_already_hunting", !alreadyHunting);
      trace.guard("not_awaiting_ready", !awaitingReady);
      trace.guard("bless_synced", this.blessState.blessSnapshotSynced);

      if (!canRestart || selectedHuntId == null || !huntValid) {
        trace.finish("skipped", { error: "restart guards failed" });
        return;
      }

      this.setFlowPhase("restarting", { startedAt: Date.now(), lastError: null });
      trace.setPhase("restarting");
      const result = await this.startHuntInternal(selectedHuntId, { restarting: true }, trace);
      if (!result.ok) {
        trace.finish(result.deferred ? "ok" : "failed", {
          error: result.error,
          result,
        });
      }
    });
  }

  /**
   * When the Battle selector changes to a startable hunt (or auto-hunt turns on),
   * claim idle — including leaving training — and start if eligible.
   */
  async tryStartFromSelectionChange(): Promise<void> {
    if (!this.ctx.isMasterEnabled("hunt")) {
      return;
    }
    await this.tryAutoRestartAfterLoot();
  }

  /**
   * Stop hunt (and tasker when it owns the loop) on terminal finish reasons.
   * Runs even when auto-hunt restart is disabled because tasker controls hunts.
   */
  private async handleTerminalHuntFinishReason(
    reason: "insufficient_gold" | "stamina_depleted"
  ): Promise<void> {
    await this.traceFlow("terminal-finish", async (trace) => {
      const session = this.ctx.session;
      const taskerOn = session.settings.autoTaskerEnabled;
      const status =
        reason === "insufficient_gold"
          ? "Insufficient gold to continue."
          : "Stamina depleted.";

      session.updateSettings({
        autoHuntEnabled: false,
        ...(taskerOn
          ? {
              autoTaskerEnabled: false,
              taskerPhase: "error",
              taskerStatus: status,
              taskerTargetHuntId: null,
            }
          : {}),
      });
      this.setFlowPhase("failed", { lastError: reason });
      this.setFlowPhase("idle");
      trace.finish("failed", { error: reason });
    });
  }

  private async handleAutoHuntEventInternal(event: GameEvent): Promise<void> {
    if (event.kind !== "json") {
      return;
    }

    await this.traceFlow("auto-restart", async (trace) => {
      const message = event.message;
      const settings = this.ctx.settings.get();

      if (message.type === ReceiveMessageTypes.HUNT_FINISHED) {
        const isLeader = isPartyLeader(this.identity());
        const selectedHuntId = this.battle.selectedHuntId;
        const handlingLoot = this.isLootBlockingRestart();
        const lootMasterOn = this.ctx.isMasterEnabled("loot");
        const deferForLoot = shouldDeferHuntRestartForLootFinish(
          lootMasterOn
            ? settings
            : { ...settings, autoSplitLootOnHuntFinished: false },
          {
            isLeader,
            lootSellEnabled: lootMasterOn && isLootSellEnabled(settings),
          }
        );

        trace.guard("handling_loot", !handlingLoot, handlingLoot ? "blocked" : undefined);
        trace.guard("defer_for_loot", !deferForLoot, deferForLoot ? "loot owns finish" : undefined);
        if (handlingLoot || deferForLoot) {
          trace.finish("skipped", { error: "handling loot" });
          return;
        }

        const reason = message.data?.reason;

        if (reason === "insufficient_gold" || reason === "stamina_depleted") {
          // Handled in onEvent via handleTerminalHuntFinishReason (also covers tasker).
          await this.handleTerminalHuntFinishReason(reason);
          return;
        }

        const canRestart = canRestartHunt({
          isLeader,
          selectedHuntId,
          autoHuntEnabled: settings.autoHuntEnabled,
          autoTaskerEnabled: settings.autoTaskerEnabled,
          handlingLoot: false,
        });
        trace.guard("can_restart", canRestart);
        trace.guard("is_leader", isLeader);
        trace.guard("has_selected_hunt", selectedHuntId != null);
        trace.guard("bless_synced", this.blessState.blessSnapshotSynced);

        if (!canRestart || selectedHuntId == null) {
          trace.finish("skipped", { error: "restart guards failed" });
          return;
        }

        this.setFlowPhase("restarting", { startedAt: Date.now(), lastError: null });
        trace.setPhase("restarting");
        const result = await this.startHuntInternal(selectedHuntId, { restarting: true }, trace);
        if (!result.ok) {
          trace.finish(result.deferred ? "ok" : "failed", {
            error: result.error,
            result,
          });
        }
        return;
      }

      if (message.type === ReceiveMessageTypes.PARTY_SNAPSHOT) {
        const isLeader = isPartyLeader(this.identity());
        const selectedHuntId = this.battle.selectedHuntId;
        const huntValid = selectedHuntId != null && isStartableHuntId(selectedHuntId);

        const leftTraining = await this.leaveTrainingIfAutoHuntClaims({ isLeader, huntValid });
        trace.guard("left_training", leftTraining.ok, leftTraining.error);
        if (!leftTraining.ok) {
          trace.finish("failed", { error: leftTraining.error });
          return;
        }

        const alreadyHunting =
          this.isHunting() || this.partyState.partyStatus === "hunting";
        const awaitingReady = this.isAwaitingPartyReady();
        const handlingLoot = this.isLootBlockingRestart();

        const canRestart = canRestartHunt({
          isLeader,
          selectedHuntId,
          autoHuntEnabled: settings.autoHuntEnabled,
          autoTaskerEnabled: settings.autoTaskerEnabled,
          handlingLoot,
          alreadyHunting: alreadyHunting || awaitingReady,
        });

        trace.guard("handling_loot", !handlingLoot, handlingLoot ? "blocked" : undefined);
        trace.guard("can_restart", canRestart);
        trace.guard("is_leader", isLeader);
        trace.guard("hunt_valid", huntValid);
        trace.guard("not_already_hunting", !alreadyHunting);
        trace.guard("not_awaiting_ready", !awaitingReady);
        trace.guard("bless_synced", this.blessState.blessSnapshotSynced);

        if (!canRestart || selectedHuntId == null || !huntValid) {
          trace.finish("skipped", { error: "restart guards failed" });
          return;
        }

        this.setFlowPhase("restarting", { startedAt: Date.now(), lastError: null });
        trace.setPhase("restarting");
        const partyResult = await this.startHuntInternal(
          selectedHuntId,
          { restarting: true },
          trace
        );
        if (!partyResult.ok) {
          trace.finish(partyResult.deferred ? "ok" : "failed", {
            error: partyResult.error,
            result: partyResult,
          });
        }
      }
    });
  }

  /** Start a hunt. Locked to prevent concurrent starts. */
  async startHunt(
    huntId: number,
    options: {
      force?: boolean;
      timeoutMs?: number;
      restarting?: boolean;
    } = {}
  ): Promise<{ ok: boolean; error?: string; deferred?: boolean }> {
    return this.run("hunt", () =>
      this.traceFlow("start-hunt", (trace) => this.startHuntInternal(huntId, options, trace))
    );
  }

  private async startHuntInternal(
    huntId: number,
    options: {
      force?: boolean;
      timeoutMs?: number;
      restarting?: boolean;
    } = {},
    trace?: FlowTraceRecorder
  ): Promise<{ ok: boolean; error?: string; deferred?: boolean }> {
    const session = this.ctx.session;
    const huntValid = isStartableHuntId(huntId);
    const isLeader = isPartyLeader(this.identity());
    const alreadyHunting = this.isHunting();

    trace?.guard("hunt_valid", huntValid);
    trace?.guard("is_leader", isLeader);
    trace?.guard("already_hunting", alreadyHunting);

    if (!huntValid) {
      this.setFlowPhase("failed", { lastError: "invalid hunt" });
      this.setFlowPhase("idle");
      const error =
        "Boss/quest maps can't be started from Hunt — select a catalog hunt on the Battle tab.";
      trace?.finish("failed", { error });
      return { ok: false, error };
    }

    const timeoutMs = options.timeoutMs ?? resolveStartHuntTimeoutMs(session);

    if (!isLeader) {
      this.setFlowPhase("failed", { lastError: "not leader" });
      this.setFlowPhase("idle");
      trace?.finish("failed", { error: "Only the party leader can start a hunt." });
      return { ok: false, error: "Only the party leader can start a hunt." };
    }

    if (!options.force && alreadyHunting) {
      this.setFlowPhase("active");
      trace?.finish("skipped", { error: "already hunting" });
      return { ok: true };
    }

    if (isInActiveTraining(session)) {
      const left = await session.services.tryGet<ToolsService>("tools")?.leaveTrainingIfActive();
      if (left && left.finished === false && left.error) {
        this.setFlowPhase("failed", { lastError: left.error });
        this.setFlowPhase("idle");
        trace?.finish("failed", { error: left.error });
        return { ok: false, error: left.error };
      }
    }

    const blessGate = await this.ensureAllBlessingsForHunt(trace);
    if (!blessGate.ok) {
      this.setFlowPhase("failed", { lastError: blessGate.error ?? "missing blessings" });
      this.setFlowPhase("idle");
      if (blessGate.deferred) {
        trace?.finish("ok", { error: blessGate.error, result: { deferred: true } });
        return { ok: false, deferred: true, error: blessGate.error };
      }
      trace?.finish("failed", { error: blessGate.error });
      return { ok: false, error: blessGate.error };
    }

    this.setFlowPhase("starting");
    trace?.setPhase("starting");

    if (options.restarting) {
      updatePlayerState(session, "idling", "Preparing next hunt…");
      await delay(PIPELINE_COOLDOWNS.beforeRestart);
    }

    const outcome = await session.commands.run(
      SendMessageTypes.START_HUNT,
      {
        huntId,
        skillsSelected: resolveStartHuntSkills(
          session.settings.autoApplyPresets,
          getHuntBattleSettings(session.settings, huntId).battlePreset,
          session.services.getBattlePreset()
        ),
      },
      {
        force: options.force,
        timeoutMs,
        cooldownMs: featureCooldown("hunt.autoHunt"),
      }
    );

    trace?.command({
      type: SendMessageTypes.START_HUNT,
      success: outcome.success !== false && !outcome.skipped,
      skipped: outcome.skipped,
      skipReason: outcome.skipReason,
      error: outcome.success === false ? outcome.errorMessage : undefined,
    });

    if (outcome.skipped) {
      const error = `Hunt start skipped (${outcome.skipReason ?? "cooldown"}).`;
      this.setFlowPhase("failed", { lastError: error });
      this.setFlowPhase("idle");
      trace?.finish("skipped", { error });
      return { ok: false, error };
    }

    const readyCheckActive = this.partyState.readyCheckId != null;
    const bootstrapped =
      outcome.response?.type === ReceiveMessageTypes.HUNT_BOOTSTRAP || this.isHunting();

    if (outcome.success === false) {
      // Timed out / failed after the party ready-check already opened — wait for it.
      if (readyCheckActive) {
        return this.enterAwaitingReady(trace);
      }
      const error = outcome.errorMessage ?? "Hunt start failed.";
      this.setFlowPhase("failed", { lastError: error });
      this.setFlowPhase("idle");
      trace?.finish("failed", { error });
      return { ok: false, error };
    }

    if (bootstrapped) {
      this.setFlowPhase("active");
      trace?.setPhase("active");
      return { ok: true };
    }

    // party:action_result / ready-check snapshot — hunt starts after everyone confirms.
    if (readyCheckActive || (this.partyState.partyMemberCount ?? 0) > 1) {
      return this.enterAwaitingReady(trace);
    }

    this.setFlowPhase("active");
    trace?.setPhase("active");
    return { ok: true };
  }

  /** Leave the current hunt if one is active. */
  async leaveHuntIfActive(
    options: { timeoutMs?: number } = {}
  ): Promise<{ left: boolean; error?: string }> {
    return this.traceFlow("leave-hunt", async (trace) => {
      const session = this.ctx.session;
      const inHunt = isInActiveHunt(session);
      trace.guard("in_active_hunt", inHunt);

      if (!inHunt) {
        trace.finish("skipped", { error: "not in hunt" });
        return { left: false };
      }

      this.setFlowPhase("leaving", { startedAt: Date.now(), lastError: null });
      trace.setPhase("leaving");

      const outcome = await session.commands.run(SendMessageTypes.LEAVE_HUNT, {}, {
        timeoutMs: options.timeoutMs ?? INTERACTIVE_COMMAND_TIMEOUT_MS,
      });

      if (outcome.success === false) {
        const error = outcome.errorMessage ?? "Failed to leave hunt.";
        this.setFlowPhase("failed", { lastError: error });
        this.setFlowPhase("idle");
        trace.finish("failed", { error });
        return { left: false, error };
      }

      this.setFlowPhase("idle");
      return { left: true };
    });
  }

  /** Returns true when auto-hunt should restart hunts (enabled and tasker is not controlling). */
  isAutoHuntRestartEnabled(): boolean {
    return isAutoHuntRestartEnabledGuard(this.ctx.settings.get());
  }

  /**
   * True while a hunt start/restart is in flight (START_HUNT, restarting, or
   * waiting on party ready-check). Ready-checks during this window should be
   * confirmed even if Tools auto-confirm is off.
   */
  isAwaitingHuntStart(): boolean {
    return (
      this.flow.phase === "starting" ||
      this.flow.phase === "restarting" ||
      this.flow.phase === "awaiting_ready"
    );
  }

  /**
   * Public hook for external callers (tests / session-host via HuntService).
   */
  async handleAutoHuntEvent(event: GameEvent): Promise<void> {
    await this.handleAutoHuntEventInternal(event);
  }

  /** Enable auto-hunt: validates state, starts the hunt, then turns on the loop. */
  async enableAutoHunt(huntId: number): Promise<HuntControlResult> {
    // Attach botState outside traceFlow — embedding it in the traced result creates a
    // cycle (result.state.debug.flowTraces → result) that Safari cannot JSON-serialize.
    const traced = await this.traceFlow("enable-auto-hunt", async (trace) => {
      const session = this.ctx.session;

      if (!Number.isFinite(huntId) || !isStartableHuntId(huntId)) {
        trace.guard("hunt_valid", false);
        trace.finish("failed", { error: "Select a hunt on the Battle tab first." });
        return { ok: false as const, error: "Select a hunt on the Battle tab first." };
      }

      if (!this.ctx.session.connected) {
        trace.guard("connected", false);
        trace.finish("failed", {
          error: "Not connected to the game — open Stonegy and enter the world.",
        });
        return {
          ok: false as const,
          error: "Not connected to the game — open Stonegy and enter the world.",
        };
      }

      if (session.settings.autoTaskerEnabled) {
        trace.guard("tasker_off", false);
        trace.finish("failed", {
          error: "Stop auto tasker first — it controls hunts.",
        });
        return { ok: false as const, error: "Stop auto tasker first — it controls hunts." };
      }

      if (!this.sessionState.characterId) {
        const error = waitForFeatureEventMessage(
          "session:bootstrap",
          "enabling auto hunt"
        );
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }

      if (!this.partyState.partySnapshotSynced) {
        requestPartySnapshot(session);
        const error = waitForFeatureEventMessage(
          "party:snapshot",
          "enabling auto hunt"
        );
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }

      if (!isPartyLeader(this.identity())) {
        const error = "Only the party leader can start a hunt.";
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }

      if (!this.blessState.blessSnapshotSynced) {
        requestBlessSnapshot(session);
        const error = waitForFeatureEventMessage(
          "bless:snapshot",
          "enabling auto hunt"
        );
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }

      const blessReady = await this.ensureAllBlessingsForHunt(trace);
      if (!blessReady.ok) {
        trace.finish("failed", { error: blessReady.error });
        return {
          ok: false as const,
          error: blessReady.error ?? "Need all 7 blessings before starting auto hunt.",
        };
      }

      const block = enableAutoHuntBlockReason({
        connected: this.ctx.session.connected,
        autoTaskerEnabled: session.settings.autoTaskerEnabled,
        hasValidHunt: isStartableHuntId(huntId),
        hasCharacterId: !!this.sessionState.characterId,
        partySnapshotSynced: this.partyState.partySnapshotSynced,
        blessSnapshotSynced: this.blessState.blessSnapshotSynced,
        isLeader: isPartyLeader(this.identity()),
        hasAllBlessings: this.playerHasAllBlessings(),
      });

      trace.guard("enable_block", block == null, block ?? undefined);

      if (block === "no_character") {
        const error = waitForFeatureEventMessage(
          "session:bootstrap",
          "enabling auto hunt"
        );
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }
      if (block === "party_not_synced") {
        requestPartySnapshot(session);
        const error = waitForFeatureEventMessage(
          "party:snapshot",
          "enabling auto hunt"
        );
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }
      if (block === "not_leader") {
        trace.finish("failed", { error: "Only the party leader can start a hunt." });
        return { ok: false as const, error: "Only the party leader can start a hunt." };
      }
      if (block === "bless_not_synced") {
        requestBlessSnapshot(session);
        const error = waitForFeatureEventMessage(
          "bless:snapshot",
          "enabling auto hunt"
        );
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }
      if (block === "missing_blessings") {
        const owned = this.blessState.ownedCount ?? 0;
        const error = `Need all 7 blessings before starting a hunt (have ${owned}/7).`;
        trace.finish("failed", { error });
        return { ok: false as const, error };
      }
      if (block) {
        trace.finish("failed", { error: block });
        return { ok: false as const, error: block };
      }

      if (!this.isHunting()) {
        const result = await this.startHuntInternal(huntId, { force: true }, trace);
        if (!result.ok) {
          return { ok: false as const, error: result.error ?? "Failed to start hunt." };
        }
      } else {
        this.setFlowPhase("active");
      }

      session.updateSettings({ autoHuntEnabled: true });
      this.battle.setSelectedHuntId(huntId);

      return {
        ok: true as const,
        message: this.isHunting()
          ? "Auto hunt enabled — already hunting."
          : "Auto hunt started.",
      };
    });

    if (!traced.ok) {
      return traced;
    }
    return { ...traced, state: this.ctx.session.botState };
  }

  /** Disable auto-hunt: turns off the loop without leaving the current hunt. */
  async disableAutoHunt(): Promise<HuntControlResult> {
    const session = this.ctx.session;

    if (session.settings.autoTaskerEnabled) {
      return {
        ok: false,
        error: "Auto hunt is controlled by the tasker — stop auto tasker instead.",
      };
    }

    if (!session.settings.autoHuntEnabled) {
      return { ok: true, message: "Auto hunt is already off.", state: session.botState };
    }

    session.updateSettings({ autoHuntEnabled: false });
    this.sawReadyCheckWhileAwaiting = false;
    this.setFlowPhase("idle");

    return { ok: true, message: "Auto hunt stopped.", state: session.botState };
  }
}
