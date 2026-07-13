import {
  WS_CLOSE_VERIFY_ATTEMPTS,
  WS_CLOSE_VERIFY_DELAY_MS,
} from "./constants";
import { readPageBridgeStatus } from "./transport";
import type { ConnectionSnapshot, PageBridgeStatus } from "./types";

export function isSocketOpen(status: Pick<PageBridgeStatus, "connected" | "readyState">): boolean {
  return !!status.connected && status.readyState === 1;
}

export function connectionSnapshotFromStatus(
  status: Pick<PageBridgeStatus, "connected" | "readyState">
): ConnectionSnapshot {
  return {
    connected: isSocketOpen(status),
    readyState: status.readyState,
  };
}

export function connectionSnapshotFromWsEvent(
  type: string,
  payload?: Record<string, unknown>
): ConnectionSnapshot | null {
  if (type === "ws:open") {
    return { connected: true, readyState: 1 };
  }

  if (type === "ws:connected") {
    const readyState = Number(payload?.readyState ?? 0);
    return {
      connected: readyState === 1,
      readyState,
    };
  }

  if (type === "ws:close") {
    return { connected: false, readyState: 3 };
  }

  return null;
}

export async function confirmPageBridgeDisconnect(options: {
  tabId?: number;
  resolveTabId: () => Promise<number | undefined>;
  delay: (ms: number) => Promise<void>;
  onConnected: () => void;
  onDisconnected: () => void;
}) {
  const pendingByTab = confirmPageBridgeDisconnect.pendingByTab;

  if (options.tabId != null) {
    const existing = pendingByTab.get(options.tabId);
    if (existing) {
      await existing;
      return;
    }
  }

  const work = (async () => {
    for (let attempt = 0; attempt < WS_CLOSE_VERIFY_ATTEMPTS; attempt += 1) {
      await options.delay(WS_CLOSE_VERIFY_DELAY_MS);

      const tabId =
        options.tabId ?? (await options.resolveTabId());

      if (tabId == null) {
        break;
      }

      const status = await readPageBridgeStatus(tabId, { delay: options.delay });
      if (status?.readyState === 1) {
        options.onConnected();
        return;
      }

      if (status?.readyState === 0) {
        continue;
      }

      if (status) {
        break;
      }
    }

    options.onDisconnected();
  })();

  if (options.tabId != null) {
    pendingByTab.set(options.tabId, work);
    await work.finally(() => {
      pendingByTab.delete(options.tabId!);
    });
    return;
  }

  await work;
}

confirmPageBridgeDisconnect.pendingByTab = new Map<number, Promise<void>>();
