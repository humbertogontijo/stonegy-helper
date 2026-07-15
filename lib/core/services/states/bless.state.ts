import type { Blessing, BlessSnapshotPayload } from "../../../protocol-messages";
import { ReceiveMessageTypes } from "../../../protocol";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { BlessProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";

function defaultBless(): BlessProjection {
  return {
    blessSnapshotSynced: false,
    ownedCount: null,
    skillLossReductionPercent: null,
    itemLossPercent: null,
    hasAolEquipped: null,
    blessings: [],
    lastSnapshotAt: null,
  };
}

function normalizeBlessings(raw: BlessSnapshotPayload["blessings"] | undefined): Blessing[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((blessing) => ({
    id: blessing.id,
    name: blessing.name,
    tier: blessing.tier,
    iconPath: blessing.iconPath,
    owned: blessing.owned === true,
    cost: blessing.cost,
  }));
}

export class BlessState extends DomainState {
  readonly id: DomainStateId = "blessState";

  private bless: BlessProjection = defaultBless();

  constructor(ctx: ServiceContext) {
    super(ctx);
  }

  get blessSnapshotSynced(): boolean {
    return this.bless.blessSnapshotSynced;
  }

  get ownedCount(): number | null {
    return this.bless.ownedCount;
  }

  get blessings(): Blessing[] {
    return this.bless.blessings;
  }

  get lastSnapshotAt(): number | null {
    return this.bless.lastSnapshotAt;
  }

  get hasAolEquipped(): boolean | null {
    return this.bless.hasAolEquipped;
  }

  projection(): BlessProjection {
    return {
      ...this.bless,
      blessings: this.bless.blessings.map((blessing) => ({ ...blessing })),
    };
  }

  applyBlessPatch(patch: Partial<BlessProjection>): void {
    this.bless = {
      ...this.bless,
      ...patch,
      blessings: patch.blessings
        ? patch.blessings.map((blessing) => ({ ...blessing }))
        : this.bless.blessings,
    };
  }

  /** Optimistically mark a purchased blessing as owned (until the next snapshot). */
  markOwned(blessingId: number): void {
    const blessings = this.bless.blessings.map((blessing) =>
      blessing.id === blessingId ? { ...blessing, owned: true } : blessing
    );
    const ownedCount = blessings.filter((blessing) => blessing.owned).length;
    this.bless = {
      ...this.bless,
      blessings,
      ownedCount,
    };
  }

  /** Death consumes blessings — clear ownership so automation gates immediately. */
  clearAfterDeath(): void {
    this.bless = {
      ...this.bless,
      ownedCount: 0,
      hasAolEquipped: false,
      blessings: this.bless.blessings.map((blessing) => ({ ...blessing, owned: false })),
      blessSnapshotSynced: true,
      lastSnapshotAt: Date.now(),
    };
  }

  async onEvent(event: GameEvent): Promise<void> {
    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.BLESS_SNAPSHOT) {
      const data = message.data as BlessSnapshotPayload | undefined;
      this.bless = {
        blessSnapshotSynced: true,
        ownedCount: typeof data?.ownedCount === "number" ? data.ownedCount : null,
        skillLossReductionPercent:
          typeof data?.skillLossReductionPercent === "number"
            ? data.skillLossReductionPercent
            : null,
        itemLossPercent: typeof data?.itemLossPercent === "number" ? data.itemLossPercent : null,
        hasAolEquipped: typeof data?.hasAolEquipped === "boolean" ? data.hasAolEquipped : null,
        blessings: normalizeBlessings(data?.blessings),
        lastSnapshotAt: Date.now(),
      };
      return;
    }

    if (message.type === ReceiveMessageTypes.PLAYER_DEATH) {
      this.clearAfterDeath();
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
