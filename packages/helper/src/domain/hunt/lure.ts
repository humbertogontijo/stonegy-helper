/**
 * Global lure pace options from the game client (`i8` in the Stonegy _app bundle).
 * Hunt `minLure`/`maxLure` are indices into this table; values outside it are unused.
 */
export const HUNT_LURE_CATALOG = [
  { id: 1, min: 1, max: 2 },
  { id: 2, min: 2, max: 3 },
  { id: 3, min: 3, max: 4 },
  { id: 4, min: 4, max: 5 },
  { id: 5, min: 5, max: 6 },
  { id: 6, min: 6, max: 7 },
  { id: 7, min: 7, max: 8 },
] as const;

export const GLOBAL_LURE_ID_MIN = HUNT_LURE_CATALOG[0].id;
export const GLOBAL_LURE_ID_MAX = HUNT_LURE_CATALOG[HUNT_LURE_CATALOG.length - 1].id;

export function clampLureId(lureId: number): number {
  return Math.max(GLOBAL_LURE_ID_MIN, Math.min(GLOBAL_LURE_ID_MAX, lureId));
}

export function readLureId(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readLureIdFromPayload(data: Record<string, unknown> | undefined): number | null {
  if (!data) {
    return null;
  }

  const direct = readLureId(data.lureId);
  if (direct != null) {
    return direct;
  }

  const hunt = data.hunt;
  if (hunt && typeof hunt === "object") {
    const huntLure = readLureId((hunt as Record<string, unknown>).lureId);
    if (huntLure != null) {
      return huntLure;
    }
  }

  const analyzer = data.analyzer;
  if (analyzer && typeof analyzer === "object") {
    return readLureId((analyzer as Record<string, unknown>).lureId);
  }

  return null;
}

/** Active lure amount during a hunt — only from explicit live-state fields. */
export function readAppliedLureIdFromPayload(
  data: Record<string, unknown> | undefined
): number | null {
  if (!data) {
    return null;
  }

  const direct = readLureId(data.currentLureId ?? data.lureAmount ?? data.appliedLureId);
  if (direct != null) {
    return direct;
  }

  const analyzer = data.analyzer;
  if (analyzer && typeof analyzer === "object") {
    const analyzerRecord = analyzer as Record<string, unknown>;
    const fromAnalyzer = readLureId(
      analyzerRecord.currentLureId ?? analyzerRecord.lureAmount ?? analyzerRecord.appliedLureId
    );
    if (fromAnalyzer != null) {
      return fromAnalyzer;
    }
  }

  return null;
}
