import { ReceiveMessageTypes } from "../../../protocol";
import {
  abilityCombatHitsToDealt,
  abilityCombatHitsToTaken,
} from "../../../binary/ability-combat-hits";
import {
  createDamageAnalyzerState,
  projectDamageEntities,
  recordHits,
  resetDamageAnalyzer,
  setEntityName,
  type DamageAnalyzerState,
  type DamageHitInput,
} from "../../../domain/combat/damage-analyzer";
import { combatFloatSchool, isCombatFloatTakenDamage } from "../../../protocol-messages";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { CombatProjection } from "../../projections/types";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";
import type { SessionState } from "./session.state";

/** Combat slot indices are runtimePlayerId values from hunt:update_players. */
function readRuntimePlayerId(player: Record<string, unknown>): number | null {
  const value = player.runtimePlayerId ?? player.runtime_player_id;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPlayerId(player: Record<string, unknown>): string | null {
  for (const key of ["playerId", "id", "characterId"] as const) {
    const value = player[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readPlayerName(player: Record<string, unknown>): string | null {
  for (const key of ["name", "nickname", "characterName", "displayName"] as const) {
    const value = player[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export class CombatState extends DomainState {
  readonly id: DomainStateId = "combatState";

  private analyzer: DamageAnalyzerState = createDamageAnalyzerState();
  /** runtimePlayerId / combat slot → display name */
  private namesByIndex = new Map<number, string>();

  constructor(
    ctx: ServiceContext,
    private readonly sessionState?: SessionState
  ) {
    super(ctx);
  }

  projection(): CombatProjection {
    // Keep every runtime id the analyzer saw — including unmapped Entity #N
    // rows. Filtering to the party roster hid mis-attributed dealt damage.
    return {
      entities: projectDamageEntities(this.analyzer),
      startedAt: this.analyzer.startedAt,
      updatedAt: this.analyzer.updatedAt,
    };
  }

  reset(): void {
    this.analyzer = resetDamageAnalyzer(this.analyzer);
    this.namesByIndex.clear();
  }

  private applyKnownNames(): void {
    for (const [index, name] of this.namesByIndex) {
      this.analyzer = setEntityName(this.analyzer, index, name);
    }
  }

  private rememberName(index: number, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.namesByIndex.set(index, trimmed);
    this.analyzer = setEntityName(this.analyzer, index, trimmed);
  }

  private ingestHuntPlayers(players: unknown[]): void {
    const characterId = this.sessionState?.characterId ?? null;
    const characterName = this.sessionState?.characterName ?? null;

    for (const entry of players) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const player = entry as Record<string, unknown>;
      const runtimeId = readRuntimePlayerId(player);
      if (runtimeId == null) {
        continue;
      }

      const name =
        readPlayerName(player) ??
        (characterId && readPlayerId(player) === characterId ? characterName : null);
      if (name) {
        this.rememberName(runtimeId, name);
      }
    }
  }

  private recordAnalyzerHits(hits: readonly DamageHitInput[]): void {
    if (hits.length === 0) {
      return;
    }
    this.applyKnownNames();
    this.analyzer = recordHits(this.analyzer, hits, Date.now());
    this.applyKnownNames();
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind === "combat_float") {
      this.recordAnalyzerHits(
        event.data.hits.map((hit) => ({
          runtimePlayerId: hit.runtimePlayerId,
          amount: hit.amount,
          asTaken: isCombatFloatTakenDamage(hit),
          element: combatFloatSchool(hit.kind),
        }))
      );
      return;
    }

    if (event.kind === "spell_cast" || event.kind === "auto_attack") {
      // Monster rows carry exact attribution: spell_cast rows reference the
      // frame's actor list, auto_attack rows name the attacker inline.
      const dealt: DamageHitInput[] = abilityCombatHitsToDealt(
        event.data.combatHits
      ).map((hit) => ({
        runtimePlayerId: hit.runtimePlayerId,
        amount: hit.amount,
        asDealt: true,
        element: hit.school,
      }));
      // Player float rows bundled into cast frames are HP hits that are not
      // re-sent as combat_float — without them taken damage is undercounted.
      const taken: DamageHitInput[] = abilityCombatHitsToTaken(event.data.combatHits).map(
        (hit) => ({
          runtimePlayerId: hit.runtimePlayerId,
          amount: hit.amount,
          asTaken: true,
          element: hit.school,
        })
      );
      this.recordAnalyzerHits([...dealt, ...taken]);
      return;
    }

    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_UPDATE_PLAYERS) {
      const players = message.data?.players;
      if (Array.isArray(players)) {
        this.ingestHuntPlayers(players);
      }
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP) {
      this.reset();
      // Bootstrap often embeds the initial player roster.
      const nestedPlayers =
        (message.data as { players?: unknown[] } | undefined)?.players ??
        (message.data?.hunt as { players?: unknown[] } | null | undefined)?.players;
      if (Array.isArray(nestedPlayers)) {
        this.ingestHuntPlayers(nestedPlayers);
      }
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
