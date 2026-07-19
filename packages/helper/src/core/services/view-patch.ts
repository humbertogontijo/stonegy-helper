import type { SessionView } from "../projections/types";
import type { SessionState } from "./states/session.state";
import type { PartyState } from "./states/party.state";
import type { HuntState } from "./states/hunt.state";
import type { TrainingState } from "./states/training.state";
import type { InventoryState } from "./states/inventory.state";
import type { MarketState } from "./states/market.state";
import type { TasksState } from "./states/tasks.state";
import type { BlessState } from "./states/bless.state";
import type { MarketService } from "./market.service";
import type { BattleService } from "./battle.service";
import type { LootService } from "./loot.service";
import type { ServiceRegistry } from "./registry";

type ViewPatch = {
  [K in keyof SessionView]?: SessionView[K] extends object
    ? Partial<SessionView[K]>
    : SessionView[K];
};

/**
 * Write patches through to domain *State / core scoped fields when present,
 * then shallow-merge onto the current view (does not rebuild from domains).
 */
export function applyViewPatchToServices(
  registry: ServiceRegistry,
  current: SessionView,
  patch: ViewPatch
): SessionView {
  if (patch.playerState != null) {
    registry.setPlayerState(patch.playerState, patch.playerStateDetail ?? "");
  } else if (patch.playerStateDetail != null) {
    const cur = registry.getPlayerState();
    registry.setPlayerState(cur.playerState, patch.playerStateDetail);
  }

  if (patch.battlePreset) {
    registry.setBattlePreset({
      ...registry.getBattlePreset(),
      ...patch.battlePreset,
    });
  }

  const session = registry.tryGetDomain<SessionState>("sessionState");
  if (session && patch.character) {
    session.applyCharacterPatch(patch.character);
  }

  const party = registry.tryGetDomain<PartyState>("partyState");
  if (party && patch.party) {
    party.applyPartyPatch(patch.party);
  }

  const hunt = registry.tryGetDomain<HuntState>("huntState");
  if (hunt && patch.hunt) {
    hunt.applyHuntPatch(patch.hunt);
  }

  const training = registry.tryGetDomain<TrainingState>("trainingState");
  if (training && patch.training) {
    training.applyTrainingPatch(patch.training);
  }

  const inventory = registry.tryGetDomain<InventoryState>("inventoryState");
  if (inventory && patch.inventory) {
    inventory.applyInventoryPatch(patch.inventory);
  }

  const marketState = registry.tryGetDomain<MarketState>("marketState");
  if (marketState && patch.market) {
    marketState.applyMarketPatch(patch.market);
  }

  const tasks = registry.tryGetDomain<TasksState>("tasksState");
  if (tasks && patch.quests) {
    tasks.applyQuestsPatch(patch.quests);
  }
  if (tasks && patch.market?.lastQuestSnapshotAt !== undefined) {
    tasks.applyLastQuestSnapshotAt(patch.market.lastQuestSnapshotAt);
  }

  const bless = registry.tryGetDomain<BlessState>("blessState");
  if (bless && patch.bless) {
    bless.applyBlessPatch(patch.bless);
  }

  const marketSvc = registry.tryGet<MarketService>("market");
  if (marketSvc && patch.market) {
    const uiPatch: Parameters<MarketService["patchMarketUi"]>[0] = {};
    if (patch.market.marketScanStatus !== undefined) {
      uiPatch.marketScanStatus = patch.market.marketScanStatus;
    }
    if (patch.market.marketFullScanStatus !== undefined) {
      uiPatch.marketFullScanStatus = patch.market.marketFullScanStatus;
    }
    if (patch.market.huntLootSyncStatus !== undefined) {
      uiPatch.huntLootSyncStatus = patch.market.huntLootSyncStatus;
    }
    if (patch.market.marketBoughtItems !== undefined) {
      uiPatch.marketBoughtItems = patch.market.marketBoughtItems;
    }
    if (patch.market.marketMissedOffers !== undefined) {
      uiPatch.marketMissedOffers = patch.market.marketMissedOffers;
    }
    if (patch.market.marketFullScanPage !== undefined) {
      uiPatch.marketFullScanPage = patch.market.marketFullScanPage;
    }
    if (patch.market.marketFullScanTotalPages !== undefined) {
      uiPatch.marketFullScanTotalPages = patch.market.marketFullScanTotalPages;
    }
    if (patch.market.marketFullScanCheckpointOrderId !== undefined) {
      uiPatch.marketFullScanCheckpointOrderId = patch.market.marketFullScanCheckpointOrderId;
    }
    if (patch.market.recentMarketListings !== undefined) {
      uiPatch.recentMarketListings = patch.market.recentMarketListings;
    }
    marketSvc.patchMarketUi(uiPatch);
  }

  const battle = registry.tryGet<BattleService>("battle");
  if (battle && patch.hunt?.lastBootstrapHuntId !== undefined) {
    battle.applyLastBootstrapHuntId(patch.hunt.lastBootstrapHuntId);
  }

  const loot = registry.tryGet<LootService>("loot");
  if (loot && patch.hunt) {
    loot.applyPendingHuntLootPatch(patch.hunt);
  }

  return registry.projectSessionView(
    patch.connection
      ? { ...current.connection, ...patch.connection }
      : current.connection
  );
}
