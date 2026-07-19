import type { GameEvent } from "../events/types";
import type { GameSession } from "../session";
import { getFeatureMasterOffPatch } from "../features/feature-control";
import { createBattlePreset } from "../../presets";
import { KeyedLocks } from "./locks";
import { Service, DomainState, type ServiceContext } from "./service";
import { SettingsStore } from "./stores";
import type {
  DomainStateId,
  FeatureId,
  FeatureMasters,
  HostTimers,
  ServiceId,
} from "./types";
import { isFeatureId } from "./types";
import type { SessionView } from "../projections/types";
import { patchSessionView } from "../projections/patch";
import type { SessionState } from "./states/session.state";
import type { PartyState } from "./states/party.state";
import type { HuntState } from "./states/hunt.state";
import type { TrainingState } from "./states/training.state";
import type { InventoryState } from "./states/inventory.state";
import type { MarketState } from "./states/market.state";
import type { TasksState } from "./states/tasks.state";
import type { BlessState } from "./states/bless.state";
import type { CombatState } from "./states/combat.state";
import type { BattleService } from "./battle.service";
import type { LootService } from "./loot.service";
import type { MarketService } from "./market.service";

export interface ServiceRegistryOptions {
  session: GameSession;
  masters?: FeatureMasters;
  hostTimers?: HostTimers;
}

function defaultMasters(): FeatureMasters {
  return {
    market: true,
    loot: true,
    battle: true,
    hunt: true,
    tasks: true,
    tools: true,
  };
}

export class ServiceRegistry {
  private readonly session: GameSession;
  private readonly locks = new KeyedLocks();
  private readonly settings: SettingsStore;
  private readonly hostTimers?: HostTimers;
  private readonly domains = new Map<DomainStateId, DomainState>();
  private readonly domainOrder: DomainState[] = [];
  private readonly cores = new Map<FeatureId, Service>();
  private masters: FeatureMasters;
  private emitQueue: GameEvent[] = [];
  private draining = false;

  /** Leftover view fields not owned by domain states. */
  private playerState: SessionView["playerState"] = "idling";
  private playerStateDetail = "";
  private battlePreset = createBattlePreset();

  constructor(options: ServiceRegistryOptions) {
    this.session = options.session;
    this.masters = options.masters ?? defaultMasters();
    this.settings = new SettingsStore(this.locks, options.session);
    this.hostTimers = options.hostTimers;
  }

  /** Build a ServiceContext bound to this registry (for constructing services). */
  createContext(): ServiceContext {
    return {
      session: this.session,
      settings: this.settings,
      locks: this.locks,
      emit: (event) => this.emit(event),
      isMasterEnabled: (id) => this.isMasterEnabled(id),
      hostTimers: this.hostTimers,
    };
  }

  registerDomain(state: DomainState): void {
    this.domains.set(state.id, state);
    this.domainOrder.push(state);
  }

  register(service: Service): void {
    if (!isFeatureId(service.id)) {
      throw new Error(`Use registerDomain for domain state: ${service.id}`);
    }
    this.cores.set(service.id, service);
  }

  getDomain<T extends DomainState>(id: DomainStateId): T {
    const state = this.domains.get(id);
    if (!state) {
      throw new Error(`Domain state not registered: ${id}`);
    }
    return state as T;
  }

  // Typed domain accessors — the sanctioned way to read domain data outside services
  // (services receive these via constructor injection instead).

  get sessionState(): SessionState {
    return this.getDomain<SessionState>("sessionState");
  }

  get partyState(): PartyState {
    return this.getDomain<PartyState>("partyState");
  }

  get huntState(): HuntState {
    return this.getDomain<HuntState>("huntState");
  }

  get trainingState(): TrainingState {
    return this.getDomain<TrainingState>("trainingState");
  }

  get inventoryState(): InventoryState {
    return this.getDomain<InventoryState>("inventoryState");
  }

  get marketState(): MarketState {
    return this.getDomain<MarketState>("marketState");
  }

