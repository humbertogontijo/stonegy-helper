import type { BotState } from "@stonegy/helper/types";
import type { FeatureId } from "@stonegy/helper/core/services/types";
import { FEATURE_TAB_ORDER } from "@stonegy/helper/core/features/instances";
import { HelperEventBus } from "./event-bus";
import { ManagedSession, type ManagedSessionCloseReason } from "./managed-session";
import { buildPartySummaries, type PartySummary } from "./parties";
import {
  getProfile,
  loadProfiles,
  type HelperProfile,
} from "./profile-store";
import { syncSettingsFromExtension } from "./config";

const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000];
const REPLACE_COOLDOWN_MS = 60_000;
const PARTY_SYNC_POLL_MS = 60_000;
const EXTENSION_RPC_TIMEOUT_MS = 15_000;

export type SessionCommandResult = {
  ok?: boolean;
  error?: string;
  state?: BotState;
  message?: string;
  connected?: boolean;
  hasGameTab?: boolean;
  connectionHint?: string;
};

export type SessionFactory = (options: {
  profile: HelperProfile;
  onChange: (state: BotState) => void;
  onClosed: (reason: ManagedSessionCloseReason) => void;
}) => {
  characterId: string;
  connect(): Promise<void>;
  stop(): void;
  get state(): BotState;
  handleCommand(
    channel: string,
    payload?: Record<string, unknown>
  ): Promise<SessionCommandResult>;
  syncPartyContext(): Promise<void>;
};

type OwnedSession = ReturnType<SessionFactory>;

export type ExtensionOutboundMessage =
  | {
      type: "settings";
      characterId: string;
      settings: Record<string, unknown>;
      featureMasters: Partial<Record<FeatureId, boolean>>;
      rev: number;
    }
  | {
      type: "command";
      id: string;
      channel: string;
      payload: Record<string, unknown>;
    };

interface ExtensionClaim {
  characterId: string;
  characterName: string;
  socketId: string;
}

type ExtensionSender = (message: ExtensionOutboundMessage) => void;

function defaultSessionFactory(options: {
  profile: HelperProfile;
  onChange: (state: BotState) => void;
  onClosed: (reason: ManagedSessionCloseReason) => void;
}): OwnedSession {
  const session = new ManagedSession({
    profile: options.profile,
    onChange: options.onChange,
    onClosed: options.onClosed,
  });
  return {
    characterId: session.characterId,
    connect: () => session.connect(),
    stop: () => session.stop(),
    get state() {
      return session.state;
    },
    handleCommand: (channel, payload) => session.handleCommand(channel, payload),
    syncPartyContext: () => session.syncPartyContext(),
  };
}

