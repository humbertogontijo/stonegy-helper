import { z } from "zod";
import { scrapingRequest } from "./scraping-session";
import { StonegyApiError, type ApiErrorBody, type AuthResponse, type CharactersResponse } from "./types";

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
}

const authResponseSchema = z.object({
  token: z.string().min(1),
});

const charactersResponseSchema = z.object({
  characters: z.array(z.record(z.string(), z.unknown())),
  account: z.record(z.string(), z.unknown()).optional(),
});

function readErrorMessage(status: number, body: unknown): string {
  if (status === 401) {
    return "Token expired or invalid — re-login and pass a fresh token";
  }

  if (typeof body === "string") {
    if (
      body.includes("cf-error-details") ||
      body.includes("Attention Required! | Cloudflare") ||
      body.includes("Sorry, you have been blocked")
    ) {
      return "Blocked by Cloudflare while contacting api-stonegy.com";
    }
    return body || `HTTP ${status}`;
  }

  if (body && typeof body === "object") {
    const parsed = body as ApiErrorBody;
    return parsed.message ?? parsed.error ?? `HTTP ${status}`;
  }

  return `HTTP ${status}`;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { statusCode, body } = await scrapingRequest<T>(path, options);

  if (statusCode >= 400) {
    throw new StonegyApiError(readErrorMessage(statusCode, body), statusCode, body);
  }

  return body as T;
}

export async function apiRequestAuth(path: string, options: ApiRequestOptions = {}): Promise<AuthResponse> {
  const body = await apiRequest<unknown>(path, options);
  return authResponseSchema.parse(body);
}

export async function apiRequestCharacters(
  path: string,
  options: ApiRequestOptions = {}
): Promise<CharactersResponse> {
  const body = await apiRequest<unknown>(path, options);
  return charactersResponseSchema.parse(body) as unknown as CharactersResponse;
}
