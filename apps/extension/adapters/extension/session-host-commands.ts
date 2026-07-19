import {
  handleSessionCommand,
  type SessionCommandHost,
  type SessionCommandResponse,
} from "@stonegy/helper/core/session-commands";
import type { GameSession } from "@stonegy/helper/core/session";
import type { MarketService } from "@stonegy/helper/core/services/market.service";
import type { BotState } from "@stonegy/helper/types";
import { syncKeepAlive } from "../../background/keep-alive";
import {
  persistBotState,
  saveFeatureMasters,
  saveMarketCache,
} from "./storage";

export type ExtensionCommandHostDeps = {
  session: GameSession;
  getState: () => BotState;
  getActiveCharacterId: () => string | null;
  findGameTab: (options?: { rebind?: boolean }) => Promise<chrome.tabs.Tab | null | undefined>;
  reloadGameTab: () => Promise<boolean>;
  checkConnection: () => Promise<SessionCommandResponse>;
  scheduleSettingsSync: () => void;
  broadcast: () => void;
  syncPageKeepAliveConfig: () => Promise<void>;
  cancelAutoReconnect: () => void;
  setMarketPersistenceDeferred: (value: boolean) => void;
  chainFullScan: (work: Promise<void>) => void;
};

export function createExtensionSessionCommandHost(
  deps: ExtensionCommandHostDeps
): SessionCommandHost {
  return {
    beforeGetState: async () => {
      await deps.findGameTab({ rebind: true });
    },
    checkConnection: () => deps.checkConnection(),
    reloadGameTab: async () => {
      await deps.findGameTab({ rebind: true });
      const reloaded = await deps.reloadGameTab();
      if (!reloaded) {
        return { ok: false, error: "No Stonegy tab found" };
      }
      return { ok: true };
    },
    runFullMarketScan: () => {
      const state = deps.getState();
      if (!state.connection.connected) {
        return { ok: false, error: "Not connected to the game tab" };
      }
      deps.setMarketPersistenceDeferred(true);
      const scan = deps.session.services.get<MarketService>("market").runFullMarketScan({
        onFlush: async () => {
          await saveMarketCache(deps.getState());
          await persistBotState(deps.getState(), deps.getActiveCharacterId());
        },
      });
      deps.chainFullScan(
        scan.finally(() => {
          deps.setMarketPersistenceDeferred(false);
          void saveMarketCache(deps.getState());
          void persistBotState(deps.getState(), deps.getActiveCharacterId());
        })
      );
      return { ok: true, state: deps.getState(), message: "Full scan started" };
    },
    afterSetSettings: async () => {
      await persistBotState(deps.getState(), deps.getActiveCharacterId());
      deps.scheduleSettingsSync();
      await syncKeepAlive();
      await deps.syncPageKeepAliveConfig();
      if (deps.session.settings.autoReconnectEnabled !== true) {
        deps.cancelAutoReconnect();
      }
    },
    afterSetFeatureMasters: async () => {
      await saveFeatureMasters(
        deps.getActiveCharacterId() ?? deps.session.view.character.characterId,
        deps.session.services.getMasters()
      );
      deps.scheduleSettingsSync();
      deps.broadcast();
    },
    afterMutation: () => {
      void persistBotState(deps.getState(), deps.getActiveCharacterId());
    },
    afterTelemetryClear: () => {
      deps.broadcast();
    },
  };
}

export async function handleExtensionBotMessage(
  session: GameSession,
  message: Record<string, unknown>,
  host: SessionCommandHost
): Promise<SessionCommandResponse> {
  const channel = typeof message.channel === "string" ? message.channel : "";
  const { channel: _channel, ...payload } = message;
  return handleSessionCommand(session, channel, payload, host);
}
