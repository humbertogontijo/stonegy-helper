import { decodeBinaryMessage, summarizeBinaryMessage } from "../../binary/decode";
import { parseMessage } from "../../protocol";
import type { WireMessage } from "../transport";
import type { FlowTrace } from "./flow-trace";
import {
  extractUnrecognizedKeys,
  validateMessagePayload,
  type PayloadSchemaIssue,
} from "./schemas";

export interface DebugEventRecord {
  id: string;
  at: number;
  direction: "send" | "receive";
  opcode: 1 | 2;
  eventKey: string;
  type?: string;
  /** Binary envelope type byte (opcode 2 only). */
  binaryType?: number;
  summary?: string;
  unknownType?: boolean;
  parseFailed?: boolean;
  extraFields?: string[];
  schemaIssues?: PayloadSchemaIssue[];
  trailingBytes?: number;
  parsed?: unknown;
  preview?: string;
  /** Full wire payload (JSON text or base64 binary) for copy/share. */
  wireData?: string;
}

export interface DebugTypeStats {
  send: number;
  receive: number;
}

/** One CommandBus attempt: outbound send + matched response (or timeout). */
export interface DebugCommandRecord {
  id: string;
  at: number;
  finishedAt: number;
  commandId: string;
  /** Expected response type(s) from the protocol map (joined with ` | ` when multiple). */
  expectedResponseType?: string;
  /** Outbound Stonegy message `{ type, data }`. */
  sent: unknown;
  /** Matched inbound response message, when received before timeout. */
  response?: unknown;
  status: "ok" | "failed" | "timeout" | "sent" | "error";
  success?: boolean;
  errorMessage?: string;
  /** 1-based attempt index when the bus retries on timeout. */
  attempt: number;
}

export interface DebugTelemetrySnapshot {
  events: DebugEventRecord[];
  /** Latest event per `${eventKey}:${direction}`. */
  lastByType: Record<string, DebugEventRecord>;
  countsByType: Record<string, DebugTypeStats>;
  unknownEvents: DebugEventRecord[];
  schemaMismatchEvents: DebugEventRecord[];
  /** Rolling buffer of recent CommandBus attempts (newest first). */
  lastCommands: DebugCommandRecord[];
  /** Rolling buffer of recent service flow traces (newest first). */
  flowTraces: FlowTrace[];
  /** In-flight flows (not yet finished) — included when copying debug state. */
  activeFlows: FlowTrace[];
}

const MAX_DEBUG_EVENTS = 300;
const MAX_UNKNOWN_EVENTS = 100;
const MAX_SCHEMA_MISMATCH_EVENTS = 100;
const MAX_LAST_COMMANDS = 50;
const MAX_FLOW_TRACES = 50;
const PREVIEW_LENGTH = 160;

let debugEventCounter = 0;

export function emptyDebugTelemetry(): DebugTelemetrySnapshot {
  return {
    events: [],
    lastByType: {},
    countsByType: {},
    unknownEvents: [],
    schemaMismatchEvents: [],
    lastCommands: [],
    flowTraces: [],
    activeFlows: [],
  };
}

export function clearDebugTelemetry(snapshot: DebugTelemetrySnapshot): void {
  snapshot.events = [];
  snapshot.lastByType = {};
  snapshot.countsByType = {};
  snapshot.unknownEvents = [];
  snapshot.schemaMismatchEvents = [];
  snapshot.lastCommands = [];
  clearFlowTraces(snapshot);
}

export function recordDebugCommand(
  snapshot: DebugTelemetrySnapshot,
  record: Omit<DebugCommandRecord, "id"> & { id?: string }
): DebugCommandRecord {
  if (!snapshot.lastCommands) {
    snapshot.lastCommands = [];
  }
  const entry: DebugCommandRecord = {
    ...record,
    id: record.id ?? nextDebugEventId(),
    sent: serializeForDebug(record.sent),
    response:
      record.response !== undefined ? serializeForDebug(record.response) : undefined,
  };
  pushLimited(snapshot.lastCommands, entry, MAX_LAST_COMMANDS);
  return entry;
}

export function recordFlowTrace(
  snapshot: DebugTelemetrySnapshot,
  trace: FlowTrace
): void {
  if (!snapshot.flowTraces) {
    snapshot.flowTraces = [];
  }
  clearActiveFlow(snapshot, trace.id);
  pushLimited(snapshot.flowTraces, sanitizeFlowTrace(trace), MAX_FLOW_TRACES);
}

