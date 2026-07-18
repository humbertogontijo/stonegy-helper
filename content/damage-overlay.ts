import type { CombatProjection, DamageElementStat, DamageEntityStats } from "../lib/types";
import { damageTypeIconUrl } from "./damage-icons";

const HOST_ID = "stonegy-damage-analyzer";
const COLLAPSED_KEY = "stonegy-damage-analyzer-collapsed";
/** Actual DOM text (CSS text-transform: uppercase only affects rendering). */
const PARTY_SECTION_TITLE = "party hunt analyzer";
const LOOT_SECTION_TITLE = "loot analyzer";
const STATS_SECTION_TITLE = "hunt stats";
const SECTION_TITLE = "Damage Analyzer";
const ANCHOR_TITLES = [PARTY_SECTION_TITLE, LOOT_SECTION_TITLE, STATS_SECTION_TITLE] as const;

/** Match Hunt Analyzer number formatting (e.g. 200.657). */
function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function emptyCombat(): CombatProjection {
  return { entities: [], startedAt: null, updatedAt: null };
}

function formatElementChips(elements: DamageElementStat[]): string {
  if (elements.length === 0) {
    return `<span class="elements empty-elements">—</span>`;
  }
  return `<span class="elements">${elements
    .map((entry) => {
      const icon = damageTypeIconUrl(entry.label);
      const title = escapeAttr(`${entry.label} ${formatNumber(entry.amount)} (${entry.percent}%)`);
      if (icon) {
        return `<span class="chip" title="${title}"><img class="type-icon" src="${icon}" alt="${escapeAttr(entry.label)}" width="9" height="9" /><span class="pct">${entry.percent}%</span></span>`;
      }
      return `<span class="chip text" title="${title}"><span class="type-label">${escapeHtml(entry.label)}</span><span class="pct">${entry.percent}%</span></span>`;
    })
    .join("")}</span>`;
}

function metricColumnHtml(sum: number, maxDps: number, elements: DamageElementStat[]): string {
  return `<div class="metric">
    <div class="sum">${formatNumber(sum)}</div>
    <div class="dps" title="Max DPS">${formatNumber(maxDps)} Max DPS</div>
    ${formatElementChips(elements)}
  </div>`;
}

function entityCardHtml(entity: DamageEntityStats): string {
  return `<article class="entity">
    <div class="entity-name" title="${escapeAttr(entity.name)}">${escapeHtml(entity.name)}</div>
    <div class="metrics">
      <div class="metric-col">
        <div class="metric-label">Dealt</div>
        ${metricColumnHtml(entity.dealtSum, entity.dealtMaxDps, entity.dealtByElement)}
      </div>
      <div class="metric-col">
        <div class="metric-label">Taken</div>
        ${metricColumnHtml(entity.takenSum, entity.takenMaxDps, entity.takenByElement)}
      </div>
    </div>
  </article>`;
}

