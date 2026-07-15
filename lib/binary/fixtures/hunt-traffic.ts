/**
 * Binary frames captured from a hunt reload HAR (stonegy-online.com.har).
 * JSON auth/bootstrap context is in the same capture.
 */
export const huntTrafficFixtures = {
  /** Unsupported short analyzer tick — decode returns null. */
  huntLootAnalyzerTick: "U0cFCgGXJAEAAAAAAAAAAAA=",

  /** Ground item drops during a hunt. */
  huntLootItemDrops:
    "U0cFCgG1JAEAAAAAAAIAJAAwMTlmM2Y4Mi0xYmY4LTcwMDQtYmZiNy03NzdjZGU4NWU3OTgnAAAAAQAAAAIAAAAAACQAMDE5ZjNmODItMWJmOC03MDA0LWJmYjctNzkzN2JlZTZiYjU5HQMAAAEAAAACAAAAAAAAAA==",

  /** Party/hunt entity UUID roster — not monster loot. */
  huntEntityUuidList:
    "U0cFCgAAAAYAJAAwMTlmNDhmMC1hMmUzLTczM2UtOTIxZC1kYWIxOWQzNDVmOWMkADAxOWY0OGRhLTM1N2MtNzMzZC1hZmUyLTZiYTViNTRlYWYyOSQAMDE5ZjQ4ZDItZTc2MC03MzNkLWE0NDUtMzk4MDdmNWIwYWU1JAAwMTlmNDhkMi02ZTQzLTczM2QtYTM4NC02NDg0MzczNTI4NWUkADAxOWY0OGQwLTI4ZWItNzMzZC05ZmZhLTgxMmJlM2Q4MzAyZCQAOTYyMDQzZTItYjVhNy00MTQwLThhYmEtNjZmYWJhZTVkZjc0",

  /** Short combat hit — 52 damage, attacker 1 → target 2. */
  combatDamage52: "U0cFGQABAAIEBjQAAAAB",

  /** Compact type-0x09 hit — 0 damage, attacker 1 → target 1. */
  compactCombatDamage0: "U0cFCQEBAQQGAAA=",

  /** Session stamina snapshot near max (12h cap). */
  sessionMetric: "U0cFFnxlAAC9kQIAQSwCAA==",

  /** Player vitals block sent right after hunt reconnect. */
  playerUpdate: "U0cFFH0AAAADAAQAAADAjwAAAAAAAAIAAQEAbAAAAFQuAAAAAAAAAQABAQB9AAAANNgMAAAAAAAEAAMBAAIAAwA=",

  /** exura heal speech line. */
  speechExura: "U0cFFwEAAgEAAAAFAGV4dXJh",

  /** Front Sweep on Soul-Broken Harbinger — 7 targets, no timestamp. */
  abilityCastFrontSweep:
    "U0cFGQILAEZyb250IFN3ZWVwFQBTb3VsLUJyb2tlbiBIYXJiaW5nZXIHAACEBYwAAAABeA8IPgAA/8wCAAABAQABAIQFBgAAAAEBBAf2GgAAAQEEB5gNBAACAQQHmA38AAMBBAeYDf4ABA==",

  /** Front Sweep with 8 targets — last target omits the trailing byte. */
  abilityCastFrontSweepEightTargets:
    "U0cFGQILAEZyb250IFN3ZWVwFQBTb3VsLUJyb2tlbiBIYXJiaW5nZXIIAACEBXwAAAABAIQFjQAAAAF4DwjSAAEBCQAAAAEBAAEAhAUVAAAAAQEEB/YaAAABAQQHmA0EAAIBBAeYDfwAAwEEB5gN/gAE",

  /**
   * Batched multi-cast frame — bundles two caster names and two spell names.
   * The trailing target/effect region does not match any known stride, so the
   * decoder preserves the strings and keeps the remaining bytes as rawTail.
   */
  abilityCastBatchedMultiCast:
    "U0cFGQQOAEZpZXJjZSBCZXJzZXJrFQBTb3VsLUJyb2tlbiBIYXJiaW5nZXIKAFRlcnJhIFdhdmUPAEdyZWF0IEZpcmUgV2F2ZRAAAIQFggAAAAECBAaiAPz/AgIEBksDAAABAIQFdgAAAAF4DwgjAf8BFwCJAwEBAAF4Dwg1Af//GQD2AwEBAAEAhAUhAAAAAXgPAQsC//8ZAOsBAwECAXgPAc4B/wEXALsBAwECAXgPArsB/wEXAAAABAEDAXgPArAB//8ZADsABAEDAQCEBRQABAAEAQQHCBMAAAEBBAeYDfz/AgEEB5gN/AADAQQHmA0EAAQ=",

  /** Another batched multi-cast frame (Berserk / Silencer / Avalanche Rune). */
  abilityCastBatchedMultiCast2:
    "U0cFGQMHAEJlcnNlcmsIAFNpbGVuY2VyDgBBdmFsYW5jaGUgUnVuZQYAeA8IjwAAAT0ACgABAQABeA8DCgAAAT0AAAACAQIBAQQH9AsAAAEBBAf0CwQBAgEEB/QL/AADAQQH9AsEAAQ=",

  /** Elvish Bow auto-attack — same payload as type 0x19, observed on wire as type 0x12. */
  abilityCastElvishBow:
    "U0cFEgMLAEF1dG8tQXR0YWNrGQAvaW52ZW50b3J5L0VsdmlzaF9Cb3cuZ2lmCgBDYXJuaXBoaWxhAgAAhAWpAAAAAfgPCGAAAAFPAAsAAQIAAQI=",

  /** Support spell cast (Utito Tempo) — 4-byte header + consecutive strings. */
  abilityCastSupportUtitoTempo:
    "U0cFEgEBAQALAFVUSVRPX1RFTVBPCwBVdGl0byBUZW1wbw4AQmxvb2RfUmFnZS5naWahHQAAAAAAAQHgLgAADAAAAAcAAAANAAAAIAAAACwBAACmAAAA",

  /** XP gain pulse during the hunt. */
  xpGain: "U0cFFX0AAACy8RUAAAAAAAQAAwEAAgADAA==",

  /** Full hunt analyzer snapshot observed during a party hunt reload. */
  huntAnalyzerSnapshot:
    "U0cFBQEAp0t3R58BAACnS3dHnwEAAJV/SgAAAAAAPRNZAQAAAACokw4BAAAAAMpDPQAAAAAAfywtAAAAAACMhEkAAAAAAGU1NgAAAAAANuckAAAAAACZFAAAAAAAADIGEAAAAAAA/QUAAAAAAAADAHsAAABSAgAAfAAAADcCAAB9AAAAdAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADC+BQAAAAAA0EH6//////8AAAAAAAAAAAw8BAAAAAAA88P7//////8AAB8AxQIAAMQAAAD0AAAATwAAACEBAAA6AAAASQAAAC8AAAC8AgAAJQAAALMAAAAfAAAAvgIAAB8AAAA6AAAAHQAAALMCAAAaAAAASgAAABkAAAC9AgAAGQAAAEsBAAAYAAAArAAAABQAAABYAAAAEAAAAMACAAAQAAAAqgAAAA8AAACyAgAADwAAABwBAAAMAAAAvwIAAAoAAACTAgAACQAAAJUCAAAJAAAAeAAAAAgAAABWAAAABwAAAEgCAAAFAAAASwAAAAQAAAADAAAAAwAAADsBAAADAAAAggEAAAMAAAC6AAAAAgAAAEwCAAACAAAA1wAAAAEAAAABJAA2N2ViYTU2OS1jYjcxLTQ1MjgtOTJlYi02YzJmMWQ2NWU1M2QHAFBhcnRuZXLywBsAAAAAAFK6EgAAAAAAoAYJAAAAAACoQQIAAAAAAAAAAAAAAAAABAAkAGQxYmMyODI5LTUzZWYtNDMwZC1iZWU4LWFkZDBiNTk0NWQ3OAUARGVsdGEAEigWAAAAAAD+QQUAAAAAABTmEAAAAAAAlFvx//////8AAAAAAAAAAGykDgAAAAAAJABhY2E2Y2VkZi1jM2M5LTQyODktYmFmMS1mYTIzY2M0YWJhNjcFAEd1aWxkAAAAAAAAAAAAsJQEAAAAAABQa/v//////1jWBgAAAAAAWNYGAAAAAAAAAAAAAAAAACQAYWFhYWFhYWEtYWFhYS00YWFhLThhYWEtYWFhYWFhYWFhYWFhDgBNZW1iZXIgUHJpbWFyeQAAAAAAAAAAADC+BQAAAAAA0EH6///////Y/wcAAAAAANj/BwAAAAAAAAAAAAAAAAAkADY3ZWJhNTY5LWNiNzEtNDUyOC05MmViLTZjMmYxZDY1ZTUzZAcAUGFydG5lcgHgmAUAAAAAAHQlAwAAAAAAbHMCAAAAAAA8zv///////wAAAAAAAAAAAAAAAAAAAAA=",

  /** Compact-layout hunt analyzer snapshot with solo loot and party totals. */
  huntAnalyzerSnapshotCompact:
    "U0cFBQEAYzvlSJ8BAABjO+VInwEAAL2UDQAAAAAAS8hJAQAAAACOMzwBAAAAAEJkBAAAAAAAVMMRAAAAAAAcRQUAAAAAAMtQFQAAAAAAeZMBAAAAAADwDQAAAAAAAJ0NAAAAAAAAhwAAAAAAAAACAFoAAABTAAAAWwAAADQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADTkAAAAAAAAC1v////////AAAAAAAAAADGSQIAAAAAADm2/f//////AAATAFUCAAApAAAAhwEAABUAAACGAQAAEAAAABsBAAAOAAAAoQAAAAsAAAAcAQAACAAAAKAAAAAHAAAAiwEAAAcAAACMAQAABgAAAIkBAAAEAAAAzQAAAAMAAAA8AQAAAwAAAIoBAAACAAAAjQEAAAIAAACAAAAAAQAAAJsAAAABAAAAxwAAAAEAAAA2AQAAAQAAAI4BAAABAAAAASQANDQ0NDQ0NDQtNDQ0NC00NDQ0LTg0NDQtNDQ0NDQ0NDQ0NDQ0BQBBbHBoYcQBBQAAAAAAdC4DAAAAAABQ0wEAAAAAANR0AAAAAAAAAAAAAAAAAAAEACQAY2NiNDBlNjktODFiMC00MWI5LThjY2MtY2ZiYzljMTUyMGE4BQBCcmF2bwAAAAAAAAAAAHP4AAAAAAAAjQf///////9HbQEAAAAAAEdtAQAAAAAAAAAAAAAAAAAkADJkNjgzY2Y3LTc0YjUtNDE0OS04MjJiLTE2NDc1MjBiZWJmYQcASGVyb09uZQAAAAAAAAAAANOQAAAAAAAALW////////+nBQEAAAAAAKcFAQAAAAAAAAAAAAAAAAAkAGU2OGUxODhmLTljOTktNDU0ZS04OWFmLTZmOGE4OWE3Mzc0ZQcAQ2hhcmxpZQAAAAAAAAAAAP7xAAAAAAAAAg7////////SZgEAAAAAANJmAQAAAAAAAAAAAAAAAAAkADQ0NDQ0NDQ0LTQ0NDQtNDQ0NC04NDQ0LTQ0NDQ0NDQ0NDQ0NAUAQWxwaGEBxAEFAAAAAAAwswAAAAAAAJROBAAAAAAAQCb8//////8AAAAAAAAAAAAAAAAAAAAA",

  /** Single inventory item grant after npc_claim_starter_item (subType 0). */
  huntLootStarterItemGrant:
    "U0cFCgABACQAMDE5ZjQ3NjgtYjRlZC03MzM0LTk0ODgtYmU0YzE1ZGM5MTUyxAEAAAEAAAACAAAAAAAAAA==",
} as const;

