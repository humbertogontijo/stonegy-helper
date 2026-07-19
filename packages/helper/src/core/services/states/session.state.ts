import { ReceiveMessageTypes } from "../../../protocol";
import { parseCharacterTaskFields } from "../../../domain/tasks";
import { parseLastStaminaUpdateAt, parseStaminaConfig, reanchorStamina } from "../../../stamina";
import { readId } from "../../../domain/party/fields";
import type { GameEvent } from "../../events/types";
import { asStonegyMessage } from "../../events/normalize";
import type { CharacterProjection } from "../../projections/types";
import type { StaminaConfig } from "../../../stamina";
import { DomainState, type ServiceContext } from "../service";
import type { DomainStateId } from "../types";
import type { PartyState } from "./party.state";

function defaultCharacter(): CharacterProjection {
  return {
    characterName: null,
    characterId: null,
    characterVocation: null,
    level: null,
    goldCoins: null,
    staminaMs: null,
    lastStaminaUpdateAt: null,
    staminaConfig: null,
    finishedTasks: [],
    finishedQuests: [],
  };
}

export class SessionState extends DomainState {
  readonly id: DomainStateId = "sessionState";

  private character: CharacterProjection = defaultCharacter();

  constructor(
    ctx: ServiceContext,
    private readonly party: PartyState
  ) {
    super(ctx);
  }

  get characterId(): string | null {
    return this.character.characterId;
  }

  get characterName(): string | null {
    return this.character.characterName;
  }

  get characterVocation(): string | null {
    return this.character.characterVocation;
  }

  get level(): number | null {
    return this.character.level;
  }

  get goldCoins(): number | null {
    return this.character.goldCoins;
  }

  get staminaMs(): number | null {
    return this.character.staminaMs;
  }

  get finishedTasks(): number[] {
    return this.character.finishedTasks;
  }

  get finishedQuests(): number[] {
    return this.character.finishedQuests;
  }

  setGoldCoins(goldCoins: number): void {
    this.character = { ...this.character, goldCoins };
  }

  setFinishedTasks(finishedTasks: number[]): void {
    this.character = { ...this.character, finishedTasks };
  }

  setFinishedQuests(finishedQuests: number[]): void {
    this.character = { ...this.character, finishedQuests };
  }

  mergeCharacterFields(fields: {
    characterId?: string | null;
    characterName?: string | null;
    level?: number | null;
    characterVocation?: string | null;
  }): void {
    this.character = {
      ...this.character,
      characterId: fields.characterId ?? this.character.characterId,
      characterName: fields.characterName ?? this.character.characterName,
      level: fields.level ?? this.character.level,
      characterVocation: fields.characterVocation ?? this.character.characterVocation,
    };
  }

  projection(): CharacterProjection {
    return { ...this.character };
  }

  applyCharacterPatch(patch: Partial<CharacterProjection>): void {
    this.character = { ...this.character, ...patch };
  }

  private staminaSlice(activeHuntId: number | null) {
    return {
      character: {
        staminaMs: this.character.staminaMs,
        lastStaminaUpdateAt: this.character.lastStaminaUpdateAt,
        staminaConfig: this.character.staminaConfig,
      },
      party: { partyStatus: this.party.partyStatus },
      hunt: { activeHuntId },
    };
  }

  private applyStaminaAnchor(activeHuntId: number | null): void {
    const anchor = reanchorStamina(this.staminaSlice(activeHuntId));
    if (anchor) {
      this.character = { ...this.character, ...anchor };
    }
  }

  async onEvent(event: GameEvent): Promise<void> {
    if (event.kind === "gold_balance") {
      this.character = { ...this.character, goldCoins: event.data.goldCoins };
      return;
    }

    if (event.kind === "inventory_snapshot") {
      this.character = { ...this.character, goldCoins: event.data.goldCoins };
      return;
    }

    const message = asStonegyMessage(event);
    if (!message) {
      return;
    }

    if (message.type === ReceiveMessageTypes.SESSION_BOOTSTRAP) {
      const character = message.data?.character;
      const taskFields = parseCharacterTaskFields(character);
      this.character = {
        ...this.character,
        characterName:
          typeof character?.nickname === "string"
            ? character.nickname
            : this.character.characterName,
        characterId: readId(character?.id) ?? this.character.characterId,
        characterVocation:
          typeof character?.vocation === "string"
            ? character.vocation
            : this.character.characterVocation,
        staminaMs:
          typeof character?.stamina === "number" ? character.stamina : this.character.staminaMs,
        lastStaminaUpdateAt:
          parseLastStaminaUpdateAt(character?.lastStaminaUpdate) ??
          this.character.lastStaminaUpdateAt,
        staminaConfig:
          (parseStaminaConfig(message.data?.staminaConfig) as StaminaConfig | null) ??
          this.character.staminaConfig,
        finishedTasks: taskFields.finishedTasks ?? this.character.finishedTasks,
        finishedQuests: taskFields.finishedQuests ?? this.character.finishedQuests,
      };
      // Quest tasks from session bootstrap are handled by TasksState
      return;
    }

    if (message.type === ReceiveMessageTypes.UPDATE_LEVELINFO) {
      this.character = {
        ...this.character,
        level:
          typeof message.data?.level === "number" ? message.data.level : this.character.level,
        goldCoins:
          typeof message.data?.goldCoins === "number"
            ? message.data.goldCoins
            : this.character.goldCoins,
      };
      return;
    }

    if (message.type === ReceiveMessageTypes.PARTY_SNAPSHOT) {
      const fields = this.party.getCharacterFieldsFromParty();
      this.mergeCharacterFields(fields);
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_BOOTSTRAP) {
      const hunt = message.data?.hunt;
      // Reanchor against pre-transition consuming state
      this.applyStaminaAnchor(hunt == null ? null : typeof hunt.id === "number" ? hunt.id : 1);
      return;
    }

    if (message.type === ReceiveMessageTypes.HUNT_FINISHED) {
      const depleted = message.data?.reason === "stamina_depleted";
      if (depleted) {
        this.character = {
          ...this.character,
          staminaMs: 0,
          lastStaminaUpdateAt: Date.now(),
        };
      } else {
        this.applyStaminaAnchor(null);
      }
      return;
    }

    if (
      message.type === ReceiveMessageTypes.TRAINING_BOOTSTRAP ||
      message.type === ReceiveMessageTypes.TRAINING_FINISHED
    ) {
      this.applyStaminaAnchor(null);
    }
  }

  snapshot(): Record<string, unknown> {
    return this.projection() as unknown as Record<string, unknown>;
  }
}
