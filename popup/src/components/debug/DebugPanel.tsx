import { useMemo, useState, type MouseEvent } from "react";
import { sendBot } from "../../api/bot";
import type { BotState, DebugEventRecord, DebugTypeStats } from "../../types/bot";
import { formatBinaryType, formatDebugTimestamp } from "../../utils/format";
import { SectionTitle } from "../ui/SectionTitle";
import { StonegyButton } from "../ui/StonegyButton";

interface DebugPanelProps {
  state: BotState | null;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

type DebugSection = "unknown" | "schema" | "lastByType";

const SECTIONS: Array<{ id: DebugSection; label: string }> = [
  { id: "unknown", label: "Unknown" },
  { id: "schema", label: "Schema drift" },
  { id: "lastByType", label: "Last by type" },
];

interface GroupedEvent {
  eventKey: string;
  count: number;
  latest: DebugEventRecord;
}

function sortByEventType(events: DebugEventRecord[]): DebugEventRecord[] {
  return [...events].sort((a, b) => a.eventKey.localeCompare(b.eventKey));
}

function groupEventsByType(events: DebugEventRecord[]): GroupedEvent[] {
  const grouped = new Map<string, GroupedEvent>();

  for (const event of events) {
    const existing = grouped.get(event.eventKey);
    if (!existing) {
      grouped.set(event.eventKey, { eventKey: event.eventKey, count: 1, latest: event });
      continue;
    }

    existing.count += 1;
    if (event.at >= existing.latest.at) {
      existing.latest = event;
    }
  }

  return [...grouped.values()].sort((a, b) => a.eventKey.localeCompare(b.eventKey));
}

function directionLabel(direction: DebugEventRecord["direction"], opcode: number): string {
  const kind = opcode === 2 ? "binary" : "json";
  return `${direction} · ${kind}`;
}

function eventCopyPayload(event: DebugEventRecord, count: number) {
  return {
    count,
    at: new Date(event.at).toISOString(),
    direction: event.direction,
    opcode: event.opcode,
    eventKey: event.eventKey,
    type: event.type,
    binaryType: event.binaryType,
    binaryTypeHex: event.binaryType != null ? formatBinaryType(event.binaryType) : undefined,
    summary: event.summary,
    unknownType: event.unknownType,
    parseFailed: event.parseFailed,
    extraFields: event.extraFields,
    schemaIssues: event.schemaIssues,
    trailingBytes: event.trailingBytes,
    parsed: event.parsed,
    preview: event.preview,
    wireData: event.wireData,
  };
}

function formatEventForCopy(event: DebugEventRecord, count: number): string {
  return JSON.stringify(eventCopyPayload(event, count), null, 2);
}

function formatColumnForCopy(
  direction: DebugEventRecord["direction"],
  items: Array<{ event: DebugEventRecord; count: number }>
): string {
  return JSON.stringify(
    {
      direction,
      events: items.map(({ event, count }) => eventCopyPayload(event, count)),
    },
    null,
    2
  );
}

async function copyColumn(
  label: string,
  text: string,
  showFeedback: (msg: string, type?: "success" | "error") => void
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showFeedback(`${label} column copied`, "success");
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "Failed to copy", "error");
  }
}

function ColumnHeader({
  title,
  typeCount,
  onCopy,
  copyDisabled,
}: {
  title: string;
  typeCount?: number;
  onCopy: () => void;
  copyDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
        {typeCount != null ? (
          <span className="ml-1 font-normal normal-case tracking-normal opacity-70">
            ({typeCount} {typeCount === 1 ? "type" : "types"})
          </span>
        ) : null}
      </h3>
      <button
        type="button"
        title={`Copy ${title.toLowerCase()} column`}
        aria-label={`Copy ${title.toLowerCase()} column`}
        disabled={copyDisabled}
        onClick={() => void onCopy()}
        className="shrink-0 rounded border border-[var(--border-gold)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--gold-soft)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      >
        Copy all
      </button>
    </div>
  );
}