export const expectedHuntEntityUuidList = [
  "019f48f0-a2e3-733e-921d-dab19d345f9c",
  "019f48da-357c-733d-afe2-6ba5b54eaf29",
  "019f48d2-e760-733d-a445-39807f5b0ae5",
  "019f48d2-6e43-733d-a384-64843735285e",
  "019f48d0-28eb-733d-9ffa-812be3d8302d",
  "962043e2-b5a7-4140-8aba-66fabae5df74",
] as const;

export const expectedHuntLootDrops = [
  {
    itemId: 39,
    amount: 1,
    groundUuid: "019f3f82-1bf8-7004-bfb7-777cde85e798",
    flagsA: 2,
    flagsB: 0,
    remainingUnits: 0,
  },
  {
    itemId: 797,
    amount: 1,
    groundUuid: "019f3f82-1bf8-7004-bfb7-7937bee6bb59",
    flagsA: 2,
    flagsB: 0,
    remainingUnits: 0,
  },
] as const;

export const expectedHuntLootStarterItemGrant = {
  itemId: 452,
  amount: 1,
  groundUuid: "019f4768-b4ed-7334-9488-be4c15dc9152",
  flagsA: 2,
  flagsB: 0,
  remainingUnits: 0,
} as const;

export const expectedCombatDamage52 = {
  attackerIndex: 1,
  targetIndex: 2,
  damageKind: 1540,
  amount: 52,
  flag: 1,
} as const;

