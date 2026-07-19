import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import {
  DEFAULT_MARKET_TAX_PERCENT,
  DEFAULT_MARKET_UNDERCUT_GOLD,
} from "@stonegy/helper/market/constants";
import { getItemName, getItemRarityBorderTier, listItems, RARITY_BORDER_TIERS, normalizeRarityBorderTier, shouldNeverAutoSell } from "@stonegy/helper/items";
import type {
  InventoryKeepOrMarketEntry,
  InventoryLootSellEntry,
} from "@stonegy/helper/domain/loot-sell";
import {
  getInventoryKeepOrMarketEntries,
  getInventoryLootSellEntries,
  sumInventoryLootSellValues,
} from "@stonegy/helper/domain/loot-sell";
import type { LootSellMode } from "@stonegy/helper/types";
import type { PartyLootSplitHistoryEntry } from "@stonegy/helper/core/projections/types";
import type { BotState } from "@stonegy/helper/types";
import { useFeatureMasterWithStop } from "../../hooks/useFeatureMasterWithStop";
import { FeaturePanelLayout } from "../layout/FeaturePanelLayout";
import { FeatureInputs } from "../ui/FeatureInputs";
import { SubFeatureSection } from "../ui/SubFeatureSection";
import type { SubFeatureBadge } from "../ui/FeatureHubNavigator";
import { SplitSubFeatureDetail } from "../ui/FeatureHubNavigator";
import { RefreshIconButton } from "../ui/RefreshIconButton";
import { StonegyPanel } from "../ui/StonegyPanel";
import { jsonEqual, usePersistedField } from "../../hooks/usePersistedField";
import { useBotTransport } from "../../transport/context";
import { formatGold } from "../../utils/format";
import { LootItemName, LootItemsTable } from "./LootItemsTable";