function EventCard({
  event,
  count,
  showFeedback,
}: {
  event: DebugEventRecord;
  count: number;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async (mouseEvent: MouseEvent<HTMLButtonElement>) => {
    mouseEvent.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatEventForCopy(event, count));
      showFeedback("Event copied", "success");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Failed to copy", "error");
    }
  };

  return (
    <article className="rounded-md border border-[var(--border-gold)] bg-[rgba(1,4,7,0.55)] p-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left cursor-pointer"
          onClick={() => setExpanded((value) => !value)}
        >
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <time dateTime={new Date(event.at).toISOString()}>{formatDebugTimestamp(event.at)}</time>
            <span>{directionLabel(event.direction, event.opcode)}</span>
            <span className="rounded border border-[rgba(255,177,0,0.35)] px-1 py-0.5 text-[10px] text-[var(--gold-soft)]">
              ×{count}
            </span>
            {event.binaryType != null ? (
              <span className="rounded border border-[rgba(255,177,0,0.35)] px-1 py-0.5 font-mono text-[10px] text-[var(--gold-soft)]">
                {formatBinaryType(event.binaryType)}
              </span>
            ) : null}
            {event.unknownType ? (
              <span className="rounded px-1 py-0.5 text-[10px] uppercase tracking-wide text-[var(--danger)] border border-[rgba(255,96,96,0.35)]">
                unknown
              </span>
            ) : null}
            {event.parseFailed ? (
              <span className="rounded px-1 py-0.5 text-[10px] uppercase tracking-wide text-[var(--danger)] border border-[rgba(255,96,96,0.35)]">
                parse failed
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate font-medium text-[var(--text-primary)]">
            {event.summary ?? event.eventKey}
          </div>
          {event.extraFields?.length ? (
            <div className="mt-1 text-[11px] text-[var(--gold-soft)]">
              Extra fields: {event.extraFields.join(", ")}
            </div>
          ) : null}
          {event.schemaIssues?.length ? (
            <div className="mt-1 space-y-0.5 text-[11px] text-[var(--gold-soft)]">
              {event.schemaIssues.map((issue) => (
                <div key={`${issue.path}:${issue.message}`}>
                  {issue.path}: {issue.message}
                </div>
              ))}
            </div>
          ) : null}
          {event.trailingBytes ? (
            <div className="mt-1 text-[11px] text-[var(--gold-soft)]">
              Trailing bytes: {event.trailingBytes}
            </div>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Copy event"
            aria-label="Copy event"
            onClick={(mouseEvent) => void handleCopy(mouseEvent)}
            className="rounded border border-[var(--border-gold)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--gold-soft)] cursor-pointer"
          >
            Copy
          </button>
          <button
            type="button"
            aria-label={expanded ? "Collapse event" : "Expand event"}
            onClick={() => setExpanded((value) => !value)}
            className="px-0.5 text-[10px] text-[var(--text-muted)] cursor-pointer"
          >
            {expanded ? "−" : "+"}
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="mt-2 max-h-40 space-y-2 overflow-auto rounded bg-[rgba(0,0,0,0.35)] p-2 text-[10px] leading-relaxed text-[var(--text-body)]">
          {event.parsed ? (
            <pre className="m-0 whitespace-pre-wrap break-all">
              {JSON.stringify(event.parsed, null, 2)}
            </pre>
          ) : null}
          {event.wireData ? (
            <pre className="m-0 whitespace-pre-wrap break-all">
              {event.opcode === 2 ? "wire (base64):\n" : "wire:\n"}
              {event.wireData}
            </pre>
          ) : (
            <pre className="m-0 whitespace-pre-wrap break-all">{event.preview ?? "No payload preview"}</pre>
          )}
        </div>
      ) : null}
    </article>
  );
}

function DirectionSection({
  title,
  events,
  countsByType,
  emptyLabel,
  showFeedback,
}: {
  title: string;
  events: DebugEventRecord[];
  countsByType: Record<string, DebugTypeStats>;
  emptyLabel: string;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}) {
  if (!events.length) {
    return (
      <section className="flex flex-col gap-2">
        <ColumnHeader title={title} typeCount={0} onCopy={() => {}} copyDisabled />
        <p className="text-[12px] text-[var(--text-muted)]">{emptyLabel}</p>
      </section>
    );
  }

  const columnItems = events.map((event) => ({
    event,
    count: countsByType[event.eventKey]?.[event.direction] ?? 1,
  }));

  return (
    <section className="flex flex-col gap-2">
      <ColumnHeader
        title={title}
        typeCount={events.length}
        onCopy={() =>
          void copyColumn(
            title,
            formatColumnForCopy(events[0]?.direction ?? "send", columnItems),
            showFeedback
          )
        }
      />
      <div className="flex flex-col gap-2">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            count={countsByType[event.eventKey]?.[event.direction] ?? 1}
            showFeedback={showFeedback}
          />
        ))}
      </div>
    </section>
  );
}

