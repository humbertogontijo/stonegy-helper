import type { z } from "zod";
import {
  receivePayloadSchemas,
  sendPayloadSchemas,
  type ReceiveMessageTypeFromSchema,
  type ReceivePayloadFromSchema,
  type SendMessageTypeFromSchema,
  type SendPayloadFromSchema,
} from "../../../protocol-messages";
import {
  formatZodIssues,
  summarizeSchemaIssues,
  type PayloadSchemaIssue,
} from "./helpers";

export type WireDirection = "send" | "receive";

export type KnownMessageType = SendMessageTypeFromSchema | ReceiveMessageTypeFromSchema;

export type { PayloadSchemaIssue, SendMessageTypeFromSchema, ReceiveMessageTypeFromSchema };
export type { SendPayloadFromSchema, ReceivePayloadFromSchema };
export { sendPayloadSchemas, receivePayloadSchemas };
export { formatZodIssues, summarizeSchemaIssues };

export type PayloadValidationResult =
  | { status: "unknown_type" }
  | { status: "valid" }
  | { status: "invalid"; issues: PayloadSchemaIssue[] };

export function getPayloadSchema(
  type: string,
  direction: WireDirection
): z.ZodType | undefined {
  if (direction === "send") {
    return sendPayloadSchemas[type as SendMessageTypeFromSchema];
  }
  return receivePayloadSchemas[type as ReceiveMessageTypeFromSchema];
}

export function isKnownMessageType(type: string, direction: WireDirection): boolean {
  return getPayloadSchema(type, direction) != null;
}

export function listKnownMessageTypes(direction: WireDirection): string[] {
  return direction === "send"
    ? Object.keys(sendPayloadSchemas)
    : Object.keys(receivePayloadSchemas);
}

export function validateMessagePayload(
  type: string,
  direction: WireDirection,
  data: unknown
): PayloadValidationResult {
  const schema = getPayloadSchema(type, direction);
  if (!schema) {
    return { status: "unknown_type" };
  }

  const payload = data === undefined ? {} : data;
  const result = schema.safeParse(payload);
  if (result.success) {
    return { status: "valid" };
  }

  return {
    status: "invalid",
    issues: formatZodIssues(result.error),
  };
}

export function extractUnrecognizedKeys(issues: PayloadSchemaIssue[]): string[] {
  return issues.flatMap((issue) => issue.keys ?? []);
}
