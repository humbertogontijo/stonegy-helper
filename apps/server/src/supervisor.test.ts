import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  setConfigDirForTests,
  upsertProfile,
} from "./profile-store";
import { setCharacterConfigDirForTests, loadCharacterConfig } from "./config";
import {
  Supervisor,
  type ExtensionOutboundMessage,
  type SessionFactory,
} from "./supervisor";
import type { BotState } from "@stonegy/helper/types";
import { defaultSettings } from "@stonegy/helper/core/settings";
import { defaultSessionView } from "@stonegy/helper/core/projections/defaults";
import { toBotState } from "@stonegy/helper/core/projections/to-bot-state";

function emptyState(characterId: string, name: string): BotState {
  const view = defaultSessionView();
  view.character.characterId = characterId;
  view.character.characterName = name;
  view.connection.connected = true;
  return toBotState(
    { ...defaultSettings(), characterId, characterName: name },
    view
  );
}

/** Poll until `cond` is true (bun:test lacks vitest's `vi.waitFor`). */
async function waitFor(
  cond: () => boolean,
  timeoutMs = 2_000
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Supervisor connect lock", () => {
  let now = 1_000_000;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "stonegy-sup-"));
    setConfigDirForTests(dir);
    now = 1_000_000;
    await upsertProfile({
      token: "tok",
      characterId: "char-x",
      characterName: "X",
    });
  });

  afterEach(() => {
    setConfigDirForTests(undefined);
  });

  it("dedupes concurrent requestConnect for the same characterId", async () => {
    let connects = 0;
    let resolveConnect: (() => void) | undefined;
    const connectGate = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });

    const factory: SessionFactory = ({ profile, onChange, onClosed }) => {
      connects += 1;
      const state = emptyState(profile.characterId, profile.characterName);
      return {
        characterId: profile.characterId,
        async connect() {
          await connectGate;
          onChange(state);
        },
        stop() {
          onClosed("stopped");
        },
        get state() {
          return state;
        },
        async handleCommand() {
          return { ok: true, state };
        },
        async syncPartyContext() {},
      };
    };

    const supervisor = new Supervisor({
      sessionFactory: factory,
      now: () => now,
    });

    const p1 = supervisor.requestConnect("char-x", "a");
    const p2 = supervisor.requestConnect("char-x", "b");
    const p3 = supervisor.requestConnect("char-x", "c");
    expect(supervisor.isConnecting("char-x")).toBe(true);
    // Allow getProfile await to resolve and reach sessionFactory / connect gate.
    await waitFor(() => connects === 1);

    resolveConnect?.();
    await Promise.all([p1, p2, p3]);
    expect(connects).toBe(1);
    expect(supervisor.states().has("char-x")).toBe(true);
    supervisor.stop();
  });

  it("sets backoff after failure and blocks retry until elapsed", async () => {
    let connects = 0;
    const factory: SessionFactory = ({ profile, onClosed }) => {
      connects += 1;
      return {
        characterId: profile.characterId,
        async connect() {
          throw new Error("boom");
        },
        stop() {
          onClosed("stopped");
        },
        get state() {
          return emptyState(profile.characterId, profile.characterName);
        },
        async handleCommand() {
          return { ok: true };
        },
        async syncPartyContext() {},
      };
    };

    const supervisor = new Supervisor({
      sessionFactory: factory,
      now: () => now,
    });

    await supervisor.requestConnect("char-x", "fail");
    expect(connects).toBe(1);
    await supervisor.requestConnect("char-x", "retry-early");
    expect(connects).toBe(1);

    now += 30_000;
    await supervisor.requestConnect("char-x", "retry-after-backoff");
    expect(connects).toBe(2);
    supervisor.stop();
  });

  it("force connect bypasses active backoff", async () => {
    let connects = 0;
    const factory: SessionFactory = ({ profile, onChange, onClosed }) => {
      connects += 1;
      const state = emptyState(profile.characterId, profile.characterName);
      return {
        characterId: profile.characterId,
        async connect() {
          if (connects === 1) {
            throw new Error("boom");
          }
          onChange(state);
        },
        stop() {
          onClosed("stopped");
        },
        get state() {
          return state;
        },
        async handleCommand() {
          return { ok: true, state };
        },
        async syncPartyContext() {},
      };
    };

    const supervisor = new Supervisor({
      sessionFactory: factory,
      now: () => now,
    });

    await supervisor.requestConnect("char-x", "fail");
    expect(connects).toBe(1);
    const blocked = await supervisor.requestConnect("char-x", "auto");
    expect(blocked).toEqual({
      ok: false,
      error: "Connect backoff active — try again shortly",
    });
    expect(connects).toBe(1);

    const forced = await supervisor.requestConnect("char-x", "api", { force: true });
    expect(forced).toEqual({ ok: true });
    expect(connects).toBe(2);
    expect(supervisor.states().has("char-x")).toBe(true);
    supervisor.stop();
  });

  it("does not connect when already owned", async () => {
    let connects = 0;
    const factory: SessionFactory = ({ profile, onChange, onClosed }) => {
      connects += 1;
      const state = emptyState(profile.characterId, profile.characterName);
      return {
        characterId: profile.characterId,
        async connect() {
          onChange(state);
        },
        stop() {
          onClosed("stopped");
        },
        get state() {
          return state;
        },
        async handleCommand() {
          return { ok: true, state };
        },
        async syncPartyContext() {},
      };
    };

    const supervisor = new Supervisor({
      sessionFactory: factory,
      now: () => now,
    });
    await supervisor.requestConnect("char-x", "first");
    await supervisor.requestConnect("char-x", "second");
    expect(connects).toBe(1);
    supervisor.stop();
  });

  it("replace sets cooldown that blocks reconnect", async () => {
    let connects = 0;
    const factory: SessionFactory = ({ profile, onChange, onClosed }) => {
      connects += 1;
      const state = emptyState(profile.characterId, profile.characterName);
      return {
        characterId: profile.characterId,
        async connect() {
          onChange(state);
        },
        stop() {
          onClosed("stopped");
        },
        get state() {
          return state;
        },
        async handleCommand() {
          return { ok: true, state };
        },
        async syncPartyContext() {},
      };
    };

    const supervisor = new Supervisor({
      sessionFactory: factory,
      now: () => now,
    });
    await supervisor.requestConnect("char-x", "first");
    expect(connects).toBe(1);
    supervisor.markReplaced("char-x");
    await supervisor.requestConnect("char-x", "during-cooldown");
    expect(connects).toBe(1);
    now += 60_000;
    await supervisor.requestConnect("char-x", "after-cooldown");
    expect(connects).toBe(2);
    supervisor.stop();
  });
});

