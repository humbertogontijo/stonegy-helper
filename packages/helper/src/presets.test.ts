import { describe, expect, it } from "vitest";
import { createBattlePreset, resolveStartHuntSkills } from "./presets";

describe("resolveStartHuntSkills", () => {
  const configured = createBattlePreset({
    selectedSkills: ["Configured A", "Configured B", null, null],
  });
  const fromEvents = createBattlePreset({
    selectedSkills: ["Last Used", null, null, null],
  });

  it("uses the last event skills when auto-apply presets is off", () => {
    expect(resolveStartHuntSkills(false, configured, fromEvents)).toEqual([
      "Last Used",
      null,
      null,
      null,
    ]);
  });

  it("uses the configured preset when auto-apply presets is on", () => {
    expect(resolveStartHuntSkills(true, configured, fromEvents)).toEqual([
      "Configured A",
      "Configured B",
      null,
      null,
    ]);
  });

  it("falls back to event skills when auto-apply is on but no preset is configured", () => {
    expect(resolveStartHuntSkills(true, null, fromEvents)).toEqual([
      "Last Used",
      null,
      null,
      null,
    ]);
  });
});
