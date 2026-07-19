import { defaultSettings } from "./core/settings";
import { defaultSessionView } from "./core/projections/defaults";
import { patchBotState } from "./core/projections/patch-bot-state";
import { toBotState } from "./core/projections/to-bot-state";
import type { BotState } from "./types";

export const defaultState: BotState = toBotState(defaultSettings(), defaultSessionView());

export function withBotState(patch: Parameters<typeof patchBotState>[1]): BotState {
  return patchBotState(defaultState, patch);
}

/** Hunt-loot sync progress is in-memory only; terminal messages may be shown after restart. */
export function isTerminalHuntLootSyncStatus(status: string): boolean {
  if (!status) {
    return true;
  }

  return (
    status.startsWith("Done") ||
    status.startsWith("Sync failed") ||
    status === "No loot items for this hunt"
  );
}

export function sanitizeHuntLootSyncStatusForPersistence(status: string): string {
  return isTerminalHuntLootSyncStatus(status) ? status : "";
}

/** Completed full-market scans may be shown after restart; in-progress/paused text is ephemeral. */
export function isTerminalMarketFullScanStatus(status: string): boolean {
  if (!status) {
    return true;
  }

  return status.startsWith("Full scan complete");
}

/** Interval scanner progress is in-memory only; stable outcomes may be shown after restart. */
export function isTerminalMarketScanStatus(status: string): boolean {
  if (!status) {
    return true;
  }

  return (
    status.startsWith("Scanned page") ||
    status === "Scanner off" ||
    status.startsWith("Scanner scheduled") ||
    status.startsWith("Interval scan error:")
  );
}

export function sanitizeMarketScanStatusForPersistence(status: string): string {
  return isTerminalMarketScanStatus(status) ? status : "";
}

export function sanitizeMarketFullScanStatusForPersistence(status: string): string {
  return isTerminalMarketFullScanStatus(status) ? status : "";
}

export type MarketScanPersistenceFields = Pick<
  BotState["market"],
  | "marketScanStatus"
  | "marketFullScanStatus"
  | "marketFullScanTotalPages"
  | "marketFullScanCheckpointOrderId"
>;

export function sanitizeMarketScanFieldsForPersistence(
  fields: MarketScanPersistenceFields
): MarketScanPersistenceFields {
  const marketScanStatus = sanitizeMarketScanStatusForPersistence(fields.marketScanStatus);

  if (isTerminalMarketFullScanStatus(fields.marketFullScanStatus)) {
    return {
      marketScanStatus,
      marketFullScanStatus: fields.marketFullScanStatus,
      marketFullScanTotalPages: fields.marketFullScanTotalPages,
      marketFullScanCheckpointOrderId: fields.marketFullScanCheckpointOrderId,
    };
  }

  if (fields.marketFullScanCheckpointOrderId != null) {
    return {
      marketScanStatus,
      marketFullScanStatus: "",
      marketFullScanTotalPages: fields.marketFullScanTotalPages,
      marketFullScanCheckpointOrderId: fields.marketFullScanCheckpointOrderId,
    };
  }

  return {
    marketScanStatus,
    marketFullScanStatus: "",
    marketFullScanTotalPages: null,
    marketFullScanCheckpointOrderId: null,
  };
}