function GroupedDirectionSection({
  title,
  groups,
  direction,
  emptyLabel,
  showFeedback,
}: {
  title: string;
  groups: GroupedEvent[];
  direction: DebugEventRecord["direction"];
  emptyLabel: string;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}) {
  if (!groups.length) {
    return (
      <section className="flex flex-col gap-2">
        <ColumnHeader title={title} typeCount={0} onCopy={() => {}} copyDisabled />
        <p className="text-[12px] text-[var(--text-muted)]">{emptyLabel}</p>
      </section>
    );
  }

  const columnItems = groups.map((group) => ({
    event: group.latest,
    count: group.count,
  }));

  return (
    <section className="flex flex-col gap-2">
      <ColumnHeader
        title={title}
        typeCount={groups.length}
        onCopy={() =>
          void copyColumn(title, formatColumnForCopy(direction, columnItems), showFeedback)
        }
      />
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <EventCard
            key={`${direction}:${group.eventKey}`}
            event={group.latest}
            count={group.count}
            showFeedback={showFeedback}
          />
        ))}
      </div>
    </section>
  );
}

function DirectionSplitView({
  sentEvents,
  receivedEvents,
  countsByType,
  groupByType,
  emptyLabel,
  showFeedback,
}: {
  sentEvents: DebugEventRecord[];
  receivedEvents: DebugEventRecord[];
  countsByType: Record<string, DebugTypeStats>;
  groupByType: boolean;
  emptyLabel: string;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}) {
  const sentGroups = useMemo(
    () => (groupByType ? groupEventsByType(sentEvents) : []),
    [groupByType, sentEvents]
  );
  const receivedGroups = useMemo(
    () => (groupByType ? groupEventsByType(receivedEvents) : []),
    [groupByType, receivedEvents]
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-2">
      <div className="min-h-0 min-w-0 overflow-y-auto pr-1">
        {groupByType ? (
          <GroupedDirectionSection
            title="Sent"
            groups={sentGroups}
            direction="send"
            emptyLabel={emptyLabel}
            showFeedback={showFeedback}
          />
        ) : (
          <DirectionSection
            title="Sent"
            events={sentEvents}
            countsByType={countsByType}
            emptyLabel={emptyLabel}
            showFeedback={showFeedback}
          />
        )}
      </div>
      <div className="min-h-0 min-w-0 overflow-y-auto border-l border-[var(--border-gold)] pl-2">
        {groupByType ? (
          <GroupedDirectionSection
            title="Received"
            groups={receivedGroups}
            direction="receive"
            emptyLabel={emptyLabel}
            showFeedback={showFeedback}
          />
        ) : (
          <DirectionSection
            title="Received"
            events={receivedEvents}
            countsByType={countsByType}
            emptyLabel={emptyLabel}
            showFeedback={showFeedback}
          />
        )}
      </div>
    </div>
  );
}

