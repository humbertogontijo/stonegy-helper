export const PAGE_BRIDGE_INJECTED_ATTR = "data-stonegy-page-bridge";

/** One-time auth token written by the content script and consumed by the MAIN-world bridge. */
export const PAGE_BRIDGE_AUTH_ATTR = "data-stonegy-bridge-auth";

/** chrome.storage.session key prefix for per-tab bridge secrets. */
export const PAGE_BRIDGE_SECRET_STORAGE_PREFIX = "stonegy-bridge-secret:";

/** DOM marker set when the mobile install-overlay bypass script is injected. */
export const MOBILE_BYPASS_INJECTED_ATTR = "data-stonegy-mobile-bypass";

/** DOM attribute mirrored from the page bridge for cross-browser status reads (untrusted alone). */
export const PAGE_BRIDGE_STATUS_ATTR = "data-stonegy-ws-state";

export const BRIDGE_CHANNELS = {
  status: "bridge-status",
  wsCommand: "ws-command",
  wsEvent: "ws-event",
} as const;

export const MESSAGE_SOURCES = {
  page: "stonegy-helper-page",
  extension: "stonegy-helper-extension",
} as const;

export const WS_COMMAND_TIMEOUT_MS = 5_000;
export const STATUS_PUBLISH_INTERVAL_MS = 2_000;
export const RELOAD_GRACE_MS = 15_000;
export const WS_STATUS_RETRY_DELAY_MS = 400;
export const WS_CLOSE_VERIFY_DELAY_MS = 300;
export const WS_CLOSE_VERIFY_ATTEMPTS = 10;

/** Auto-reconnect: reload game tab after a confirmed socket close. */
export const AUTO_RECONNECT_MAX_ATTEMPTS = 5;
export const AUTO_RECONNECT_BASE_DELAY_MS = 2_000;
export const AUTO_RECONNECT_MAX_DELAY_MS = 60_000;
export const AUTO_RECONNECT_CONNECT_POLL_MS = 500;
export const AUTO_RECONNECT_CONNECT_WAIT_MS = 20_000;

export const EXTENSION_URL_PREFIXES = [
  "chrome-extension://",
  "moz-extension://",
  "safari-web-extension://",
] as const;

export function pageBridgeSecretStorageKey(tabId: number): string {
  return `${PAGE_BRIDGE_SECRET_STORAGE_PREFIX}${tabId}`;
}

export function pageBridgeSymbolKey(secret: string): string {
  return `stonegy-helper-bridge:${secret}`;
}
