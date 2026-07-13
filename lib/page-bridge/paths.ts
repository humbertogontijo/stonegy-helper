import { EXTENSION_URL_PREFIXES } from "./constants";

export function normalizePageBridgeScriptPath(path: string): string {
  for (const prefix of EXTENSION_URL_PREFIXES) {
    if (path.startsWith(prefix)) {
      const withoutScheme = path.slice(prefix.length);
      const slashIndex = withoutScheme.indexOf("/");
      return slashIndex === -1 ? "" : withoutScheme.slice(slashIndex + 1);
    }
  }

  return path.startsWith("/") ? path.slice(1) : path;
}

export function resolveExtensionAssetUrl(path: string): string {
  for (const prefix of EXTENSION_URL_PREFIXES) {
    if (path.startsWith(prefix)) {
      return path;
    }
  }

  return chrome.runtime.getURL(normalizePageBridgeScriptPath(path));
}
