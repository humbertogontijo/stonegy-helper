import {
  buildBattleConfigPayload,
  parseBattleConfigFromGame,
  resolveBattlePreset,
} from "../../presets";
import { SendMessageTypes, ReceiveMessageTypes } from "../../protocol";
import { getQuickSellDeselectedItemIds } from "../../market/hunt-loot";
import { isLootSellEnabled } from "../../domain/loot-sell";
import { getHuntLureRange, isValidLureId, resolveLureId, resolvePartyPosition } from "../../hunts";
import {
  canChangePartyPosition,
  isInParty,
  isPartyLeader,
  partyIdentity,
} from "../humanize";
import { delay, featureCooldown, PIPELINE_COOLDOWNS } from "../commands/cooldown";
import type { GameEvent } from "../events/types";
import { getHuntBattleSettings } from "../settings";
import { Service, type ServiceContext } from "./service";
import type { FeatureId } from "./types";
import type { HuntState } from "./states/hunt.state";
import type { PartyState } from "./states/party.state";
import type { SessionState } from "./states/session.state";
import type { InventoryState } from "./states/inventory.state";

function isJsonEvent(event: GameEvent, type: string): boolean {
  return event.kind === "json" && event.message.type === type;
}

export class BattleService extends Service {
  readonly id: FeatureId = "battle";

  /** User/automation selected hunt — scoped var peers read. */
  private _selectedHuntId: number | null = null;
  private _lastBootstrapHuntId: number | null = null;

  constructor(
    ctx: ServiceContext,
    private readonly huntState: HuntState,
    private readonly partyState: PartyState,
    private readonly sessionState: SessionState,
    private readonly inventoryState: InventoryState
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
      const huntId = message.data?.hunt?.id;
      if (typeof huntId === "number") {
        this._selectedHuntId = huntId;
        if (settings.selectedHuntId !== huntId) {
          void session.updateSettings({ selectedHuntId: huntId });
        }
      } else if (message.data?.hunt == null) {
        this._lastBootstrapHuntId = null;
      }
    }

    const bootstrapHuntId =
      message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP &&
      typeof message.data?.hunt?.id === "number"
        ? (message.data.hunt.id as number)
        : null;

    const willRunBootstrapSetup =
      bootstrapHuntId != null &&
      this.shouldRunBootstrap(bootstrapHuntId) &&
      (settings.autoApplyPresets ||
        settings.autoPlacePartyPosition ||
        this.shouldAutoLockLure());
    if (willRunBootstrapSetup) {
      await delay(PIPELINE_COOLDOWNS.afterHuntBootstrap);
    }

    if (settings.autoApplyPresets && bootstrapHuntId != null) {
      await this.run("battle", async () => {
        if (!this.shouldRunBootstrap(bootstrapHuntId)) {
          return;
        }
        await this.applyPresetsImpl(bootstrapHuntId);
      });
    }

    if (
      settings.autoPlacePartyPosition &&
      (bootstrapHuntId != null ||
        isJsonEvent(event, ReceiveMessageTypes.HUNT_UPDATE_PLAYERS))
    ) {
      await this.run("battle", () =>
        this.traceFlow("place-position", async (trace) => {
          const huntId = bootstrapHuntId ?? this.resolveHuntId();
          const fromBootstrap = bootstrapHuntId != null;
          trace.guard("has_hunt", huntId != null);
          if (huntId == null) {
            trace.finish("skipped", { error: "no hunt id" });
            return;
          }
          if (fromBootstrap) {
            const shouldRun = this.shouldRunBootstrap(huntId);
            trace.guard("should_run_bootstrap", shouldRun, `last=${this._lastBootstrapHuntId}`);
            if (!shouldRun) {
              trace.finish("skipped", { error: "bootstrap already applied for hunt" });
              return;
            }
          }
          const placed = await this.placePositionImpl(huntId);
          if (!placed.attempted) {
            trace.finish("skipped", { error: placed.reason });
            return;
          }
          trace.command({
            type: SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
            success: true,
          });
        })
      );
    }

    if (
      this.shouldAutoLockLure() &&
      (bootstrapHuntId != null ||
        isJsonEvent(event, ReceiveMessageTypes.HUNT_UPDATE_LURE))
    ) {
      await this.run("battle", async () => {
        const huntId = bootstrapHuntId ?? this.resolveHuntId();
        if (huntId == null) {
          return;
        }
        if (bootstrapHuntId != null && !this.shouldRunBootstrap(huntId)) {
          return;
        }
        await this.lockLureImpl(huntId);
      });
    }

