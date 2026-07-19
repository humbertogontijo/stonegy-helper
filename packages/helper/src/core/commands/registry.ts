import type { StonegyMessage } from "../../types";

export function isActionResultSuccess(message: StonegyMessage): boolean {
  return (message.data as Record<string, unknown> | undefined)?.success !== false;
}

export function readActionResultMessage(message: StonegyMessage): string | undefined {
  const text = (message.data as Record<string, unknown> | undefined)?.message;
  return typeof text === "string" ? text : undefined;
}
