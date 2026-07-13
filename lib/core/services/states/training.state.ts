import { ReceiveMessageTypes } from "../../../protocol";
import { readId } from "../../../domain/party/fields";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { TrainingProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";

export class TrainingState extends DomainState {
  readonly id: DomainStateId = "trainingState";

  private _activeTrainingId: string | null = null;

  constructor(ctx: ServiceContext) {
    super(ctx);
  }

  get activeTrainingId(): string | null {
    return this._activeTrainingId;
  }

  projection(): TrainingProjection {
    return { activeTrainingId: this._activeTrainingId };
  }

  applyTrainingPatch(patch: Partial<TrainingProjection>): void {
    if (patch.activeTrainingId !== undefined) {
      this._activeTrainingId = patch.activeTrainingId;
    }
  }

  async onEvent(event: GameEvent): Promise<void> {
    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.TRAINING_BOOTSTRAP) {
      const training = message.data?.training;
      if (training == null) {
        this._activeTrainingId = null;
        return;
      }
      this._activeTrainingId =
        readId(training.activeTraining?.id) ?? this._activeTrainingId;
      return;
    }

    if (message.type === ReceiveMessageTypes.TRAINING_FINISHED) {
      this._activeTrainingId = null;
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
