import { HUNTS } from "@stonegy/game-data/hunts";
import { QUESTS } from "@stonegy/game-data/quests";
import { getMonsterById } from "../monsters";
import type {
  ActiveMonsterTask,
  MonsterTaskQuestSummary,
  QuestMission,
  QuestRecord,
} from "../types";

export function normalizeActiveMonsterTask(raw: unknown): ActiveMonsterTask | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const task = raw as Record<string, unknown>;
  const questId = task.questId;
  const missionId = task.missionId;

  if (typeof questId !== "number" || typeof missionId !== "number") {
    return null;
  }

  return {
    questId,
    missionId,
    monsterId: typeof task.monsterId === "number" ? task.monsterId : null,
    requiredAmount: typeof task.requiredAmount === "number" ? task.requiredAmount : null,
    currentAmount: typeof task.currentAmount === "number" ? task.currentAmount : null,
    met: task.met === true,
    questTitle: typeof task.questTitle === "string" ? task.questTitle : undefined,
    missionTitle: typeof task.missionTitle === "string" ? task.missionTitle : undefined,
  };
}

export function normalizeActiveMonsterTasks(raw: unknown): ActiveMonsterTask[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(normalizeActiveMonsterTask).filter((task): task is ActiveMonsterTask => task !== null);
}

export function parseTasksSnapshot(data: unknown): ActiveMonsterTask[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  return normalizeActiveMonsterTasks((data as Record<string, unknown>).activeMonsterTasks);
}

/** Parses all task-progress fields from a `tasks:snapshot` payload root. */
export function parseTasksSnapshotFields(data: unknown): {
  activeMonsterTasks: ActiveMonsterTask[];
  finishedTasks: number[];
  finishedQuests: number[];
} {
  if (!data || typeof data !== "object") {
    return { activeMonsterTasks: [], finishedTasks: [], finishedQuests: [] };
  }

  const record = data as Record<string, unknown>;
  const activeMonsterTasks = parseTasksSnapshot(data);

  return {
    activeMonsterTasks,
    finishedTasks: Array.isArray(record.finishedTasks)
      ? record.finishedTasks.filter((id): id is number => typeof id === "number")
      : [],
    finishedQuests: Array.isArray(record.finishedQuests)
      ? record.finishedQuests.filter((id): id is number => typeof id === "number")
      : [],
  };
}

export function parseCharacterTaskFields(character: unknown): {
  activeMonsterTasks: ActiveMonsterTask[];
  finishedTasks: number[];
  finishedQuests: number[];
} {
  if (!character || typeof character !== "object") {
    return { activeMonsterTasks: [], finishedTasks: [], finishedQuests: [] };
  }

  const data = character as Record<string, unknown>;

  return {
    activeMonsterTasks: normalizeActiveMonsterTasks(data.activeMonsterTasks),
    finishedTasks: Array.isArray(data.finishedTasks)
      ? data.finishedTasks.filter((id): id is number => typeof id === "number")
      : [],
    finishedQuests: Array.isArray(data.finishedQuests)
      ? data.finishedQuests.filter((id): id is number => typeof id === "number")
      : [],
  };
}

export function getQuest(questId: number): QuestRecord | undefined {
  return QUESTS.find((quest) => quest.id === questId);
}

export function getMission(questId: number, missionId: number): QuestMission | undefined {
  return getQuest(questId)?.missions.find((mission) => mission.id === missionId);
}

export function listMonsterTaskQuests(): MonsterTaskQuestSummary[] {
  return QUESTS
    .filter((quest) => quest.missions.some((mission) => mission.type === "monster_task"))
    .map((quest) => ({
      id: quest.id,
      title: quest.title,
      levelMin: quest.levelMin ?? 1,
      monsterMissionCount: quest.missions.filter((mission) => mission.type === "monster_task").length,
    }))
    .sort((a, b) => a.levelMin - b.levelMin || a.title.localeCompare(b.title));
}

export function isTaskComplete(task: ActiveMonsterTask): boolean {
  if (task.met) {
    return true;
  }

  if (task.requiredAmount != null && task.currentAmount != null) {
    return task.currentAmount >= task.requiredAmount;
  }

  return false;
}

/** All kill counters for a quest’s active mission (missions can require multiple monsters). */
export function getActiveTasksForQuest(
  tasks: ActiveMonsterTask[],
  questId: number
): ActiveMonsterTask[] {
  const forQuest = tasks.filter((task) => task.questId === questId);
  if (forQuest.length <= 1) {
    return forQuest;
  }

  // Prefer the incomplete mission when a snapshot still includes a finished sibling.
  const incomplete = forQuest.filter((task) => !isTaskComplete(task));
  const focusMissionId = (incomplete[0] ?? forQuest[0]).missionId;
  return forQuest.filter((task) => task.missionId === focusMissionId);
}

export function getActiveTaskForQuest(
  tasks: ActiveMonsterTask[],
  questId: number
): ActiveMonsterTask | null {
  return getActiveTasksForQuest(tasks, questId)[0] ?? null;
}

