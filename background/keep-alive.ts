export const KEEP_ALIVE_ALARM_NAME = "stonegy-keep-alive";

/** Stay under Stonegy's 5 minute idle_timeout (DOM input based, not ping). */
const KEEP_ALIVE_PERIOD_MINUTES = 4;

let sendKeepAliveActivity: (() => Promise<void>) | null = null;
let isConnected: (() => boolean) | null = null;
let isEnabled: (() => boolean) | null = null;

export function initKeepAlive(deps: {
  sendKeepAliveActivity: () => Promise<void>;
  isConnected: () => boolean;
  isEnabled: () => boolean;
}) {
  sendKeepAliveActivity = deps.sendKeepAliveActivity;
  isConnected = deps.isConnected;
  isEnabled = deps.isEnabled;

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEP_ALIVE_ALARM_NAME) {
      void tickKeepAlive();
    }
  });
}

export async function syncKeepAlive() {
  const shouldRun = (isEnabled?.() ?? false) && (isConnected?.() ?? false);

  if (shouldRun) {
    await chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
      periodInMinutes: KEEP_ALIVE_PERIOD_MINUTES,
      delayInMinutes: KEEP_ALIVE_PERIOD_MINUTES,
    });
    return;
  }

  await chrome.alarms.clear(KEEP_ALIVE_ALARM_NAME);
}

async function tickKeepAlive() {
  if (!isEnabled?.() || !isConnected?.()) {
    await syncKeepAlive();
    return;
  }

  try {
    await sendKeepAliveActivity?.();
  } catch {
    // Tab closed or bridge unavailable; ws:close will clear the alarm.
  }
}
