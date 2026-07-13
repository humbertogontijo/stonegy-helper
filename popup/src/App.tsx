import { useState } from "react";
import { DebugPanel } from "./components/debug/DebugPanel";
import { HuntPanel } from "./components/cavebot/HuntPanel";
import { ConnectionSetup } from "./components/layout/ConnectionSetup";
import { FeedbackToast } from "./components/layout/FeedbackToast";
import { Header } from "./components/layout/Header";
import { restoreActiveTab, SideNav } from "./components/layout/SideNav";
import { LootPanel } from "./components/loot/LootPanel";
import { BattlePanel } from "./components/presets/BattlePanel";
import { MarketPanel } from "./components/market/MarketPanel";
import { ToolsPanel } from "./components/tools/ToolsPanel";
import { TaskPanel } from "./components/tasker/TaskPanel";
import { useBotActions } from "./hooks/useBotActions";
import { useBotState } from "./hooks/useBotState";
import { useFeatureMasterStates } from "./hooks/useFeatureMasterStates";
import { useFeedback } from "./hooks/useFeedback";
import type { AppTab } from "./types/bot";

export function App() {
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

  const handleReloadPage = () => {
    void reloadGamePage();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header
        state={state}
        onRefresh={handleReloadPage}
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
          onReloadPage={handleReloadPage}
        />
      )}
      <FeedbackToast message={message} type={type} />
    </div>
  );
}
