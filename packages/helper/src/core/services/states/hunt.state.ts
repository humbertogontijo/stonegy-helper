import { ReceiveMessageTypes } from "../../../protocol";
import { readAppliedLureIdFromPayload, readLureId } from "../../../domain/hunt/lure";
import { parsePartyPositionFromHuntUpdate } from "../../../hunts";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { HuntProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";
import type { SessionState } from "./session.state";
import type { PartyState } from "./party.state";

function defaultHunt(): Omit<
  HuntProjection,
  "pendingHuntLootSell" | "pendingHuntLootSellAt" | "lastBootstrapHuntId"
> {
  return {
    activeHuntId: null,
    activeHuntTitle: null,
    currentLureId: null,
    currentPartyTileX: null,
    currentPartyTileY: null,
  };
}

export class HuntState extends DomainState {
  readonly id: DomainStateId = "huntState";

  private _activeHuntId: number | null = null;
  private _activeHuntTitle: string | null = null;
  private _currentLureId: number | null = null;
  private _currentPartyTileX: number | null = null;
  private _currentPartyTileY: number | null = null;

  constructor(
    ctx: ServiceContext,
    private readonly sessionState: SessionState,
    private readonly partyState: PartyState
  ) {
    super(ctx);
  }

  /** True when an active hunt id is set or party status is hunting. */
  isActivelyHunting(): boolean {
    return this._activeHuntId != null || this.partyState.partyStatus === "hunting";
  }

  get activeHuntId(): number | null {
    return this._activeHuntId;
  }

  get activeHuntTitle(): string | null {
    return this._activeHuntTitle;
  }

  get currentLureId(): number | null {
    return this._currentLureId;
  }

  get currentPartyTileX(): number | null {
    return this._currentPartyTileX;
  }

  get currentPartyTileY(): number | null {
    return this._currentPartyTileY;
  }

  /** Game hunt slice (bot-only pending/bootstrap fields merged elsewhere). */
  projection(): Pick<
    HuntProjection,
    | "activeHuntId"
    | "activeHuntTitle"
    | "currentLureId"
    | "currentPartyTileX"
    | "currentPartyTileY"
  > {
    return {
      activeHuntId: this._activeHuntId,
      activeHuntTitle: this._activeHuntTitle,
      currentLureId: this._currentLureId,
      currentPartyTileX: this._currentPartyTileX,
      currentPartyTileY: this._currentPartyTileY,
    };
  }

  applyHuntPatch(
    patch: Partial<
      Pick<
        HuntProjection,
        | "activeHuntId"
        | "activeHuntTitle"
        | "currentLureId"
        | "currentPartyTileX"
        | "currentPartyTileY"
      >
    >
  ): void {
    if (patch.activeHuntId !== undefined) {
      this._activeHuntId = patch.activeHuntId;
    }
    if (patch.activeHuntTitle !== undefined) {
      this._activeHuntTitle = patch.activeHuntTitle;
    }
    if (patch.currentLureId !== undefined) {
      this._currentLureId = patch.currentLureId;
    }
    if (patch.currentPartyTileX !== undefined) {
      this._currentPartyTileX = patch.currentPartyTileX;
    }
    if (patch.currentPartyTileY !== undefined) {
      this._currentPartyTileY = patch.currentPartyTileY;
    }
  }

  private clear(): void {
    const cleared = defaultHunt();
    this._activeHuntId = cleared.activeHuntId;
    this._activeHuntTitle = cleared.activeHuntTitle;
    this._currentLureId = cleared.currentLureId;
    this._currentPartyTileX = cleared.currentPartyTileX;
    this._currentPartyTileY = cleared.currentPartyTileY;
  }

  async onEvent(event: GameEvent): Promise<void> {
    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP) {
      const hunt = message.data?.hunt;
      if (hunt == null) {
        this.clear();
        return;
      }
      this._activeHuntId =
        typeof hunt.id === "number" ? hunt.id : this._activeHuntId;
      this._activeHuntTitle =
        typeof hunt.title === "string" && hunt.title.length > 0
          ? hunt.title
          : this._activeHuntTitle;
      const bootstrapLureId = readAppliedLureIdFromPayload(message.data);
      if (bootstrapLureId != null) {
        this._currentLureId = bootstrapLureId;
      }
      const position = parsePartyPositionFromHuntUpdate(
        message.data,
        this.sessionState.characterId
      );
      if (position) {
        this._currentPartyTileX = position.x;
        this._currentPartyTileY = position.y;
      }
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_FINISHED) {
      this.clear();
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_UPDATE_PLAYERS) {
      const position = parsePartyPositionFromHuntUpdate(
        message.data,
        this.sessionState.characterId
      );
      if (position) {
        this._currentPartyTileX = position.x;
        this._currentPartyTileY = position.y;
      }
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_UPDATE_LURE) {
      const currentLureId = readLureId(message.data?.lureId);
      if (currentLureId != null) {
        this._currentLureId = currentLureId;
      }
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
