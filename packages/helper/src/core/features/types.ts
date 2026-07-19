import type { GameSession } from "../session";
import type { FeatureId, SubFeatureId } from "../services/types";

export interface SubFeature {
  readonly id: SubFeatureId;
  readonly featureId: FeatureId;
  readonly label: string;
  isEnabled(session: GameSession): boolean;
}

export interface Feature {
  readonly id: FeatureId;
  readonly label: string;
  readonly description: string;
  readonly dependsOn: FeatureId[];
  readonly subFeatures: readonly SubFeature[];
}