/** Mission is complete only when every monster kill requirement is met. */
export function isMissionTasksComplete(tasks: ActiveMonsterTask[]): boolean {
  return tasks.length > 0 && tasks.every(isTaskComplete);
}

export function resolveHuntForMission(mission: QuestMission): number | null {
  const monsterTasks = mission.monsterTasks ?? [];
  if (!monsterTasks.length) {
    return null;
  }

  const monsterIds = monsterTasks.map((entry) => entry.monsterId);
  let bestCovering: { huntId: number; score: number } | null = null;

  for (const hunt of HUNTS) {
    const monsters = new Set(hunt.monsters ?? []);
    if (!monsterIds.every((monsterId) => monsters.has(monsterId))) {
      continue;
    }

    const score = monsterIds.reduce((total, monsterId) => {
      const weights = hunt.monsterWeights as Record<number, number> | undefined;
      return total + (weights?.[monsterId] ?? 1);
    }, 0);

    if (!bestCovering || score > bestCovering.score) {
      bestCovering = { huntId: hunt.id, score };
    }
  }

  if (bestCovering) {
    return bestCovering.huntId;
  }

  const primaryMonsterId = monsterIds[0];
  let bestFallback: { huntId: number; weight: number } | null = null;

  for (const hunt of HUNTS) {
    if (!(hunt.monsters ?? []).includes(primaryMonsterId)) {
      continue;
    }

    const weights = hunt.monsterWeights as Record<number, number> | undefined;
    const weight = weights?.[primaryMonsterId] ?? 1;
    if (!bestFallback || weight > bestFallback.weight) {
      bestFallback = { huntId: hunt.id, weight };
    }
  }

  return bestFallback?.huntId ?? null;
}

export function findNextMonsterMission(
  questId: number,
  options: {
    finishedTaskIds?: number[];
    level?: number | null;
    afterMissionId?: number | null;
  } = {}
): QuestMission | null {
  const quest = getQuest(questId);
  if (!quest) {
    return null;
  }

  const finished = new Set(options.finishedTaskIds ?? []);
  const level = options.level ?? 1;

  const missions = quest.missions
    .filter((mission) => mission.type === "monster_task")
    .sort((a, b) => a.id - b.id);

  let candidates = missions;
  if (options.afterMissionId != null) {
    candidates = missions.filter((mission) => mission.id > options.afterMissionId!);
  } else {
    candidates = missions.filter((mission) => !finished.has(mission.id));
  }

  for (const mission of candidates) {
    if (mission.requirements?.levelMin != null && level < mission.requirements.levelMin) {
      continue;
    }
    return mission;
  }

  return null;
}

export function resolveTaskHuntId(task: ActiveMonsterTask | null, level: number | null): number | null {
  if (!task) {
    return null;
  }

  const mission = getMission(task.questId, task.missionId);
  if (!mission || mission.type !== "monster_task") {
    return null;
  }

  if (mission.requirements?.levelMin != null && level != null && level < mission.requirements.levelMin) {
    return null;
  }

  return resolveHuntForMission(mission);
}

/** Preview the hunt auto-tasker will use for a quest line (active task, else next unfinished mission). */
export function previewTaskerHunt(
  questId: number,
  options: {
    activeTasks: ActiveMonsterTask[];
    finishedTaskIds?: number[];
    level?: number | null;
  }
): {
  activeTasks: ActiveMonsterTask[];
  activeTask: ActiveMonsterTask | null;
  mission: QuestMission | null;
  huntId: number | null;
} {
  const activeTasks = getActiveTasksForQuest(options.activeTasks, questId);
  const activeTask = activeTasks[0] ?? null;
  if (activeTask) {
    const mission = getMission(questId, activeTask.missionId) ?? null;
    return {
      activeTasks,
      activeTask,
      mission,
      huntId: resolveTaskHuntId(activeTask, options.level ?? null),
    };
  }

  const mission = findNextMonsterMission(questId, {
    finishedTaskIds: options.finishedTaskIds,
    level: options.level,
  });

  return {
    activeTasks: [],
    activeTask: null,
    mission,
    huntId: mission ? resolveHuntForMission(mission) : null,
  };
}

export function formatMonsterTaskProgress(task: ActiveMonsterTask): string {
  const monster =
    task.monsterId != null
      ? (getMonsterById(task.monsterId)?.name ?? `Monster #${task.monsterId}`)
      : "Monster";
  const progress =
    task.currentAmount != null && task.requiredAmount != null
      ? `${task.currentAmount}/${task.requiredAmount}`
      : "?/?";

  return `${monster} · ${progress}`;
}

export function formatActiveTasks(tasks: ActiveMonsterTask[]): string {
  if (!tasks.length) {
    return "No active task";
  }

  return tasks.map(formatMonsterTaskProgress).join(", ");
}

export function formatActiveTask(task: ActiveMonsterTask | null): string {
  if (!task) {
    return "No active task";
  }

  return formatActiveTasks([task]);
}

/** True when status still reflects a prior claim rather than the current incomplete task. */
export function isStaleClaimTaskerStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized.includes("recompensa resgatada") ||
    normalized.includes("reward claimed") ||
    /claimed.+\bnext\b/.test(normalized)
  );
}
