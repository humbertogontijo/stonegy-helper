import { RELOAD_GRACE_MS } from "./constants";

export function createReloadGrace(durationMs = RELOAD_GRACE_MS) {
  let activeUntil = 0;

  return {
    begin() {
      activeUntil = Date.now() + durationMs;
    },
    isActive() {
      return Date.now() < activeUntil;
    },
  };
}
