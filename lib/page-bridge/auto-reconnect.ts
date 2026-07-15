import {
  AUTO_RECONNECT_BASE_DELAY_MS,
  AUTO_RECONNECT_CONNECT_POLL_MS,
  AUTO_RECONNECT_CONNECT_WAIT_MS,
  AUTO_RECONNECT_MAX_ATTEMPTS,
  AUTO_RECONNECT_MAX_DELAY_MS,
} from "./constants";

export function computeAutoReconnectDelayMs(attemptIndex: number): number {
  const capped = Math.max(0, Math.floor(attemptIndex));
  const delay = AUTO_RECONNECT_BASE_DELAY_MS * 2 ** capped;
  return Math.min(delay, AUTO_RECONNECT_MAX_DELAY_MS);
}

export function createAutoReconnectController(options: {
  delay: (ms: number) => Promise<void>;
  isEnabled: () => boolean;
  isConnected: () => boolean;
  reloadTab: () => Promise<boolean>;
  maxAttempts?: number;
  connectWaitMs?: number;
  connectPollMs?: number;
}) {
  const maxAttempts = options.maxAttempts ?? AUTO_RECONNECT_MAX_ATTEMPTS;
  const connectWaitMs = options.connectWaitMs ?? AUTO_RECONNECT_CONNECT_WAIT_MS;
  const connectPollMs = options.connectPollMs ?? AUTO_RECONNECT_CONNECT_POLL_MS;

  let running = false;
  let generation = 0;

  async function waitForConnect(gen: number): Promise<boolean> {
    const deadline = Date.now() + connectWaitMs;
    while (Date.now() < deadline) {
      if (gen !== generation) {
        return false;
      }
      if (!options.isEnabled()) {
        return false;
      }
      if (options.isConnected()) {
        return true;
      }
      await options.delay(connectPollMs);
    }
    return options.isConnected();
  }

  return {
    isRunning() {
      return running;
    },

    /** Cancel an in-flight reconnect loop (e.g. setting turned off). */
    cancel() {
      generation += 1;
      running = false;
    },

    /**
     * After a confirmed socket close (post successful connect), reload the
     * game tab with exponential backoff between attempts.
     */
    async scheduleAfterDisconnect(): Promise<void> {
      if (running || !options.isEnabled() || options.isConnected()) {
        return;
      }

      running = true;
      const gen = (generation += 1);

      try {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (gen !== generation || !options.isEnabled()) {
            return;
          }
          if (options.isConnected()) {
            return;
          }

          if (attempt > 0) {
            await options.delay(computeAutoReconnectDelayMs(attempt - 1));
            if (gen !== generation || !options.isEnabled() || options.isConnected()) {
              return;
            }
          }

          const reloaded = await options.reloadTab();
          if (!reloaded) {
            return;
          }

          const connected = await waitForConnect(gen);
          if (connected) {
            return;
          }
        }
      } finally {
        if (gen === generation) {
          running = false;
        }
      }
    },
  };
}
