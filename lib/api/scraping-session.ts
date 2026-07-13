import type { Agent } from "node:http";
import { gotScraping } from "got-scraping";
import { STONEGY_API_BASE, STONEGY_ORIGIN } from "./constants";

let httpsAgent: Agent | undefined;
let generatedUserAgent: string | undefined;

const scrapingClient = gotScraping.extend({
  http2: false,
  hooks: {
    beforeRequest: [
      (options) => {
        httpsAgent =
          options.agent?.https && typeof options.agent.https !== "boolean"
            ? options.agent.https
            : undefined;
        const userAgent = options.headers["user-agent"];
        if (typeof userAgent === "string") {
          generatedUserAgent = userAgent;
        }
      },
    ],
  },
});

export function getScrapingHttpsAgent(): Agent | undefined {
  return httpsAgent;
}

export async function primeScrapingSession(): Promise<void> {
  if (httpsAgent) {
    return;
  }

  await scrapingClient({
    url: `${STONEGY_API_BASE}/api/character`,
    method: "HEAD",
    throwHttpErrors: false,
  });
}

function authHeaders(token?: string): Record<string, string> | undefined {
  if (!token) {
    return undefined;
  }

  return {
    authorization: `Bearer ${token}`,
  };
}

export interface ScrapingRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
}

function isCloudflareBlock(body: string): boolean {
  return (
    body.includes("cf-error-details") ||
    body.includes("Attention Required! | Cloudflare") ||
    body.includes("Sorry, you have been blocked")
  );
}

export async function scrapingRequest<T>(
  path: string,
  options: ScrapingRequestOptions = {}
): Promise<{ statusCode: number; body: T | string }> {
  const { method = "GET", token, body, signal } = options;
  const headers = authHeaders(token);
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await scrapingClient({
      url: `${STONEGY_API_BASE}${path}`,
      method,
      ...(headers ? { headers } : {}),
      throwHttpErrors: false,
      responseType: "text",
      signal,
      ...(body === undefined ? {} : { json: body }),
    });

    const rawBody = response.body;
    let parsedBody: T | string = rawBody;

    if (typeof rawBody === "string" && rawBody.trim().startsWith("{")) {
      try {
        parsedBody = JSON.parse(rawBody) as T;
      } catch {
        parsedBody = rawBody;
      }
    }

    if (response.statusCode < 400 || attempt === maxAttempts - 1) {
      return {
        statusCode: response.statusCode,
        body: parsedBody,
      };
    }

    if (response.statusCode === 403 && typeof rawBody === "string" && isCloudflareBlock(rawBody)) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      continue;
    }

    return {
      statusCode: response.statusCode,
      body: parsedBody,
    };
  }

  throw new Error("Unreachable scraping retry loop");
}

export function wsConnectHeaders(): Record<string, string> {
  return {
    Origin: STONEGY_ORIGIN,
    ...(generatedUserAgent ? { "User-Agent": generatedUserAgent } : {}),
  };
}
