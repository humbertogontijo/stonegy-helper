import { useMemo, useState } from "react";
import { DebugPanel } from "../components/debug/DebugPanel";
import { HuntPanel } from "../components/cavebot/HuntPanel";
import { ConnectionSetup } from "../components/layout/ConnectionSetup";
import { FeedbackToast } from "../components/layout/FeedbackToast";
import { Header } from "../components/layout/Header";
import { restoreActiveTab, SideNav } from "../components/layout/SideNav";
import { LootPanel } from "../components/loot/LootPanel";
import { BattlePanel } from "../components/presets/BattlePanel";
import { MarketPanel } from "../components/market/MarketPanel";
import { ToolsPanel } from "../components/tools/ToolsPanel";
import { TaskPanel } from "../components/tasker/TaskPanel";
import { useBotActions } from "../hooks/useBotActions";
import { useBotState } from "../hooks/useBotState";
import { useFeatureMasterStates } from "../hooks/useFeatureMasterStates";
import { useFeedback } from "../hooks/useFeedback";
import { BotTransportProvider } from "../transport/context";
import type { BotTransport } from "../transport/types";
import type { AppTab } from "../types/bot";

const NOOP_TRANSPORT: BotTransport = {
  send: async () => ({ ok: false, error: "unmanaged" }),
  subscribe: () => () => {},
};

export interface HelperPartyTab {
  characterId: string;
  characterName: string;
  transport: BotTransport;
  live?: boolean;
  unmanaged?: boolean;
}

export interface HelperPartyShellProps {
  tabs: HelperPartyTab[];
  /** Optional title shown above character tabs (Node multi-party layout). */
  title?: string;
  /** Show the member tab bar even when there is only one character. */
  alwaysShowTabs?: boolean;
}

function SelectedCharacterBody({
  characterName,
  live,
  unmanaged,
}: {
  characterName: string;
  live?: boolean;
  unmanaged?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<AppTab>(restoreActiveTab);
  const {
    state,
    connected,
    reloadingPage,
    connectionHint,
    connectionMessage,
    reloadGamePage,
    refreshState,
  } = useBotState();
  const { message, type, showFeedback } = useFeedback();
  const { runAction, saveSettings } = useBotActions(refreshState, showFeedback);
  const { masters: featureMasters, anyMasterOn } = useFeatureMasterStates(state);
  const characterScopeKey = state?.character.characterId ?? "none";

  if (unmanaged) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-[var(--text-muted)]">
        <p className="font-medium text-[var(--text)]">{characterName}</p>
        {live ? (
          <>
            <p>Connected via browser extension.</p>
            <p>Controls are available in the extension popup until the helper takes over.</p>
          </>
        ) : (
          <>
            <p>No saved login for this party member.</p>
            <p>Add a profile in the Node helper to manage them remotely.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header
        state={state}
        onRefresh={() => void reloadGamePage()}
        reloading={reloadingPage}
        compact={!connected}
        anyFeatureMasterOn={anyMasterOn}
      />
      {connected ? (
        <div className="flex flex-1 min-h-0 flex-col">
          <SideNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            state={state}
            featureMasters={featureMasters}
          />
          <main
            className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden p-2"
            role="tabpanel"
          >
            {activeTab === "market" ? (
              <MarketPanel
                key={`market:${characterScopeKey}`}
                state={state}
                runAction={runAction}
                saveSettings={saveSettings}
                showFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "loot" ? (
              <LootPanel
                key={`loot:${characterScopeKey}`}
                state={state}
                runAction={runAction}
                saveSettings={saveSettings}
                showFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "battle" ? (
              <BattlePanel
                key={`battle:${characterScopeKey}`}
                state={state}
                runAction={runAction}
                saveSettings={saveSettings}
                showFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "hunt" ? (
              <HuntPanel
                key={`hunt:${characterScopeKey}`}
                state={state}
                runAction={runAction}
                saveSettings={saveSettings}
                showFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "tasks" ? (
              <TaskPanel
                key={`tasks:${characterScopeKey}`}
                state={state}
                runAction={runAction}
                saveSettings={saveSettings}
                showFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "tools" ? (
              <ToolsPanel
                key={`tools:${characterScopeKey}`}
                state={state}
                saveSettings={saveSettings}
                showFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "debug" ? (
              <DebugPanel key={`debug:${characterScopeKey}`} state={state} showFeedback={showFeedback} />
            ) : null}
          </main>
        </div>
      ) : (
        <ConnectionSetup
          hint={connectionHint}
          message={connectionMessage}
          reloading={reloadingPage}
          onReloadPage={() => void reloadGamePage()}
        />
      )}
      <FeedbackToast message={message} type={type} />
    </div>
  );
}

export function HelperPartyShell({ tabs, title, alwaysShowTabs = false }: HelperPartyShellProps) {
  const usableTabs = tabs.length > 0 ? tabs : [];
  const defaultId =
    usableTabs.find((t) => t.live || !t.unmanaged)?.characterId ?? usableTabs[0]?.characterId;
  const [selectedId, setSelectedId] = useState<string | undefined>(defaultId);

  const selected = useMemo(() => {
    const byId = usableTabs.find((t) => t.characterId === selectedId);
    return byId ?? usableTabs[0];
  }, [usableTabs, selectedId]);

  const showMemberTabs = usableTabs.length > 1 || (alwaysShowTabs && usableTabs.length > 0);

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[var(--text-muted)]">
        No party members
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {title ? (
        <div className="shrink-0 border-b border-[var(--border-gold)] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {title}
        </div>
      ) : null}
      {showMemberTabs ? (
        <div
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[var(--border-gold)] bg-[rgba(1,4,7,0.55)] px-1.5 py-1"
          role="tablist"
          aria-label="Party members"
        >
          {usableTabs.map((tab) => {
            const active = tab.characterId === selected.characterId;
            const selectable = !!tab.live || !tab.unmanaged;
            return (
              <button
                key={tab.characterId}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!selectable}
                onClick={() => setSelectedId(tab.characterId)}
                className={[
                  "shrink-0 rounded px-2 py-1 text-xs",
                  active
                    ? "bg-[rgba(212,175,55,0.22)] text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)]",
                  !selectable ? "cursor-not-allowed opacity-50" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={
                  tab.live
                    ? "Live in browser extension"
                    : tab.unmanaged
                      ? "No saved login"
                      : tab.characterName
                }
              >
                {tab.characterName}
                {tab.live ? (
                  <span className="ml-1 text-[9px] uppercase text-[var(--accent-green,#8f8)]">live</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="min-h-0 flex-1" key={selected.characterId}>
        <BotTransportProvider
          transport={selected.unmanaged ? NOOP_TRANSPORT : selected.transport}
        >
          <SelectedCharacterBody
            characterName={selected.characterName}
            live={selected.live}
            unmanaged={selected.unmanaged}
          />
        </BotTransportProvider>
      </div>
    </div>
  );
}
