import { getHuntById } from "../hunts";
import { getItemName } from "../items";
import { canArmFeature } from "./features/feature-control";
import type { GameSession } from "./session";
import type { FeatureMasters } from "./services/types";
import { isFeatureId } from "./services/types";
import type { HuntService } from "./services/hunt.service";
import type { TasksService } from "./services/tasks.service";
import type { LootService } from "./services/loot.service";
import type { MarketService } from "./services/market.service";
import type { BattleService } from "./services/battle.service";
import { clearDebugTelemetry } from "./events/debug-telemetry";
import { marketScanTickEvent } from "./services/events";
import { applySettingsPatch as applySharedSettingsPatch } from "./settings-persist";
import type { BotState } from "../types";
import {
  buildMessage,
  marketGetSnapshotMessage,
  marketResolveOrderMessage,
  pingMessage,
  questGetSnapshotMessage,
  SendMessageTypes,
} from "../protocol";

export type SessionCommandResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  state?: BotState;
  connected?: boolean;
  hasGameTab?: boolean;
  connectionHint?: string;
};

/** Host-specific overrides for chrome / persist side effects. */
export type SessionCommandHost = {
  /** Extension: rebind tab before returning state. */
  beforeGetState?: () => Promise<void>;
  /** Extension: real tab/bridge connection check. */
  checkConnection?: () => Promise<SessionCommandResponse>;
  /** Extension: reload the live game tab. */
  reloadGameTab?: () => Promise<SessionCommandResponse>;
  /** Extension: full market scan with persistence hooks. */
  runFullMarketScan?: () => Promise<SessionCommandResponse> | SessionCommandResponse;
  /** After shared settings patch + market alarm sync. */
  afterSetSettings?: () => Promise<void>;
  /** After feature masters were applied. */
  afterSetFeatureMasters?: () => Promise<void>;
  /** After auto-hunt / auto-tasker enable/disable mutations. */
  afterMutation?: () => void | Promise<void>;
  /** After clear-logs / clear-debug. */
  afterTelemetryClear?: () => void;
};

function stateOf(session: GameSession): BotState {
  return session.botState;
}

async function applySettingsPatch(
  session: GameSession,
  message: Record<string, unknown>,
  host?: SessionCommandHost
): Promise<SessionCommandResponse> {
  applySharedSettingsPatch(session, message);
  void session.services.get<MarketService>("market").syncMarketScannerAlarm();
  await host?.afterSetSettings?.();
  return { ok: true, state: stateOf(session) };
}

/**
 * Shared bot RPC handler for a live GameSession (extension + Node helper).
 * Pass {@link SessionCommandHost} for chrome-only channels and persist side effects.
 */