export function DebugPanel({ state, showFeedback }: DebugPanelProps) {
  const [section, setSection] = useState<DebugSection>("lastByType");
  const debug = state?.debug;
  const countsByType = debug?.countsByType ?? {};

  const unknownSent = useMemo(
    () => sortByEventType((debug?.unknownEvents ?? []).filter((event) => event.direction === "send")),
    [debug?.unknownEvents]
  );
  const unknownReceived = useMemo(
    () =>
      sortByEventType(
        (debug?.unknownEvents ?? []).filter((event) => event.direction === "receive")
      ),
    [debug?.unknownEvents]
  );

  const schemaSent = useMemo(
    () =>
      sortByEventType(
        (debug?.schemaMismatchEvents ?? []).filter((event) => event.direction === "send")
      ),
    [debug?.schemaMismatchEvents]
  );
  const schemaReceived = useMemo(
    () =>
      sortByEventType(
        (debug?.schemaMismatchEvents ?? []).filter((event) => event.direction === "receive")
      ),
    [debug?.schemaMismatchEvents]
  );

  const lastByTypeSent = useMemo(() => {
    if (!debug) {
      return [];
    }
    return sortByEventType(
      Object.values(debug.lastByType).filter((event) => event.direction === "send")
    );
  }, [debug]);

  const lastByTypeReceived = useMemo(() => {
    if (!debug) {
      return [];
    }
    return sortByEventType(
      Object.values(debug.lastByType).filter((event) => event.direction === "receive")
    );
  }, [debug]);

  const unknownTypeCount = useMemo(() => {
    const sentTypes = new Set(unknownSent.map((event) => event.eventKey));
    const receivedTypes = new Set(unknownReceived.map((event) => event.eventKey));
    return sentTypes.size + receivedTypes.size;
  }, [unknownSent, unknownReceived]);

  const schemaTypeCount = useMemo(() => {
    const sentTypes = new Set(schemaSent.map((event) => event.eventKey));
    const receivedTypes = new Set(schemaReceived.map((event) => event.eventKey));
    return sentTypes.size + receivedTypes.size;
  }, [schemaSent, schemaReceived]);

  const handleClear = async () => {
    try {
      const response = await sendBot("bot:clear-debug");
      if (response?.ok === false) {
        throw new Error(response.error ?? "Failed to clear debug events");
      }
      showFeedback("Debug events cleared", "success");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const flowTraces = debug?.flowTraces ?? [];
  const activeFlows = debug?.activeFlows ?? [];

  const buildFlowDump = (fresh: BotState | null | undefined) => {
    const source = fresh ?? state;
    const sourceDebug = source?.debug;
    const traces = sourceDebug?.flowTraces ?? [];
    const active = sourceDebug?.activeFlows ?? [];
    return {
      copiedAt: Date.now(),
      playerState: source?.playerState ?? null,
      playerStateDetail: source?.playerStateDetail ?? null,
      serviceState: source?.serviceState ?? null,
      activeFlows: active,
      last: traces[0] ?? active[0] ?? null,
      flowTraces: traces,
    };
  };

  const handleCopyFlowTraces = async () => {
    try {
      const response = await sendBot("bot:get-state");
      const dump = buildFlowDump(response.state ?? state);
      const activeCount = dump.activeFlows.length;
      const finishedCount = dump.flowTraces.length;
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      showFeedback(
        activeCount || finishedCount
          ? `Copied ${finishedCount} finished + ${activeCount} active flow(s)`
          : "Copied bot flow state (no traces yet)",
        "success"
      );
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Failed to copy", "error");
    }
  };

  const handleCopyLastFlow = async () => {
    try {
      const response = await sendBot("bot:get-state");
      const dump = buildFlowDump(response.state ?? state);
      const target = dump.last;
      if (!target) {
        // Still copy service/player state so a stuck bot is diagnosable.
        await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
        showFeedback("No flow traces — copied player/service state", "success");
        return;
      }
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            copiedAt: dump.copiedAt,
            playerState: dump.playerState,
            playerStateDetail: dump.playerStateDetail,
            serviceState: dump.serviceState,
            activeFlows: dump.activeFlows,
            flow: target,
          },
          null,
          2
        )
      );
      showFeedback(
        target.outcome == null ? "Active flow copied" : "Last flow trace copied",
        "success"
      );
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Failed to copy", "error");
    }
  };

  const counts = {
    unknown: unknownTypeCount,
    schema: schemaTypeCount,
    lastByType: lastByTypeSent.length + lastByTypeReceived.length,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Debug events</SectionTitle>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <StonegyButton
            variant="secondary"
            small
            onClick={() => void handleCopyLastFlow()}
          >
            Copy last flow
          </StonegyButton>
          <StonegyButton
            variant="secondary"
            small
            onClick={() => void handleCopyFlowTraces()}
          >
            Copy flow traces
            {flowTraces.length || activeFlows.length
              ? ` (${flowTraces.length}${activeFlows.length ? `+${activeFlows.length}↻` : ""})`
              : ""}
          </StonegyButton>
          <StonegyButton variant="secondary" small onClick={() => void handleClear()}>
            Clear
          </StonegyButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {SECTIONS.map((entry) => {
          const active = section === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSection(entry.id)}
              className={`rounded-md border px-2 py-1 text-[11px] cursor-pointer transition-colors ${
                active
                  ? "border-[var(--gold-soft)] text-[var(--gold-soft)] bg-[rgba(255,177,0,0.08)]"
                  : "border-[var(--border-gold)] text-[var(--text-muted)] hover:text-[var(--text-body)]"
              }`}
            >
              {entry.label}
              <span className="ml-1 opacity-70">({counts[entry.id]})</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {section === "unknown" ? (
          <DirectionSplitView
            sentEvents={unknownSent}
            receivedEvents={unknownReceived}
            countsByType={countsByType}
            groupByType
            emptyLabel="None"
            showFeedback={showFeedback}
          />
        ) : null}
        {section === "schema" ? (
          <DirectionSplitView
            sentEvents={schemaSent}
            receivedEvents={schemaReceived}
            countsByType={countsByType}
            groupByType
            emptyLabel="None"
            showFeedback={showFeedback}
          />
        ) : null}
        {section === "lastByType" ? (
          <DirectionSplitView
            sentEvents={lastByTypeSent}
            receivedEvents={lastByTypeReceived}
            countsByType={countsByType}
            groupByType={false}
            emptyLabel="No events captured yet."
            showFeedback={showFeedback}
          />
        ) : null}
      </div>
    </div>
  );
}
