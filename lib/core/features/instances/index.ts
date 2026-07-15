import type { Feature, SubFeature } from "../types";
import type { FeatureId } from "../../services/types";
import { marketFeature } from "./market";
import { lootFeature } from "./loot";
import { battleFeature } from "./battle";
import { huntFeature } from "./hunt";
import { tasksFeature } from "./tasks";
import { toolsFeature } from "./tools";

export { marketFeature, lootFeature, battleFeature, huntFeature, tasksFeature, toolsFeature };
export {
  marketIntervalScanSubFeature,
  marketAutoBuySubFeature,
} from "./market";
export { lootAutoSellSubFeature, lootLootSplitSubFeature } from "./loot";
export {
  battleApplyPresetsSubFeature,
  battlePlacePositionSubFeature,
  battleLockLureSubFeature,
} from "./battle";
export { huntAutoHuntSubFeature } from "./hunt";
export { tasksAutoTaskerSubFeature } from "./tasks";
export {
  toolsReadyCheckSubFeature,
  toolsAcceptPartyInviteSubFeature,
  toolsAutoTrainingSubFeature,
} from "./tools";

export const FEATURE_TAB_ORDER: FeatureId[] = [
  "market",
  "loot",
  "battle",
  "hunt",
  "tasks",
  "tools",
];

export const FEATURES: Record<FeatureId, Feature> = {
  market: marketFeature,
  loot: lootFeature,
  battle: battleFeature,
  hunt: huntFeature,
  tasks: tasksFeature,
  tools: toolsFeature,
};

export const SUB_FEATURES: SubFeature[] = FEATURE_TAB_ORDER.flatMap(
  (id) => FEATURES[id].subFeatures
);
