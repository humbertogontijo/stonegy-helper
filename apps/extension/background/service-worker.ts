import { extensionHost } from "../adapters/extension/session-host";

const hostReady = extensionHost.init();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      await hostReady;
      const response = await extensionHost.handleBridgeMessage(
        message as Record<string, unknown>,
        sender
      );
      sendResponse(response);
    } catch (error) {
      console.error(
        "[service-worker] message handler error:",
        error instanceof Error ? error.message : error
      );
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  return true;
});
