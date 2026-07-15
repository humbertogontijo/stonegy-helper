import { ReceiveMessageTypes } from "../../../protocol";
import type { InventoryItemEntry } from "../../../binary/types";
import { applyInventoryMonsterLootDrops } from "../../../inventory";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { InventoryProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";

export class InventoryState extends DomainState {
  readonly id: DomainStateId = "inventoryState";

  private items: InventoryItemEntry[] = [];
  private gameQuickSellDeselectedItemIds: number[] = [];
  private gameLootFilterExcludedItemIds: number[] = [];

  constructor(ctx: ServiceContext) {
    super(ctx);
  }

  get inventoryItems(): InventoryItemEntry[] {
    return this.items;
  }

  get quickSellDeselectedItemIds(): number[] {
    return this.gameQuickSellDeselectedItemIds;
  }

  get lootFilterExcludedItemIds(): number[] {
    return this.gameLootFilterExcludedItemIds;
  }

  projection(): InventoryProjection {
    return {
      items: this.items,
      gameQuickSellDeselectedItemIds: this.gameQuickSellDeselectedItemIds,
      gameLootFilterExcludedItemIds: this.gameLootFilterExcludedItemIds,
    };
  }

  applyInventoryPatch(patch: Partial<InventoryProjection>): void {
    if (patch.items) {
      this.items = patch.items;
    }
    if (patch.gameQuickSellDeselectedItemIds) {
      this.gameQuickSellDeselectedItemIds = patch.gameQuickSellDeselectedItemIds;
    }
    if (patch.gameLootFilterExcludedItemIds) {
      this.gameLootFilterExcludedItemIds = patch.gameLootFilterExcludedItemIds;
    }
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind === "inventory_snapshot") {
      this.items = event.data.items;
      return;
    }

    if (event.kind === "monster_loot") {
      const drops = event.data.drops;
      if (drops?.length) {
        this.items = applyInventoryMonsterLootDrops(this.items, drops);
      }
      return;
    }

    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.UPDATE_BATTLE_CONFIG && message.data) {
      const data = message.data as {
        quickSellDeselectedItemIds?: number[];
        lootFilterExcludedItemIds?: number[];
      };
      if (Array.isArray(data.quickSellDeselectedItemIds)) {
        this.gameQuickSellDeselectedItemIds = data.quickSellDeselectedItemIds.filter(
          (itemId) => Number.isFinite(itemId) && itemId > 0
        );
      }
      if (Array.isArray(data.lootFilterExcludedItemIds)) {
        this.gameLootFilterExcludedItemIds = data.lootFilterExcludedItemIds.filter(
          (itemId) => Number.isFinite(itemId) && itemId > 0
        );
      }
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
