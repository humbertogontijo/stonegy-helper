import { PAGE_BRIDGE_AUTH_ATTR, PAGE_BRIDGE_INJECTED_ATTR } from "./constants";
import { resolveExtensionAssetUrl } from "./paths";

/**
 * Inject a MAIN-world IIFE at `document_start` via a classic `<script>` tag.
 * Optionally writes a one-time auth secret onto `<html>` for the bridge to consume.
 */
export function injectMainWorldScriptFromContent(
  scriptPath: string,
  injectedAttr: string,
  options: { authSecret?: string } = {}
) {
  const root = document.documentElement;
  const existing = root.getAttribute(injectedAttr);
  if (existing) {
    return existing;
  }

  // Non-guessable token so the page cannot pre-set a known value to skip injection.
  const injectedToken = options.authSecret ?? crypto.randomUUID();

  if (options.authSecret) {
    root.setAttribute(PAGE_BRIDGE_AUTH_ATTR, options.authSecret);
  }

  root.setAttribute(injectedAttr, injectedToken);

  const script = document.createElement("script");
  script.src = resolveExtensionAssetUrl(scriptPath);
  script.async = false;
  (document.head ?? root).appendChild(script);
  return injectedToken;
}

/**
 * Inject the page-bridge IIFE. Must run before the game constructs its WebSocket.
 * Returns the per-injection auth secret shared with the MAIN-world bridge.
 */
export function injectPageBridgeFromContent(scriptPath: string, authSecret: string) {
  injectMainWorldScriptFromContent(scriptPath, PAGE_BRIDGE_INJECTED_ATTR, { authSecret });
  return authSecret;
}
