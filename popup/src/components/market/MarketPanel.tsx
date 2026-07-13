import { useMemo } from "react";
import { getItemName } from "../../../../lib/items";
import { sendBot } from "../../api/bot";
import type { BotState } from "../../types/bot";
import { useFeatureMasterWithStop } from "../../hooks/useFeatureMasterWithStop";
import { usePersistedField } from "../../hooks/usePersistedField";
import { FeaturePanelLayout } from "../layout/FeaturePanelLayout";
import { FeatureInputs } from "../ui/FeatureInputs";
import { SubFeatureSection } from "../ui/SubFeatureSection";
import { StonegyInput } from "../ui/StonegyInput";
import { StonegyPanel } from "../ui/StonegyPanel";
import { StonegyToggle } from "../ui/StonegyToggle";
import type { SubFeatureBadge } from "../ui/FeatureHubNavigator";
import { isMarketFullScanRunning } from "../../features";

interface MarketPanelProps {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string }>) => Promise<void>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

export function MarketPanel({ state, runAction, saveSettings, showFeedback }: MarketPanelProps) {
  const [scanEnabled, setScanEnabled] = usePersistedField(state?.settings.marketScanEnabled, false);
  const [scanIntervalSec, setScanIntervalSec] = usePersistedField(
    state?.settings.marketScanIntervalSec != null ? String(state.settings.marketScanIntervalSec) : undefined,
    "30"
  );
  const [autoBuyEnabled, setAutoBuyEnabled] = usePersistedField(state?.settings.marketAutoBuyEnabled, false);

  const marketSettings = (overrides: Record<string, unknown> = {}) => ({
    marketScanEnabled: scanEnabled,
    marketScanIntervalSec: Math.max(10, Number(scanIntervalSec) || 30),
    marketAutoBuyEnabled: autoBuyEnabled,
    ...overrides,
  });

  const saveMarketSettings = (overrides?: Record<string, unknown>) =>
    saveSettings(marketSettings(overrides));

  const { masterOn, subsDisabled, handleMasterChange } = useFeatureMasterWithStop("market", {
    state,
    saveSettings: saveMarketSettings,
    onLocalStateReset: (updates) => {
      if (updates.marketScanEnabled === false) {
        setScanEnabled(false);
      }
      if (updates.marketAutoBuyEnabled === false) {
        setAutoBuyEnabled(false);
      }
    },
    showFeedback,
  });

  const scannedItemIds = useMemo(
    () => Object.keys(state?.market.marketPrices ?? {}).map(Number).filter((id) => id > 0),
    [state?.market.marketPrices]
  );

  const boughtItems = state?.market.marketBoughtItems ?? [];
  const missedOffers = state?.market.marketMissedOffers ?? [];

  const totalProfit = useMemo(
    () => boughtItems.reduce((sum, entry) => sum + entry.profitPerItem * entry.amount, 0),
    [boughtItems]
  );

  const totalMissedProfit = useMemo(
    () => missedOffers.reduce((sum, entry) => sum + entry.profitPerItem * entry.missedAmount, 0),
    [missedOffers]
  );

  const formatGold = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? "—" : `${value.toLocaleString()} gp`;

  const fullScanPage = state?.market.marketFullScanPage;
  const fullScanTotal = state?.market.marketFullScanTotalPages;
  const fullScanStatus = state?.market.marketFullScanStatus;
  const fullScanRunning = isMarketFullScanRunning(state);

  const scannerBadge: SubFeatureBadge = scanEnabled
    ? state?.market.marketFullScanPage != null || state?.market.marketFullScanStatus
      ? "live"
      : state?.market.marketScanStatus
        ? "live"
        : "on"
    : "off";

  return (
    <FeaturePanelLayout
      featureId="market"
      masterOn={masterOn}
      onMasterChange={handleMasterChange}
      showFeedback={showFeedback}
      subsDisabled={subsDisabled}
      setup={
        <FeatureInputs>
          <StonegyToggle
            id="market-auto-buy"
            label="Auto-buy profitable listings"
            checked={autoBuyEnabled}
            disabled={!masterOn}
            onChange={(e) => {
              const checked = e.target.checked;
              setAutoBuyEnabled(checked);
              void saveMarketSettings({ marketAutoBuyEnabled: checked });
            }}
          />
        </FeatureInputs>
      }
      subFeatures={[
        {
          id: "scanner",
          label: "Market Scanner",
          order: 1,
          badge: scannerBadge,
          toggle: {
            checked: scanEnabled,
            disabled: subsDisabled,
            onChange: (checked) => {
              setScanEnabled(checked);
              void saveMarketSettings({ marketScanEnabled: checked });
            },
          },
          action: {
            label: fullScanRunning ? "Stop scan" : "Scan now",
            disabled: !state?.connection.connected,
            onClick: () =>
              void runAction(() =>
                sendBot(fullScanRunning ? "bot:market-scan-stop" : "bot:market-scan-full")
              ),
          },
          content: (
            <SubFeatureSection hideTitle lockAutomation={subsDisabled}>
              <StonegyInput
                label="Scan interval (seconds)"
                type="number"
                min={10}
                className="!w-28"
                value={scanIntervalSec}
                onChange={(e) => setScanIntervalSec(e.target.value)}
                onBlur={() => void saveMarketSettings()}
              />
              {fullScanPage != null && fullScanTotal != null ? (
                <p className="m-0 text-[11px] font-medium text-[var(--gold-soft)]">
                  Full scan: page {fullScanPage}/{fullScanTotal}
                </p>
              ) : null}
              {fullScanStatus ? (
                <p className="m-0 text-[11px] text-[var(--text-muted)]">{fullScanStatus}</p>
              ) : null}
              <p className="m-0 text-[11px] text-[var(--text-muted)]">
                {scannedItemIds.length.toLocaleString()} items in cache.
              </p>
            </SubFeatureSection>
          ),
        },
        {
          id: "bought",
          label: "Bought items",
          order: 2,
          content: (
            <StonegyPanel title="Bought items">
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <p className="m-0 text-sm font-medium text-[var(--success)]">
                  +{formatGold(totalProfit)}
                </p>
                {!boughtItems.length ? (
                  <p className="m-0 text-xs text-[var(--text-muted)]">No market buys yet.</p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-gold-soft)]">
                          <th className="py-1 pr-2">Item</th>
                          <th className="py-1 pr-2">Buy</th>
                          <th className="py-1 pr-2">NPC</th>
                          <th className="py-1 pr-2">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boughtItems.map((entry, index) => (
                          <tr
                            key={`${entry.itemId}-${entry.boughtAt}-${index}`}
                            className="border-b border-[var(--border-gold-soft)]/40"
                          >
                            <td className="py-1.5 pr-2">
                              <div>{getItemName(entry.itemId) ?? `#${entry.itemId}`}</div>
                              <div className="text-[var(--text-muted)]">×{entry.amount}</div>
                            </td>
                            <td className="py-1.5 pr-2">{formatGold(entry.buyPrice)}</td>
                            <td className="py-1.5 pr-2">{formatGold(entry.sellPrice)}</td>
                            <td className="py-1.5 pr-2 text-[var(--success)]">
                              +{formatGold(entry.profitPerItem * entry.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </StonegyPanel>
          ),
        },
        {
          id: "missed",
          label: "Missed offers",
          order: 3,
          content: (
            <StonegyPanel title="Missed offers">
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <p className="m-0 text-sm font-medium text-[var(--warning,#d4a017)]">
                  {formatGold(totalMissedProfit)}
                </p>
                {!missedOffers.length ? (
                  <p className="m-0 text-xs text-[var(--text-muted)]">No missed offers yet.</p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-gold-soft)]">
                          <th className="py-1 pr-2">Item</th>
                          <th className="py-1 pr-2">Buy</th>
                          <th className="py-1 pr-2">Missed</th>
                          <th className="py-1 pr-2">Lost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missedOffers.map((entry, index) => (
                          <tr
                            key={`${entry.itemId}-${entry.missedAt}-${index}`}
                            className="border-b border-[var(--border-gold-soft)]/40"
                          >
                            <td className="py-1.5 pr-2">
                              <div>{getItemName(entry.itemId) ?? `#${entry.itemId}`}</div>
                              <div className="text-[var(--text-muted)]">×{entry.missedAmount}</div>
                            </td>
                            <td className="py-1.5 pr-2">{formatGold(entry.buyPrice)}</td>
                            <td className="py-1.5 pr-2">×{entry.missedAmount.toLocaleString()}</td>
                            <td className="py-1.5 pr-2 text-[var(--warning,#d4a017)]">
                              {formatGold(entry.profitPerItem * entry.missedAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </StonegyPanel>
          ),
        },
      ]}
    />
  );
}
