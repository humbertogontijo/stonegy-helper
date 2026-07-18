/** Rolling window used for peak DPS. */
export const DPS_WINDOW_MS = 1000;

/** Synthetic bucket for dealt damage whose party attacker cannot be proven. */
export const UNATTRIBUTED_DAMAGE_ENTITY_INDEX = 0;

/**
 * Element labels from the `kind` hi byte (shared by dealt monster rows and
 * taken float rows). Confirmed against spells with known elements on live
 * traffic: Terra Wave/Terra Strike → 1, Great Fireball Rune → 2, Avalanche
 * Rune → 3, Thunderstorm Rune → 4, Divine Caldera → 6, weapon skills and
 * monster melee → 8, life-drain monster abilities → 9.
 */
const DAMAGE_ELEMENT_LABELS: Record<number, string> = {
  1: "Earth",
  2: "Fire",
  3: "Ice",
  4: "Energy",
  5: "Mana",
  6: "Holy",
  8: "Physical",
  9: "Life Drain",
};

export function damageElementLabel(element: number): string {
  return DAMAGE_ELEMENT_LABELS[element] ?? `Unknown (${element})`;
}

/** Identity for now — kept so callers can canonicalize once labels stabilize. */
export function canonicalDamageElement(element: number): number {
  return element;
}

/**
 * Party-player combat hit for the analyzer.
 * - Taken: `combat_float` HP damage + tag-0x80 rows from spell_cast/auto_attack
 * - Dealt: monster hits from spell_cast / auto_attack attributed to attacker
 */
export interface DamageHitInput {
  runtimePlayerId: number;
  amount: number;
  /** When true (default), counts toward taken damage. */
  asTaken?: boolean;
  /** When true, counts toward dealt damage (monster hits). */
  asDealt?: boolean;
  /** School/element id (hi byte of the wire `kind`), when known. */
  element?: number;
}

export interface DamageHitStamp {
  at: number;
  amount: number;
}

export interface EntityDamageBucket {
  entityIndex: number;
  name: string | null;
  dealtSum: number;
  dealtMaxDps: number;
  takenSum: number;
  takenMaxDps: number;
  dealtWindow: DamageHitStamp[];
  takenWindow: DamageHitStamp[];
  /** element id → damage total */
  dealtByElement: Map<number, number>;
  takenByElement: Map<number, number>;
}

export interface DamageElementStat {
  element: number;
  label: string;
  amount: number;
  /** Share of the parent dealt/taken total, 0–100. */
  percent: number;
}

export interface DamageAnalyzerState {
  entities: Map<number, EntityDamageBucket>;
  startedAt: number | null;
  updatedAt: number | null;
}

export interface DamageEntityStats {
  entityIndex: number;
  name: string;
  dealtSum: number;
  dealtMaxDps: number;
  takenSum: number;
  takenMaxDps: number;
  /** Sorted descending by amount. */
  dealtByElement: DamageElementStat[];
  takenByElement: DamageElementStat[];
}

export function createDamageAnalyzerState(): DamageAnalyzerState {
  return {
    entities: new Map(),
    startedAt: null,
    updatedAt: null,
  };
}

export function resetDamageAnalyzer(_state?: DamageAnalyzerState): DamageAnalyzerState {
  return createDamageAnalyzerState();
}

export function entityDisplayName(entityIndex: number, name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (entityIndex === UNATTRIBUTED_DAMAGE_ENTITY_INDEX) {
    return "Unknown party attacker";
  }
  return `Entity #${entityIndex}`;
}

function ensureBucket(
  entities: Map<number, EntityDamageBucket>,
  entityIndex: number
): EntityDamageBucket {
  const existing = entities.get(entityIndex);
  if (existing) {
    return existing;
  }
  const created: EntityDamageBucket = {
    entityIndex,
    name: null,
    dealtSum: 0,
    dealtMaxDps: 0,
    takenSum: 0,
    takenMaxDps: 0,
    dealtWindow: [],
    takenWindow: [],
    dealtByElement: new Map(),
    takenByElement: new Map(),
  };
  entities.set(entityIndex, created);
  return created;
}

function cloneBucket(bucket: EntityDamageBucket): EntityDamageBucket {
  return {
    ...bucket,
    dealtWindow: bucket.dealtWindow.map((hit) => ({ ...hit })),
    takenWindow: bucket.takenWindow.map((hit) => ({ ...hit })),
    dealtByElement: new Map(bucket.dealtByElement),
    takenByElement: new Map(bucket.takenByElement),
  };
}

