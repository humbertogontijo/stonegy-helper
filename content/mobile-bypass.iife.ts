/**
 * MAIN-world patch that skips Stonegy's "Instale como app" overlay on iPhone.
 * Stonegy shows that gate when `I()` is false — i.e. not opened as PWA/standalone.
 *
 * We only spoof standalone/fullscreen display signals. Viewport width, UA, and
 * touch detection stay untouched so mobile rendering is unchanged.
 */
(function () {
  const PATCHED_FLAG = "__stonegyHelperMobileBypassPatched";
  if ((window as unknown as Record<string, boolean>)[PATCHED_FLAG]) {
    return;
  }
  (window as unknown as Record<string, boolean>)[PATCHED_FLAG] = true;

  try {
    Object.defineProperty(navigator, "standalone", {
      get: () => true,
      configurable: true,
    });
  } catch {
    // `navigator.standalone` exists only on iOS Safari.
  }

  const nativeMatchMedia = window.matchMedia.bind(window);
  const displayModePattern = /display-mode\s*:\s*(standalone|fullscreen)/i;

  window.matchMedia = ((query: string) => {
    const mediaQueryList = nativeMatchMedia(query);
    if (!displayModePattern.test(query)) {
      return mediaQueryList;
    }

    return new Proxy(mediaQueryList, {
      get(target, property, receiver) {
        if (property === "matches") {
          return true;
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof window.matchMedia;
})();