describe("Supervisor extension claim", () => {
  let now = 1_000_000;
  const pendingTimers: Array<{ fn: () => void; ms: number }> = [];

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "stonegy-sup-ext-"));
    setConfigDirForTests(dir);
    now = 1_000_000;
    pendingTimers.length = 0;
    await upsertProfile({
      token: "tok",
      characterId: "char-x",
      characterName: "X",
    });
  });

  afterEach(() => {
    setConfigDirForTests(undefined);
  });

  function makeFactory(): { factory: SessionFactory; connects: { n: number } } {
    const connects = { n: 0 };
    const factory: SessionFactory = ({ profile, onChange, onClosed }) => {
      connects.n += 1;
      const state = emptyState(profile.characterId, profile.characterName);
      return {
        characterId: profile.characterId,
        async connect() {
          onChange(state);
        },
        stop() {
          onClosed("stopped");
        },
        get state() {
          return state;
        },
        async handleCommand() {
          return { ok: true, state };
        },
        async syncPartyContext() {},
      };
    };
    return { factory, connects };
  }

  function makeSupervisor(factory: SessionFactory): Supervisor {
    return new Supervisor({
      sessionFactory: factory,
      now: () => now,
      schedule: (fn, ms) => {
        const entry = { fn, ms };
        pendingTimers.push(entry);
        return entry as unknown as ReturnType<typeof setTimeout>;
      },
      clearSchedule: (id) => {
        const i = pendingTimers.indexOf(id as unknown as (typeof pendingTimers)[number]);
        if (i >= 0) {
          pendingTimers.splice(i, 1);
        }
      },
    });
  }

  it("blocks requestConnect while extension claims the character", async () => {
    const { factory, connects } = makeFactory();
    const supervisor = makeSupervisor(factory);
    await supervisor.claimExtension("char-x", "X", "sock-1");
    expect(supervisor.isExtensionLive("char-x")).toBe(true);
    const result = await supervisor.requestConnect("char-x", "api", { force: true });
    expect(result).toEqual({ ok: false, error: "extension live" });
    expect(connects.n).toBe(0);
    supervisor.stop();
  });

  it("release clears claim and does not connect", async () => {
    const { factory, connects } = makeFactory();
    const supervisor = makeSupervisor(factory);
    await supervisor.claimExtension("char-x", "X", "sock-1");
    await supervisor.releaseExtension("sock-1");
    expect(supervisor.isExtensionLive("char-x")).toBe(false);
    expect(connects.n).toBe(0);
    expect(pendingTimers).toHaveLength(0);
    expect(supervisor.states().has("char-x")).toBe(false);
    supervisor.stop();
  });

  it("socket close clears claim and does not connect", async () => {
    const { factory, connects } = makeFactory();
    const supervisor = makeSupervisor(factory);
    await supervisor.claimExtension("char-x", "X", "sock-1");
    await supervisor.onExtensionSocketClosed("sock-1");
    expect(supervisor.isExtensionLive("char-x")).toBe(false);
    expect(connects.n).toBe(0);
    expect(pendingTimers).toHaveLength(0);
    supervisor.stop();
  });

  it("disconnects owned session when extension claims", async () => {
    const { factory, connects } = makeFactory();
    const supervisor = makeSupervisor(factory);
    await supervisor.requestConnect("char-x", "api", { force: true });
    expect(connects.n).toBe(1);
    expect(supervisor.states().has("char-x")).toBe(true);
    await supervisor.claimExtension("char-x", "X", "sock-1");
    expect(supervisor.states().has("char-x")).toBe(false);
    expect(supervisor.isExtensionLive("char-x")).toBe(true);
    supervisor.stop();
  });
});

