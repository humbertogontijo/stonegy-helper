import {
  formatActiveHuntSelectorLabel,
  getHuntLureOptions,
  getHuntLureRange,
  isStartableHuntId,
  listHuntSelectorOptions,
  resolveLureId,
  resolvePartyPosition,
  resolveSelectorHuntIdFromBootstrap,
} from "./hunts";
import { encodeBossHuntId, encodeQuestHuntId } from "./hunt-ids";
import { GLOBAL_LURE_ID_MAX } from "./domain/hunt/lure";
import { listQuestCombatMissions } from "./quests";
import { describe, expect, it } from "vitest";

describe("listHuntSelectorOptions", () => {
  it("includes regular hunts, quest combat maps, and boss maps", () => {
    const options = listHuntSelectorOptions();
    expect(options.some((entry) => entry.kind === "hunt")).toBe(true);
    expect(options.some((entry) => entry.kind === "quest")).toBe(true);
    expect(options.some((entry) => entry.kind === "boss")).toBe(true);
  });

  it("uses non-colliding synthetic ids for quest and boss entries", () => {
    const options = listHuntSelectorOptions();
    const huntIds = new Set(options.filter((e) => e.kind === "hunt").map((e) => e.id));
    const quest = options.find((e) => e.kind === "quest");
    const boss = options.find((e) => e.kind === "boss");
    expect(quest).toBeDefined();
    expect(boss).toBeDefined();
    expect(huntIds.has(quest!.id)).toBe(false);
    expect(huntIds.has(boss!.id)).toBe(false);
  });

  it("labels quest and boss entries clearly", () => {
    const options = listHuntSelectorOptions();
    expect(options.find((e) => e.kind === "quest")?.label.startsWith("Quest ·")).toBe(true);
    expect(options.find((e) => e.kind === "boss")?.label.startsWith("Boss ·")).toBe(true);
  });
});

describe("isStartableHuntId", () => {
  it("accepts catalog hunts and rejects synthetic boss/quest ids", () => {
    expect(isStartableHuntId(12)).toBe(true);
    expect(isStartableHuntId(encodeBossHuntId(1))).toBe(false);
    const mission = listQuestCombatMissions()[0];
    expect(isStartableHuntId(encodeQuestHuntId(mission.questId, mission.missionId))).toBe(false);
  });
});

describe("encode activity hunt ids", () => {
  it("round-trips quest and boss encodings used by the selector", () => {
    const mission = listQuestCombatMissions()[0];
    expect(mission).toBeDefined();
    const questId = encodeQuestHuntId(mission.questId, mission.missionId);
    expect(listHuntSelectorOptions().some((e) => e.id === questId && e.kind === "quest")).toBe(
      true
    );
    expect(
      listHuntSelectorOptions().some((e) => e.id === encodeBossHuntId(1) && e.kind === "boss")
    ).toBe(true);
  });
});

describe("resolveSelectorHuntIdFromBootstrap", () => {
  it("returns real hunt ids as-is", () => {
    expect(resolveSelectorHuntIdFromBootstrap({ id: 12 })).toBe(12);
  });

  it("maps quest room bootstraps to the synthetic quest selector id", () => {
    const mission = listQuestCombatMissions().find(
      (entry) => entry.questId === 4 && entry.missionId === 2
    );
    expect(mission).toBeDefined();
    expect(
      resolveSelectorHuntIdFromBootstrap({
        id: 900402,
        mode: "quest",
        questFight: { questId: 4, missionId: 2 },
      })
    ).toBe(encodeQuestHuntId(4, 2));
  });

  it("maps boss fight bootstraps even when game hunt id collides with a catalog hunt", () => {
    // Hunt #43 is "Lava Lurker"; Count of the Core also boots as hunt id 43.
    expect(
      resolveSelectorHuntIdFromBootstrap({
        id: 43,
        mode: "boss",
        bossFight: { bossId: 43 },
      })
    ).toBe(encodeBossHuntId(43));
  });

  it("returns null for unknown ephemeral hunt ids without quest/boss metadata", () => {
    expect(resolveSelectorHuntIdFromBootstrap({ id: 900402 })).toBeNull();
  });
});

describe("formatActiveHuntSelectorLabel", () => {
  it("prefers the live bootstrap title", () => {
    expect(formatActiveHuntSelectorLabel(900402, "The Pits of Inferno - Alavanca 14")).toBe(
      "#900402 · The Pits of Inferno - Alavanca 14"
    );
  });
});

describe("resolvePartyPosition", () => {
  it("returns null when preferred is unset", () => {
    expect(resolvePartyPosition(96, null)).toBeNull();
    expect(resolvePartyPosition(96, undefined)).toBeNull();
  });

  it("returns preferred when it is walkable for the hunt", () => {
    expect(resolvePartyPosition(96, { x: 2, y: 0 })).toEqual({ x: 2, y: 0 });
  });

  it("returns null when preferred is blocked for the hunt", () => {
    expect(resolvePartyPosition(96, { x: 3, y: 0 })).toBeNull();
  });

  it("does not invent a fallback tile", () => {
    expect(resolvePartyPosition(1, null)).toBeNull();
  });
});

describe("getHuntLureRange", () => {
  it("clamps hunt maxLure above the global catalog", () => {
    // Gnomegate Crystal Dungeon lists maxLure: 8 in game data; catalog max is 7.
    expect(getHuntLureRange(64)).toEqual({ min: 5, max: GLOBAL_LURE_ID_MAX });
    expect(getHuntLureOptions(64)).toEqual([5, 6, 7]);
  });
});

describe("resolveLureId", () => {
  it("returns null when preferred is unset", () => {
    expect(resolveLureId(96, null)).toBeNull();
    expect(resolveLureId(96, undefined)).toBeNull();
  });

  it("returns preferred when valid for the hunt", () => {
    expect(resolveLureId(96, 2)).toBe(2);
  });

  it("returns null when preferred is out of range", () => {
    expect(resolveLureId(96, 99)).toBeNull();
  });

  it("does not invent a fallback lure", () => {
    expect(resolveLureId(1, null)).toBeNull();
  });
});
