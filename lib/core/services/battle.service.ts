import {
  arrowDiffers,
  buildSelectArrowPayload,
  buildSelectHealPayloads,
  buildSelectManaPotionPayload,
  buildSelectSkillsPayload,
  healSlotDiffers,
  manaPotionDiffers,
  parseBattleConfigFromGame,
  resolveBattlePreset,
  skillsDiffers,
} from "../../presets";
import { SendMessageTypes, ReceiveMessageTypes } from "../../protocol";
import { getHuntLureRange, isValidLureId, resolveLureId, resolvePartyPosition, resolveSelectorHuntIdFromBootstrap } from "../../hunts";
import {
  canChangePartyPosition,
  isInParty,
  isPartyLeader,
  partyIdentity,
} from "../humanize";
import { delay, featureCooldown, PIPELINE_COOLDOWNS } from "../commands/cooldown";
import type { CommandOutcome } from "../commands/bus";
import type { FlowTraceRecorder } from "../events/flow-trace";
import type { GameEvent } from "../events/types";
import { getHuntBattleSettings } from "../settings";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { HuntState } from "./states/hunt.state";
import type { PartyState } from "./states/party.state";
import type { SessionState } from "./states/session.state";

function isJsonEvent(event: GameEvent, type: string): boolean {
  return event.kind === "json" && event.message.type === type;
}

function commandSucceeded(outcome: CommandOutcome): boolean {
  return outcome.sent && !outcome.skipped && outcome.success !== false;
}

function recordCommand(
  trace: FlowTraceRecorder,
  type: string,
  outcome: CommandOutcome
): void {
  trace.command({
    type,
    success: commandSucceeded(outcome),
    skipped: outcome.skipped,
    skipReason: outcome.skipReason,
    error: outcome.errorMessage,
  });
}

type AttemptResult = {
  attempted: boolean;
  reason?: string;
  outcome?: CommandOutcome;
};

export class BattleService extends Service {
  readonly id: FeatureId = "battle";

  /** User/automation selected hunt — scoped var peers read. */
  private _selectedHuntId: number | null = null;
  private _lastBootstrapHuntId: number | null = null;

  constructor(
    ctx: ServiceContext,
    private readonly huntState: HuntState,
    private readonly partyState: PartyState,
    private readonly sessionState: SessionState
  ) {
    super(ctx);
    this._selectedHuntId = ctx.session.settings.selectedHuntId ?? null;
  }

  private identity() {
    return partyIdentity(this.sessionState.characterId, this.partyState);
  }

  get selectedHuntId(): number | null {
    return this._selectedHuntId;
  }

  get lastBootstrapHuntId(): number | null {
    return this._lastBootstrapHuntId;
  }

  sessionOverlay() {
    return {
      hunt: {
        lastBootstrapHuntId: this._lastBootstrapHuntId,
      },
    };
  }

  applyLastBootstrapHuntId(huntId: number | null): void {
    this._lastBootstrapHuntId = huntId;
  }

  setSelectedHuntId(huntId: number | null): void {
    this._selectedHuntId = huntId;
    if (this.ctx.session.settings.selectedHuntId !== huntId) {
      void this.ctx.session.updateSettings({ selectedHuntId: huntId });
    }
  }

  /** Prefer active hunt, then selected, then tasker target. */
  resolveHuntId(): number | null {
    return (
      this.huntState.activeHuntId ??
      this._selectedHuntId ??
      this.ctx.session.settings.taskerTargetHuntId ??
      null
    );
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind !== "json") {
      return;
    }

    const session = this.ctx.session;
    const settings = this.ctx.settings.get();
    const message = event.message;

    // Allow bootstrap actions again after a hunt ends (same hunt id on auto-restart).
    if (message.type === ReceiveMessageTypes.HUNT_FINISHED) {
      this._lastBootstrapHuntId = null;
    }

    if (message.type === ReceiveMessageTypes.UPDATE_BATTLE_CONFIG && message.data) {
      const preset = parseBattleConfigFromGame(message.data);
      session.services.setBattlePreset(preset);
    }

    if (message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP) {
      const hunt = message.data?.hunt;
      const huntId =
        hunt != null ? resolveSelectorHuntIdFromBootstrap(hunt) : null;
      if (typeof huntId === "number") {
        this._selectedHuntId = huntId;
        if (settings.selectedHuntId !== huntId) {
          void session.updateSettings({ selectedHuntId: huntId });
        }
      } else if (hunt == null) {
        this._lastBootstrapHuntId = null;
      }
    }

    const bootstrapGameHuntId =
      message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP &&
      typeof message.data?.hunt?.id === "number"
        ? (message.data.hunt.id as number)
        : null;
    /** Selector id for battle settings (may be synthetic for boss/quest). */
    const bootstrapSettingsHuntId =
      message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP &&
      message.data?.hunt != null
        ? (resolveSelectorHuntIdFromBootstrap(message.data.hunt) ??
          bootstrapGameHuntId)
        : bootstrapGameHuntId;

