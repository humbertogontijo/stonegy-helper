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

  /** Type 0x19 disc-0 combat_float — HP heal 52 on runtimePlayerId 1 at (0,0). */
  combatFloatHeal52: "U0cFGQABAAIEBjQAAAAB",

  /** Type 0x19 disc-0 combat_float — mana restore + two HP heals. */
  combatFloatMultiHit: "U0cFGQADAACEBb0A/gACAgQGUQH+AAICBAbMAwAAAQ==",

  /** Type 0x19 disc-0 combat_float — fire damage 700 on runtimePlayerId 1 at (0,0). */
  combatFloatFire700: "U0cFGQABAAAEArwCAAAB",

  /** Type 0x1c spell_cast — Auto-Attack with monster combat hits (HAR Asura Vaults). */
  spellCastAutoAttackHits:
    "U0cFHAYLAEF1dG8tQXR0YWNrHgAvaW52ZW50b3J5L015Y29sb2dpY2FsX0Jvdy5naWYTAFRydWUgRGF3bmZpcmUgQXN1cmETAFRydWUgTWlkbmlnaHQgQXN1cmEaAC9pbnZlbnRvcnkvU3Bpa2VfU3dvcmQuZ2lmIgAvaW52ZW50b3J5L0RyZWFtX0Jsb3Nzb21fU3RhZmYuZ2lmAx8CAgABHwMCAAQfBAIABQoAgAACFQAAAAGACAUjAvwABPgACEEAAf+OApoEAAL4AAhBAP//kAIJAwAD+AAIQQAA/5MCcQMAA/gACEEAAQGPAssBAAKACAUaAPz/AvgACAEAAf+OApkEAQL4AARaAAH/jgI/BAICgAAIpgAAAAE=",

  /**
   * Type 0x1c — Thunderstorm Rune + Terra Wave. Energy hits are linked to tanks
   * 1/2 on the wire, but 0x0f actors name player 3 as the Thunderstorm caster.
   */
  spellCastThunderstormTerraWave:
    "U0cFHAQRAFRodW5kZXJzdG9ybSBSdW5lEwBUcnVlIERhd25maXJlIEFzdXJhEwBUcnVlIE1pZG5pZ2h0IEFzdXJhCgBUZXJyYSBXYXZlAw8CAQAPAwEADwQBAyAAgAgFqQEEAAOCAAbgAwAAAYAIBZgAAAAB+AAEiwAB/44CNwcAAfgABIwAAQCNAqYDAAH4AASIAAEBjwLtBQAB+AAEhAAA/5MCKwcAAvgABLUA//+QAiIHAAL4AARmAP8AkgKpAwAB+AAEdwD/AZECQAIAAYAIBT8A/P8C+AAE/QD/AZECQwEBAfgABLkA/wCSAvACAQH4AAT9AP//kAIlBgEC+AAEuQAA/5MCcgYBAvgABA8BAQGPAt4EAQH4AAQqAQEAjQJ8AgEB+AAEowAB/44ClAYBAYAIBR0ABAAD+AABTQEB/44CRwUCAfgAAYMBAQCNAvkAAgH4AAFXAgEBjwKHAgIB+AABQAIA/5MCMgQCAvgAAR4C//+QAgcEAgL4AAExAv8AkgK/AAIB+AABQwH/AZECAAACAYEAB78iAAABgQAHXxX8/wKBAAeFEQQAA4EAB4UR/AAEgAAIegAAAAGAAAKWAQAAAQ==",

  /** Type 0x19 auto_attack — Gnome Sword hits with monster combat hits. */
  autoAttackMonsterHits:
    "U0cFGQULAEF1dG8tQXR0YWNrGgAvaW52ZW50b3J5L0dub21lX1N3b3JkLmdpZhMAVHJ1ZSBEYXduZmlyZSBBc3VyYRoAL2ludmVudG9yeS9TcGlrZV9Td29yZC5naWYiAC9pbnZlbnRvcnkvRHJlYW1fQmxvc3NvbV9TdGFmZi5naWYFAPgPCA0AAQCNAi8EAQIAAQL4DwRXAAEAjQIvBAECAAEC+A8IAwABAI0CLAQDAgADAvgPBEMAAQCNAukDBAIABAIABAhyAQAAAQ==",

  /** Type 0x08 cooldown_update — attack cast: spell slot 2 (+4s) + group slot 1 (+2s). */
  cooldownUpdateAttackCast: "U0cFCAEAAQIB3WTwcZ8BAAANXfBxnwEAAA==",

  /** Type 0x08 cooldown_update — potion (group 3, global) + heal group (2 records). */
  cooldownUpdatePotionAndHeal: "U0cFCAIAA/8AoVXwcZ8BAAACAwOhVfBxnwEAAKFV8HGfAQAA",

  /** Type 0x09 — single entity, mask 0x01 (bit0=1540). */
  vitalsSingleBit0: "U0cFCQEBAQQGAAA=",

  /** Type 0x09 — one entity with bits 0+2 (11-byte payload). */
  vitalsBits02: "U0cFCQEBBRoOAAB7AgAA",

  /** Type 0x09 — three entities, mixed masks (27-byte payload). */
  vitalsMixed27: "U0cFCQMDBLANAAABBTsPAABUAwAAAgVHCQAAGgwAAA==",

  /** Type 0x09 — three entities sharing bit4 (31-byte payload). */
  vitalsSharedBit4: "U0cFCQMBETsPAABGAQAAAhSbDAAARgEAAAMUqw8AAEYBAAA=",

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

