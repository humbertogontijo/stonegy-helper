import type { PartyLootSplitter } from "../../../protocol-messages";
import { ReceiveMessageTypes } from "../../../protocol";
import { parsePartyCharacterFields, readId } from "../../../domain/party/fields";
import { readPartyMemberCount } from "../../humanize";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import {
  reconcileLootSplitProgress,
} from "../../projections/loot-split-progress";
import type { PartyProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";

function defaultParty(): PartyProjection {
  return {
    partyStatus: null,
    currentHuntId: null,
    partyLeaderId: null,
    partyMemberCount: null,
    partySnapshotSynced: false,
    lastSnapshotAt: null,
    readyCheckId: null,
    partyLootSplitter: null,
    lootSplitCompletedByPlayerId: {},
    lootSplitProgressFingerprint: null,
    lootSplitHistory: [],
  };
}

function shouldClearPartySnapshot(
  party: { members?: unknown[] } | null | undefined
): boolean {
  if (party == null) {
    return true;
  }
  const memberCount = readPartyMemberCount(party);
  return memberCount == null || memberCount === 0;
}

export class PartyState extends DomainState {
  readonly id: DomainStateId = "partyState";

  private party: PartyProjection = defaultParty();

  /** Character fields sometimes arrive on party:snapshot — SessionState may merge these. */
  private lastCharacterFields: {
    characterId: string | null;
    characterName: string | null;
    level: number | null;
    characterVocation: string | null;
  } = {
    characterId: null,
    characterName: null,
    level: null,
    characterVocation: null,
  };

  constructor(ctx: ServiceContext) {
    super(ctx);
  }

  get partyStatus(): string | null {
    return this.party.partyStatus;
  }

  get currentHuntId(): number | null {
    return this.party.currentHuntId;
  }

  get partyLeaderId(): string | null {
    return this.party.partyLeaderId;
  }

  get partyMemberCount(): number | null {
    return this.party.partyMemberCount;
  }

  get partySnapshotSynced(): boolean {
    return this.party.partySnapshotSynced;
  }

  get lastSnapshotAt(): number | null {
    return this.party.lastSnapshotAt;
  }

  get readyCheckId(): string | null {
    return this.party.readyCheckId;
  }

  get partyLootSplitter(): PartyLootSplitter | null {
    return this.party.partyLootSplitter;
  }

  get lootSplitHistory() {
    return this.party.lootSplitHistory;
  }

  get lootSplitCompletedByPlayerId() {
    return this.party.lootSplitCompletedByPlayerId;
  }

  get lootSplitProgressFingerprint() {
    return this.party.lootSplitProgressFingerprint;
  }

  getCharacterFieldsFromParty() {
    return { ...this.lastCharacterFields };
  }

  setPartyStatus(status: string | null): void {
    this.party = { ...this.party, partyStatus: status };
  }

  /** Bot bookkeeping for loot split — called by LootService. */
  patchLootSplitProgress(
    patch: Partial<
      Pick<
        PartyProjection,
        | "lootSplitCompletedByPlayerId"
        | "lootSplitProgressFingerprint"
        | "lootSplitHistory"
        | "partyLootSplitter"
      >
    >
  ): void {
    this.party = { ...this.party, ...patch };
  }

  projection(): PartyProjection {
    return { ...this.party };
  }

  applyPartyPatch(patch: Partial<PartyProjection>): void {
    this.party = { ...this.party, ...patch };
  }

  async onEvent(event: GameEvent): Promise<void> {
    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.PARTY_SNAPSHOT) {
      const party = message.data?.party;
      this.lastCharacterFields = parsePartyCharacterFields(message.data);

      if (shouldClearPartySnapshot(party)) {
        this.party = {
          ...defaultParty(),
          partySnapshotSynced: true,
          lastSnapshotAt: Date.now(),
          lootSplitHistory: this.party.lootSplitHistory,
        };
        return;
      }

      const memberCount = readPartyMemberCount(party);
      const nextSplitter = party?.lootSplitter ?? null;
      const readyCheckId =
        typeof party?.readyCheck?.id === "string" ? party.readyCheck.id : null;
      this.party = {
        ...this.party,
        partySnapshotSynced: true,
        partyStatus: typeof party?.status === "string" ? party.status : this.party.partyStatus,
        currentHuntId: typeof party?.currentHuntId === "number" ? party.currentHuntId : null,
        partyLeaderId: readId(party?.leaderId) ?? this.party.partyLeaderId,
        partyMemberCount: memberCount ?? this.party.partyMemberCount,
        readyCheckId,
        lastSnapshotAt: Date.now(),
        partyLootSplitter: nextSplitter,
        ...reconcileLootSplitProgress(this.party, nextSplitter),
      };
      return;
    }

    // Cross-domain activity signals from hunt/training lifecycle
    if (
      message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP &&
      message.data?.hunt == null
    ) {
      this.party = { ...this.party, partyStatus: "idle" };
      return;
    }
    if (message.type === ReceiveMessageTypes.HUNT_FINISHED) {
      this.party = { ...this.party, partyStatus: "idle" };
      return;
    }
    if (
      message.type === ReceiveMessageTypes.TRAINING_BOOTSTRAP &&
      message.data?.training == null
    ) {
      this.party = { ...this.party, partyStatus: "idle" };
      return;
    }
    if (message.type === ReceiveMessageTypes.TRAINING_BOOTSTRAP && message.data?.training) {
      this.party = { ...this.party, partyStatus: "training" };
      return;
    }
    if (message.type === ReceiveMessageTypes.TRAINING_FINISHED) {
      this.party = { ...this.party, partyStatus: "idle" };
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
