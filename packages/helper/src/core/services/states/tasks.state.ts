import { ReceiveMessageTypes } from "../../../protocol";
import {
  parseCharacterTaskFields,
  parseTasksSnapshot,
  parseTasksSnapshotFields,
} from "../../../domain/tasks";
import type { ActiveMonsterTask } from "../../../types";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { QuestProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";
import type { SessionState } from "./session.state";

export class TasksState extends DomainState {
  readonly id: DomainStateId = "tasksState";

  private activeMonsterTasks: ActiveMonsterTask[] = [];
  private _lastQuestSnapshotAt: number | null = null;

  constructor(
    ctx: ServiceContext,
    private readonly sessionState: SessionState
  ) {
    super(ctx);
  }

  get tasks(): ActiveMonsterTask[] {
    return this.activeMonsterTasks;
  }

  get lastQuestSnapshotAt(): number | null {
    return this._lastQuestSnapshotAt;
  }

  projection(): QuestProjection {
    return { activeMonsterTasks: this.activeMonsterTasks };
  }

  applyQuestsPatch(patch: Partial<QuestProjection>): void {
    if (patch.activeMonsterTasks) {
      this.activeMonsterTasks = patch.activeMonsterTasks;
    }
  }

  applyLastQuestSnapshotAt(at: number | null): void {
    this._lastQuestSnapshotAt = at;
  }

  async onEvent(event: GameEvent): Promise<void> {
    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.SESSION_BOOTSTRAP) {
      const character = message.data?.character;
      const taskFields = parseCharacterTaskFields(character);
      const tasksFromPayload = parseTasksSnapshot(message.data ?? {});
      const next =
        tasksFromPayload.length > 0 ? tasksFromPayload : taskFields.activeMonsterTasks;
      if (next.length > 0) {
        this.activeMonsterTasks = next;
      }
      const hasQuestData =
        next.length > 0 ||
        taskFields.finishedTasks.length > 0 ||
        taskFields.finishedQuests.length > 0;
      if (hasQuestData) {
        this._lastQuestSnapshotAt = Date.now();
      }
      return;
    }

    if (message.type === ReceiveMessageTypes.TASKS_SNAPSHOT) {
      const taskFields = parseTasksSnapshotFields(message.data ?? {});
      this.activeMonsterTasks = taskFields.activeMonsterTasks;
      if (taskFields.finishedTasks.length > 0) {
        this.sessionState.setFinishedTasks(taskFields.finishedTasks);
      }
      if (taskFields.finishedQuests.length > 0) {
        this.sessionState.setFinishedQuests(taskFields.finishedQuests);
      }
      this._lastQuestSnapshotAt = Date.now();
    }
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.projection(),
      lastQuestSnapshotAt: this._lastQuestSnapshotAt,
    };
  }
}
