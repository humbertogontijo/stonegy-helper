export const STONEGY_BINARY_MAGIC = "SG";
export const STONEGY_BINARY_VERSION = 0x05;

export enum StonegyBinaryMessageType {
  HuntEntitySpawn = 0x02,
  HuntAnalyzerSnapshot = 0x05,
  KillEvent = 0x06,
  EntityUpdate = 0x08,
  VitalDelta = 0x09,
  /** Multiplexed hunt frame: monster loot, item grants, or entity uuid lists. */
  HuntLoot = 0x0a,
  AnalyzerStats = 0x0b,
  CounterTriplet = 0x0c,
  /** Gold wallet push — observed as the quick-sell ack (and other gold changes). */
  GoldBalance = 0x0d,
  MapBootstrap = 0x0e,
  InventorySnapshot = 0x10,
  Ping = 0x11,
  /** Named ability cast — same payload layout as AutoAttack. */
  AbilityCast = 0x12,
  PlayerUpdate = 0x14,
  XpGain = 0x15,
  SessionMetric = 0x16,
  Speech = 0x17,
  StatusEffect = 0x18,
  AutoAttack = 0x19,
  GroundItemUpdate = 0x1a,
  /** Visual/outfit sync frames observed during city and outfit flows. */
  VisualUpdate = 0x1b,
  SpellCast = 0x1c,
  /** Large hunt-area payload observed between spell casts and entity moves. */
  HuntWorldSnapshot = 0x1f,
  EntityMove = 0x20,
  EntityPosition = 0x21,
  /** Server-side entity position sync observed between move and market frames. */
  EntityPositionSync = 0x22,
  MarketSnapshot = 0x26,
  /** Client map/area selection observed when entering home or city maps. */
  ClientAreaSelect = 0x65,
  /** Compact client input frames observed on send alongside 0x65. */
  ClientInput = 0x66,
  /** Client area heartbeat observed on send with the same layout as 0x65. */
  ClientAreaPulse = 0x67,
}

export interface BinaryEnvelope {
  magic: typeof STONEGY_BINARY_MAGIC;
  version: number;
  type: number;
  payloadOffset: number;
}

export interface InventoryItemEntry {
  uuid: string;
  itemId: number;
  amount: number;
  flagsA: number;
  flagsB: number;
  /** Remaining charges/duration units from flagsA high word (0 = unset/unused for timed items). */
  remainingUnits: number;
}

export interface InventorySnapshotBody {
  goldCoins: number;
  reserved: number;
  padding: number;
  /** Number of depot items following the backpack section. */
  depotItemCount: number;
  capacity: number;
  /** Backpack slots used, as reported by the server header. */
  usedSlots: number;
  unknownByte: number;
  items: InventoryItemEntry[];
  depot?: InventoryDepotSection;
}

export interface InventoryDepotSection {
  sectionType: number;
  items: InventoryItemEntry[];
}

export interface SpeechBody {
  channel: number;
  mode: number;
  text: string;
}

export interface SpellCastBody {
  strings: string[];
  header: {
    mode: number;
    effectId: number;
    fieldA: number;
    fieldB: number;
  };
  effects: Array<{ fields: number[] }>;
}

export interface AutoAttackBody {
  strings: string[];
  targetCount: number;
  timestamp: number;
  targets: Array<{
    attackerIndex: number;
    effectType: number;
    paramA: number;
    paramB: number;
    paramC: number;
    /** Present on multi-hit ability frames that omit the u64 timestamp. */
    tail?: number;
  }>;
  effects: Array<{ fields: number[] }>;
  /** Observed on batched multi-cast frames before the per-target records. */
  batchLead?: number;
}

export interface SupportAbilityCastEffectTail {
  fieldA: number;
  fieldB: number;
  fieldC: number;
  byteD: number;
  byteE: number;
  durationMs: number;
  values: number[];
}

export interface SupportAbilityCastBody {
  header: {
    byteA: number;
    byteB: number;
    byteC: number;
    byteD: number;
  };
  strings: string[];
  effectTail?: SupportAbilityCastEffectTail;
  rawTail: Uint8Array;
}

export interface VisualUpdateBody {
  /** Leading discriminator byte; changes the tail layout (meaning unconfirmed). */
  leadByte: number;
  /** Compact 4-byte entity handle (hex), stable per entity across frames. */
  entityHandle: string;
  /** Remaining payload bytes, not yet mapped. */
  raw: Uint8Array;
}

export interface WorldSnapshotEntity {
  name: string;
  /** Signed tile offsets from the player. */
  dx: number;
  dy: number;
  dz: number;
  /** Remaining per-entity block bytes, not yet mapped. */
  raw: Uint8Array;
}

