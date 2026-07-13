import type { Plugin } from "vite";

export function patchCrxHmrPortCode(code: string): string {
  if (!code.includes("class HMRPort")) {
    return code;
  }

  return code
    .replace(
      /if \(error instanceof Error && error\.message\.includes\("Extension context invalidated\."\)\) \{\s*location\.reload\(\);\s*\} else\s*throw error;/,
      `if (error instanceof Error && error.message.includes("Extension context invalidated.")) {
          location.reload();
        } else if (error instanceof Error && error.message.includes("disconnected port")) {
          this.initPort();
        } else
          throw error;`
    )
    .replace(
      /handleDisconnect = \(\) => \{\s*if \(this\.callbacks\.has\("close"\)\)/,
      `handleDisconnect = () => {
    this.port = null;
    setTimeout(() => this.initPort(), 250);
    if (this.callbacks.has("close"))`
    );
}

export function patchCrxHmrPort(): Plugin {
  return {
    name: "stonegy:patch-crx-hmr-port",
    enforce: "post",
    transform(code, id) {
      if (!id.includes("crx-client-port") && !id.includes("@crx/client-port")) {
        return null;
      }

      return patchCrxHmrPortCode(code);
    },
  };
}
