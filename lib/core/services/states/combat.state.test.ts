import { describe, expect, it } from "vitest";
import { decodeBinaryMessage } from "../../../binary/decode";
import { huntTrafficFixtures } from "../../../binary/fixtures/hunt-traffic";
import { ReceiveMessageTypes } from "../../../protocol";
import { normalizeWireMessage } from "../../events/normalize";
import type { GameEvent } from "../../events/types";
import { CombatState } from "./combat.state";
import type { ServiceContext } from "../service";
import type { SessionState } from "./session.state";

function stubContext(): ServiceContext {
  return {
    session: {} as ServiceContext["session"],
    settings: {} as ServiceContext["settings"],
    locks: { runExclusive: async (_key, fn) => fn() } as ServiceContext["locks"],
    emit: () => undefined,
    isMasterEnabled: () => true,
  };
}

describe("CombatState", () => {
  it("maps combat slots to names from hunt:update_players runtimePlayerId", async () => {
    const sessionState = {
      characterId: "me-1",
      characterName: "HeroOne",
    } as SessionState;
    const combat = new CombatState(stubContext(), sessionState);

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
        data: {
          players: [
            { runtimePlayerId: 1, playerId: "me-1", name: "HeroOne" },
            { runtimePlayerId: 2, playerId: "ally-1", name: "Partner" },
          ],
        },
      },
      raw: "{}",
    });

    const damageEvents = normalizeWireMessage({
      direction: "receive",
      opcode: 2,
      data: huntTrafficFixtures.combatFloatFire700,
    });
    await combat.onEvent(damageEvents[0] as GameEvent);

    const projection = combat.projection();
    expect(projection.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityIndex: 1,
          name: "HeroOne",
          takenSum: 700,
          dealtSum: 0,
        }),
      ])
    );
    expect(projection.entities.find((row) => row.entityIndex === 1)?.takenSum).toBe(700);
  });

  it("ignores heals and mana restores for taken damage", async () => {
    const combat = new CombatState(stubContext());

    const decoded = decodeBinaryMessage(huntTrafficFixtures.combatFloatHeal52);
    if (decoded.body.kind !== "combat_float") {
      throw new Error("expected combat_float");
    }

    await combat.onEvent({
      kind: "combat_float",
      direction: "receive",
      data: decoded.body.data,
      raw: huntTrafficFixtures.combatFloatHeal52,
    });

    expect(combat.projection().entities).toEqual([]);
  });

  it("counts magic-shield absorption as taken damage", async () => {
    const combat = new CombatState(stubContext());

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
        data: {
          players: [{ runtimePlayerId: 3, name: "AllyA" }],
        },
      },
      raw: "{}",
    });

    await combat.onEvent({
      kind: "combat_float",
      direction: "receive",
      data: {
        hits: [
          {
            category: 4,
            kind: 0x0204,
            amount: 269,
            tileX: -3,
            tileY: 0,
            runtimePlayerId: 3,
          },
          {
            category: 4,
            kind: 0x0904,
            amount: 100,
            tileX: -3,
            tileY: 0,
            runtimePlayerId: 3,
          },
        ],
      },
      raw: "",
    });

    const allyA = combat.projection().entities.find((row) => row.name === "AllyA");
    expect(allyA?.takenSum).toBe(369);
    expect(allyA?.takenByElement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Fire", amount: 269 }),
        expect.objectContaining({ label: "Life Drain", amount: 100 }),
      ])
    );
  });

  it("labels unknown runtimePlayerIds as Entity #N", async () => {
    const combat = new CombatState(stubContext());

    const decoded = decodeBinaryMessage(huntTrafficFixtures.combatFloatFire700);
    if (decoded.body.kind !== "combat_float") {
      throw new Error("expected combat_float");
    }

    await combat.onEvent({
      kind: "combat_float",
      direction: "receive",
      data: decoded.body.data,
      raw: huntTrafficFixtures.combatFloatFire700,
    });

    expect(combat.projection().entities.find((row) => row.entityIndex === 1)?.name).toBe(
      "Entity #1"
    );
  });

  it("attributes spell_cast monster hits through the frame's actor list", async () => {
    const combat = new CombatState(stubContext());

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
        data: {
          players: [
            { runtimePlayerId: 2, name: "AllyC" },
            { runtimePlayerId: 3, name: "AllyD" },
            { runtimePlayerId: 4, name: "AllyB" },
          ],
        },
      },
      raw: "{}",
    });

    const events = normalizeWireMessage({
      direction: "receive",
      opcode: 2,
      data: huntTrafficFixtures.spellCastAutoAttackHits,
    });
    expect(events[0]?.kind).toBe("spell_cast");
    await combat.onEvent(events[0] as GameEvent);

    const projection = combat.projection();
    // Bow user (id 2) lands 4×65 physical arrows; sword (3) grazes for 1;
    // staff (4) hits for 90 energy. Nothing lands on the unknown-attacker row.
    expect(projection.entities.find((row) => row.name === "AllyC")?.dealtSum).toBe(260);
    expect(projection.entities.find((row) => row.name === "AllyD")?.dealtSum).toBe(1);
    const allyB = projection.entities.find((row) => row.name === "AllyB");
    expect(allyB?.dealtSum).toBe(90);
    expect(allyB?.dealtByElement).toEqual([
      expect.objectContaining({ label: "Energy", amount: 90 }),
    ]);
    expect(projection.entities.find((row) => row.entityIndex === 0)).toBeUndefined();
  });

  it("attributes auto_attack monster hits to the inline attacker id", async () => {
    const combat = new CombatState(stubContext());

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
        data: {
          players: [
            { runtimePlayerId: 1, name: "AllyE" },
            { runtimePlayerId: 3, name: "HeroOne" },
            { runtimePlayerId: 4, name: "AllyA" },
          ],
        },
      },
      raw: "{}",
    });

    const events = normalizeWireMessage({
      direction: "receive",
      opcode: 2,
      data: huntTrafficFixtures.autoAttackMonsterHits,
    });
    expect(events[0]?.kind).toBe("auto_attack");
    await combat.onEvent(events[0] as GameEvent);

    const projection = combat.projection();
    const allyE = projection.entities.find((row) => row.name === "AllyE");
    expect(allyE?.dealtSum).toBe(100);
    expect(allyE?.dealtByElement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Physical", amount: 13 }),
        expect.objectContaining({ label: "Energy", amount: 87 }),
      ])
    );
    expect(projection.entities.find((row) => row.name === "HeroOne")?.dealtSum).toBe(3);
    expect(projection.entities.find((row) => row.name === "AllyA")?.dealtSum).toBe(67);
    expect(projection.entities.find((row) => row.entityIndex === 0)).toBeUndefined();
  });

  it("credits thunderstorm energy to the 0x0f casters, not other party members", async () => {
    const combat = new CombatState(stubContext());

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
        data: {
          players: [
            { runtimePlayerId: 1, name: "AllyF" },
            { runtimePlayerId: 2, name: "AllyC" },
            { runtimePlayerId: 3, name: "AllyD" },
            { runtimePlayerId: 4, name: "AllyB" },
          ],
        },
      },
      raw: "{}",
    });

    const events = normalizeWireMessage({
      direction: "receive",
      opcode: 2,
      data: huntTrafficFixtures.spellCastThunderstormTerraWave,
    });
    expect(events[0]?.kind).toBe("spell_cast");
    await combat.onEvent(events[0] as GameEvent);

    const projection = combat.projection();
    // Thunderstorm Rune casters are ids 2 and 3; Terra Wave (Earth) is id 4.
    for (const name of ["AllyC", "AllyD"] as const) {
      const row = projection.entities.find((entity) => entity.name === name);
      const energy = row?.dealtByElement.find((entry) => entry.label === "Energy");
      expect(energy?.amount ?? 0).toBeGreaterThan(0);
    }
    const allyB = projection.entities.find((row) => row.name === "AllyB");
    expect(allyB?.dealtByElement.find((entry) => entry.label === "Earth")?.amount).toBeGreaterThan(
      0
    );
    expect(allyB?.dealtByElement.find((entry) => entry.label === "Energy")).toBeUndefined();
    const allyF = projection.entities.find((row) => row.name === "AllyF");
    expect(allyF?.dealtSum ?? 0).toBe(0);
  });

  it("records embedded player damage rows from spell_cast as taken damage", async () => {
    const combat = new CombatState(stubContext());

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
        data: {
          players: [{ runtimePlayerId: 1, name: "HeroOne" }],
        },
      },
      raw: "{}",
    });

    const events = normalizeWireMessage({
      direction: "receive",
      opcode: 2,
      data: huntTrafficFixtures.spellCastAutoAttackHits,
    });
    expect(events[0]?.kind).toBe("spell_cast");
    if (events[0]?.kind !== "spell_cast") {
      throw new Error("expected spell_cast");
    }

    const expectedTaken = events[0].data.combatHits
      .filter(
        (hit) =>
          hit.target === "player" &&
          hit.category === 0 &&
          hit.school !== 5 &&
          !hit.isRestore &&
          hit.runtimePlayerId === 1
      )
      .reduce((sum, row) => sum + row.amount, 0);
    expect(expectedTaken).toBeGreaterThan(0);

    await combat.onEvent(events[0] as GameEvent);

    const projection = combat.projection();
    expect(projection.entities.find((row) => row.entityIndex === 1)?.takenSum).toBe(
      expectedTaken
    );
  });

  it("keeps unattributed dealt damage and unmapped taken targets visible", async () => {
    const combat = new CombatState(stubContext());

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: {
        type: ReceiveMessageTypes.HUNT_UPDATE_PLAYERS,
        data: {
          players: [
            { runtimePlayerId: 1, name: "AllyE" },
            { runtimePlayerId: 2, name: "HeroOne" },
          ],
        },
      },
      raw: "{}",
    });

    await combat.onEvent({
      kind: "spell_cast",
      direction: "receive",
      data: {
        strings: ["Berserk"],
        actors: [],
        combatHits: [
          {
            target: "monster",
            tag: 0xf8,
            kind: 0x0800,
            school: 8,
            amount: 672,
            tileX: 0,
            tileY: 0,
            monsterId: 140,
            remainingHp: 100,
            attackerRuntimePlayerId: undefined,
          },
          {
            target: "player",
            tag: 0x80,
            category: 0,
            kind: 0x0100,
            school: 1,
            amount: 500,
            tileX: 0,
            tileY: 0,
            runtimePlayerId: 7,
            isRestore: false,
          },
        ],
      },
      raw: "",
    });

    const projection = combat.projection();
    expect(projection.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Unknown party attacker",
          dealtSum: 672,
          takenSum: 0,
        }),
        expect.objectContaining({ name: "Entity #7", takenSum: 500 }),
      ])
    );
  });

  it("resets on hunt_bootstrap", async () => {
    const combat = new CombatState(stubContext());
    const decoded = decodeBinaryMessage(huntTrafficFixtures.combatFloatFire700);
    if (decoded.body.kind !== "combat_float") {
      throw new Error("expected combat_float");
    }

    await combat.onEvent({
      kind: "combat_float",
      direction: "receive",
      data: decoded.body.data,
      raw: huntTrafficFixtures.combatFloatFire700,
    });
    expect(combat.projection().entities).toHaveLength(1);

    await combat.onEvent({
      kind: "json",
      direction: "receive",
      message: { type: ReceiveMessageTypes.HUNT_BOOTSTRAP, data: { huntId: 1 } },
      raw: "{}",
    });
    expect(combat.projection().entities).toEqual([]);
  });
});