    if (bootstrapHuntId != null && this.shouldRunBootstrap(bootstrapHuntId)) {
      this._lastBootstrapHuntId = bootstrapHuntId;
    }
  }

  private shouldRunBootstrap(huntId: number | null): boolean {
    return huntId != null && this._lastBootstrapHuntId !== huntId;
  }

  async applyPresets(huntId?: number): Promise<void> {
    const resolved = huntId ?? this.resolveHuntId();
    if (resolved == null) {
      return;
    }
    await this.run("battle", () => this.applyPresetsImpl(resolved));
  }

  async attemptAutoPlacePartyPosition(huntId?: number): Promise<void> {
    return this.traceFlow("place-position", async (trace) => {
      const resolved = huntId ?? this.resolveHuntId();
      trace.guard("has_hunt", resolved != null, resolved != null ? `${resolved}` : undefined);
      if (resolved == null) {
        trace.finish("skipped", { error: "no hunt id" });
        return;
      }
      await this.run("battle", async () => {
        const placed = await this.placePositionImpl(resolved);
        if (!placed.attempted) {
          trace.finish("skipped", { error: placed.reason ?? "not attempted" });
          return;
        }
        trace.command({
          type: SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
          success: true,
        });
      });
    });
  }

  async lockLureForHunt(huntId?: number): Promise<void> {
    const resolved = huntId ?? this.resolveHuntId();
    if (resolved == null) {
      return;
    }
    await this.run("battle", () => this.lockLureImpl(resolved));
  }

  shouldAutoLockLure(): boolean {
    const session = this.ctx.session;
    const { settings } = session;
    if (settings.autoLockLure) {
      return true;
    }
    return settings.autoTaskerEnabled && isPartyLeader(this.identity());
  }

  private async applyPresetsImpl(huntId: number): Promise<void> {
    const session = this.ctx.session;
    const { settings } = session;
    const configured = getHuntBattleSettings(settings, huntId).battlePreset;
    const preset = resolveBattlePreset(configured, session.services.getBattlePreset());
    const payload = buildBattleConfigPayload(preset, {
      lootFilterExcludedItemIds: this.inventoryState.lootFilterExcludedItemIds,
      quickSellDeselectedItemIds: getQuickSellDeselectedItemIds(huntId, {
        settings: {
          lootSellModeByItemId: settings.lootSellModeByItemId,
          lootSellExcludedItemIds: settings.lootSellExcludedItemIds ?? [],
          marketSellMinRarityTier: settings.marketSellMinRarityTier ?? 1,
          marketSellMountItems: settings.marketSellMountItems ?? false,
        },
        autoSellLootEnabled: isLootSellEnabled(settings),
      }),
    });
    await session.commands.run(SendMessageTypes.UPDATE_BATTLE_CONFIG, payload, {
      cooldownMs: featureCooldown("battle.applyPresets"),
    });
  }

  private async placePositionImpl(
    huntId: number
  ): Promise<{ attempted: boolean; reason?: string }> {
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

    await session.commands.run(
      SendMessageTypes.HUNT_CHANGE_PARTY_POSITION,
      { x: resolved.x, y: resolved.y },
      { cooldownMs: featureCooldown("battle.placePosition"), waitForResponse: false }
    );
    return { attempted: true };
  }

  private async lockLureImpl(huntId: number): Promise<void> {
    const session = this.ctx.session;
    const { settings } = session;
    const identity = this.identity();

    if (!identity.characterId) {
      return;
    }
    if (isInParty(identity.partyMemberCount) && !isPartyLeader(identity)) {
      return;
    }

    let lureId: number | null;
    if (settings.autoTaskerEnabled && isPartyLeader(identity)) {
      lureId = getHuntLureRange(huntId).max;
    } else {
      lureId = resolveLureId(huntId, getHuntBattleSettings(settings, huntId).selectedLureId);
    }

    if (!isValidLureId(huntId, lureId)) {
      return;
    }

    if (this.huntState.currentLureId === lureId) {
      return;
    }

    await session.commands.run(
      SendMessageTypes.HUNT_LURE_ID,
      { lureId: lureId! },
      { cooldownMs: featureCooldown("battle.lockLure") }
    );
  }
}