    // Dedup always uses the game hunt id (never the synthetic selector id).
    const isFreshBootstrap =
      bootstrapGameHuntId != null && this.shouldRunBootstrap(bootstrapGameHuntId);

    const wantPresets =
      settings.autoApplyPresets && bootstrapSettingsHuntId != null && isFreshBootstrap;
    const wantPosition =
      settings.autoPlacePartyPosition &&
      (isFreshBootstrap || isJsonEvent(event, ReceiveMessageTypes.HUNT_UPDATE_PLAYERS));
    const wantLure =
      this.shouldAutoLockLure() &&
      (isFreshBootstrap || isJsonEvent(event, ReceiveMessageTypes.HUNT_UPDATE_LURE));

    if (!wantPresets && !wantPosition && !wantLure) {
      return;
    }

    // Claim before defer so duplicate bootstraps don't schedule a second setup.
    if (isFreshBootstrap && bootstrapGameHuntId != null) {
      this._lastBootstrapHuntId = bootstrapGameHuntId;
    }

    const settingsHuntId = bootstrapSettingsHuntId ?? this.resolveHuntId();
    const afterBootstrap = isFreshBootstrap;

    // Off the wire chain: command waits must not block notifyResponse.
    session.deferFromWire(async () => {
      if (afterBootstrap) {
        await delay(PIPELINE_COOLDOWNS.afterHuntBootstrap);
      }

      const setupTasks: Promise<void>[] = [];
      if (wantPresets && bootstrapSettingsHuntId != null) {
        setupTasks.push(this.runApplyPresetsFlow(bootstrapSettingsHuntId));
      }
      if (wantPosition) {
        setupTasks.push(this.runPlacePositionFlow(settingsHuntId));
      }
      if (wantLure) {
        setupTasks.push(this.runLockLureFlow(settingsHuntId));
      }
      if (setupTasks.length > 0) {
        await Promise.all(setupTasks);
      }
    });
  }

  private shouldRunBootstrap(huntId: number | null): boolean {
    return huntId != null && this._lastBootstrapHuntId !== huntId;
  }

  async applyPresets(huntId?: number): Promise<void> {
    const resolved = huntId ?? this.resolveHuntId();
    if (resolved == null) {
      return;
    }
    await this.runApplyPresetsFlow(resolved);
  }

  async attemptAutoPlacePartyPosition(huntId?: number): Promise<void> {
    await this.runPlacePositionFlow(huntId ?? this.resolveHuntId());
  }

  async lockLureForHunt(huntId?: number): Promise<void> {
    await this.runLockLureFlow(huntId ?? this.resolveHuntId());
  }

  shouldAutoLockLure(): boolean {
    const session = this.ctx.session;
    const { settings } = session;
    if (settings.autoLockLure) {
      return true;
    }
    return (
      settings.autoTaskerEnabled &&
      settings.taskerMaxLure &&
      isPartyLeader(this.identity())
    );
  }

  private async runApplyPresetsFlow(huntId: number): Promise<void> {
    await this.run("apply-presets", () =>
      this.traceFlow("apply-presets", async (trace) => {
        const outcomes = await this.applyPresetsImpl(huntId);
        if (outcomes.length === 0) {
          trace.finish("skipped", { error: "preset already matches" });
          return;
        }
        for (const { type, outcome } of outcomes) {
          recordCommand(trace, type, outcome);
        }
        const failed = outcomes.find(({ outcome }) => !commandSucceeded(outcome));
        if (failed) {
          const { outcome } = failed;
          trace.finish(outcome.skipped ? "skipped" : "failed", {
            error: outcome.errorMessage ?? outcome.skipReason ?? "apply presets failed",
          });
        }
      })
    );
  }

  private async runPlacePositionFlow(huntId: number | null): Promise<void> {
    await this.run("place-position", () =>
      this.traceFlow("place-position", async (trace) => {
        trace.guard("has_hunt", huntId != null, huntId != null ? `${huntId}` : undefined);
        if (huntId == null) {
          trace.finish("skipped", { error: "no hunt id" });
          return;
        }
        const placed = await this.placePositionImpl(huntId);
        if (!placed.attempted) {
          trace.finish("skipped", { error: placed.reason });
          return;
        }
        const outcome = placed.outcome!;
        recordCommand(trace, SendMessageTypes.HUNT_CHANGE_PARTY_POSITION, outcome);
        if (!commandSucceeded(outcome)) {
          trace.finish(outcome.skipped ? "skipped" : "failed", {
            error: outcome.errorMessage ?? outcome.skipReason ?? placed.reason,
          });
        }
      })
    );
  }

  private async runLockLureFlow(huntId: number | null): Promise<void> {
    await this.run("lock-lure", () =>
      this.traceFlow("lock-lure", async (trace) => {
        trace.guard("has_hunt", huntId != null, huntId != null ? `${huntId}` : undefined);
        if (huntId == null) {
          trace.finish("skipped", { error: "no hunt id" });
          return;
        }
        const locked = await this.lockLureImpl(huntId);
        if (!locked.attempted) {
          trace.finish("skipped", { error: locked.reason });
          return;
        }
        const outcome = locked.outcome!;
        recordCommand(trace, SendMessageTypes.HUNT_LURE_ID, outcome);
        if (!commandSucceeded(outcome)) {
          trace.finish(outcome.skipped ? "skipped" : "failed", {
            error: outcome.errorMessage ?? outcome.skipReason ?? locked.reason,
          });
        }
      })
    );
  }

  private async applyPresetsImpl(
    huntId: number
  ): Promise<Array<{ type: string; outcome: CommandOutcome }>> {
    const session = this.ctx.session;
    const current = session.services.getBattlePreset();
    const desired = resolveBattlePreset(
      getHuntBattleSettings(session.settings, huntId).battlePreset,
      current
    );
    const cooldownMs = featureCooldown("battle.applyPresets");
    const outcomes: Array<{ type: string; outcome: CommandOutcome }> = [];

    for (const payload of buildSelectHealPayloads(desired)) {
      if (!healSlotDiffers(desired, current, payload.healIdx)) {
        continue;
      }
      outcomes.push({
        type: SendMessageTypes.SELECT_HEAL,
        outcome: await session.commands.run(SendMessageTypes.SELECT_HEAL, payload, {
          cooldownMs,
        }),
      });
    }

    if (manaPotionDiffers(desired, current)) {
      outcomes.push({
        type: SendMessageTypes.SELECT_MANA_POTION,
        outcome: await session.commands.run(
          SendMessageTypes.SELECT_MANA_POTION,
          buildSelectManaPotionPayload(desired),
          { cooldownMs }
        ),
      });
    }

    if (arrowDiffers(desired, current)) {
      outcomes.push({
        type: SendMessageTypes.SELECT_ARROW,
        outcome: await session.commands.run(
          SendMessageTypes.SELECT_ARROW,
          buildSelectArrowPayload(desired),
          { cooldownMs }
        ),
      });
    }

    if (skillsDiffers(desired, current)) {
      outcomes.push({
        type: SendMessageTypes.SELECT_SKILLS,
        outcome: await session.commands.run(
          SendMessageTypes.SELECT_SKILLS,
          buildSelectSkillsPayload(desired),
          { cooldownMs }
        ),
      });
    }

    return outcomes;
  }

  private async placePositionImpl(huntId: number): Promise<AttemptResult> {
    const session = this.ctx.session;
    if (!canChangePartyPosition(this.partyState.partyMemberCount)) {
      return { attempted: false, reason: "solo party" };
    }

    const huntBattle = getHuntBattleSettings(session.settings, huntId);
    const preferred =
      huntBattle.partyPositionX != null && huntBattle.partyPositionY != null
        ? { x: huntBattle.partyPositionX, y: huntBattle.partyPositionY }
        : null;
    const resolved = resolvePartyPosition(huntId, preferred);
    if (!resolved) {
      return { attempted: false, reason: "no party position" };
    }

    if (
      this.huntState.currentPartyTileX === resolved.x &&
      this.huntState.currentPartyTileY === resolved.y
    ) {
      return { attempted: false, reason: "already at position" };
    }

    const outcome = await session.commands.run(
      SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
      { x: resolved.x, y: resolved.y },
      { cooldownMs: featureCooldown("battle.placePosition") }
    );
    return { attempted: true, outcome };
  }

  private async lockLureImpl(huntId: number): Promise<AttemptResult & { lureId?: number }> {
    const session = this.ctx.session;
    const { settings } = session;
    const identity = this.identity();

    if (!identity.characterId) {
      return { attempted: false, reason: "no character" };
    }
    if (isInParty(identity.partyMemberCount) && !isPartyLeader(identity)) {
      return { attempted: false, reason: "not party leader" };
    }

    let lureId: number | null;
    if (settings.autoTaskerEnabled && settings.taskerMaxLure && isPartyLeader(identity)) {
      lureId = getHuntLureRange(huntId).max;
    } else {
      lureId = resolveLureId(huntId, getHuntBattleSettings(settings, huntId).selectedLureId);
    }

    if (lureId == null) {
      return { attempted: false, reason: "no lure" };
    }
    if (!isValidLureId(huntId, lureId)) {
      return { attempted: false, reason: "invalid lure" };
    }

    if (this.huntState.currentLureId === lureId) {
      return { attempted: false, reason: "already at lure" };
    }

    const outcome = await session.commands.run(
      SendMessageTypes.HUNT_LURE_ID,
      { lureId },
      { cooldownMs: featureCooldown("battle.lockLure") }
    );
    return { attempted: true, lureId, outcome };
  }
}
