import { z } from "zod";

export interface PayloadSchemaIssue {
  path: string;
  message: string;
  code: string;
  keys?: string[];
}

export function formatZodIssues(error: z.ZodError): PayloadSchemaIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
    code: issue.code,
    keys:
      issue.code === "unrecognized_keys" && "keys" in issue
        ? (issue.keys as string[])
        : undefined,
  }));
}

export function summarizeSchemaIssues(issues: PayloadSchemaIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