describe("Supervisor extension proxy", () => {
  let now = 1_000_000;
  const pendingTimers: Array<{ fn: () => void; ms: number }> = [];
  let configDir: string;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "stonegy-sup-proxy-"));
    configDir = dir;
    setConfigDirForTests(dir);
    setCharacterConfigDirForTests(dir);
    now = 1_000_000;
    pendingTimers.length = 0;
    await upsertProfile({
      token: "tok",
      characterId: "char-x",
      characterName: "X",
    });
  });

  afterEach(() => {
    setConfigDirForTests(undefined);
    setCharacterConfigDirForTests(undefined);
  });

  function makeSupervisor(): Supervisor {
    return new Supervisor({
      sessionFactory: () => {
        throw new Error("should not connect while testing proxy");
      },
      now: () => now,
      schedule: (fn, ms) => {
        const entry = { fn, ms };
        pendingTimers.push(entry);
        return entry as unknown as ReturnType<typeof setTimeout>;
      },
      clearSchedule: (id) => {
        const i = pendingTimers.indexOf(id as unknown as (typeof pendingTimers)[number]);
        if (i >= 0) {
          pendingTimers.splice(i, 1);
        }
      },
    });
  }

  it("serves extension state and forwards commands over the claim socket", async () => {
    const supervisor = makeSupervisor();
    const outbound: ExtensionOutboundMessage[] = [];
    supervisor.registerExtensionSocket("sock-1", (msg) => {
      outbound.push(msg);
    });
    await supervisor.claimExtension("char-x", "X", "sock-1");

    const state = emptyState("char-x", "X");
    supervisor.onExtensionState("sock-1", state);
    expect(supervisor.getSessionState("char-x")).toEqual(state);

    const commandPromise = supervisor.handleSessionCommand("char-x", "bot:clear-logs", {});
    expect(outbound).toHaveLength(1);
    expect(outbound[0]).toMatchObject({ type: "command", channel: "bot:clear-logs" });
    const cmd = outbound[0] as Extract<ExtensionOutboundMessage, { type: "command" }>;
    supervisor.onExtensionCommandResult(cmd.id, { ok: true, state });
    await expect(commandPromise).resolves.toEqual({ ok: true, state });
    supervisor.stop();
  });

  it("forwards settings to extension then persists disk after ack", async () => {
    const supervisor = makeSupervisor();
    const outbound: ExtensionOutboundMessage[] = [];
    supervisor.registerExtensionSocket("sock-1", (msg) => {
      outbound.push(msg);
      if (msg.type === "settings") {
        queueMicrotask(() => {
          supervisor.onExtensionSettingsAck(msg.rev, true);
        });
      }
    });
    await supervisor.claimExtension("char-x", "X", "sock-1");
    supervisor.onExtensionState("sock-1", emptyState("char-x", "X"));

    const result = await supervisor.handleSessionCommand("char-x", "bot:set-settings", {
      autoSellLoot: true,
    });
    expect(result.ok).toBe(true);
    expect(outbound.some((m) => m.type === "settings")).toBe(true);

    const config = await loadCharacterConfig("char-x");
    expect(config.settings.autoSellLoot).toBe(true);
    void configDir;
    supervisor.stop();
  });

  it("applies extension settings push to disk without bouncing", async () => {
    const supervisor = makeSupervisor();
    const outbound: ExtensionOutboundMessage[] = [];
    supervisor.registerExtensionSocket("sock-1", (msg) => {
      outbound.push(msg);
    });
    await supervisor.claimExtension("char-x", "X", "sock-1");
    await supervisor.applyExtensionSettings("sock-1", {
      characterId: "char-x",
      settings: { keepAliveEnabled: false },
      featureMasters: { hunt: true },
      rev: 1,
    });
    const config = await loadCharacterConfig("char-x");
    expect(config.settings.keepAliveEnabled).toBe(false);
    expect(config.featureMasters.hunt).toBe(true);
    expect(outbound.filter((m) => m.type === "settings")).toHaveLength(0);
    supervisor.stop();
  });

  it("falls back to managed session when not extension-live", async () => {
    let handled = false;
    const state = emptyState("char-x", "X");
    const supervisor = new Supervisor({
      sessionFactory: ({ profile, onChange, onClosed }) => ({
        characterId: profile.characterId,
        async connect() {
          onChange(state);
        },
        stop() {
          onClosed("stopped");
        },
        get state() {
          return state;
        },
        async handleCommand(channel) {
          handled = channel === "bot:clear-logs";
          return { ok: true, state };
        },
        async syncPartyContext() {},
      }),
      now: () => now,
    });
    await supervisor.requestConnect("char-x", "api", { force: true });
    const result = await supervisor.handleSessionCommand("char-x", "bot:clear-logs", {});
    expect(handled).toBe(true);
    expect(result.ok).toBe(true);
    supervisor.stop();
  });
});