function addElement(byElement: Map<number, number>, element: number | undefined, amount: number): void {
  if (element == null) {
    return;
  }
  const key = canonicalDamageElement(element);
  byElement.set(key, (byElement.get(key) ?? 0) + amount);
}

function pruneAndPeak(
  window: DamageHitStamp[],
  amount: number,
  at: number,
  previousMax: number
): { window: DamageHitStamp[]; maxDps: number } {
  const nextWindow = window.filter((hit) => at - hit.at <= DPS_WINDOW_MS);
  nextWindow.push({ at, amount });
  const currentDps = nextWindow.reduce((sum, hit) => sum + hit.amount, 0);
  return {
    window: nextWindow,
    maxDps: Math.max(previousMax, currentDps),
  };
}

export function setEntityName(
  state: DamageAnalyzerState,
  entityIndex: number,
  name: string
): DamageAnalyzerState {
  const trimmed = name.trim();
  if (!trimmed) {
    return state;
  }

  const existing = state.entities.get(entityIndex);
  // Don't create empty rows for named party members who haven't fought yet.
  if (!existing) {
    return state;
  }

  const entities = new Map(state.entities);
  const bucket = cloneBucket(existing);
  bucket.name = trimmed;
  entities.set(entityIndex, bucket);

  return {
    ...state,
    entities,
  };
}

/**
 * Record party-player hits.
 * - `asTaken` (default true unless `asDealt` alone): damage received
 * - `asDealt`: damage dealt to monsters
 */
export function recordHits(
  state: DamageAnalyzerState,
  hits: readonly DamageHitInput[],
  atMs: number
): DamageAnalyzerState {
  if (hits.length === 0) {
    return state;
  }

  const entities = new Map(
    [...state.entities.entries()].map(([index, bucket]) => [index, cloneBucket(bucket)])
  );

  let recorded = false;
  for (const hit of hits) {
    if (!Number.isFinite(hit.amount) || hit.amount <= 0) {
      continue;
    }

    const asDealt = hit.asDealt === true;
    // Dealt-only hits must not also inflate taken; combat_float owns taken.
    const asTaken = hit.asTaken === true || (hit.asTaken !== false && !asDealt);

    if (!asTaken && !asDealt) {
      continue;
    }

    const bucket = ensureBucket(entities, hit.runtimePlayerId);

    if (asDealt) {
      const dealt = pruneAndPeak(bucket.dealtWindow, hit.amount, atMs, bucket.dealtMaxDps);
      bucket.dealtSum += hit.amount;
      bucket.dealtWindow = dealt.window;
      bucket.dealtMaxDps = dealt.maxDps;
      addElement(bucket.dealtByElement, hit.element, hit.amount);
      recorded = true;
    }

    if (asTaken) {
      const taken = pruneAndPeak(bucket.takenWindow, hit.amount, atMs, bucket.takenMaxDps);
      bucket.takenSum += hit.amount;
      bucket.takenWindow = taken.window;
      bucket.takenMaxDps = taken.maxDps;
      addElement(bucket.takenByElement, hit.element, hit.amount);
      recorded = true;
    }

    entities.set(hit.runtimePlayerId, bucket);
  }

  if (!recorded) {
    return state;
  }

  return {
    entities,
    startedAt: state.startedAt ?? atMs,
    updatedAt: atMs,
  };
}

function projectElements(
  byElement: Map<number, number>,
  total: number
): DamageElementStat[] {
  return [...byElement.entries()]
    .map(([element, amount]) => ({
      element,
      label: damageElementLabel(element),
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.element - b.element);
}

export function projectDamageEntities(state: DamageAnalyzerState): DamageEntityStats[] {
  return [...state.entities.values()]
    .map((bucket) => ({
      entityIndex: bucket.entityIndex,
      name: entityDisplayName(bucket.entityIndex, bucket.name),
      dealtSum: bucket.dealtSum,
      dealtMaxDps: bucket.dealtMaxDps,
      takenSum: bucket.takenSum,
      takenMaxDps: bucket.takenMaxDps,
      dealtByElement: projectElements(bucket.dealtByElement, bucket.dealtSum),
      takenByElement: projectElements(bucket.takenByElement, bucket.takenSum),
    }))
    .sort(
      (a, b) =>
        b.dealtSum - a.dealtSum || b.takenSum - a.takenSum || a.entityIndex - b.entityIndex
    );
}
