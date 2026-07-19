import { describe, expect, it } from "vitest";
import type { ActiveMonsterTask } from "../types";
import {
  formatActiveTasks,
  formatMonsterTaskProgress,
  getActiveTasksForQuest,
  isMissionTasksComplete,
  isStaleClaimTaskerStatus,
  previewTaskerHunt,
} from "./tasks";

const warzoneTasks: ActiveMonsterTask[] = [
  {
    questId: 5,
    questTitle: "Bigfoot's Burden (Warzone)",
    missionId: 2,
    missionTitle: "Warzone II",
    monsterId: 117,
    requiredAmount: 200,
    currentAmount: 166,
    met: false,
  },
  {
    questId: 5,
    questTitle: "Bigfoot's Burden (Warzone)",
    missionId: 2,
    missionTitle: "Warzone II",
    monsterId: 74,
    requiredAmount: 200,
    currentAmount: 177,
    met: false,
  },
];

describe("getActiveTasksForQuest", () => {
  it("returns every monster counter for the active mission", () => {
    const tasks = [
      ...warzoneTasks,
      {
        questId: 6,
        missionId: 11,
        missionTitle: "Paw and Fur II - Bonebeast",
        monsterId: 49,
        requiredAmount: 700,
        currentAmount: 0,
        met: false,
      },
    ];

    expect(getActiveTasksForQuest(tasks, 5)).toEqual(warzoneTasks);
    expect(getActiveTasksForQuest(tasks, 6)).toHaveLength(1);
  });
});

describe("isMissionTasksComplete", () => {
  it("requires every monster requirement to be met", () => {
    expect(isMissionTasksComplete(warzoneTasks)).toBe(false);

    const oneDone: ActiveMonsterTask[] = [
      { ...warzoneTasks[0], currentAmount: 200, met: true },
      warzoneTasks[1],
    ];
    expect(isMissionTasksComplete(oneDone)).toBe(false);

    const bothDone: ActiveMonsterTask[] = [
      { ...warzoneTasks[0], currentAmount: 200, met: true },
      { ...warzoneTasks[1], currentAmount: 200, met: true },
    ];
    expect(isMissionTasksComplete(bothDone)).toBe(true);
  });
});

describe("formatActiveTasks", () => {
  it("shows monster names and amounts instead of a single mission title", () => {
    expect(formatMonsterTaskProgress(warzoneTasks[0])).toBe("Lost Berserker · 166/200");
    expect(formatMonsterTaskProgress(warzoneTasks[1])).toBe("Lava Golem · 177/200");
    expect(formatActiveTasks(warzoneTasks)).toBe(
      "Lost Berserker · 166/200, Lava Golem · 177/200"
    );
  });
});

describe("previewTaskerHunt", () => {
  it("surfaces all active monsters for multi-requirement missions", () => {
    const preview = previewTaskerHunt(5, {
      activeTasks: warzoneTasks,
      level: 80,
    });

    expect(preview.activeTasks).toHaveLength(2);
    expect(preview.mission?.title).toBe("Warzone II");
    expect(preview.huntId).toBe(48);
  });
});

describe("isStaleClaimTaskerStatus", () => {
  it("detects leftover claim messages", () => {
    expect(isStaleClaimTaskerStatus("Recompensa resgatada.")).toBe(true);
    expect(isStaleClaimTaskerStatus("Reward claimed — next task…")).toBe(true);
    expect(isStaleClaimTaskerStatus("Hunting")).toBe(false);
  });
});
