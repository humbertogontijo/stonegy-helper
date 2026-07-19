import { mergeMarketSnapshot, snapshotToStateRecord } from "../../../market/store";
import { ReceiveMessageTypes } from "../../../protocol";
import type { ItemMarketPrice } from "../../../types";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { MarketProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";

export class MarketState extends DomainState {
  readonly id: DomainStateId = "marketState";

  private marketPrices: Record<number, ItemMarketPrice> = {};
  private marketPricesUpdatedAt: number | null = null;

  /** Set by session before dispatch when attributing a snapshot to an in-flight request. */
  requestedItemId: number | null = null;

  constructor(ctx: ServiceContext) {
    super(ctx);
  }

  get prices(): Record<number, ItemMarketPrice> {
    return this.marketPrices;
  }

  get pricesUpdatedAt(): number | null {
    return this.marketPricesUpdatedAt;
  }

  /** Price slice only — scan UI fields live on MarketService. */
  projection(): Pick<MarketProjection, "marketPrices" | "marketPricesUpdatedAt"> {
    return {
      marketPrices: this.marketPrices,
      marketPricesUpdatedAt: this.marketPricesUpdatedAt,
    };
  }

  applyMarketPatch(
    patch: Partial<Pick<MarketProjection, "marketPrices" | "marketPricesUpdatedAt">>
  ): void {
    if (patch.marketPrices) {
      this.marketPrices = patch.marketPrices;
    }
    if (patch.marketPricesUpdatedAt !== undefined) {
      this.marketPricesUpdatedAt = patch.marketPricesUpdatedAt;
    }
  }

  async onEvent(event: GameEvent): Promise<void> {
    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.MARKET_SNAPSHOT) {
      mergeMarketSnapshot(message.data, {
        requestedItemId: this.requestedItemId,
      });
      this.marketPrices = snapshotToStateRecord();
      this.marketPricesUpdatedAt = Date.now();
      this.requestedItemId = null;
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