  get tasksState(): TasksState {
    return this.getDomain<TasksState>("tasksState");
  }

  get blessState(): BlessState {
    return this.getDomain<BlessState>("blessState");
  }

  tryGetDomain<T extends DomainState>(id: DomainStateId): T | undefined {
    return this.domains.get(id) as T | undefined;
  }

  get<T extends Service>(id: FeatureId): T {
    const service = this.cores.get(id);
    if (!service) {
      throw new Error(`Service not registered: ${id}`);
    }
    return service as T;
  }

  tryGet<T extends Service>(id: FeatureId): T | undefined {
    return this.cores.get(id) as T | undefined;
  }

  /** Resolve any registered service by id. */
  getService<T extends Service>(id: ServiceId): T {
    if (isFeatureId(id)) {
      return this.get<T>(id);
    }
    return this.getDomain<T & DomainState>(id) as T;
  }

  isMasterEnabled(id: FeatureId): boolean {
    return this.masters[id] !== false;
  }

  getMasters(): FeatureMasters {
    return { ...this.masters };
  }

  async setMasters(patch: Partial<FeatureMasters>): Promise<void> {
    let changed = false;
    for (const [id, enabled] of Object.entries(patch) as [FeatureId, boolean][]) {
      const wasEnabled = this.masters[id];
      if (wasEnabled === enabled) {
        continue;
      }
      changed = true;
      this.masters[id] = enabled;
      if (wasEnabled && !enabled) {
        const service = this.cores.get(id);
        service?.stop();
        await this.settings.transaction(() => getFeatureMasterOffPatch(id));
      } else if (!wasEnabled && enabled) {
        this.cores.get(id)?.start();
      }
    }
    // Turning a master ON does not touch settings, so notify explicitly so
    // HTTP/SSE clients see featureMasters in the next BotState projection.
    if (changed) {
      this.session.notifyChange();
    }
  }

  startAll(): void {
    for (const state of this.domainOrder) {
      state.start();
    }
    for (const [id, service] of this.cores) {
      if (this.isMasterEnabled(id)) {
        service.start();
      }
    }
  }

  stopAll(): void {
    for (const service of this.cores.values()) {
      service.stop();
    }
    for (const state of this.domainOrder) {
      state.stop();
    }
  }

  /** Cancel timers / in-flight automation when the transport drops. */
  onDisconnected(): void {
    for (const service of this.cores.values()) {
      service.stop();
    }
  }

  /** Collect serializable snapshots from core services for BotState. */
  serviceState(): Record<FeatureId, Record<string, unknown>> {
    const state = {} as Record<FeatureId, Record<string, unknown>>;
    for (const [id, service] of this.cores) {
      state[id] = service.snapshot();
    }
    return state;
  }

  setBattlePreset(preset: SessionView["battlePreset"]): void {
    this.battlePreset = preset;
  }

  getBattlePreset(): SessionView["battlePreset"] {
    return this.battlePreset;
  }

  setPlayerState(
    playerState: SessionView["playerState"],
    playerStateDetail = ""
  ): void {
    const previous = this.playerState;
    this.playerState = playerState;
    this.playerStateDetail = playerStateDetail;
    if (previous !== playerState) {
      this.emit({
        kind: "player_state_changed",
        previous,
        playerState,
      });
    }
  }

  getPlayerState(): {
    playerState: SessionView["playerState"];
    playerStateDetail: string;
  } {
    return {
      playerState: this.playerState,
      playerStateDetail: this.playerStateDetail,
    };
  }