interface LootPanelProps {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => Promise<void>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

const OVERRIDE_MODE_OPTIONS: Array<{ value: LootSellMode; label: string }> = [
  { value: "keep", label: "Keep" },
  { value: "npc", label: "NPC" },
  { value: "market", label: "Market" },
];

const MIN_RARITY_OPTIONS = RARITY_BORDER_TIERS.map((entry) => ({
  value: String(entry.tier),
  label: entry.name,
}));

/** Text color by rarityBorderTier (1 common → 5 legendary). */
const RARITY_HEX: Record<number, string> = {
  1: "#c5c0b5",
  2: "#a1de53",
  3: "#2f6f9c",
  4: "#c084fc",
  5: "#c89b3c",
};

const RARITY_ROW_CLASS: Record<number, string> = {
  1: "text-[#c5c0b5]",
  2: "text-[var(--success)]",
  3: "text-[var(--blue)]",
  4: "text-[#c084fc]",
  5: "text-[var(--gold)]",
};

function rarityRowClass(itemId: number): string | undefined {
  const tier = getItemRarityBorderTier(itemId);
  return tier != null ? RARITY_ROW_CLASS[tier] : undefined;
}

function rarityTierClass(tier: number): string | undefined {
  return RARITY_ROW_CLASS[normalizeRarityBorderTier(tier)];
}

function rarityTierColor(tier: number): string {
  return RARITY_HEX[normalizeRarityBorderTier(tier)] ?? RARITY_HEX[1];
}

function formatCompactGold(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString();
}

const CATEGORY_SELL_OPTIONS: Array<{
  key: "mountSellMode" | "imbuementSellMode" | "craftSellMode" | "enchantSellMode";
  label: string;
}> = [
  { key: "mountSellMode", label: "Mount items" },
  { key: "imbuementSellMode", label: "Imbuement items" },
  { key: "craftSellMode", label: "Craft items" },
  { key: "enchantSellMode", label: "Enchant items" },
];

function SellOnMarketSection({
  minRarityTier,
  minRaritySellMode,
  categoryModes,
  disabled,
  onMinRarityChange,
  onMinRarityModeChange,
  onCategoryModeChange,
}: {
  minRarityTier: string;
  minRaritySellMode: LootSellMode;
  categoryModes: {
    mountSellMode: LootSellMode;
    imbuementSellMode: LootSellMode;
    craftSellMode: LootSellMode;
    enchantSellMode: LootSellMode;
  };
  disabled?: boolean;
  onMinRarityChange: (tier: string) => void;
  onMinRarityModeChange: (mode: LootSellMode) => void;
  onCategoryModeChange: (
    key: "mountSellMode" | "imbuementSellMode" | "craftSellMode" | "enchantSellMode",
    mode: LootSellMode
  ) => void;
}) {
  const selectedTier = normalizeRarityBorderTier(Number(minRarityTier));

  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Min rarity
        </span>
        <select
          className={`stonegy-select min-w-0 flex-1 py-0.5! px-1! text-[11px]! ${rarityTierClass(selectedTier) ?? ""}`}
          style={{ color: rarityTierColor(selectedTier) }}
          value={String(selectedTier)}
          disabled={disabled}
          onChange={(e) =>
            onMinRarityChange(String(normalizeRarityBorderTier(Number(e.target.value))))
          }
        >
          {MIN_RARITY_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              style={{ color: rarityTierColor(Number(option.value)) }}
            >
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="stonegy-select w-[4.75rem]! shrink-0 py-0.5! px-1! text-[11px]!"
          value={minRaritySellMode}
          disabled={disabled}
          aria-label="Sell mode for min rarity items"
          onChange={(e) => onMinRarityModeChange(e.target.value as LootSellMode)}
        >
          {OVERRIDE_MODE_OPTIONS.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      {CATEGORY_SELL_OPTIONS.map((option) => (
        <label key={option.key} className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {option.label}
          </span>
          <select
            className="stonegy-select w-[4.75rem]! shrink-0 py-0.5! px-1! text-[11px]!"
            value={categoryModes[option.key]}
            disabled={disabled}
            aria-label={`Sell mode for ${option.label}`}
            onChange={(e) =>
              onCategoryModeChange(option.key, e.target.value as LootSellMode)
            }
          >
            {OVERRIDE_MODE_OPTIONS.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function SellOverridesDropdown({
  sellModes,
  disabled,
  onToggleItem,
  onModeChange,
}: {
  sellModes: Record<number, LootSellMode>;
  disabled?: boolean;
  onToggleItem: (itemId: number, selected: boolean) => void;
  onModeChange: (itemId: number, mode: LootSellMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(
    () =>
      Object.keys(sellModes)
        .map(Number)
        .filter((itemId) => Number.isFinite(itemId) && itemId > 0),
    [sellModes]
  );

  const selectedRows = useMemo(() => {
    return selectedIds
      .map((itemId) => ({
        itemId,
        name: getItemName(itemId) ?? `Item #${itemId}`,
        mode: sellModes[itemId] ?? ("keep" as LootSellMode),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedIds, sellModes]);

  const unselectedMatches = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    const selected = new Set(selectedIds);
    return listItems()
      .filter(
        (item) =>
          !selected.has(item.id) &&
          !shouldNeverAutoSell(item.id) &&
          (item.name.toLowerCase().includes(query) || String(item.id).includes(query))
      )
      .slice(0, 12);
  }, [filter, selectedIds]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const summary = selectedRows.length
    ? `${selectedRows.length} override${selectedRows.length === 1 ? "" : "s"}`
    : "Select items…";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Item overrides
      </span>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          className="stonegy-select flex w-full items-center justify-between gap-1 py-0.5! px-1.5! text-left text-[11px]!"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="min-w-0 truncate">{summary}</span>
          <span className="shrink-0 text-[var(--text-muted)]" aria-hidden>
            {open ? "▴" : "▾"}
          </span>
        </button>
        {open ? (
          <div className="absolute left-0 right-0 top-0 z-20 flex flex-col gap-1 rounded border border-[var(--border-gold-soft)] bg-[var(--bg-inset)] p-1.5 shadow-lg">
            <input
              className="stonegy-input py-0.5! text-[11px]!"
              value={filter}
              placeholder="Filter items…"
              disabled={disabled}
              autoFocus
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul className="m-0 max-h-28 list-none overflow-auto p-0" role="listbox">
              {selectedRows.map((row) => (
                <li
                  key={row.itemId}
                  className={`flex items-center gap-1 border-b border-[var(--border-gold-soft)] px-0.5 py-0.5 last:border-b-0 ${
                    rarityRowClass(row.itemId) ?? ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--gold)] h-3 w-3 shrink-0"
                    checked
                    disabled={disabled}
                    aria-label={`Remove override for ${row.name}`}
                    onChange={() => onToggleItem(row.itemId, false)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[10px]" title={row.name}>
                    {row.name}
                  </span>
                  <select
                    className="stonegy-select w-[4.25rem]! min-w-0! shrink-0 py-0! px-0.5! text-[9px]!"
                    value={row.mode}
                    disabled={disabled}
                    aria-label={`Sell mode for ${row.name}`}
                    onChange={(e) => onModeChange(row.itemId, e.target.value as LootSellMode)}
                  >
                    {OVERRIDE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
              {unselectedMatches.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-1 border-b border-[var(--border-gold-soft)] px-0.5 py-0.5 last:border-b-0 ${
                    rarityRowClass(item.id) ?? ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--gold)] h-3 w-3 shrink-0"
                    checked={false}
                    disabled={disabled}
                    aria-label={`Add override for ${item.name}`}
                    onChange={() => onToggleItem(item.id, true)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[10px]" title={item.name}>
                    {item.name}
                  </span>
                </li>
              ))}
              {!selectedRows.length && !unselectedMatches.length ? (
                <li className="px-1 py-1 text-[9px] text-[var(--text-muted)]">
                  {filter.trim().length < 2 ? "Type to search…" : "No matches."}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type AutoSellPreviewSettings = {
  marketSellMinRarityTier: number;
  minRaritySellMode: LootSellMode;
  mountSellMode: LootSellMode;
  imbuementSellMode: LootSellMode;
  craftSellMode: LootSellMode;
  enchantSellMode: LootSellMode;
  lootSellModeByItemId: Record<number, LootSellMode>;
};

function useAutoSellPreviewState(
  state: BotState | null,
  previewSettings: AutoSellPreviewSettings
) {
  return useMemo(() => {
    if (!state) {
      return null;
    }
    return {
      ...state,
      settings: {
        ...state.settings,
        ...previewSettings,
      },
    };
  }, [state, previewSettings]);
}

function KeepOrMarketStatusPanel({
  state,
  runAction,
  previewSettings,
}: {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => Promise<void>;
  previewSettings: AutoSellPreviewSettings;
}) {
  const { send: sendBot } = useBotTransport();
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [listedItemIds, setListedItemIds] = useState<Set<number>>(() => new Set());
  const pricing = useMemo(
    () => ({
      taxPercent: state?.settings.marketTaxPercent ?? DEFAULT_MARKET_TAX_PERCENT,
      undercutGold: state?.settings.marketUndercutGold ?? DEFAULT_MARKET_UNDERCUT_GOLD,
    }),
    [state?.settings.marketTaxPercent, state?.settings.marketUndercutGold]
  );
  const previewState = useAutoSellPreviewState(state, previewSettings);
  const rows = useMemo(() => {
    if (!previewState) {
      return [];
    }
    return getInventoryKeepOrMarketEntries(previewState, pricing).filter(
      (row) => !listedItemIds.has(row.itemId)
    );
  }, [previewState, pricing, listedItemIds]);
  const connected = !!state?.connection.connected;

  const fetchPrice = (row: InventoryKeepOrMarketEntry) => {
    setBusyItemId(row.itemId);
    void (async () => {
      try {
        await runAction(() => sendBot("bot:market-sync-item", { itemId: row.itemId }));
      } finally {
        setBusyItemId((current) => (current === row.itemId ? null : current));
      }
    })();
  };

  const placeSellOrder = (row: InventoryKeepOrMarketEntry) => {
    if (row.listPrice == null || row.amount <= 0) {
      return;
    }
    setBusyItemId(row.itemId);
    void (async () => {
      try {
        let listed = false;
        await runAction(async () => {
          const result = await sendBot("bot:market-create", {
            itemId: row.itemId,
            eachPrice: row.listPrice,
            itemAmount: row.amount,
            isBuyOrder: false,
          });
          listed = result.ok !== false;
          return {
            ...result,
            message:
              result.message ??
              `Listed ${row.name} ×${row.amount} @ ${row.listPrice!.toLocaleString()} gp`,
          };
        });
        if (listed) {
          setListedItemIds((current) => {
            const next = new Set(current);
            next.add(row.itemId);
            return next;
          });
        }
      } finally {
        setBusyItemId((current) => (current === row.itemId ? null : current));
      }
    })();
  };

  return (
    <StonegyPanel title="Keep / market items">
      <LootItemsTable<InventoryKeepOrMarketEntry>
        rows={rows}
        rowKey={(row) => row.itemId}
        rowClassName={(row) => rarityRowClass(row.itemId)}
        emptyMessage="No keep or market items in inventory."
        summary={rows.length ? `${rows.length} filtered from auto loot` : undefined}
        note={
          <p className="m-0 text-[10px] text-[var(--text-muted)]">
            Fetch price, then list at lowest −{pricing.undercutGold} gp.
          </p>
        }
        columns={[
          {
            id: "item",
            header: "Item",
            className: "max-w-[7.5rem] min-w-0 pr-1 text-left",
            cell: (row) => (
              <div className="max-w-[7.5rem] truncate">
                <LootItemName name={row.name} amount={row.amount} />
              </div>
            ),
          },
          {
            id: "price",
            header: "Price",
            className: "w-12 whitespace-nowrap pr-1 text-right tabular-nums",
            cell: (row) =>
              row.listPrice != null ? (
                <span title={row.lowestSellPrice != null ? `Lowest ${row.lowestSellPrice}` : undefined}>
                  {formatCompactGold(row.listPrice)}
                </span>
              ) : !row.needsMarketSync ? (
                <span className="text-[var(--text-muted)]" title="No market listings">
                  none
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">—</span>
              ),
          },
          {
            id: "actions",
            header: "",
            className: "w-14 whitespace-nowrap py-0.5 text-right",
            cell: (row) => {
              const busy = busyItemId === row.itemId;
              const canList = row.listPrice != null;
              return (
                <div className="flex items-center justify-end gap-0.5">
                  <RefreshIconButton
                    label={`Fetch market price for ${row.name}`}
                    disabled={!connected || busy}
                    onClick={() => fetchPrice(row)}
                  />
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border-gold-soft)] bg-[rgba(28,36,39,0.55)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--gold-soft)] disabled:pointer-events-none disabled:opacity-40"
                    disabled={!connected || busy || !canList}
                    aria-label={
                      canList
                        ? `List ${row.name} on market at ${row.listPrice!.toLocaleString()} gp`
                        : row.needsMarketSync
                          ? `Fetch price before listing ${row.name}`
                          : `No market listings for ${row.name}`
                    }
                    title={
                      canList
                        ? `List @ ${row.listPrice!.toLocaleString()} gp`
                        : row.needsMarketSync
                          ? "Fetch price first"
                          : "No market listings"
                    }
                    onClick={() => placeSellOrder(row)}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2zM7.16 14.26l.03-.12L8.1 12h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 3H5.21L4.27 1H1v2h2l3.6 7.59-1.35 2.44C4.52 14.37 5.48 16 7 16h12v-2H7.42c-.14 0-.25-.11-.26-.24z" />
                    </svg>
                  </button>
                </div>
              );
            },
          },
        ]}
      />
    </StonegyPanel>
  );
}

function AutoSellStatusPanel({
  state,
  runAction,
  previewSettings,
}: {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => Promise<void>;
  previewSettings: AutoSellPreviewSettings;
}) {
  const { send: sendBot } = useBotTransport();
  const pricing = useMemo(
    () => ({
      taxPercent: state?.settings.marketTaxPercent ?? DEFAULT_MARKET_TAX_PERCENT,
      undercutGold: state?.settings.marketUndercutGold ?? DEFAULT_MARKET_UNDERCUT_GOLD,
    }),
    [state?.settings.marketTaxPercent, state?.settings.marketUndercutGold]
  );

  const previewState = useAutoSellPreviewState(state, previewSettings);

  const sellRows = useMemo(() => {
    if (!previewState) {
      return [];
    }

    return getInventoryLootSellEntries(previewState, pricing, { includeHeldForMarketSync: true });
  }, [previewState, pricing]);

  const totals = useMemo(() => sumInventoryLootSellValues(sellRows), [sellRows]);
  const heldCount = sellRows.filter((row) => row.venue === "none").length;
  const syncItemIds = useMemo(
    () =>
      sellRows
        .filter((row) => row.needsMarketSync)
        .map((row) => row.itemId)
        .sort((a, b) => a - b),
    [sellRows]
  );
  const lastSyncedKeyRef = useRef("");

  useEffect(() => {
    if (!state?.connection.connected || !syncItemIds.length) {
      return;
    }
    const syncKey = syncItemIds.join(",");
    if (syncKey === lastSyncedKeyRef.current) {
      return;
    }
    lastSyncedKeyRef.current = syncKey;
    void sendBot("bot:market-sync-items", { itemIds: syncItemIds }).catch(() => {
      lastSyncedKeyRef.current = "";
    });
  }, [state?.connection.connected, syncItemIds]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <StonegyPanel title="Auto sell preview">
        <LootItemsTable<InventoryLootSellEntry>
          rows={sellRows}
          rowKey={(row) => row.itemId}
          rowClassName={(row) => rarityRowClass(row.itemId)}
          emptyMessage="No sellable inventory items."
          summary={sellRows.length ? `${sellRows.length} item type(s)` : undefined}
          note={
            heldCount ? (
              <p className="m-0 text-[10px] text-[var(--gold-soft)]">
                {heldCount} item(s) held — market rule matched but no price reference
                {sellRows.some((row) => row.venue === "none" && row.needsMarketSync)
                  ? ". Syncing market prices…"
                  : " (empty book). Kept, not sold to NPC."}
              </p>
            ) : null
          }
          columns={[
            {
              id: "item",
              header: "Item",
              className: "min-w-0 w-auto pr-2 text-left",
              cell: (row) => (
                <LootItemName
                  name={row.name}
                  amount={row.amount}
                />
              ),
              footer: "Total",
            },
            {
              id: "final",
              header: "Value",
              className: "w-16 whitespace-nowrap text-right tabular-nums",
              cell: (row) =>
                row.venue === "none" ? (
                  <span className="text-[var(--gold-soft)]">hold</span>
                ) : row.finalValue == null ? (
                  <span className="text-[var(--text-muted)]">—</span>
                ) : (
                  formatCompactGold(row.finalValue)
                ),
              footer: formatGold(totals.finalValue),
            },
          ]}
        />
      </StonegyPanel>
      <KeepOrMarketStatusPanel
        state={state}
        runAction={runAction}
        previewSettings={previewSettings}
      />
    </div>
  );
}


function formatSplitTimestamp(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type LootSplitView =
  | {
      kind: "current";
      totals: {
        lootTotalValue: number;
        suppliesGold: number;
        balanceGold: number;
      };
      rows: Array<{ playerId: string; name: string; amount: number; isLeader?: boolean }>;
    }
  | {
      kind: "history";
      entry: PartyLootSplitHistoryEntry;
      rows: Array<{ playerId: string; name: string; amount: number }>;
    };

function LootSplitMemberTable({
  rows,
}: {
  rows: Array<{ playerId: string; name: string; amount: number; isLeader?: boolean }>;
}) {
  return (
    <div className="min-h-0 overflow-auto">
      <table className="w-full table-fixed border-collapse text-[11px]">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="pb-1 font-medium">Member</th>
            <th className="pb-1 text-right font-medium">Gold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId}>
              <td className="truncate py-0.5">
                {row.name}
                {row.isLeader ? " (L)" : ""}
              </td>
              <td
                className={`py-0.5 text-right tabular-nums ${
                  row.amount > 0 ? "font-semibold text-[var(--accent-gold)]" : ""
                }`}
              >
                {row.amount > 0 ? formatGold(row.amount) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LootSplitStatusPanel({
  state,
  runAction,
}: {
  state: BotState | null;
  runAction: LootPanelProps["runAction"];
}) {
  const { send: sendBot } = useBotTransport();
  const splitter = state?.party.partyLootSplitter;
  const history = state?.party.lootSplitHistory ?? [];
  const [pageIndex, setPageIndex] = useState(0);

  const views = useMemo((): LootSplitView[] => {
    const pages: LootSplitView[] = [];
    if (splitter) {
      pages.push({
        kind: "current",
        totals: splitter.totals,
        rows: splitter.splitter.members.map((member) => ({
          playerId: member.playerId,
          name: member.name,
          amount: member.transferFromLeaderGold,
          isLeader: member.isLeader,
        })),
      });
    }
    for (const entry of history) {
      pages.push({
        kind: "history",
        entry,
        rows: entry.transfers.map((transfer) => ({
          playerId: transfer.playerId,
          name: transfer.name,
          amount: transfer.amount,
        })),
      });
    }
    return pages;
  }, [splitter, history]);

  useEffect(() => {
    setPageIndex((current) => {
      if (!views.length) {
        return 0;
      }
      return Math.min(current, views.length - 1);
    });
  }, [views.length]);

  const active = views[pageIndex] ?? null;
  const canGoLeft = pageIndex > 0;
  const canGoRight = pageIndex < views.length - 1;

  const goBy = (delta: number) => {
    setPageIndex((current) => {
      const next = current + delta;
      if (next < 0 || next >= views.length) {
        return current;
      }
      return next;
    });
  };

  const onWheel = (event: WheelEvent<HTMLElement>) => {
    if (!event.shiftKey || views.length < 2) {
      return;
    }
    event.preventDefault();
    goBy(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
  };

  const title =
    active?.kind === "history"
      ? `Split · ${formatSplitTimestamp(active.entry.at)}`
      : "Loot split";

  return (
    <StonegyPanel
      title={title}
      action={
        <div className="flex items-center gap-1">
          {views.length > 1 ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="rounded border border-[var(--border-gold-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] disabled:opacity-30"
                aria-label="Previous split view"
                disabled={!canGoLeft}
                onClick={() => goBy(-1)}
              >
                ‹
              </button>
              <span className="min-w-[2.5rem] text-center text-[9px] tabular-nums text-[var(--text-muted)]">
                {pageIndex + 1}/{views.length}
              </span>
              <button
                type="button"
                className="rounded border border-[var(--border-gold-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] disabled:opacity-30"
                aria-label="Next split view"
                disabled={!canGoRight}
                onClick={() => goBy(1)}
              >
                ›
              </button>
            </div>
          ) : null}
          <RefreshIconButton
            label="Refresh party"
            disabled={!state?.connection.connected}
            onClick={() => void runAction(() => sendBot("bot:refresh-hunt"))}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-1 text-xs" onWheel={onWheel}>
        {!active ? (
          <p className="m-0 text-xs text-[var(--text-muted)]">No split data yet.</p>
        ) : (
          <>
            {active.kind === "history" ? (
              <p className="m-0 text-[10px] text-[var(--text-muted)]">
                Last split · {active.entry.transferCount} transfer
                {active.entry.transferCount === 1 ? "" : "s"}
              </p>
            ) : null}
            <dl className="m-0 grid grid-cols-3 gap-1">
              <div>
                <dt className="text-[var(--text-muted)]">Loot</dt>
                <dd className="m-0">{formatGold(active.kind === "current" ? active.totals.lootTotalValue : active.entry.totals.lootTotalValue)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Supplies</dt>
                <dd className="m-0">{formatGold(active.kind === "current" ? active.totals.suppliesGold : active.entry.totals.suppliesGold)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Balance</dt>
                <dd className="m-0">{formatGold(active.kind === "current" ? active.totals.balanceGold : active.entry.totals.balanceGold)}</dd>
              </div>
            </dl>
            <LootSplitMemberTable rows={active.rows} />
          </>
        )}
      </div>
    </StonegyPanel>
  );
}

export function LootPanel({ state, runAction, saveSettings, showFeedback }: LootPanelProps) {
  const { send: sendBot } = useBotTransport();
  const [autoSellLoot, setAutoSellLoot] = usePersistedField(
    state?.settings.autoSellLoot,
    false
  );
  const [minRarityTier, setMinRarityTier] = usePersistedField(
    state?.settings.marketSellMinRarityTier != null
      ? String(normalizeRarityBorderTier(state.settings.marketSellMinRarityTier))
      : undefined,
    "1"
  );
  const [minRaritySellMode, setMinRaritySellMode] = usePersistedField(
    state?.settings.minRaritySellMode,
    "market" as LootSellMode
  );
  const [mountSellMode, setMountSellMode] = usePersistedField(
    state?.settings.mountSellMode,
    "keep" as LootSellMode
  );
  const [imbuementSellMode, setImbuementSellMode] = usePersistedField(
    state?.settings.imbuementSellMode,
    "keep" as LootSellMode
  );
  const [craftSellMode, setCraftSellMode] = usePersistedField(
    state?.settings.craftSellMode,
    "keep" as LootSellMode
  );
  const [enchantSellMode, setEnchantSellMode] = usePersistedField(
    state?.settings.enchantSellMode,
    "keep" as LootSellMode
  );
  const [sellModes, setSellModes] = usePersistedField(
    state?.settings.lootSellModeByItemId,
    {} as Record<number, LootSellMode>,
    jsonEqual
  );
  const [autoSplitLootOnHuntFinished, setAutoSplitLootOnHuntFinished] = usePersistedField(
    state?.settings.autoSplitLootOnHuntFinished,
    false
  );

  const lootSettings = (overrides: Record<string, unknown> = {}) => ({
    autoSellLoot,
    marketSellMinRarityTier: normalizeRarityBorderTier(Number(minRarityTier)),
    minRaritySellMode,
    mountSellMode,
    imbuementSellMode,
    craftSellMode,
    enchantSellMode,
    lootSellModeByItemId: sellModes,
    autoSplitLootOnHuntFinished,
    ...overrides,
  });

  const saveLoot = (overrides?: Record<string, unknown>) =>
    saveSettings(lootSettings(overrides));

  const { masterOn, subsDisabled, handleMasterChange } = useFeatureMasterWithStop("loot", {
    state,
    saveSettings: saveLoot,
    onLocalStateReset: (updates) => {
      if (updates.autoSellLoot === false) {
        setAutoSellLoot(false);
      }
      if (updates.autoSplitLootOnHuntFinished === false) {
        setAutoSplitLootOnHuntFinished(false);
      }
    },
    showFeedback,
  });

  const setItemSellMode = (itemId: number, mode: LootSellMode) => {
    const next = { ...sellModes, [itemId]: mode };
    setSellModes(next);
    void saveLoot({ lootSellModeByItemId: next });
  };

  const setCategorySellMode = (
    key: "mountSellMode" | "imbuementSellMode" | "craftSellMode" | "enchantSellMode",
    mode: LootSellMode
  ) => {
    if (key === "mountSellMode") {
      setMountSellMode(mode);
    } else if (key === "imbuementSellMode") {
      setImbuementSellMode(mode);
    } else if (key === "craftSellMode") {
      setCraftSellMode(mode);
    } else {
      setEnchantSellMode(mode);
    }
    void saveLoot({ [key]: mode });
  };

  const toggleOverrideItem = (itemId: number, selected: boolean) => {
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return;
    }
    if (selected) {
      if (sellModes[itemId] != null) {
        return;
      }
      const next = { ...sellModes, [itemId]: "keep" as LootSellMode };
      setSellModes(next);
      void saveLoot({ lootSellModeByItemId: next });
      return;
    }
    const next = { ...sellModes };
    delete next[itemId];
    setSellModes(next);
    void saveLoot({ lootSellModeByItemId: next });
  };

  const autoSellBadge: SubFeatureBadge = autoSellLoot ? "on" : masterOn ? "armed" : "off";
  const lootSplitBadge: SubFeatureBadge = autoSplitLootOnHuntFinished
    ? "on"
    : masterOn
      ? "armed"
      : "off";

  const handleSplitNow = () => {
    void runAction(async () => {
      const result = await sendBot("bot:split-loot-now");
      if (result.ok) {
        showFeedback(result.message ?? "Loot split complete.", "success");
      }
      return result;
    });
  };

  return (
    <FeaturePanelLayout
      featureId="loot"
      masterOn={masterOn}
      onMasterChange={handleMasterChange}
      showFeedback={showFeedback}
      subsDisabled={subsDisabled}
      setup={<FeatureInputs>{null}</FeatureInputs>}
      subFeatures={[
        {
          id: "auto-sell",
          label: "Auto sell",
          order: 1,
          badge: autoSellBadge,
          toggle: {
            checked: autoSellLoot,
            disabled: subsDisabled,
            onChange: (checked) => {
              setAutoSellLoot(checked);
              void saveLoot({ autoSellLoot: checked });
            },
          },
          action: {
            label: "Sell now",
            disabled: !state?.connection.connected,
            onClick: () => void runAction(() => sendBot("bot:sell-loot-now")),
          },
          content: (
            <SplitSubFeatureDetail
              controls={
                <SubFeatureSection hideTitle compact lockAutomation={subsDisabled}>
                  <SellOnMarketSection
                    minRarityTier={minRarityTier}
                    minRaritySellMode={minRaritySellMode}
                    categoryModes={{
                      mountSellMode,
                      imbuementSellMode,
                      craftSellMode,
                      enchantSellMode,
                    }}
                    onMinRarityChange={(next) => {
                      setMinRarityTier(next);
                      void saveLoot({ marketSellMinRarityTier: Number(next) });
                    }}
                    onMinRarityModeChange={(mode) => {
                      setMinRaritySellMode(mode);
                      void saveLoot({ minRaritySellMode: mode });
                    }}
                    onCategoryModeChange={setCategorySellMode}
                  />
                  <SellOverridesDropdown
                    sellModes={sellModes}
                    onToggleItem={toggleOverrideItem}
                    onModeChange={setItemSellMode}
                  />
                </SubFeatureSection>
              }
              status={
                <AutoSellStatusPanel
                  state={state}
                  runAction={runAction}
                  previewSettings={{
                    marketSellMinRarityTier: normalizeRarityBorderTier(Number(minRarityTier)),
                    minRaritySellMode,
                    mountSellMode,
                    imbuementSellMode,
                    craftSellMode,
                    enchantSellMode,
                    lootSellModeByItemId: sellModes,
                  }}
                />
              }
            />
          ),
        },
        {
          id: "loot-split",
          label: "Loot split",
          order: 2,
          badge: lootSplitBadge,
          toggle: {
            checked: autoSplitLootOnHuntFinished,
            disabled: subsDisabled,
            onChange: (checked) => {
              setAutoSplitLootOnHuntFinished(checked);
              void saveLoot({ autoSplitLootOnHuntFinished: checked });
            },
          },
          action: {
            label: "Split now",
            disabled: !state?.connection.connected,
            onClick: handleSplitNow,
          },
          content: (
            <SplitSubFeatureDetail
              status={<LootSplitStatusPanel state={state} runAction={runAction} />}
            />
          ),
        },
      ]}
    />
  );
}
