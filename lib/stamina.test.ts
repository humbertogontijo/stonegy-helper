import { describe, expect, it } from "vitest";
import {
  computeCurrentStaminaMs,
  isStaminaConsuming,
  parseLastStaminaUpdateAt,
  parseStaminaConfig,
  reanchorStamina,
  resolveDisplayedStaminaMs,
} from "./stamina";

const sampleConfig = {
  maxStaminaMs: 43_200_000,
  recoveryFactor: 2,
  consumptionIntervalMs: 60_000,
  consumptionAmountMs: 60_000,
};

describe("stamina parsing", () => {
  it("parses stamina config from session bootstrap", () => {
    expect(
      parseStaminaConfig({
        maxStaminaMs: 43_200_000,
        recoveryFactor: 2,
        consumptionIntervalMs: 60_000,
        consumptionAmountMs: 60_000,
        bossConsumesStamina: false,
      })
    ).toEqual(sampleConfig);
  });

  it("parses lastStaminaUpdate timestamps", () => {
    expect(parseLastStaminaUpdateAt("2026-07-07T14:55:52.899Z")).toBe(
      Date.parse("2026-07-07T14:55:52.899Z")
    );
  });
});

describe("computeCurrentStaminaMs", () => {
  const anchorAt = Date.parse("2026-07-07T14:55:52.899Z");

  it("recovers 1 minute of stamina every 2 minutes while idle", () => {
    const current = computeCurrentStaminaMs({
      anchorMs: 0,
      lastUpdateAt: anchorAt,
      config: sampleConfig,
      consuming: false,
      now: anchorAt + 2 * 60_000,
    });

    expect(current).toBe(60_000);
  });

  it("recovers 30 minutes after one hour idle", () => {
    const current = computeCurrentStaminaMs({
      anchorMs: 0,
      lastUpdateAt: anchorAt,
      config: sampleConfig,
      consuming: false,
      now: anchorAt + 60 * 60_000,
    });

    expect(current).toBe(30 * 60_000);
  });

  it("consumes 1 minute of stamina per minute while hunting", () => {
    const current = computeCurrentStaminaMs({
      anchorMs: 3 * 60 * 60_000,
      lastUpdateAt: anchorAt,
      config: sampleConfig,
      consuming: true,
      now: anchorAt + 45 * 60_000,
    });

    expect(current).toBe(2 * 60 * 60_000 + 15 * 60_000);
  });

  it("clamps recovery to max stamina", () => {
    const current = computeCurrentStaminaMs({
      anchorMs: 42 * 60 * 60_000,
      lastUpdateAt: anchorAt,
      config: sampleConfig,
      consuming: false,
      now: anchorAt + 10 * 60 * 60_000,
    });

    expect(current).toBe(sampleConfig.maxStaminaMs);
  });
});

describe("reanchorStamina", () => {
  it("detects hunting as stamina-consuming", () => {
    expect(
      isStaminaConsuming({ party: { partyStatus: "hunting" }, hunt: { activeHuntId: 95 } })
    ).toBe(true);
    expect(
      isStaminaConsuming({ party: { partyStatus: "idle" }, hunt: { activeHuntId: null } })
    ).toBe(false);
  });

  it("reanchors to the computed value at the transition time", () => {
    const anchorAt = Date.parse("2026-07-07T14:55:52.899Z");
    const now = anchorAt + 60 * 60_000;
    const reanchored = reanchorStamina(
      {
        character: {
          staminaMs: 0,
          lastStaminaUpdateAt: anchorAt,
          staminaConfig: sampleConfig,
        },
        party: { partyStatus: "idle" },
        hunt: { activeHuntId: null },
      },
      now
    );

    expect(reanchored).toEqual({
      staminaMs: 30 * 60_000,
      lastStaminaUpdateAt: now,
    });
  });
});

describe("resolveDisplayedStaminaMs", () => {
  it("falls back to the stored anchor when config is missing", () => {
    expect(
      resolveDisplayedStaminaMs({
        character: {
          staminaMs: 1_234,
          lastStaminaUpdateAt: null,
          staminaConfig: null,
        },
        party: { partyStatus: "idle" },
        hunt: { activeHuntId: null },
      })
    ).toBe(1_234);
  });
});
