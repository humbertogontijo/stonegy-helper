export type FeaturePrerequisiteEvent =
  | "session:bootstrap"
  | "party:snapshot"
  | "bless:snapshot"
  | "tasks:snapshot";

const EVENT_CONTEXT: Record<FeaturePrerequisiteEvent, string> = {
  "session:bootstrap": "character data is not synced yet",
  "party:snapshot": "party status is not synced yet",
  "bless:snapshot": "blessings are not synced yet",
  "tasks:snapshot": "task progress is not synced yet",
};

/** User feedback for controls that require an event-backed projection before running. */
export function waitForFeatureEventMessage(
  event: FeaturePrerequisiteEvent,
  action: string
): string {
  return `Wait for ${event} before ${action} — ${EVENT_CONTEXT[event]}.`;
}
