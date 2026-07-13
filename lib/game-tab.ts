export const GAME_TAB_URLS = [
  "https://stonegy-online.com/*",
  "https://*.stonegy-online.com/*",
];

export function isStonegyGameUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }

  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") {
      return false;
    }

    return (
      hostname === "stonegy-online.com" || hostname.endsWith(".stonegy-online.com")
    );
  } catch {
    return false;
  }
}

/** Safari can miss `tabs.query({ url })` wildcard matches; fall back to manual filtering. */
export async function queryGameTabs(): Promise<chrome.tabs.Tab[]> {
  const matched = await chrome.tabs.query({ url: GAME_TAB_URLS });
  if (matched.length > 0) {
    return matched;
  }

  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => isStonegyGameUrl(tab.url));
}