export interface HuntWorldSnapshotBody {
  entityCount: number;
  entities: WorldSnapshotEntity[];
  /** Trailing tile/path section following the entity list, not yet mapped. */
  tail: Uint8Array;
}

export interface EntityMoveBody {
  entityIndex: number;
  moveKind: number;
  name: string;
  delta: number;
  reserved: number;
  state: number;
}

export interface EntityPositionBody {
  entityIndex: number;
  name: string;
  delta: number;
  fieldA: number;
  fieldB: number;
  state: number;
}

export interface MapBootstrapEntry {
  key: number;
  type: number;
  sub: number;
  value?: number;
  raw?: number;
  blob?: Uint8Array;
  children?: MapBootstrapEntry[];
}

export interface MapBootstrapBody {
  mapId: number;
  schemaVersion: number;
  reserved: number;
  sections: MapBootstrapEntry[];
}

import type { ClientAreaBody } from "./client-area.ts";
import type {
  AnalyzerStatsBody,
  CombatDamageBody,
  CounterTripletBody,
  EntityUpdateBody,
  GroundItemUpdateBody,
  HuntEntitySpawnBody,
  HuntAnalyzerSnapshotBody,
  EntityUuidListBody,
  MonsterLootBody,
  ItemGrantBody,
  KillEventBody,
  PlayerVitalsBody,
  SessionMetricBody,
  GoldBalanceBody,
  StatusEffectBody,
  VitalDeltaBody,
  XpGainBody,
} from "../protocol-messages.ts";

export interface UnknownBinaryBody {
  raw: Uint8Array;
  error?: string;
}

export interface BinaryMarketOrder {
  id: string;
  itemId: number;
  tier: number;
  isOwnOrder: boolean;
  isBuyOrder: boolean;
  eachPrice: number;
  itemAmount: number;
  totalPrice: number;
  createdAt: string;
}

export interface MarketSnapshotBody {
  page: number;
  totalPages: number;
  requestedItemId: number | null;
  selectedItemTradableAmount: number;
  sellOrders: BinaryMarketOrder[];
  buyOrders: BinaryMarketOrder[];
  sellOrderAnchors: number[];
  buyOrderAnchors: number[];
}

export type DecodedBinaryBody =
  | { kind: "ping" }
  | { kind: "hunt_entity_spawn"; data: HuntEntitySpawnBody }
  | { kind: "hunt_analyzer_snapshot"; data: HuntAnalyzerSnapshotBody }
  | { kind: "kill_event"; data: KillEventBody }
  | { kind: "entity_update"; data: EntityUpdateBody }
  | { kind: "vital_delta"; data: VitalDeltaBody }
  | { kind: "monster_loot"; data: MonsterLootBody }
  | { kind: "item_grant"; data: ItemGrantBody }
  | { kind: "entity_uuid_list"; data: EntityUuidListBody }
  | { kind: "analyzer_stats"; data: AnalyzerStatsBody }
  | { kind: "counter_triplet"; data: CounterTripletBody }
  | { kind: "gold_balance"; data: GoldBalanceBody }
  | { kind: "inventory_snapshot"; data: InventorySnapshotBody }
  | { kind: "market_snapshot"; data: MarketSnapshotBody }
  | { kind: "player_update"; data: PlayerVitalsBody }
  | { kind: "xp_gain"; data: XpGainBody }
  | { kind: "session_metric"; data: SessionMetricBody }
  | { kind: "speech"; data: SpeechBody }
  | { kind: "spell_cast"; data: SpellCastBody }
  | { kind: "status_effect"; data: StatusEffectBody }
  | { kind: "combat_damage"; data: CombatDamageBody }
  | { kind: "auto_attack"; data: AutoAttackBody }
  | { kind: "support_ability_cast"; data: SupportAbilityCastBody }
  | { kind: "ground_item_update"; data: GroundItemUpdateBody }
  | { kind: "client_input"; data: { fields: number[] } }
  | { kind: "client_area"; data: ClientAreaBody }
  | { kind: "entity_move"; data: EntityMoveBody }
  | { kind: "entity_position"; data: EntityPositionBody }
  | { kind: "map_bootstrap"; data: MapBootstrapBody }
  | { kind: "visual_update"; data: VisualUpdateBody }
  | { kind: "hunt_world_snapshot"; data: HuntWorldSnapshotBody }
  | { kind: "unknown"; data: UnknownBinaryBody };

export interface DecodedBinaryMessage {
  envelope: BinaryEnvelope;
  body: DecodedBinaryBody;
}