export const expectedCompactCombatDamage0 = {
  attackerIndex: 1,
  targetIndex: 1,
  damageKind: 1540,
  amount: 0,
  flag: 0,
} as const;

export const expectedPlayerVitals = {
  currentHp: 841780,
  currentMana: 108,
  huntTimeMs: 11860,
} as const;

export const expectedSessionMetric = {
  staminaMs: 43105536,
} as const;

export const expectedHuntAnalyzerSnapshotCompact = {
  totalKills: 135,
  monsterCount: 2,
  primaryMonsterId: 90,
  rawXp: 287_810,
  xp: 345_372,
  suppliesGold: 37_075,
  lootBalanceGold: -37_075,
  monsters: [
    { killCount: 83, monsterId: 91 },
    { killCount: 52, monsterId: 0 },
    { killCount: 0, monsterId: 0 },
  ],
  lootItems: [
    { amount: 41, itemId: 391 },
    { amount: 21, itemId: 390 },
    { amount: 16, itemId: 283 },
    { amount: 14, itemId: 161 },
    { amount: 11, itemId: 284 },
    { amount: 8, itemId: 160 },
    { amount: 7, itemId: 395 },
    { amount: 7, itemId: 396 },
    { amount: 6, itemId: 393 },
    { amount: 4, itemId: 205 },
    { amount: 3, itemId: 316 },
    { amount: 3, itemId: 394 },
    { amount: 2, itemId: 397 },
    { amount: 2, itemId: 128 },
    { amount: 1, itemId: 155 },
    { amount: 1, itemId: 199 },
    { amount: 1, itemId: 310 },
    { amount: 1, itemId: 398 },
  ],
  partyMembers: ["Alpha", "Bravo", "HeroOne", "Charlie"],
  partyLeaderTotals: {
    name: "Alpha",
    lootTotalValue: 328_132,
    suppliesGold: 208_500,
    profitGold: 119_632,
  },
} as const;

