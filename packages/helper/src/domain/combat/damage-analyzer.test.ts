import { describe, expect, it } from "vitest";
import {
  createDamageAnalyzerState,
  DPS_WINDOW_MS,
  projectDamageEntities,
  recordHits,
  resetDamageAnalyzer,
  setEntityName,
} from "./damage-analyzer";

describe("damage analyzer", () => {
  it("sums taken damage and tracks peak 1s dps per runtimePlayerId", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(
      state,
      [
        { runtimePlayerId: 1, amount: 52 },
        { runtimePlayerId: 1, amount: 48 },
      ],
      1_000
    );

    const [target] = projectDamageEntities(state);
    expect(target).toMatchObject({
      entityIndex: 1,
      dealtSum: 0,
      dealtMaxDps: 0,
      takenSum: 100,
      takenMaxDps: 100,
    });
  });

  it("computes max dps from the rolling window, not the full session", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(state, [{ runtimePlayerId: 3, amount: 200 }], 0);
    state = recordHits(
      state,
      [{ runtimePlayerId: 3, amount: 50 }],
      DPS_WINDOW_MS + 1
    );

    const [target] = projectDamageEntities(state);
    expect(target.takenSum).toBe(250);
    expect(target.takenMaxDps).toBe(200);
  });

  it("keeps same-timestamp hits inside the peak window", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(
      state,
      [
        { runtimePlayerId: 1, amount: 189 },
        { runtimePlayerId: 2, amount: 337 },
        { runtimePlayerId: 2, amount: 972 },
      ],
      5_000
    );

    const rows = projectDamageEntities(state);
    expect(rows[0]).toMatchObject({
      entityIndex: 2,
      takenSum: 1309,
      takenMaxDps: 1309,
      dealtSum: 0,
    });
    expect(rows[1]).toMatchObject({
      entityIndex: 1,
      takenSum: 189,
      takenMaxDps: 189,
      dealtSum: 0,
    });
  });

  it("skips hits marked asTaken=false", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(
      state,
      [
        { runtimePlayerId: 1, amount: 100, asTaken: false },
        { runtimePlayerId: 1, amount: 40 },
      ],
      10
    );

    expect(projectDamageEntities(state)).toEqual([
      expect.objectContaining({ entityIndex: 1, takenSum: 40 }),
    ]);
  });

  it("sums dealt damage separately from taken", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(
      state,
      [
        { runtimePlayerId: 1, amount: 500, asDealt: true },
        { runtimePlayerId: 1, amount: 50 },
        { runtimePlayerId: 2, amount: 200, asDealt: true },
      ],
      1_000
    );

    const rows = projectDamageEntities(state);
    expect(rows[0]).toMatchObject({
      entityIndex: 1,
      dealtSum: 500,
      dealtMaxDps: 500,
      takenSum: 50,
    });
    expect(rows[1]).toMatchObject({
      entityIndex: 2,
      dealtSum: 200,
      takenSum: 0,
    });
  });

  it("computes avg dps from session duration (floored to 1s)", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(state, [{ runtimePlayerId: 1, amount: 100, asDealt: true }], 0);
    state = recordHits(state, [{ runtimePlayerId: 1, amount: 100, asDealt: true }], 4_000);

    const [row] = projectDamageEntities(state);
    expect(row.dealtSum).toBe(200);
    expect(row.dealtAvgDps).toBe(50);
    expect(row.dealtMaxDps).toBe(100);
  });

  it("floors avg dps duration to at least one second", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(state, [{ runtimePlayerId: 1, amount: 300 }], 5_000);

    const [row] = projectDamageEntities(state);
    expect(row.takenAvgDps).toBe(300);
  });

  it("aggregates damage by element for dealt and taken", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(
      state,
      [
        { runtimePlayerId: 1, amount: 100, asDealt: true, element: 4 },
        { runtimePlayerId: 1, amount: 40, asDealt: true, element: 1 },
        { runtimePlayerId: 1, amount: 25, element: 2 },
        { runtimePlayerId: 1, amount: 30, element: 8 },
      ],
      1_000
    );

    const [row] = projectDamageEntities(state);
    expect(row.dealtByElement).toEqual([
      { element: 4, label: "Energy", amount: 100, percent: 71 },
      { element: 1, label: "Earth", amount: 40, percent: 29 },
    ]);
    expect(row.takenByElement).toEqual([
      { element: 8, label: "Physical", amount: 30, percent: 55 },
      { element: 2, label: "Fire", amount: 25, percent: 45 },
    ]);
  });

  it("resolves entity names and falls back to Entity #N", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(state, [{ runtimePlayerId: 4, amount: 10 }], 10);
    state = setEntityName(state, 4, "HeroOne");

    const rows = projectDamageEntities(state);
    expect(rows.find((row) => row.entityIndex === 4)?.name).toBe("HeroOne");
  });

  it("resets all totals", () => {
    let state = createDamageAnalyzerState();
    state = recordHits(state, [{ runtimePlayerId: 1, amount: 99 }], 1);
    state = resetDamageAnalyzer(state);

    expect(projectDamageEntities(state)).toEqual([]);
    expect(state.startedAt).toBeNull();
    expect(state.updatedAt).toBeNull();
  });
});
