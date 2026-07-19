/**
 * Replay harness — turn a DebugPanel wire export into a fixture and assert session state.
 *
 * How to build a fixture from DebugPanel:
 * 1. Open the Debug tab, expand events (or Copy all on Sent/Received).
 * 2. Collect records that include `direction`, `opcode`, and `wireData` (or `data`).
 *    A typical export looks like:
 *      { direction: "receive", opcode: 1, wireData: "{\"type\":\"party:snapshot\",...}" }
 *    Binary events use opcode 2 with base64 `wireData`.
 * 3. Map each event to `{ direction, opcode, data: wireData }` (drop metadata).
 * 4. Pass the array to `replayWireCapture(records)` and assert on `result.view` / `result.botState`.
 *
 * Only `receive` records are injected into the session; `send` rows are ignored (they were
 * outbound from the live bot). Order is preserved.
 */

import { GameSession, type GameSessionOptions } from "../session";
import { toBotState } from "../projections/to-bot-state";
import type { SessionView } from "../projections/types";
import type { BotState } from "../../types";
import type { Transport, WireMessage } from "../transport";

export interface ReplayCaptureRecord {
  direction: "send" | "receive";
  opcode: 1 | 2;
  /** Wire payload: JSON text (opcode 1) or base64 binary (opcode 2). */
  data: string;
}

export interface ReplayResult {
  session: GameSession;
  view: SessionView;
  botState: BotState;
  transport: ReplayTransport;
}

/** In-memory transport that injects captured wire messages for tests. */
export class ReplayTransport implements Transport {
  private handler: ((message: WireMessage) => void) | null = null;
  private connectionHandler: ((connected: boolean, readyState?: number) => void) | null =
    null;
  readonly sent: WireMessage[] = [];

  async connect(): Promise<void> {
    this.connectionHandler?.(true, 1);
  }

  async send(opcode: 1 | 2, data: string): Promise<void> {
    this.sent.push({ direction: "send", opcode, data });
  }

  onMessage(handler: (message: WireMessage) => void): void {
    this.handler = handler;
  }

  onConnectionChange(handler: (connected: boolean, readyState?: number) => void): void {
    this.connectionHandler = handler;
  }

  close(): void {
    this.connectionHandler?.(false, 3);
  }

  inject(record: ReplayCaptureRecord): void {
    this.handler?.({
      direction: record.direction,
      opcode: record.opcode,
      data: record.data,
    });
  }
}

export interface ReplayOptions {
  sessionOptions?: GameSessionOptions;
  /** When true (default), mark the session connected before replaying. */
  connect?: boolean;
}

/**
 * Create a GameSession, inject wire records in order, drain the message chain,
 * and return the final projected view / bot state for assertions.
 */
export async function replayWireCapture(
  records: ReplayCaptureRecord[],
  options: ReplayOptions = {}
): Promise<ReplayResult> {
  const transport = new ReplayTransport();
  const session = new GameSession(transport, options.sessionOptions);

  if (options.connect !== false) {
    await transport.connect();
  }

  for (const record of records) {
    if (record.direction !== "receive") {
      continue;
    }
    transport.inject(record);
    await session.drainMessages();
  }

  return {
    session,
    view: session.view,
    botState: toBotState(session.settings, session.view, session.telemetry),
    transport,
  };
}