export const expectedAbilityCastFrontSweep = {
  strings: ["Front Sweep", "Soul-Broken Harbinger"],
  targetCount: 7,
  timestamp: 0,
  targets: [
    { attackerIndex: 0, effectType: 132, paramA: 35845, paramB: 0, paramC: 256, tail: 120 },
    { attackerIndex: 15, effectType: 8, paramA: 62, paramB: 65280, paramC: 716, tail: 0 },
    { attackerIndex: 0, effectType: 1, paramA: 1, paramB: 1, paramC: 1412, tail: 6 },
    { attackerIndex: 0, effectType: 0, paramA: 256, paramB: 1025, paramC: 62983, tail: 26 },
    { attackerIndex: 0, effectType: 0, paramA: 257, paramB: 1796, paramC: 3480, tail: 4 },
    { attackerIndex: 0, effectType: 2, paramA: 1025, paramB: 38919, paramC: 64525, tail: 0 },
    { attackerIndex: 3, effectType: 1, paramA: 1796, paramB: 3480, paramC: 254, tail: 4 },
  ],
} as const;

export const expectedAbilityCastBatchedMultiCast = {
  strings: ["Fierce Berserk", "Soul-Broken Harbinger", "Terra Wave", "Great Fire Wave"],
  /** Length of the undecoded target/effect region preserved on rawTail. */
  rawTailLength: 172,
} as const;

export const expectedSupportAbilityCastUtitoTempo = {
  strings: ["UTITO_TEMPO", "Utito Tempo", "Blood_Rage.gif"],
  effectTail: {
    fieldA: 161,
    fieldB: 29,
    fieldC: 0,
    byteD: 1,
    byteE: 1,
    durationMs: 12000,
    values: [12, 7, 13, 32, 300, 166],
  },
} as const;
