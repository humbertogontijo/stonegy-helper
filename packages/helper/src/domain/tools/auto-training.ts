import { ReceiveMessageTypes } from "../../protocol";
import type { SkillToTrain } from "../../protocol-messages";

export function shouldCancelAutoTrainingIdleCheck(
  messageType: string,
  trainingPresent: boolean
): boolean {
  if (messageType === ReceiveMessageTypes.HUNT_BOOTSTRAP) {
    return true;
  }

  if (messageType === ReceiveMessageTypes.TRAINING_BOOTSTRAP && trainingPresent) {
    return true;
  }

  return false;
}

export function defaultAutoTrainingSkill(): SkillToTrain {
  return "DISTANCE";
}