export async function handleSessionCommand(
  session: GameSession,
  channel: string,
  payload: Record<string, unknown> = {},
  host?: SessionCommandHost
): Promise<SessionCommandResponse> {
  const message: Record<string, unknown> = { channel, ...payload };

  switch (channel) {
    case "bot:get-state": {
      await host?.beforeGetState?.();
      const state = stateOf(session);
      return { ok: true, state };
    }

    case "bot:check-connection": {
      if (host?.checkConnection) {
        return host.checkConnection();
      }
      const state = stateOf(session);
      return {
        ok: true,
        state,
        connected: state.connection.connected,
        connectionHint: state.connection.connected ? "connected" : "no-game-session",
      };
    }

    case "bot:reload-game-tab":
      if (host?.reloadGameTab) {
        return host.reloadGameTab();
      }
      return { ok: false, error: "Reload is only available for the live game tab" };

    case "bot:refresh-hunt":
      await session.commands.run(SendMessageTypes.PARTY_GET_SNAPSHOT, {}, { force: true });
      return { ok: true, state: stateOf(session) };

    case "bot:sell-loot-now": {
      const result = await session.services.get<LootService>("loot").sellLootNow();
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Loot sell failed.", state: stateOf(session) };
      }
      return {
        ok: true,
        message: result.message ?? "Loot sell complete.",
        state: stateOf(session),
      };
    }

    case "bot:split-loot-now": {
      const result = await session.services.get<LootService>("loot").splitLootNow();
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Loot split failed.", state: stateOf(session) };
      }
      return {
        ok: true,
        message: result.message ?? "Loot split complete.",
        state: stateOf(session),
      };
    }

    case "bot:send-raw":
      await session.commands.sendRaw(String(message.payload ?? ""));
      return { ok: true, state: stateOf(session) };

    case "bot:send-type":
      await session.commands.sendRaw(
        buildMessage(message.messageType as never, (message.data as never) ?? {})
      );
      return { ok: true, state: stateOf(session) };

    case "bot:ping":
      await session.commands.sendRaw(pingMessage());
      return { ok: true, state: stateOf(session) };

    case "bot:start-hunt": {
      const huntId = Number(message.huntId);
      const result = await session.services.get<HuntService>("hunt").startHunt(huntId, {
        force: true,
      });
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Failed to start hunt." };
      }
      return { ok: true, state: stateOf(session) };
    }

    case "bot:start-auto-hunt": {
      const huntId = Number(message.huntId ?? session.settings.selectedHuntId);
      const result = await session.services.get<HuntService>("hunt").enableAutoHunt(huntId);
      if (!result.ok) {
        return { ok: false, error: result.error, state: stateOf(session) };
      }
      await host?.afterMutation?.();
      return { ok: true, message: result.message, state: result.state ?? stateOf(session) };
    }

    case "bot:stop-auto-hunt": {
      const result = await session.services.get<HuntService>("hunt").disableAutoHunt();
      if (!result.ok) {
        return { ok: false, error: result.error, state: stateOf(session) };
      }
      await host?.afterMutation?.();
      return { ok: true, message: result.message, state: result.state ?? stateOf(session) };
    }

    case "bot:start-auto-tasker": {
      const questId = Number(message.questId ?? session.settings.selectedTaskQuestId ?? 6);
      const result = await session.services.get<TasksService>("tasks").enableAutoTasker(questId);
      if (!result.ok) {
        return { ok: false, error: result.error, state: result.state ?? stateOf(session) };
      }
      await host?.afterMutation?.();
      return { ok: true, message: result.message, state: result.state ?? stateOf(session) };
    }

    case "bot:task-now": {
      const questId = Number(message.questId ?? session.settings.selectedTaskQuestId ?? 6);
      const result = await session.services.get<TasksService>("tasks").runTaskNow(questId);
      if (!result.ok) {
        return { ok: false, error: result.error, state: result.state ?? stateOf(session) };
      }
      return { ok: true, message: result.message, state: result.state ?? stateOf(session) };
    }

    case "bot:stop-auto-tasker": {
      const result = await session.services.get<TasksService>("tasks").disableAutoTasker();
      if (!result.ok) {
        return { ok: false, error: result.error, state: stateOf(session) };
      }
      await host?.afterMutation?.();
      return { ok: true, message: result.message, state: result.state ?? stateOf(session) };
    }

    case "bot:refresh-tasks":
      await session.commands.sendRaw(questGetSnapshotMessage());
      return { ok: true, state: stateOf(session) };

    case "bot:market-snapshot":
      await session.commands.sendRaw(
        marketGetSnapshotMessage(Number(message.page ?? 1), (message.filters as never) ?? {})
      );
      return { ok: true, state: stateOf(session) };

    case "bot:market-sync-item": {
      const itemId = Number(message.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) {
        return { ok: false, error: "Invalid item ID" };
      }
      await session.services.get<LootService>("loot").syncMarketItemIds([itemId], true);
      const state = stateOf(session);
      const price = state.market.marketPrices[itemId];
      const name = getItemName(itemId) ?? `Item #${itemId}`;
      const hasListing =
        price?.lowestSellPrice != null || price?.ownOrderReferencePrice != null;
      return {
        ok: true,
        state,
        message: hasListing
          ? `Fetched market price for ${name}`
          : `No market listings for ${name}`,
      };
    }

    case "bot:market-sync-items": {
      const itemIds = Array.isArray(message.itemIds)
        ? message.itemIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0)
        : [];
      if (!itemIds.length) {
        return { ok: false, error: "No item IDs provided" };
      }
      await session.services.get<LootService>("loot").syncMarketItemIds(itemIds, true);
      return { ok: true, state: stateOf(session) };
    }

    case "bot:market-sync-hunt-loot": {
      const huntId = Number(
        message.huntId ?? session.settings.selectedHuntId ?? session.view.hunt.activeHuntId
      );
      if (!Number.isFinite(huntId) || !getHuntById(huntId)) {
        return { ok: false, error: "Select a hunt first" };
      }
      void session.services.get<LootService>("loot").syncHuntLootMarketPrices(huntId);
      return { ok: true, state: stateOf(session) };
    }

    case "bot:market-scan-now":
      await session.dispatchFeatureEvent(marketScanTickEvent({ manual: true }));
      return { ok: true, state: stateOf(session) };

    case "bot:market-scan-full": {
      if (host?.runFullMarketScan) {
        return host.runFullMarketScan();
      }
      if (!session.view.connection.connected) {
        return { ok: false, error: "Not connected" };
      }
      void session.services.get<MarketService>("market").runFullMarketScan();
      return { ok: true, state: stateOf(session), message: "Full scan started" };
    }

    case "bot:market-scan-stop":
      session.services.get<MarketService>("market").cancelFullMarketScan();
      return { ok: true, state: stateOf(session), message: "Full scan stopped" };

    case "bot:market-create": {
      const outcome = await session.commands.run(SendMessageTypes.MARKET_CREATE_ORDER, {
        itemId: Number(message.itemId),
        eachPrice: Number(message.eachPrice),
        itemAmount: Number(message.itemAmount ?? 1),
        tier: Number(message.tier ?? 0),
        isBuyOrder: !!message.isBuyOrder,
      });
      if (!outcome.sent || outcome.success === false) {
        return {
          ok: false,
          error: outcome.errorMessage ?? "Failed to create market order",
          state: stateOf(session),
        };
      }
      return { ok: true, state: stateOf(session) };
    }

    case "bot:market-buy":
      await session.commands.sendRaw(
        marketResolveOrderMessage(String(message.orderId), Number(message.amount ?? 1), "buy")
      );
      return { ok: true, state: stateOf(session) };

    case "bot:place-party-position": {
      const huntId = session.view.hunt.activeHuntId ?? session.settings.selectedHuntId;
      if (huntId != null) {
        await session.services.get<BattleService>("battle").attemptAutoPlacePartyPosition(huntId);
      }
      return { ok: true, state: stateOf(session) };
    }

    case "bot:lock-lure": {
      const huntId =
        session.view.hunt.activeHuntId ??
        session.settings.selectedHuntId ??
        session.settings.taskerTargetHuntId;
      if (huntId != null) {
        await session.services.get<BattleService>("battle").lockLureForHunt(huntId);
      }
      return { ok: true, state: stateOf(session) };
    }

    case "bot:apply-presets": {
      const huntId = session.view.hunt.activeHuntId ?? session.settings.selectedHuntId;
      if (huntId != null) {
        await session.services.get<BattleService>("battle").applyPresets(huntId);
      }
      return { ok: true, state: stateOf(session) };
    }

    case "bot:set-feature-masters": {
      const patch = message.patch as Partial<FeatureMasters>;
      if (patch && typeof patch === "object") {
        const current = session.services.getMasters();
        const next: FeatureMasters = { ...current, ...patch };
        for (const key of Object.keys(patch) as Array<keyof FeatureMasters>) {
          if (!isFeatureId(key) || !patch[key]) {
            continue;
          }
          const check = canArmFeature(key, next);
          if (!check.ok) {
            return { ok: false, error: check.error };
          }
        }
        await session.services.setMasters(patch);
        await host?.afterSetFeatureMasters?.();
      }
      return { ok: true, state: stateOf(session) };
    }

    case "bot:set-settings":
      return applySettingsPatch(session, message, host);

    case "bot:clear-logs":
      session.telemetry.logs = [];
      host?.afterTelemetryClear?.();
      return { ok: true, state: stateOf(session) };

    case "bot:clear-debug":
      clearDebugTelemetry(session.telemetry.debug);
      host?.afterTelemetryClear?.();
      return { ok: true, state: stateOf(session) };

    default:
      return { ok: false, error: `Unknown channel: ${channel}` };
  }
}
