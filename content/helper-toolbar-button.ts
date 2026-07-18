import markSvg from "./assets/stonegy-helper-mark.svg?raw";

const BUTTON_ID = "stonegy-helper-toolbar-btn";
const PANEL_ID = "stonegy-helper-panel";
const SETTINGS_GUIDE = "header-settings-button";
const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 315;

/** Same clamp formula the game uses for header icon circles. */
const CIRCLE_SIZE =
  "clamp(calc(var(--stonegy-interface-scale, 1) * 35.2px), calc(var(--stonegy-interface-scale, 1) * 44px), calc(var(--stonegy-interface-scale, 1) * 52.8px))";
const CIRCLE_PAD =
  "clamp(1px, calc(var(--stonegy-interface-scale, 1) * 2px), calc(var(--stonegy-interface-scale, 1) * 2.4px))";
const CIRCLE_INSET =
  "clamp(calc(var(--stonegy-interface-scale, 1) * 3.2px), calc(var(--stonegy-interface-scale, 1) * 4px), calc(var(--stonegy-interface-scale, 1) * 4.8px))";
const ICON_SIZE =
  "clamp(3px, calc(var(--stonegy-interface-scale, 1) * 24px), calc(var(--stonegy-interface-scale, 1) * 28.8px))";

function popupUrl(): string {
  return chrome.runtime.getURL("popup/index.html");
}

function createMarkIcon(): SVGElement {
  const host = document.createElement("span");
  host.innerHTML = markSvg.trim();
  const svg = host.querySelector("svg");
  if (!svg) {
    throw new Error("Stonegy helper mark SVG failed to parse");
  }
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText = [
    `width:${ICON_SIZE}`,
    "height:auto",
    "display:block",
    "pointer-events:none",
    "overflow:visible",
  ].join(";");
  return svg;
}

function findIconCluster(): HTMLElement | null {
  const settings = document.querySelector<HTMLElement>(`[data-guide="${SETTINGS_GUIDE}"]`);
  return settings?.parentElement ?? null;
}

function isMountedInCluster(button: HTMLElement): boolean {
  const cluster = findIconCluster();
  return !!cluster && cluster.firstElementChild === button;
}

function createButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.setAttribute("aria-label", "Stonegy Helper");
  button.title = "Stonegy Helper";
  button.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:0",
    "margin:0",
    "border:0",
    "background:transparent",
    "cursor:pointer",
    "flex-shrink:0",
    "line-height:0",
  ].join(";");

  // Match game header icon chrome: gradient ring + inset dark circle.
  const ring = document.createElement("span");
  ring.style.cssText = [
    "display:flex",
    "align-items:stretch",
    "justify-content:stretch",
    "box-sizing:border-box",
    `width:${CIRCLE_SIZE}`,
    `height:${CIRCLE_SIZE}`,
    `padding:${CIRCLE_PAD}`,
    "border-radius:100%",
    "background:linear-gradient(180deg, #5b5a56 0%, #3c3c41 100%)",
  ].join(";");

  const inner = document.createElement("span");
  inner.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-sizing:border-box",
    "width:100%",
    "height:100%",
    "border-radius:100%",
    "background:#1c2427",
    `box-shadow:inset 0 0 ${CIRCLE_INSET} 0 #000`,
    "overflow:hidden",
  ].join(";");

  inner.appendChild(createMarkIcon());
  ring.appendChild(inner);
  button.appendChild(ring);
  return button;
}

function createPanel(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Stonegy Helper");
  panel.hidden = true;
  panel.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    `width:${PANEL_WIDTH}px`,
    `height:${PANEL_HEIGHT}px`,
    "border-radius:10px",
    "overflow:hidden",
    "box-shadow:0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(200,155,60,0.28)",
    "background:#050607",
  ].join(";");

  const frame = document.createElement("iframe");
  frame.title = "Stonegy Helper";
  frame.src = popupUrl();
  frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:#050607;";
  panel.appendChild(frame);
  return panel;
}

function positionPanel(button: HTMLElement, panel: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  const top = Math.min(rect.bottom + 8, window.innerHeight - PANEL_HEIGHT - 8);
  const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
  panel.style.top = `${Math.max(8, top)}px`;
  panel.style.left = `${left}px`;
}

export function mountHelperToolbarButton(): void {
  let button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (!button) {
    button = createButton();
  }

  let panel = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (!panel) {
    panel = createPanel();
    document.documentElement.appendChild(panel);
  }

  let open = !panel.hidden;
  let attachQueued = false;
  let lastScanAt = 0;
  let parentObserver: MutationObserver | null = null;

  const setOpen = (next: boolean) => {
    open = next;
    panel.hidden = !next;
    button.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      positionPanel(button, panel);
      void chrome.runtime.sendMessage({ channel: "popup:bind" }).catch(() => {});
    }
  };

  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!open) {
      return;
    }
    const target = event.target as Node | null;
    if (target && (button.contains(target) || panel.contains(target))) {
      return;
    }
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
    }
  };

  const onResize = () => {
    if (open) {
      positionPanel(button, panel);
    }
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", onResize);

  const observeCluster = () => {
    const cluster = button.parentElement;
    if (!cluster) {
      return;
    }
    parentObserver?.disconnect();
    parentObserver = new MutationObserver(() => {
      if (!isMountedInCluster(button)) {
        scheduleAttach(true);
      }
    });
    parentObserver.observe(cluster, { childList: true });
  };

  const attach = (): boolean => {
    const cluster = findIconCluster();
    if (!cluster) {
      return false;
    }
    if (cluster.firstElementChild === button) {
      return true;
    }
    cluster.insertBefore(button, cluster.firstChild);
    return true;
  };

  const scheduleAttach = (immediate = false) => {
    if (isMountedInCluster(button)) {
      return;
    }
    if (attachQueued) {
      return;
    }
    attachQueued = true;
    requestAnimationFrame(() => {
      attachQueued = false;
      if (isMountedInCluster(button)) {
        return;
      }
      const now = Date.now();
      if (!immediate && now - lastScanAt < 400) {
        return;
      }
      lastScanAt = now;
      if (attach()) {
        observeCluster();
      }
    });
  };

  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", PANEL_ID);

  if (attach()) {
    observeCluster();
  }

  const rootObserver = new MutationObserver(() => {
    if (!isMountedInCluster(button)) {
      scheduleAttach(false);
    }
  });
  rootObserver.observe(document.documentElement, { childList: true, subtree: true });
}
