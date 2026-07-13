import type { ReactNode } from "react";
import { RefreshIconButton } from "../ui/RefreshIconButton";

export function LootItemName({
  name,
  amount,
}: {
  name: string;
  amount?: number | null;
}) {
  const label = amount != null && amount > 0 ? `${name} ×${amount}` : name;
  return (
    <div className="min-w-0 truncate" title={label}>
      <span>{name}</span>
      {amount != null && amount > 0 ? (
        <span className="text-[var(--text-muted)]"> ×{amount}</span>
      ) : null}
    </div>
  );
}

export interface LootTableColumn<T> {
  id: string;
  header: ReactNode;
  /** Applied to both th and td (width / alignment). */
  className?: string;
  cell: (row: T) => ReactNode;
  footer?: ReactNode;
}

interface LootItemsTableProps<T> {
  columns: Array<LootTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string | number;
  rowClassName?: (row: T) => string | undefined;
  emptyMessage?: string;
  /** Optional note above the table (e.g. sync warning). */
  note?: ReactNode;
  /** Compact header with refresh — used when the table is not inside StonegyPanel. */
  refresh?: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
  };
  summary?: ReactNode;
}

export function LootItemsTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  emptyMessage = "No items.",
  note,
  refresh,
  summary,
}: LootItemsTableProps<T>) {
  const hasFooter = columns.some((column) => column.footer != null);

  if (!rows.length) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        {refresh ? (
          <div className="flex items-center justify-end">
            <RefreshIconButton
              label={refresh.label}
              disabled={refresh.disabled}
              onClick={refresh.onClick}
            />
          </div>
        ) : null}
        <p className="m-0 text-[var(--text-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-1 text-xs">
      {(refresh || summary) && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-[var(--text-muted)]">{summary}</div>
          {refresh ? (
            <RefreshIconButton
              label={refresh.label}
              disabled={refresh.disabled}
              onClick={refresh.onClick}
            />
          ) : null}
        </div>
      )}
      {note}
      <div className="min-h-0 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-[var(--border-gold-soft)] text-left text-[var(--text-muted)]">
              {columns.map((column) => (
                <th key={column.id} className={`pb-1 font-medium ${column.className ?? ""}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-b border-[var(--border-gold-soft)]/40 ${rowClassName?.(row) ?? ""}`}
              >
                {columns.map((column) => (
                  <td key={column.id} className={column.className ?? "py-0.5"}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasFooter ? (
            <tfoot>
              <tr className="border-t border-[var(--border-gold-soft)] text-[var(--text-muted)]">
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={`pt-1 font-medium ${column.className ?? ""}`}
                  >
                    {column.footer ?? null}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
