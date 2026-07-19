import type { Settings } from "../settings";
import { GameSession } from "../session";
import type { GameEvent } from "../events/types";
import type { Transport, WireMessage } from "../transport";
import { defaultSessionView } from "./defaults";
import type { SessionView } from "./types";

class NoopTransport implements Transport {
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  onMessage(_handler: (message: WireMessage) => void): void {}
  onConnectionChange(): void {}
  close(): void {}
}

export interface ProjectEventsOptions {
  initialView?: SessionView;
  settings?: Partial<Settings>;
  marketSnapshotRequestedItemId?: () => number | null;
}

/**
 * Apply events through live domain *State services and return the projected view.
 * Replaces the former pure `reduceSessionView` for tests.
 */
export async function projectAfterEvents(
  events: GameEvent | GameEvent[],
  options: ProjectEventsOptions = {}
): Promise<SessionView> {
  const list = Array.isArray(events) ? events : [events];
  const session = new GameSession(new NoopTransport(), {
    settings: options.settings,
    marketSnapshotRequestedItemId: options.marketSnapshotRequestedItemId,
  });

  if (options.initialView) {
    session.view = options.initialView;
  }

  for (const event of list) {
    if (event.kind === "connection") {
      session.updateView({
        connection: {
          connected: event.connected,
          readyState: event.readyState,
        },
      });
      continue;
    }

    if (
      event.kind === "json" &&
      options.marketSnapshotRequestedItemId &&
      event.message.type === "market:snapshot"
    ) {
      const marketState = session.services.marketState;
      marketState.requestedItemId = options.marketSnapshotRequestedItemId();
    }

    await session.services.applyDomains(event);
    session.invalidateProjection();
  }

  return session.view;
}

/** Convenience: project a single event from a blank (or seeded) view. */
export async function projectAfterEvent(
  event: GameEvent,
  options: ProjectEventsOptions = {}
): Promise<SessionView> {
  return projectAfterEvents(event, {
    ...options,
    initialView: options.initialView ?? defaultSessionView(),
  });
}
