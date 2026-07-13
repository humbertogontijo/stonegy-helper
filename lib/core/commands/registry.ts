import { shouldAttributeMarketSnapshotToItem } from "../../market/attribution";
import { getResponseTypeForSend } from "../../protocol";
import type { StonegyMessage } from "../../types";

export function expectedActionForCommand(commandId: string): string | null {
  if (commandId === "party_get_snapshot" || commandId === "quest_get_snapshot") {
    return null;
  }
  if (commandId.startsWith("party_")) {
    return commandId.slice("party_".length);
  }
  if (commandId.startsWith("quest_")) {
    return commandId.slice("quest_".length);
  }
  if (commandId === "market_create_order") {
    return "create_order";
  }
  if (commandId === "market_resolve_order") {
    return "resolve_order";
  }
  return null;
}

export function matchesCommandResponse(commandId: string, message: StonegyMessage): boolean {
  const expectedType = getResponseTypeForSend(commandId);
  if (!expectedType || message.type !== expectedType) {
    return false;
  }

  const expectedAction = expectedActionForCommand(commandId);
  if (expectedAction == null) {
    return true;
  }

  const action = (message.data as Record<string, unknown> | undefined)?.action;
  return typeof action === "string" && action === expectedAction;
}

export function isActionResultSuccess(message: StonegyMessage): boolean {
  return (message.data as Record<string, unknown> | undefined)?.success !== false;
}

export function readActionResultMessage(message: StonegyMessage): string | undefined {
  const text = (message.data as Record<string, unknown> | undefined)?.message;
  return typeof text === "string" ? text : undefined;
}

export interface MarketCommandContext {
  itemId?: number | null;
  page?: number;
  referenceOrderId?: string | null;
}

export function matchesGoldTransferResponse(
  message: StonegyMessage,
  requestId: string
): boolean {
  if (!matchesCommandResponse("gold_transfer", message)) {
    return false;
  }

  const responseRequestId = (message.data as Record<string, unknown> | undefined)?.requestId;
  return typeof responseRequestId === "string" && responseRequestId === requestId;
}

export function matchesMarketSnapshot(
  message: StonegyMessage,
  context: MarketCommandContext
): boolean {
  if (message.type !== "market:snapshot") {
    return false;
  }

  const data = message.data ?? {};
  if (context.itemId != null && context.itemId > 0) {
    return shouldAttributeMarketSnapshotToItem(data, context.itemId);
  }

  if (context.referenceOrderId) {
    return true;
  }

  const page = typeof data.page === "number" ? data.page : null;
  return page === (context.page ?? 1);
}