  /**
   * Project a full SessionView from domain states + core service sessionOverlay().
   */
  projectSessionView(connection: SessionView["connection"]): SessionView {
    const session = this.tryGetDomain<SessionState>("sessionState");
    const party = this.tryGetDomain<PartyState>("partyState");
    const hunt = this.tryGetDomain<HuntState>("huntState");
    const training = this.tryGetDomain<TrainingState>("trainingState");
    const inventory = this.tryGetDomain<InventoryState>("inventoryState");
    const market = this.tryGetDomain<MarketState>("marketState");
    const tasks = this.tryGetDomain<TasksState>("tasksState");
    const bless = this.tryGetDomain<BlessState>("blessState");
    const combat = this.tryGetDomain<CombatState>("combatState");

    const huntGame = hunt?.projection() ?? {
      activeHuntId: null,
      activeHuntTitle: null,
      currentLureId: null,
      currentPartyTileX: null,
      currentPartyTileY: null,
    };

    let view: SessionView = {
      connection,
      character: session?.projection() ?? {
        characterName: null,
        characterId: null,
        characterVocation: null,
        level: null,
        goldCoins: null,
        staminaMs: null,
        lastStaminaUpdateAt: null,
        staminaConfig: null,
        finishedTasks: [],
        finishedQuests: [],
      },
      party: party?.projection() ?? {
        partyStatus: null,
        currentHuntId: null,
        partyLeaderId: null,
        partyMemberCount: null,
        partyMembers: [],
        partySnapshotSynced: false,
        lastSnapshotAt: null,
        readyCheckId: null,
        partyLootSplitter: null,
        lootSplitCompletedByPlayerId: {},
        lootSplitProgressFingerprint: null,
        lootSplitHistory: [],
      },
      hunt: {
        ...huntGame,
        lastBootstrapHuntId: null,
        pendingHuntLootSell: false,
        pendingHuntLootSellAt: null,
      },
      training: training?.projection() ?? { activeTrainingId: null },
      inventory: inventory?.projection() ?? {
        items: [],
        gameQuickSellDeselectedItemIds: [],
        gameLootFilterExcludedItemIds: [],
      },
      market: {
        ...(market?.projection() ?? { marketPrices: {}, marketPricesUpdatedAt: null }),
        marketScanStatus: "",
        marketFullScanStatus: "",
        huntLootSyncStatus: "",
        marketBoughtItems: [],
        marketMissedOffers: [],
        marketFullScanPage: null,
        marketFullScanTotalPages: null,
        marketFullScanCheckpointOrderId: null,
        recentMarketListings: {},
        lastQuestSnapshotAt: tasks?.lastQuestSnapshotAt ?? null,
      },
      quests: tasks?.projection() ?? { activeMonsterTasks: [] },
      bless: bless?.projection() ?? {
        blessSnapshotSynced: false,
        ownedCount: null,
        skillLossReductionPercent: null,
        itemLossPercent: null,
        hasAolEquipped: null,
        blessings: [],
        lastSnapshotAt: null,
      },
      combat: combat?.projection() ?? {
        entities: [],
        startedAt: null,
        updatedAt: null,
      },
      playerState: this.playerState,
      playerStateDetail: this.playerStateDetail,
      battlePreset: this.battlePreset,
    };

    for (const service of this.cores.values()) {
      view = patchSessionView(view, service.sessionOverlay());
    }

    return view;
  }

  /** Sync activity playerState from domain hunt/training when not in bot busy flows. */
  syncActivityPlayerState(): void {
    if (
      this.playerState === "selling_loot" ||
      this.playerState === "splitting_loot" ||
      this.playerState === "buying_bless"
    ) {
      return;
    }
    const hunt = this.tryGetDomain<HuntState>("huntState");
    const training = this.tryGetDomain<TrainingState>("trainingState");
    if (hunt?.activeHuntId != null) {
      this.setPlayerState("hunting", "");
      return;
    }
    if (training?.activeTrainingId != null) {
      this.setPlayerState("training", "");
      return;
    }
    this.setPlayerState("idling", "");
  }

  private pumpTail: Promise<void> = Promise.resolve();

  /** Queue a synthetic event to run after the current dispatch completes.
   *  If no dispatch is in progress, starts one. */
  emit(event: GameEvent): void {
    this.emitQueue.push(event);
    if (!this.draining) {
      this.pumpTail = this.pump();
    }
  }

