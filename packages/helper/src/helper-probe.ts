import { HELPER_BASE_URL } from "./helper-endpoint";

const HEALTH_TIMEOUT_MS = 500;

export async function fetchHelperHealth(
  baseUrl: string = HELPER_BASE_URL
): Promise<{ ok: boolean; version: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/v1/health`, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { ok?: boolean; version?: string };
    if (!body.ok) {
      return null;
    }
    return { ok: true, version: body.version ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeHelperHealth(
  baseUrl: string = HELPER_BASE_URL
): Promise<boolean> {
  const health = await fetchHelperHealth(baseUrl);
  return !!health?.ok;
}