export const expectedCombatFloatHeal52 = {
  hits: [
    {
      category: 2,
      kind: 1540,
      amount: 52,
      tileX: 0,
      tileY: 0,
      runtimePlayerId: 1,
    },
  ],
} as const;

export const expectedCombatFloatMultiHit = {
  hits: [
    {
      category: 0,
      kind: 1412,
      amount: 189,
      tileX: -2,
      tileY: 0,
      runtimePlayerId: 2,
    },
    {
      category: 2,
      kind: 1540,
      amount: 337,
      tileX: -2,
      tileY: 0,
      runtimePlayerId: 2,
    },
    {
      category: 2,
      kind: 1540,
      amount: 972,
      tileX: 0,
      tileY: 0,
      runtimePlayerId: 1,
    },
  ],
} as const;

export const expectedCooldownUpdateAttackCast = {
  records: [
    {
      groupId: 1,
      slotA: 2,
      slotB: 1,
      expiresAtA: 1784323007709,
      expiresAtB: 1784323005709,
    },
  ],
} as const;

export const expectedCooldownUpdatePotionAndHeal = {
  records: [
    { groupId: 3, slotA: 0xff, slotB: 0, expiresAtA: 1784323003809 },
    {
      groupId: 2,
      slotA: 3,
      slotB: 3,
      expiresAtA: 1784323003809,
      expiresAtB: 1784323003809,
    },
  ],
} as const;

/** Type 0x19 disc-0 combat_float — fire damage 700 on runtimePlayerId 1 at (0,0). HAR Asura Vaults. */
export const expectedCombatFloatFire700 = {
  hits: [
    {
      category: 0,
      kind: 516,
      amount: 700,
      tileX: 0,
      tileY: 0,
      runtimePlayerId: 1,
    },
  ],
} as const;

export const expectedVitalsSingleBit0 = {
  records: [{ entityIndex: 1, fieldMask: 0x01, fields: [{ bit: 0, value: 1540 }] }],
} as const;

export const expectedVitalsBits02 = {
  records: [
    {
      entityIndex: 1,
      fieldMask: 0x05,
      fields: [
        { bit: 0, value: 3610 },
        { bit: 2, value: 635 },
      ],
    },
  ],
} as const;

export const expectedVitalsMixed27 = {
  records: [
    { entityIndex: 3, fieldMask: 0x04, fields: [{ bit: 2, value: 3504 }] },
    {
      entityIndex: 1,
      fieldMask: 0x05,
      fields: [
        { bit: 0, value: 3899 },
        { bit: 2, value: 852 },
      ],
    },
    {
      entityIndex: 2,
      fieldMask: 0x05,
      fields: [
        { bit: 0, value: 2375 },
        { bit: 2, value: 3098 },
      ],
    },
  ],
} as const;

export const expectedVitalsSharedBit4 = {
  records: [
    {
      entityIndex: 1,
      fieldMask: 0x11,
      fields: [
        { bit: 0, value: 3899 },
        { bit: 4, value: 326 },
      ],
    },
    {
      entityIndex: 2,
      fieldMask: 0x14,
      fields: [
        { bit: 2, value: 3227 },
        { bit: 4, value: 326 },
      ],
    },
    {
      entityIndex: 3,
      fieldMask: 0x14,
      fields: [
        { bit: 2, value: 4011 },
        { bit: 4, value: 326 },
      ],
    },
  ],
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
  combatHitCount: 7,
  monsterHit: {
    target: "monster",
    amount: 62,
    school: 8,
    attackerRuntimePlayerId: 1,
    abilityName: "Front Sweep",
    monsterName: "Soul-Broken Harbinger",
  },
} as const;

export const expectedAbilityCastBatchedMultiCast = {
  strings: ["Fierce Berserk", "Soul-Broken Harbinger", "Terra Wave", "Great Fire Wave"],
  /** Monster damage per `attackerRuntimePlayerId:abilityName`. */
  dealtByAbility: {
    "1:Fierce Berserk": 600,
    "3:Terra Wave": 985,
    "4:Great Fire Wave": 875,
  },
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