  async dispatch(event: GameEvent): Promise<void> {
    this.emitQueue.push(event);
    this.pumpTail = this.pump();
    await this.pumpTail;
  }

  /** Await in-flight emit/dispatch pumps (tests / drainMessages). */
  async drain(): Promise<void> {
    await this.pumpTail;
    // Nested emits during the last pump may have started a new tail.
    while (this.draining || this.emitQueue.length > 0) {
      await this.pumpTail;
    }
  }

  /** Replace domain/core scoped state from a full projection (test / view setter). */
  seedFromProjection(projection: SessionView): void {
    this.setBattlePreset(projection.battlePreset);

    // Apply domains before playerState so syncActivityPlayerState on the emitted
    // player_state_changed event sees the new hunt/training ids.
    this.tryGetDomain<SessionState>("sessionState")?.applyCharacterPatch(projection.character);
    this.tryGetDomain<PartyState>("partyState")?.applyPartyPatch(projection.party);
    this.tryGetDomain<HuntState>("huntState")?.applyHuntPatch(projection.hunt);
    this.tryGetDomain<TrainingState>("trainingState")?.applyTrainingPatch(projection.training);
    this.tryGetDomain<InventoryState>("inventoryState")?.applyInventoryPatch(projection.inventory);
    this.tryGetDomain<MarketState>("marketState")?.applyMarketPatch(projection.market);
    this.tryGetDomain<TasksState>("tasksState")?.applyQuestsPatch(projection.quests);
    this.tryGetDomain<TasksState>("tasksState")?.applyLastQuestSnapshotAt(
      projection.market.lastQuestSnapshotAt
    );
    this.tryGetDomain<BlessState>("blessState")?.applyBlessPatch(projection.bless);

    this.tryGet<BattleService>("battle")?.applyLastBootstrapHuntId(
      projection.hunt.lastBootstrapHuntId
    );
    this.tryGet<LootService>("loot")?.applyPendingHuntLootPatch(projection.hunt);
    this.tryGet<MarketService>("market")?.patchMarketUi({
      marketScanStatus: projection.market.marketScanStatus,
      marketFullScanStatus: projection.market.marketFullScanStatus,
      huntLootSyncStatus: projection.market.huntLootSyncStatus,
      marketBoughtItems: projection.market.marketBoughtItems,
      marketMissedOffers: projection.market.marketMissedOffers,
      marketFullScanPage: projection.market.marketFullScanPage,
      marketFullScanTotalPages: projection.market.marketFullScanTotalPages,
      marketFullScanCheckpointOrderId: projection.market.marketFullScanCheckpointOrderId,
      recentMarketListings: projection.market.recentMarketListings,
    });

    this.setPlayerState(projection.playerState, projection.playerStateDetail);
  }

  /** Apply domain states only (for wire path before CommandBus). */
  async applyDomains(event: GameEvent): Promise<void> {
    for (const state of this.domainOrder) {
      try {
        await state.onEvent(event);
      } catch (error) {
        console.error(
          `[${state.id}] ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    this.syncActivityPlayerState();
    this.session.invalidateProjection();
  }

  /** Apply master-gated core services (serialized for deterministic ordering). */
  async applyCores(event: GameEvent): Promise<void> {
    const activeCores = [...this.cores.values()].filter((s) =>
      isFeatureId(s.id) ? this.isMasterEnabled(s.id) : true
    );

    for (const service of activeCores) {
      try {
        await service.onEvent(event);
      } catch (error) {
        console.error(
          `[${service.id}] ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.session.invalidateProjection();
  }

  private async pump(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.emitQueue.length > 0) {
        const next = this.emitQueue.shift()!;
        await this.dispatchOne(next);
      }
    } finally {
      this.draining = false;
    }
  }

  private async dispatchOne(event: GameEvent): Promise<void> {
    await this.applyDomains(event);
    await this.applyCores(event);
  }
}
