import type { AbilityCombatHit, CombatActor } from "./ability-combat-hits.ts";

export const STONEGY_BINARY_MAGIC = "SG";
export const STONEGY_BINARY_VERSION = 0x05;

export enum StonegyBinaryMessageType {
  HuntEntitySpawn = 0x02,
  HuntAnalyzerSnapshot = 0x05,
  KillEvent = 0x06,
  /** Spell/potion cooldown sync (records of unix-ms expiries). */
  CooldownUpdate = 0x08,
  Vitals = 0x09,
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
  /** Xp record batch on hunt bootstrap/reconnect (formerly "PlayerUpdate"). */
  XpSummary = 0x14,
  XpGain = 0x15,
  SessionMetric = 0x16,
  Speech = 0x17,
  /** Batched effect/AoE area records (formerly misread as "StatusEffect"). */
  EffectArea = 0x18,
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

/** One utterance on a type 0x17 frame (frames batch multiple speakers). */
export interface SpeechEntry {
  /** Observed constant 2 — likely the speech mode (spell yell). */
  mode: number;
  /** Runtime party-member index (matches xp share memberIndex values). */
  speakerIndex: number;
  text: string;
}

export interface SpeechBody {
  entries: SpeechEntry[];
}

export interface SpellCastBody {
  strings: string[];
  /**
   * 0x0f (spell) / 0x1f (weapon swing) actor records — attacker + ability
   * string index. Monster rows reference this list by actor index.
   */
  actors: CombatActor[];
  /** Player float rows + attributed monster hits. */
  combatHits: AbilityCombatHit[];
}

export interface AutoAttackBody {
  strings: string[];
  /** Player float rows + attributed monster hits. */
  combatHits: AbilityCombatHit[];
}

/**
 * Status effect attached to a support-cast entry (observed: Burning DoT on
 * Utamo Tempo refresh frames). Wire layout: uuid string + element/name/icon
 * strings + 4 × u32.
 */
export interface SupportAbilityStatusEffect {
  /** UUIDv7 identifying the status-effect instance. */
  uuid: string;
  /** Damage school code (observed "FIRE"). */
  element: string;
  /** Display name (observed "Burning"). */
  name: string;
  /** Icon asset path (observed "/assets/icons/Burning_Icon.gif"). */
  iconPath: string;
  /** Total effect duration in ms (observed 312000). */
  totalDurationMs: number;
  /** Unknown u32 between duration and amount (observed 1). */
  fieldA: number;
  /** Per-tick amount (observed 25 for Burning). */
  amount: number;
  /** Tick interval in ms (observed 4000). */
  tickIntervalMs: number;
}

export interface SupportAbilityCastEffectTail {
  /** Milliseconds remaining on the buff when the frame was sent. */
  remainingMs: number;
  /**
   * Optional u8 present when entry header.byteA has bits 0x02/0x04 set
   * (observed: Magic Shield strength = 100; byteA ∈ {0x03, 0x04}).
   */
  extra?: number;
  /** Status effects attached to the entry (e.g. Burning while the buff refreshes). */
  statusEffects?: SupportAbilityStatusEffect[];
  /** Trailing flag byte before duration (observed 0 or 1). */
  flag: number;
  durationMs: number;
  values: number[];
}

export interface SupportAbilityCastEntry {
  header: {
    byteA: number;
    byteB: number;
    byteC: number;
  };
  /**
   * Typically [spellCode, displayName, iconGif]. Empty for headerless
   * continuation entries (header.byteB === 0), which carry only the tail.
   */
  strings: string[];
  /** 0 for continuation entries (no remainingMs on the wire). */
  remainingMs: number;
  extra?: number;
  /** Status effects attached to this entry (e.g. Burning DoT). */
  statusEffects?: SupportAbilityStatusEffect[];
  flag: number;
  durationMs: number;
  values: number[];
}

export interface SupportAbilityCastBody {
  /** One or more active support buffs in this frame. */
  entries: SupportAbilityCastEntry[];
  /**
   * Compat mirror of `entries[0].header` with `byteD: 0`.
   * Legacy captures treated `entryCount + header` as a fixed 4-byte header.
   */
  header: {
    byteA: number;
    byteB: number;
    byteC: number;
    byteD: number;
  };
  /** Flattened strings across all entries. */
  strings: string[];
  /** Compat mirror of the first entry's effect fields. */
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

/** One outfit color slot (0x01 marker + RGB). Slots map to head/body/legs/feet. */
export interface EntityAppearanceColor {
  marker: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Appearance/outfit block on moveKind=1 entity_move records — identical to the
 * tail of a type-0x1f world-snapshot entity block.
 */
export interface EntityAppearance {
  level: number;
  fieldA: number;
  fieldB: number;
  looktype: number;
  flag: number;
  value: number;
  reserved: number;
  colors: EntityAppearanceColor[];
}

export interface EntityMoveRecord {
  moveKind: number;
  name: string;
  delta: number;
  reserved: number;
  state: number;
  /** Present when moveKind=1 (entity appearing in view). */
  appearance?: EntityAppearance;
}

export interface EntityMoveBody {
  records: EntityMoveRecord[];
}

export interface EntityPositionRecord {
  name: string;
  delta: number;
  fieldA: number;
  fieldB: number;
  state: number;
}

export interface EntityPositionBody {
  records: EntityPositionRecord[];
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
  CombatFloatBody,
  CounterTripletBody,
  CooldownUpdateBody,
  EffectAreaBody,
  GroundItemUpdateBody,
  HuntEntitySpawnBody,
  HuntAnalyzerSnapshotBody,
  EntityUuidListBody,
  MonsterLootBody,
  ItemGrantBody,
  KillEventBody,
  SessionMetricBody,
  GoldBalanceBody,
  VitalsBody,
  XpGainBody,
  XpSummaryBody,
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
  /** Unmapped footer bytes; presence means the frame is incomplete. */
  trailingBytes?: Uint8Array;
}

export type DecodedBinaryBody =
  | { kind: "ping" }
  | { kind: "hunt_entity_spawn"; data: HuntEntitySpawnBody }
  | { kind: "hunt_analyzer_snapshot"; data: HuntAnalyzerSnapshotBody }
  | { kind: "kill_event"; data: KillEventBody }
  | { kind: "cooldown_update"; data: CooldownUpdateBody }
  | { kind: "vitals"; data: VitalsBody }
  | { kind: "monster_loot"; data: MonsterLootBody }
  | { kind: "item_grant"; data: ItemGrantBody }
  | { kind: "entity_uuid_list"; data: EntityUuidListBody }
  | { kind: "analyzer_stats"; data: AnalyzerStatsBody }
  | { kind: "counter_triplet"; data: CounterTripletBody }
  | { kind: "gold_balance"; data: GoldBalanceBody }
  | { kind: "inventory_snapshot"; data: InventorySnapshotBody }
  | { kind: "market_snapshot"; data: MarketSnapshotBody }
  | { kind: "xp_summary"; data: XpSummaryBody }
  | { kind: "xp_gain"; data: XpGainBody }
  | { kind: "session_metric"; data: SessionMetricBody }
  | { kind: "speech"; data: SpeechBody }
  | { kind: "spell_cast"; data: SpellCastBody }
  | { kind: "effect_area"; data: EffectAreaBody }
  | { kind: "combat_float"; data: CombatFloatBody }
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