export function upsertActiveFlow(
  snapshot: DebugTelemetrySnapshot,
  trace: FlowTrace
): void {
  if (!snapshot.activeFlows) {
    snapshot.activeFlows = [];
  }
  const safe = sanitizeFlowTrace(trace);
  const index = snapshot.activeFlows.findIndex((entry) => entry.id === safe.id);
  if (index >= 0) {
    snapshot.activeFlows[index] = safe;
  } else {
    snapshot.activeFlows.unshift(safe);
  }
  if (snapshot.activeFlows.length > MAX_FLOW_TRACES) {
    snapshot.activeFlows.length = MAX_FLOW_TRACES;
  }
}

export function clearActiveFlow(
  snapshot: DebugTelemetrySnapshot,
  traceId: string
): void {
  if (!snapshot.activeFlows?.length) {
    return;
  }
  snapshot.activeFlows = snapshot.activeFlows.filter((entry) => entry.id !== traceId);
}

export function clearFlowTraces(snapshot: DebugTelemetrySnapshot): void {
  snapshot.flowTraces = [];
  snapshot.activeFlows = [];
}

export function lastByTypeKey(eventKey: string, direction: DebugEventRecord["direction"]): string {
  return `${eventKey}:${direction}`;
}

export function incrementTypeCount(
  countsByType: Record<string, DebugTypeStats>,
  eventKey: string,
  direction: DebugEventRecord["direction"]
): void {
  const stats = countsByType[eventKey] ?? { send: 0, receive: 0 };
  stats[direction] += 1;
  countsByType[eventKey] = stats;
}

export function countForDirection(
  countsByType: Record<string, DebugTypeStats>,
  eventKey: string,
  direction: DebugEventRecord["direction"]
): number {
  return countsByType[eventKey]?.[direction] ?? 0;
}

function nextDebugEventId(): string {
  debugEventCounter += 1;
  return `dbg-${debugEventCounter}`;
}

function previewText(raw: string): string {
  if (raw.length <= PREVIEW_LENGTH) {
    return raw;
  }
  return `${raw.slice(0, PREVIEW_LENGTH)}…`;
}

/** Enough for binary bodies like vitals records → fields → { bit, value }. */
const MAX_SERIALIZE_DEPTH = 8;

/** Plain JSON-safe clone for debug payloads (cycles → "[circular]", depth-capped). */
export function serializeForDebug(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (depth > MAX_SERIALIZE_DEPTH) {
    return "[max depth]";
  }

  if (value instanceof Uint8Array) {
    return { __bytes: value.length };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[circular]";
    }
    seen.add(value);
    return value.slice(0, 30).map((entry) => serializeForDebug(entry, depth + 1, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry instanceof Uint8Array) {
        out[key] = { __bytes: entry.length };
        continue;
      }
      out[key] = serializeForDebug(entry, depth + 1, seen);
    }
    return out;
  }

  return value;
}

/** Drop non-JSON / cyclic fields from a flow trace before storing on BotState.debug. */
export function sanitizeFlowTrace(trace: FlowTrace): FlowTrace {
  return {
    ...trace,
    guards: [...trace.guards],
    commands: [...trace.commands],
    result: trace.result !== undefined ? serializeForDebug(trace.result) : undefined,
    stateSnapshot:
      trace.stateSnapshot !== undefined
        ? (serializeForDebug(trace.stateSnapshot) as Record<string, unknown>)
        : undefined,
    settingsSnapshot:
      trace.settingsSnapshot !== undefined
        ? (serializeForDebug(trace.settingsSnapshot) as Record<string, unknown>)
        : undefined,
  };
}

/** In-place heal so already-recorded cyclic traces cannot break message serialization. */
export function sanitizeDebugTelemetry(snapshot: DebugTelemetrySnapshot): DebugTelemetrySnapshot {
  if (snapshot.lastCommands?.length) {
    snapshot.lastCommands = snapshot.lastCommands.map((entry) => ({
      ...entry,
      sent: serializeForDebug(entry.sent),
      response:
        entry.response !== undefined ? serializeForDebug(entry.response) : undefined,
    }));
  } else if (!snapshot.lastCommands) {
    snapshot.lastCommands = [];
  }
  if (snapshot.flowTraces?.length) {
    snapshot.flowTraces = snapshot.flowTraces.map(sanitizeFlowTrace);
  }
  if (snapshot.activeFlows?.length) {
    snapshot.activeFlows = snapshot.activeFlows.map(sanitizeFlowTrace);
  }
  return snapshot;
}

function countTrailingBytes(parsed: unknown): number | undefined {
  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }

  let total = 0;

  if ("trailingBytes" in parsed && parsed.trailingBytes instanceof Uint8Array) {
    total += parsed.trailingBytes.length;
  }

  if ("rawTail" in parsed && parsed.rawTail instanceof Uint8Array) {
    total += parsed.rawTail.length;
  }

  if ("data" in parsed && parsed.data && typeof parsed.data === "object") {
    const nested = countTrailingBytes(parsed.data);
    if (nested) {
      total += nested;
    }
  }

  return total > 0 ? total : undefined;
}

