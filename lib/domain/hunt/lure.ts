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