/** Logged-in player first (name match), then ascending entityIndex. */
function sortEntitiesForPager(
  entities: DamageEntityStats[],
  characterName: string | null
): DamageEntityStats[] {
  const selfName = characterName?.trim().toLowerCase() ?? "";
  return [...entities].sort((a, b) => {
    if (selfName) {
      const aSelf = a.name.trim().toLowerCase() === selfName;
      const bSelf = b.name.trim().toLowerCase() === selfName;
      if (aSelf !== bSelf) {
        return aSelf ? -1 : 1;
      }
    }
    return a.entityIndex - b.entityIndex;
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function renderBody(
  combat: CombatProjection,
  collapsed: boolean,
  pageIndex: number,
  characterName: string | null
): string {
  const entities = sortEntitiesForPager(combat.entities, characterName);
  const total = entities.length;
  const safeIndex = total === 0 ? 0 : Math.min(Math.max(pageIndex, 0), total - 1);
  const entity = total > 0 ? entities[safeIndex] : null;

  let body: string;
  if (!entity) {
    body = `<div class="empty">Waiting for combat…</div>`;
  } else {
    const atStart = safeIndex <= 0;
    const atEnd = safeIndex >= total - 1;
    body = `<div class="pager">
      <button type="button" class="nav prev" aria-label="Previous player" ${atStart ? "disabled" : ""}>»</button>
      <div class="page">
        ${entityCardHtml(entity)}
        <div class="page-indicator">${safeIndex + 1}/${total}</div>
      </div>
      <button type="button" class="nav next" aria-label="Next player" ${atEnd ? "disabled" : ""}>»</button>
    </div>`;
  }

  return `
    <div class="panel ${collapsed ? "collapsed" : ""}">
      <header>
        <button type="button" class="toggle" aria-label="${collapsed ? "Expand" : "Collapse"}">
          <span class="title">${SECTION_TITLE}</span>
        </button>
        <button type="button" class="reset" title="Reset">Reset</button>
      </header>
      <div class="body">${body}</div>
    </div>
  `;
}

/** Matches Hunt Analyzer section chrome (MuiStack css-1qom4ns + h5 css-1d5mi08). */
const OVERLAY_CSS = `
:host {
  display: block;
  width: 100%;
  box-sizing: border-box;
  --s: var(--stonegy-interface-scale, 1);
  font-family: beaufort-pro, sans-serif;
  color: #ded3ca;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--s) * 6px);
  padding: calc(var(--s) * 8px) calc(var(--s) * 10px);
  color: #ded3ca;
  background: linear-gradient(180deg, rgba(28, 36, 39, 0.78), rgba(11, 16, 17, 0.92));
  border: 1px solid rgba(120, 90, 40, 0.24);
  border-radius: calc(var(--s) * 6px);
  box-shadow: inset 0 0 calc(var(--s) * 6px) rgba(0, 0, 0, 0.65);
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  gap: calc(var(--s) * 8px);
  padding: 0;
}

.toggle {
  flex: 1;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #c8aa6e;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.title {
  margin: 0;
  font-family: beaufort-pro, sans-serif;
  font-size: calc(var(--s) * 13px);
  font-weight: 800;
  letter-spacing: normal;
  line-height: 1;
  text-transform: uppercase;
  color: #c8aa6e;
}

.reset {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: beaufort-pro, sans-serif;
  font-size: calc(var(--s) * 16px);
  font-weight: 700;
  line-height: 1.33;
  text-transform: uppercase;
  color: #cdbe91;
  cursor: pointer;
}

.reset:hover {
  color: #f0e6d2;
}

.body {
  overflow: hidden;
}

.panel.collapsed .body {
  display: none;
}

.pager {
  display: flex;
  align-items: stretch;
  gap: calc(var(--s) * 6px);
}

.page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--s) * 4px);
}

.nav {
  flex: 0 0 calc(var(--s) * 18px);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: calc(var(--s) * 2px);
  background: linear-gradient(180deg, rgb(28, 36, 39), rgb(11, 16, 17));
  color: #cdbe91;
  font-family: beaufort-pro, sans-serif;
  font-size: calc(var(--s) * 16px);
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  user-select: none;
}

.nav.prev {
  transform: rotate(180deg);
}

.nav:hover:not(:disabled) {
  color: #f0e6d2;
}

.nav:disabled {
  opacity: 0.28;
  cursor: default;
}

.page-indicator {
  text-align: center;
  color: #5b5a56;
  font-size: calc(var(--s) * 11px);
  font-weight: 500;
  line-height: 1;
}

.entity {
  display: flex;
  flex-direction: column;
  gap: calc(var(--s) * 3px);
}

.entity-name {
  color: #ded3ca;
  font-size: calc(var(--s) * 13px);
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--s) * 8px);
}

.metric-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--s) * 2px);
}

.metric-label {
  color: #a09b8c;
  font-size: calc(var(--s) * 12px);
  font-weight: 500;
  line-height: 1.3;
}

.metric .sum {
  color: #c89b3c;
  font-size: calc(var(--s) * 13px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.metric .dps {
  color: #5b5a56;
  font-size: calc(var(--s) * 11px);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.elements {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin-top: 1px;
}

.elements.empty-elements {
  color: #5b5a56;
  font-size: calc(var(--s) * 11px);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: #a09b8c;
  font-size: calc(var(--s) * 11px);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.chip.text .type-label {
  max-width: calc(var(--s) * 36px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #5b5a56;
}

.type-icon {
  width: 9px;
  height: 9px;
  image-rendering: pixelated;
  flex: 0 0 auto;
}

.empty {
  text-align: center;
  color: #a09b8c;
  font-size: calc(var(--s) * 12px);
  font-weight: 500;
  padding: calc(var(--s) * 8px) 0;
}
`;

function sectionTitle(el: Element | null | undefined): string {
  return (el?.firstElementChild?.textContent || "").trim().toLowerCase();
}

function findSectionByTitle(title: string): HTMLElement | null {
  for (const el of document.querySelectorAll("div")) {
    if (sectionTitle(el) === title) {
      return el as HTMLElement;
    }
  }
  return null;
}

/** Prefer after Party, else Loot, else Hunt Stats. */
function findAnchorSection(): HTMLElement | null {
  for (const title of ANCHOR_TITLES) {
    const section = findSectionByTitle(title);
    if (section) {
      return section;
    }
  }
  return null;
}

function isAnchorTitle(title: string): boolean {
  return (ANCHOR_TITLES as readonly string[]).includes(title);
}

/** Fast path: correctly placed after party (preferred) or loot/stats when party is absent. */
function isMountedAfterAnchor(host: HTMLElement): boolean {
  if (!host.isConnected) {
    return false;
  }
  const prev = host.previousElementSibling;
  if (!prev) {
    return false;
  }
  const prevTitle = sectionTitle(prev);
  if (prevTitle === PARTY_SECTION_TITLE) {
    return true;
  }
  if (!isAnchorTitle(prevTitle)) {
    return false;
  }
  const parent = host.parentElement;
  if (!parent) {
    return false;
  }
  for (const child of parent.children) {
    if (sectionTitle(child) === PARTY_SECTION_TITLE) {
      return false;
    }
  }
  return true;
}

function attachIntoHuntAnalyzer(host: HTMLElement): boolean {
  if (isMountedAfterAnchor(host)) {
    return true;
  }

  const anchor = findAnchorSection();
  if (!anchor?.parentElement) {
    if (host.isConnected) {
      host.remove();
    }
    return false;
  }

  // Keep preferred order: after party when present (even if we were after loot).
  const party = sectionTitle(anchor) === PARTY_SECTION_TITLE ? anchor : findSectionByTitle(PARTY_SECTION_TITLE);
  const insertAfter = party ?? anchor;
  insertAfter.parentElement!.insertBefore(host, insertAfter.nextSibling);
  return true;
}

export function mountDamageAnalyzerOverlay(): void {
  if (document.getElementById(HOST_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  shadow.appendChild(style);

  const root = document.createElement("div");
  shadow.appendChild(root);

  let collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  let combat = emptyCombat();
  let characterName: string | null = null;
  let pageIndex = 0;
  let focusedEntityIndex: number | null = null;
  let hasUserPaged = false;
  let paintQueued = false;
  let attachQueued = false;
  let lastScanAt = 0;
  let parentObserver: MutationObserver | null = null;

  const syncPageIndex = () => {
    const entities = sortEntitiesForPager(combat.entities, characterName);
    if (entities.length === 0) {
      pageIndex = 0;
      focusedEntityIndex = null;
      hasUserPaged = false;
      return;
    }
    if (focusedEntityIndex != null) {
      const found = entities.findIndex((row) => row.entityIndex === focusedEntityIndex);
      if (found >= 0) {
        pageIndex = found;
        return;
      }
    }
    pageIndex = Math.min(Math.max(pageIndex, 0), entities.length - 1);
    focusedEntityIndex = entities[pageIndex]?.entityIndex ?? null;
  };

  const paintNow = () => {
    syncPageIndex();
    root.innerHTML = renderBody(combat, collapsed, pageIndex, characterName);
    root.querySelector(".toggle")?.addEventListener("click", () => {
      collapsed = !collapsed;
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
      paintNow();
    });
    root.querySelector(".reset")?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ channel: "overlay:reset-damage" }).catch(() => {});
    });
    root.querySelector(".nav.prev")?.addEventListener("click", () => {
      if (pageIndex <= 0) {
        return;
      }
      hasUserPaged = true;
      pageIndex -= 1;
      const entities = sortEntitiesForPager(combat.entities, characterName);
      focusedEntityIndex = entities[pageIndex]?.entityIndex ?? null;
      paintNow();
    });
    root.querySelector(".nav.next")?.addEventListener("click", () => {
      const entities = sortEntitiesForPager(combat.entities, characterName);
      if (pageIndex >= entities.length - 1) {
        return;
      }
      hasUserPaged = true;
      pageIndex += 1;
      focusedEntityIndex = entities[pageIndex]?.entityIndex ?? null;
      paintNow();
    });
  };

  const schedulePaint = () => {
    if (paintQueued) {
      return;
    }
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      paintNow();
    });
  };

  const observeMountParent = () => {
    const parent = host.parentElement;
    if (!parent) {
      return;
    }
    parentObserver?.disconnect();
    parentObserver = new MutationObserver(() => {
      if (!isMountedAfterAnchor(host)) {
        // Parent re-rendered — reattach immediately.
        scheduleAttach(true);
      }
    });
    parentObserver.observe(parent, { childList: true });
  };

  const scheduleAttach = (immediate = false) => {
    if (isMountedAfterAnchor(host)) {
      return;
    }
    if (attachQueued) {
      return;
    }
    attachQueued = true;
    requestAnimationFrame(() => {
      attachQueued = false;
      if (isMountedAfterAnchor(host)) {
        return;
      }
      const now = Date.now();
      if (!immediate && now - lastScanAt < 400) {
        return;
      }
      lastScanAt = now;
      if (attachIntoHuntAnalyzer(host)) {
        observeMountParent();
      }
    });
  };

  paintNow();
  if (attachIntoHuntAnalyzer(host)) {
    observeMountParent();
  }

  // Hunt analyzer mounts/unmounts with the game UI; watch for it appearing.
  const rootObserver = new MutationObserver(() => {
    if (!isMountedAfterAnchor(host)) {
      scheduleAttach(false);
    }
  });
  rootObserver.observe(document.documentElement, { childList: true, subtree: true });

  const applyState = (
    state:
      | {
          combat?: CombatProjection;
          character?: { characterName?: string | null };
        }
      | null
      | undefined
  ) => {
    if (!state) {
      return;
    }
    if (state.combat) {
      combat = state.combat;
    }
    if (state.character && "characterName" in state.character) {
      const nextName = state.character.characterName ?? null;
      if (nextName !== characterName) {
        characterName = nextName;
        // Jump to self when identity arrives, unless the user already paged.
        if (!hasUserPaged) {
          pageIndex = 0;
          focusedEntityIndex = null;
        }
      }
    }
    schedulePaint();
  };

  chrome.runtime.onMessage.addListener(
    (message: {
      channel?: string;
      state?: {
        combat?: CombatProjection;
        character?: { characterName?: string | null };
      };
    }) => {
      if (message?.channel === "state-updated") {
        applyState(message.state);
      }
    }
  );

  void chrome.runtime
    .sendMessage({ channel: "overlay:get-state" })
    .then(
      (
        response:
          | {
              ok?: boolean;
              state?: {
                combat?: CombatProjection;
                character?: { characterName?: string | null };
              };
            }
          | undefined
      ) => {
        if (response?.ok) {
          applyState(response.state);
        }
      }
    )
    .catch(() => {});
}