function pushLimited<T>(list: T[], entry: T, max: number): void {
  list.unshift(entry);
  if (list.length > max) {
    list.length = max;
  }
}

/** Keep latest sample per eventKey+direction so high-volume types cannot flush others out. */
function upsertLimitedByType(
  list: DebugEventRecord[],
  record: DebugEventRecord,
  max: number
): void {
  const key = lastByTypeKey(record.eventKey, record.direction);
  const existingIndex = list.findIndex(
    (entry) => lastByTypeKey(entry.eventKey, entry.direction) === key
  );
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  }
  pushLimited(list, record, max);
}

function appendDebugRecord(snapshot: DebugTelemetrySnapshot, record: DebugEventRecord): void {
  pushLimited(snapshot.events, record, MAX_DEBUG_EVENTS);
  incrementTypeCount(snapshot.countsByType, record.eventKey, record.direction);
  snapshot.lastByType[lastByTypeKey(record.eventKey, record.direction)] = record;

  if (record.unknownType || record.parseFailed) {
    upsertLimitedByType(snapshot.unknownEvents, record, MAX_UNKNOWN_EVENTS);
  }

  if (record.schemaIssues?.length || record.extraFields?.length || record.trailingBytes) {
    upsertLimitedByType(snapshot.schemaMismatchEvents, record, MAX_SCHEMA_MISMATCH_EVENTS);
  }
}

function recordJsonWire(
  wire: WireMessage,
  snapshot: DebugTelemetrySnapshot,
  at: number
): void {
  const parsed = parseMessage(wire.data);

  if (!parsed) {
    appendDebugRecord(snapshot, {
      id: nextDebugEventId(),
      at,
      direction: wire.direction,
      opcode: 1,
      eventKey: "json:parse_failed",
      parseFailed: true,
      unknownType: true,
      preview: previewText(wire.data),
      wireData: wire.data,
    });
    return;
  }

  const validation = validateMessagePayload(parsed.type, wire.direction, parsed.data);
  const unknownType = validation.status === "unknown_type";
  const schemaIssues =
    validation.status === "invalid" ? validation.issues : undefined;
  const extraFields = schemaIssues ? extractUnrecognizedKeys(schemaIssues) : undefined;

  appendDebugRecord(snapshot, {
    id: nextDebugEventId(),
    at,
    direction: wire.direction,
    opcode: 1,
    eventKey: parsed.type,
    type: parsed.type,
    summary: parsed.type,
    unknownType: unknownType || undefined,
    schemaIssues,
    extraFields: extraFields?.length ? extraFields : undefined,
    parsed: serializeForDebug(parsed),
    preview: previewText(wire.data),
    wireData: wire.data,
  });
}

function recordBinaryWire(
  wire: WireMessage,
  snapshot: DebugTelemetrySnapshot,
  at: number
): void {
  try {
    const decoded = decodeBinaryMessage(wire.data);
    const eventKey = `binary:${decoded.body.kind}`;
    const trailingBytes = countTrailingBytes(decoded.body);
    const unknownType = decoded.body.kind === "unknown";

    appendDebugRecord(snapshot, {
      id: nextDebugEventId(),
      at,
      direction: wire.direction,
      opcode: 2,
      eventKey,
      type: eventKey,
      binaryType: decoded.envelope.type,
      summary: summarizeBinaryMessage(decoded),
      unknownType: unknownType || undefined,
      trailingBytes,
      parsed: serializeForDebug({
        envelope: decoded.envelope,
        body: decoded.body,
      }),
      // Always truncate the raw wire string for UI; summary carries the decode label.
      preview: previewText(wire.data),
      wireData: wire.data,
    });
  } catch (error) {
    appendDebugRecord(snapshot, {
      id: nextDebugEventId(),
      at,
      direction: wire.direction,
      opcode: 2,
      eventKey: "binary:decode_failed",
      parseFailed: true,
      unknownType: true,
      summary: error instanceof Error ? error.message : String(error),
      preview: previewText(wire.data),
      wireData: wire.data,
    });
  }
}

export function recordDebugWireMessage(
  wire: WireMessage,
  snapshot: DebugTelemetrySnapshot
): void {
  const at = Date.now();

  if (wire.opcode === 1) {
    recordJsonWire(wire, snapshot, at);
    return;
  }

  if (wire.opcode === 2) {
    recordBinaryWire(wire, snapshot, at);
  }
}