export interface SupervisorOptions {
  eventBus?: HelperEventBus;
  sessionFactory?: SessionFactory;
  now?: () => number;
  /** Injected for tests; defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearSchedule?: (id: ReturnType<typeof setTimeout>) => void;
}

export class Supervisor {
  private readonly owned = new Map<string, OwnedSession>();
  private readonly connecting = new Set<string>();
  private readonly backoffUntil = new Map<string, number>();
  private readonly cooldownUntil = new Map<string, number>();
  private readonly failCount = new Map<string, number>();
  private readonly extensionClaims = new Map<string, ExtensionClaim>();
  private readonly socketToCharacter = new Map<string, string>();
  private readonly socketSenders = new Map<string, ExtensionSender>();
  private readonly extensionStates = new Map<string, BotState>();
  private readonly settingsRevByCharacter = new Map<string, number>();
  private readonly pendingCommands = new Map<
    string,
    {
      resolve: (result: SessionCommandResult) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly pendingSettingsAcks = new Map<
    string,
    {
      resolve: (ok: boolean, error?: string) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private commandSeq = 0;
  private settingsRevSeq = 0;
  private readonly eventBus: HelperEventBus;
  private readonly sessionFactory: SessionFactory;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearSchedule: (id: ReturnType<typeof setTimeout>) => void;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SupervisorOptions = {}) {
    this.eventBus = options.eventBus ?? new HelperEventBus();
    this.sessionFactory = options.sessionFactory ?? defaultSessionFactory;
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? setTimeout;
    this.clearSchedule = options.clearSchedule ?? clearTimeout;
  }

  get events(): HelperEventBus {
    return this.eventBus;
  }

  start(): void {
    this.pollTimer = setInterval(() => {
      void this.syncOwnedParties();
    }, PARTY_SYNC_POLL_MS);
    void this.syncOwnedParties();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const pending of this.pendingCommands.values()) {
      this.clearSchedule(pending.timer);
      pending.resolve({ ok: false, error: "Supervisor stopped" });
    }
    this.pendingCommands.clear();
    for (const pending of this.pendingSettingsAcks.values()) {
      this.clearSchedule(pending.timer);
      pending.resolve(false, "Supervisor stopped");
    }
    this.pendingSettingsAcks.clear();
    this.extensionClaims.clear();
    this.socketToCharacter.clear();
    this.socketSenders.clear();
    this.extensionStates.clear();
    for (const id of [...this.owned.keys()]) {
      void this.disconnect(id);
    }
  }

  states(): Map<string, BotState> {
    const map = new Map<string, BotState>();
    for (const [id, session] of this.owned) {
      map.set(id, session.state);
    }
    return map;
  }

  getSession(characterId: string): OwnedSession | undefined {
    return this.owned.get(characterId);
  }

  /** characterId → display name for extension-held characters. */
  extensionLiveMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const claim of this.extensionClaims.values()) {
      map.set(claim.characterId, claim.characterName);
    }
    return map;
  }

  isExtensionLive(characterId: string): boolean {
    return this.extensionClaims.has(characterId);
  }

  registerExtensionSocket(socketId: string, send: ExtensionSender): void {
    this.socketSenders.set(socketId, send);
  }

  unregisterExtensionSocket(socketId: string): void {
    this.socketSenders.delete(socketId);
  }

  async listParties(): Promise<PartySummary[]> {
    const profiles = (await loadProfiles()).profiles;
    return buildPartySummaries(
      this.states(),
      profiles,
      this.extensionLiveMap(),
      this.extensionStates
    );
  }

  getSessionState(characterId: string): BotState | null {
    const owned = this.owned.get(characterId);
    if (owned) {
      return owned.state;
    }
    return this.extensionStates.get(characterId) ?? null;
  }

  async handleSessionCommand(
    characterId: string,
    channel: string,
    payload: Record<string, unknown> = {}
  ): Promise<SessionCommandResult> {
    if (this.extensionClaims.has(characterId)) {
      if (channel === "bot:get-state" || channel === "bot:check-connection") {
        const state = this.extensionStates.get(characterId);
        if (!state) {
          return { ok: false, error: "Extension state not ready" };
        }
        return {
          ok: true,
          state,
          connected: state.connection?.connected ?? true,
          hasGameTab: true,
          connectionHint: state.connection?.connected ? "connected" : "no-game-session",
        };
      }
      if (channel === "bot:set-settings" || channel === "bot:set-feature-masters") {
        return this.forwardSettingsToExtension(characterId, channel, payload);
      }
      return this.forwardCommandToExtension(characterId, channel, payload);
    }

    const session = this.owned.get(characterId);
    if (!session) {
      return { ok: false, error: "Session not connected" };
    }
    return session.handleCommand(channel, payload);
  }

  /**
   * Extension holds the game WS for this character.
   * Disconnects any headless session for the same id.
   */
  async claimExtension(
    characterId: string,
    characterName: string,
    socketId: string
  ): Promise<void> {
    // Live game session proves prior connect failures are stale.
    this.clearConnectGates(characterId);

    const previousForSocket = this.socketToCharacter.get(socketId);
    if (previousForSocket && previousForSocket !== characterId) {
      await this.clearClaim(previousForSocket, socketId);
    }

    const existing = this.extensionClaims.get(characterId);
    if (existing && existing.socketId !== socketId) {
      this.socketToCharacter.delete(existing.socketId);
    }

    this.extensionClaims.set(characterId, { characterId, characterName, socketId });
    this.socketToCharacter.set(socketId, characterId);

    if (this.owned.has(characterId)) {
      await this.disconnect(characterId);
    }

    console.log(`[helper] extension claim ${characterId} (${characterName})`);
    await this.emitParties();
  }

  /** Explicit release from the extension (game WS gone). */
  async releaseExtension(socketId: string): Promise<void> {
    const characterId = this.socketToCharacter.get(socketId);
    if (!characterId) {
      return;
    }
    await this.clearClaim(characterId, socketId);
    await this.emitParties();
  }

  /** Control WS closed — drop claim if this socket still held one. */
  async onExtensionSocketClosed(socketId: string): Promise<void> {
    this.unregisterExtensionSocket(socketId);
    await this.releaseExtension(socketId);
  }

  async applyExtensionSettings(
    socketId: string,
    input: {
      characterId: string;
      settings?: Record<string, unknown>;
      featureMasters?: Partial<Record<FeatureId, boolean>>;
      rev?: number;
    }
  ): Promise<void> {
    const claimedId = this.socketToCharacter.get(socketId);
    if (!claimedId || claimedId !== input.characterId) {
      throw new Error("Settings character does not match claim");
    }
    if (typeof input.rev === "number") {
      const last = this.settingsRevByCharacter.get(input.characterId) ?? 0;
      if (input.rev <= last) {
        return;
      }
      this.settingsRevByCharacter.set(input.characterId, input.rev);
    }
    await syncSettingsFromExtension({
      characterId: input.characterId,
      settings: input.settings,
      featureMasters: input.featureMasters,
    });
  }

  onExtensionSettingsAck(rev: number, ok: boolean, error?: string): void {
    const key = `settings:${rev}`;
    const pending = this.pendingSettingsAcks.get(key);
    if (!pending) {
      return;
    }
    this.clearSchedule(pending.timer);
    this.pendingSettingsAcks.delete(key);
    pending.resolve(ok, error);
  }

  onExtensionState(socketId: string, state: BotState): void {
    const characterId = this.socketToCharacter.get(socketId);
    if (!characterId) {
      return;
    }
    this.extensionStates.set(characterId, state);
    this.eventBus.emit({ event: "state", data: { characterId, state } });
    void this.emitParties();
  }

  onExtensionCommandResult(id: string, result: SessionCommandResult): void {
    const pending = this.pendingCommands.get(id);
    if (!pending) {
      return;
    }
    this.clearSchedule(pending.timer);
    this.pendingCommands.delete(id);
    pending.resolve(result);
  }

  /**
   * Connect a managed session.
   * - Manual/API pass `{ force: true }` to bypass connect backoff and replace cooldown.
   * - Blocked while the extension claims the character (avoids kicking the tab).
   */
  async requestConnect(
    characterId: string,
    reason: string,
    options: { force?: boolean } = {}
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.owned.has(characterId) || this.connecting.has(characterId)) {
      return { ok: true };
    }
    if (this.extensionClaims.has(characterId)) {
      return { ok: false, error: "extension live" };
    }
    const now = this.now();
    if (!options.force && (this.backoffUntil.get(characterId) ?? 0) > now) {
      return { ok: false, error: "Connect backoff active — try again shortly" };
    }
    if (!options.force && (this.cooldownUntil.get(characterId) ?? 0) > now) {
      return { ok: false, error: "Session replaced cooldown — try again shortly" };
    }
    if (options.force) {
      this.clearConnectGates(characterId);
    }

    // Reserve the lock before any await so concurrent callers see connecting.
    this.connecting.add(characterId);
    try {
      const profile = await getProfile(characterId);
      if (!profile) {
        return { ok: false, error: "Profile not found" };
      }
      // Re-check after await — extension may have claimed meanwhile.
      if (this.extensionClaims.has(characterId)) {
        return { ok: false, error: "extension live" };
      }

      console.log(`[helper] connect ${characterId} (${reason})`);

      const session = this.sessionFactory({
        profile,
        onChange: (state) => {
          this.eventBus.emit({ event: "state", data: { characterId, state } });
          void this.emitParties();
        },
        onClosed: (closeReason) => {
          this.owned.delete(characterId);
          if (closeReason === "replaced") {
            this.cooldownUntil.set(characterId, this.now() + REPLACE_COOLDOWN_MS);
            console.log(`[helper] ${characterId} replaced — cooldown ${REPLACE_COOLDOWN_MS}ms`);
          }
          void this.emitParties();
        },
      });
      await session.connect();
      if (this.extensionClaims.has(characterId)) {
        session.stop();
        return { ok: false, error: "extension live" };
      }
      this.owned.set(characterId, session);
      this.clearConnectGates(characterId);
      void this.emitParties();
      return { ok: true };
    } catch (error) {
      const fails = (this.failCount.get(characterId) ?? 0) + 1;
      this.failCount.set(characterId, fails);
      const delay = BACKOFF_STEPS_MS[Math.min(fails - 1, BACKOFF_STEPS_MS.length - 1)]!;
      this.backoffUntil.set(characterId, this.now() + delay);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[helper] connect failed ${characterId}:`, message, `(backoff ${delay}ms)`);
      return { ok: false, error: message };
    } finally {
      this.connecting.delete(characterId);
    }
  }

  /** Test/helper: mark a character as recently replaced (cooldown). */
  markReplaced(characterId: string): void {
    this.owned.get(characterId)?.stop();
    this.owned.delete(characterId);
    this.cooldownUntil.set(characterId, this.now() + REPLACE_COOLDOWN_MS);
  }

  /** Expose connecting set size for tests. */
  isConnecting(characterId: string): boolean {
    return this.connecting.has(characterId);
  }

  async disconnect(characterId: string): Promise<void> {
    const session = this.owned.get(characterId);
    if (!session) {
      return;
    }
    session.stop();
    this.owned.delete(characterId);
    await this.emitParties();
  }

  /** Reconnect an already-owned session (e.g. JWT refreshed). */
  async reconnectOwned(characterId: string, reason: string): Promise<void> {
    if (!this.owned.has(characterId)) {
      return;
    }
    await this.disconnect(characterId);
    void this.requestConnect(characterId, reason, { force: true });
  }

  private async forwardSettingsToExtension(
    characterId: string,
    channel: string,
    payload: Record<string, unknown>
  ): Promise<SessionCommandResult> {
    const claim = this.extensionClaims.get(characterId);
    const send = claim ? this.socketSenders.get(claim.socketId) : undefined;
    if (!claim || !send) {
      return { ok: false, error: "Extension not connected" };
    }

    const rev = ++this.settingsRevSeq;
    this.settingsRevByCharacter.set(characterId, rev);

    const settings =
      channel === "bot:set-settings" ? (payload as Record<string, unknown>) : {};
    const featureMasters =
      channel === "bot:set-feature-masters"
        ? normalizeMastersPatch(
            (payload.patch as Record<string, unknown> | undefined) ?? payload
          )
        : {};

    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const key = `settings:${rev}`;
      const timer = this.schedule(() => {
        this.pendingSettingsAcks.delete(key);
        resolve({ ok: false, error: "Extension settings timeout" });
      }, EXTENSION_RPC_TIMEOUT_MS);
      this.pendingSettingsAcks.set(key, {
        resolve: (ok, error) => resolve({ ok, error }),
        timer,
      });
      send({
        type: "settings",
        characterId,
        settings,
        featureMasters,
        rev,
      });
    });

    if (!ack.ok) {
      return { ok: false, error: ack.error ?? "Settings sync failed" };
    }

    await syncSettingsFromExtension({
      characterId,
      settings: channel === "bot:set-settings" ? settings : undefined,
      featureMasters:
        channel === "bot:set-feature-masters" ? featureMasters : undefined,
    });

    return {
      ok: true,
      state: this.extensionStates.get(characterId),
    };
  }

  private async forwardCommandToExtension(
    characterId: string,
    channel: string,
    payload: Record<string, unknown>
  ): Promise<SessionCommandResult> {
    const claim = this.extensionClaims.get(characterId);
    const send = claim ? this.socketSenders.get(claim.socketId) : undefined;
    if (!claim || !send) {
      return { ok: false, error: "Extension not connected" };
    }

    const id = `cmd-${++this.commandSeq}`;
    return new Promise((resolve) => {
      const timer = this.schedule(() => {
        this.pendingCommands.delete(id);
        resolve({ ok: false, error: "Extension command timeout" });
      }, EXTENSION_RPC_TIMEOUT_MS);
      this.pendingCommands.set(id, { resolve, timer });
      send({ type: "command", id, channel, payload });
    });
  }

  private async clearClaim(characterId: string, socketId: string): Promise<void> {
    const claim = this.extensionClaims.get(characterId);
    if (!claim || claim.socketId !== socketId) {
      return;
    }
    this.extensionClaims.delete(characterId);
    this.socketToCharacter.delete(socketId);
    this.extensionStates.delete(characterId);
    this.clearConnectGates(characterId);
    console.log(`[helper] extension release ${characterId}`);
  }

  private clearConnectGates(characterId: string): void {
    this.backoffUntil.delete(characterId);
    this.cooldownUntil.delete(characterId);
    this.failCount.delete(characterId);
  }

  /** Refresh party online flags for owned sessions (no auto-connect). */
  private async syncOwnedParties(): Promise<void> {
    await Promise.all(
      [...this.owned.values()].map((s) => s.syncPartyContext().catch(() => undefined))
    );
    await this.emitParties();
  }

  private async emitParties(): Promise<void> {
    const parties = await this.listParties();
    this.eventBus.emit({ event: "parties", data: parties });
  }
}

function normalizeMastersPatch(
  raw: Record<string, unknown>
): Partial<Record<FeatureId, boolean>> {
  const patch: Partial<Record<FeatureId, boolean>> = {};
  for (const id of FEATURE_TAB_ORDER) {
    if (typeof raw[id] === "boolean") {
      patch[id] = raw[id] as boolean;
    }
  }
  return patch;
}
