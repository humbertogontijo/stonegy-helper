import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../lib/core/settings";
import { defaultSessionView } from "../../lib/core/projections/defaults";
import { toBotState } from "../../lib/core/projections/to-bot-state";
import {
  characterBotSettingsKey,
  characterBotStateKey,
  characterMarketCacheKey,
  loadPersistedSettings,
  persistBotState,
  pickPersistedState,
  resolveCharacterId,
} from "./storage";
import { emptyDebugTelemetry } from "../../lib/core/events/debug-telemetry";

function createMemoryStorage() {
  const memory: Record<string, unknown> = {};
  return {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown>) => {
      if (typeof keys === "string") {
        return { [keys]: memory[keys] };
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, memory[key]]));
      }
      return { ...memory };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(memory, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete memory[key];
      }
    }),
    memory,
  };
}

describe("extension storage", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      storage: {
        local: createMemoryStorage(),
      },
    });
  });

  it("builds per-character storage keys", () => {
    expect(characterBotSettingsKey("hero-1")).toBe("botSettings:hero-1");
    expect(characterBotStateKey("hero-1")).toBe("botState:hero-1");
    expect(characterMarketCacheKey("hero-1")).toBe("marketPricesCache:hero-1");
  });

  it("resolves character id from live state first", () => {
    const settings = defaultSettings();
    settings.characterId = "settings-id";

    const view = defaultSessionView();
    view.character.characterId = "live-id";

    const state = toBotState(settings, view);
    expect(resolveCharacterId(state)).toBe("live-id");
  });

  it("loads and persists isolated settings per character", async () => {
    const charA = toBotState(
      { ...defaultSettings(), selectedHuntId: 10 },
      defaultSessionView()
    );
    charA.character.characterId = "char-a";

    const charB = toBotState(
      { ...defaultSettings(), selectedHuntId: 20 },
      defaultSessionView()
    );
    charB.character.characterId = "char-b";

    await persistBotState(charA, "char-a");
    await persistBotState(charB, "char-b");

    const loadedA = await loadPersistedSettings("char-a");
    const loadedB = await loadPersistedSettings("char-b");

    expect(loadedA.settings.selectedHuntId).toBe(10);
    expect(loadedB.settings.selectedHuntId).toBe(20);
  });

  it("returns defaults when character id is missing", async () => {
    const loaded = await loadPersistedSettings(null);
    expect(loaded.settings.selectedHuntId).toBeNull();
    expect(loaded.logs).toEqual([]);
    expect(loaded.viewPatch).toEqual({});
  });

  it("does not persist debug telemetry or market prices in botState", () => {
    const state = toBotState(defaultSettings(), defaultSessionView());
    state.character.characterId = "hero-1";
    state.debug = {
      ...emptyDebugTelemetry(),
      events: [
        {
          id: "dbg-1",
          at: 1,
          direction: "receive",
          opcode: 1,
          eventKey: "ping",
          wireData: "x".repeat(50_000),
        },
      ],
    };
    state.market.marketPrices = {
      1: {
        itemId: 1,
        lowestSellPrice: 10,
        highestBuyPrice: 5,
        ownOrderReferencePrice: null,
        sellOrderCount: 1,
        buyOrderCount: 1,
        tradableAmount: 10,
        updatedAt: Date.now(),
      },
    };

    const persisted = pickPersistedState(state) as Record<string, unknown>;

    expect(persisted.debug).toBeUndefined();
    expect(persisted.serviceState).toBeUndefined();
    expect(persisted.featureMasters).toBeUndefined();
    expect((persisted.market as { marketPrices?: unknown }).marketPrices).toBeUndefined();
    expect(JSON.stringify(persisted).length).toBeLessThan(5_000);
  });
});
