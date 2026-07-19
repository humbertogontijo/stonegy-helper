/**
 * Binary frames captured from a hunt reload HAR (stonegy-online.com.har).
 * JSON auth/bootstrap context is in the same capture.
 */
export const huntTrafficFixtures = {
  /** Empty monster loot (dropCount=0) — kill with no ground drops. */
  huntLootAnalyzerTick: "U0cFCgGXJAEAAAAAAAAAAAA=",

  /** Empty monster loot from live traffic (2026-07-18). */
  huntLootEmptyDrops: "U0cFCgGTI3EAAAAAAAAAAAA=",

  /** Ground item drops during a hunt. */
  huntLootItemDrops:
    "U0cFCgG1JAEAAAAAAAIAJAA3Nzc3Nzc3Ny03Nzc3LTc3NzctODc3Ny0wMDAwMDAwMDAwMDInAAAAAQAAAAIAAAAAACQAODg4ODg4ODgtODg4OC03ODg4LTg4ODgtMDAwMDAwMDAwMDAyHQMAAAEAAAACAAAAAAAAAA==",

  /** Party/hunt entity UUID roster — not monster loot. */
  huntEntityUuidList:
    "U0cFCgAAAAYAJABhYWFhYWFhYS1hYWFhLTdhYWEtOGFhYS0wMDAwMDAwMDAwMDUkADk5OTk5OTk5LTk5OTktNzk5OS04OTk5LTAwMDAwMDAwMDAwNCQAODg4ODg4ODgtODg4OC03ODg4LTg4ODgtMDAwMDAwMDAwMDA0JAA3Nzc3Nzc3Ny03Nzc3LTc3NzctODc3Ny0wMDAwMDAwMDAwMDQkADY2NjY2NjY2LTY2NjYtNzY2Ni04NjY2LTAwMDAwMDAwMDAwNCQAOTk5OTk5OTktOTk5OS00OTk5LTg5OTktMDAwMDAwMDAwMDBh",

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

  /** Xp summary batch (3 records) sent right after hunt reconnect. */
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

  /** Support spell cast (Utito Tempo) — entryCount + per-entry header/strings/effect. */
  abilityCastSupportUtitoTempo:
    "U0cFEgEBAQALAFVUSVRPX1RFTVBPCwBVdGl0byBUZW1wbw4AQmxvb2RfUmFnZS5naWahHQAAAAAAAQHgLgAADAAAAAcAAAANAAAAIAAAACwBAACmAAAA",

  /**
   * Multi-buff support frame (Utamo Vita + Utamo Tempo) observed while both
   * shields were active. entryCount=2; Magic Shield entry carries extra=100.
   */
  abilityCastSupportUtamoMulti:
    "U0cFEgIEAQEKAFVUQU1PX1ZJVEEMAE1hZ2ljIFNoaWVsZBAATWFnaWNfU2hpZWxkLmdpZvG9AgAAZAAAAQD4KgAACwAAAAcAAAANAAAAPAAAACwBAADwAAAAAQEACwBVVEFNT19URU1QTwsAVXRhbW8gVGVtcG8NAFByb3RlY3Rvci5naWZbIgAAAAAAAQD4KgAACwAAAAcAAAANAAAAPAAAACwBAADwAAAA",

  /**
   * Single Magic Shield support cast with header.byteA=0x03 (extra=100).
   * Previously rejected by the {0x01,0x04}-only header heuristic. Live 2026-07-18.
   */
  abilityCastSupportUtamoVitaByteA3:
    "U0cFEgEDAQEKAFVUQU1PX1ZJVEEMAE1hZ2ljIFNoaWVsZBAATWFnaWNfU2hpZWxkLmdpZiC/AgAAZAAAAQD4KgAACwAAAAcAAAANAAAAPAAAACwBAADxAAAA",

  /**
   * Utamo Tempo refresh while a Burning DoT was active. Entry 1 carries a
   * status-effect attachment (FIRE/Burning, 25 per 4000ms tick); entry 2 is a
   * headerless continuation (byteB=0) with only the duration tail. Live 2026-07-18.
   */
  abilityCastSupportUtamoTempoBurning:
    "U0cFEgIBAQALAFVUQU1PX1RFTVBPCwBVdGFtbyBUZW1wbw0AUHJvdGVjdG9yLmdpZpsxAAAAAAEkAGNjY2NjY2NjLWNjY2MtN2NjYy04Y2NjLTAwMDAwMDAwMDAwOAQARklSRQcAQnVybmluZx4AL2Fzc2V0cy9pY29ucy9CdXJuaW5nX0ljb24uZ2lmwMIEAAEAAAAZAAAAoA8AAAEA4C4AAAwAAAAHAAAADQAAADAAAABeAQAADgEAAAIAAAABAOAuAAAMAAAABwAAAA0AAAAwAAAAXgEAAA4BAAA=",

  /**
   * Type 0x18 short (8-byte) effect area frame — single handle-less
   * record (kind=0x00) at (-1,-1). Live 2026-07-18.
   */
  statusEffectClearShort: "U0cFGAEAAP//AQAA",

  /**
   * Type 0x1a ref/value list variant (no entityRef): zero prefix + u8 count +
   * {u16 ref, u16 value} pairs + {u16 ref, u8 flag} list + terminator.
   * Live 2026-07-18.
   */
  groundItemRefValueSingle: "U0cFGgAAAAFoALACAAA=",
  groundItemRefValuePair: "U0cFGgAAAAJzAPoGdgA6CAAA",
  groundItemRefValueWithFlag: "U0cFGgAAAAF8BNgHAX0EAQA=",
  /** count=0 frames that carry only the {u16 ref, u8 flag} list. */
  groundItemRefFlags3: "U0cFGgAAAAADbAYAaQYAawYAAA==",
  groundItemRefFlags4: "U0cFGgAAAAAErwYAsAYArgYAqwYAAA==",

  /**
   * Type 0x12 continuation-only support frame: a single headerless entry
   * (byteA=0x02, byteB=0) with no strings — buff-tick refresh. Live 2026-07-18.
   */
  abilityCastSupportContinuationOnly:
    "U0cFEgECAAAAAQDgLgAADAAAAAcAAAANAAAAMAAAAF4BAAAPAQAA",

  /**
   * Type 0x05 fresh-hunt analyzer snapshot with monsterCount=0: the 3-slot
   * monster table is omitted, shifting the value block and loot table up by
   * 24 bytes. Party of 4 + leader summary row. Live 2026-07-18 (names anonymized).
   */
  huntAnalyzerSnapshotFreshHunt:
    "U0cFBQEAbnwKdp8BAABufAp2nwEAAHBOAAAAAAAAnBUAAQAAAAAsx/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASQ4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMQDAAAAAAAAPPz///////8AAAAAAAAAAByjAgAAAAAA41z9//////8AAAAAASQANjY2NjY2NjYtNjY2Ni00NjY2LTg2NjYtMDAwMDAwMDAwMDA5BwBMZWFkZXIxAAAAAAAAAAA0DgAAAAAAAMzx////////c/z///////8AAAAAAAAAAAQAJAAxMTExMTExMS0xMTExLTQxMTEtODExMS0wMDAwMDAwMDAwMGIFAEJyYXZvAAAAAAAAAAAAOAQAAAAAAADI+////////6sAAAAAAAAAqwAAAAAAAAAAAAAAAAAAACQANjY2NjY2NjYtNjY2Ni00NjY2LTg2NjYtMDAwMDAwMDAwMDA5BwBMZWFkZXIxAQAAAAAAAAAAxAMAAAAAAAA8/P///////zcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACQAOTk5OTk5OTktOTk5OS00OTk5LTg5OTktMDAwMDAwMDAwMDBiBwBDaGFybGllAAAAAAAAAAAAUAQAAAAAAACw+////////8MAAAAAAAAAwwAAAAAAAAAAAAAAAAAAACQANDQ0NDQ0NDQtNDQ0NC00NDQ0LTg0NDQtMDAwMDAwMDAwMDA5BQBEZWx0YQAAAAAAAAAAAOgBAAAAAAAAGP7///////9b/v///////wAAAAAAAAAApQEAAAAAAAA=",

  /**
   * Fresh-hunt analyzer snapshot captured while the party was still in
   * training (all counters zero, only supplies spent). Regression fixture for
   * party rows whose first i64 is zero — the old zero-skipping heuristic
   * misaligned here. Live 2026-07-18 (anonymized to the fresh-hunt cast).
   */
  huntAnalyzerSnapshotTrainingIdle:
    "U0cFBQEAC7F/dp8BAAALsX92nwEAAFwnAAAAAAAA8+HFAAAAAACXusUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASQANjY2NjY2NjYtNjY2Ni00NjY2LTg2NjYtMDAwMDAwMDAwMDA5BwBMZWFkZXIxAAAAAAAAAADYAAAAAAAAACj/////////yv////////8AAAAAAAAAAAQAJAAxMTExMTExMS0xMTExLTQxMTEtODExMS0wMDAwMDAwMDAwMGIFAEJyYXZvAAAAAAAAAAAA2AAAAAAAAAAo/////////6IAAAAAAAAAogAAAAAAAAAAAAAAAAAAACQANjY2NjY2NjYtNjY2Ni00NjY2LTg2NjYtMDAwMDAwMDAwMDA5BwBMZWFkZXIxAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMr/////////AAAAAAAAAAAAAAAAAAAAACQAOTk5OTk5OTktOTk5OS00OTk5LTg5OTktMDAwMDAwMDAwMDBiBwBDaGFybGllAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMr/////////AAAAAAAAAAA2AAAAAAAAACQANDQ0NDQ0NDQtNDQ0NC00NDQ0LTg0NDQtMDAwMDAwMDAwMDA5BQBEZWx0YQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADK/////////wAAAAAAAAAANgAAAAAAAAA=",

  /** XP gain pulse during the hunt (+125, 3 party shares). */
  xpGain: "U0cFFX0AAACy8RUAAAAAAAQAAwEAAgADAA==",

  /** Full hunt analyzer snapshot observed during a party hunt reload. */
  huntAnalyzerSnapshot:
    "U0cFBQEAp0t3R58BAACnS3dHnwEAAJV/SgAAAAAAPRNZAQAAAACokw4BAAAAAMpDPQAAAAAAfywtAAAAAACMhEkAAAAAAGU1NgAAAAAANuckAAAAAACZFAAAAAAAADIGEAAAAAAA/QUAAAAAAAADAHsAAABSAgAAfAAAADcCAAB9AAAAdAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADC+BQAAAAAA0EH6//////8AAAAAAAAAAAw8BAAAAAAA88P7//////8AAB8AxQIAAMQAAAD0AAAATwAAACEBAAA6AAAASQAAAC8AAAC8AgAAJQAAALMAAAAfAAAAvgIAAB8AAAA6AAAAHQAAALMCAAAaAAAASgAAABkAAAC9AgAAGQAAAEsBAAAYAAAArAAAABQAAABYAAAAEAAAAMACAAAQAAAAqgAAAA8AAACyAgAADwAAABwBAAAMAAAAvwIAAAoAAACTAgAACQAAAJUCAAAJAAAAeAAAAAgAAABWAAAABwAAAEgCAAAFAAAASwAAAAQAAAADAAAAAwAAADsBAAADAAAAggEAAAMAAAC6AAAAAgAAAEwCAAACAAAA1wAAAAEAAAABJABlZWVlZWVlZS1lZWVlLTRlZWUtOGVlZS0wMDAwMDAwMDAwMGEHAFBhcnRuZXLywBsAAAAAAFK6EgAAAAAAoAYJAAAAAACoQQIAAAAAAAAAAAAAAAAABAAkADU1NTU1NTU1LTU1NTUtNDU1NS04NTU1LTAwMDAwMDAwMDAwYgUARGVsdGEAEigWAAAAAAD+QQUAAAAAABTmEAAAAAAAlFvx//////8AAAAAAAAAAGykDgAAAAAAJABiYmJiYmJiYi1iYmJiLTRiYmItOGJiYi0wMDAwMDAwMDAwMGIFAEd1aWxkAAAAAAAAAAAAsJQEAAAAAABQa/v//////1jWBgAAAAAAWNYGAAAAAAAAAAAAAAAAACQAYWFhYWFhYWEtYWFhYS00YWFhLThhYWEtYWFhYWFhYWFhYWFhDgBNZW1iZXIgUHJpbWFyeQAAAAAAAAAAADC+BQAAAAAA0EH6///////Y/wcAAAAAANj/BwAAAAAAAAAAAAAAAAAkAGVlZWVlZWVlLWVlZWUtNGVlZS04ZWVlLTAwMDAwMDAwMDAwYQcAUGFydG5lcgHgmAUAAAAAAHQlAwAAAAAAbHMCAAAAAAA8zv///////wAAAAAAAAAAAAAAAAAAAAA=",

  /** Compact-layout hunt analyzer snapshot with solo loot and party totals. */
  huntAnalyzerSnapshotCompact:
    "U0cFBQEAYzvlSJ8BAABjO+VInwEAAL2UDQAAAAAAS8hJAQAAAACOMzwBAAAAAEJkBAAAAAAAVMMRAAAAAAAcRQUAAAAAAMtQFQAAAAAAeZMBAAAAAADwDQAAAAAAAJ0NAAAAAAAAhwAAAAAAAAACAFoAAABTAAAAWwAAADQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADTkAAAAAAAAC1v////////AAAAAAAAAADGSQIAAAAAADm2/f//////AAATAFUCAAApAAAAhwEAABUAAACGAQAAEAAAABsBAAAOAAAAoQAAAAsAAAAcAQAACAAAAKAAAAAHAAAAiwEAAAcAAACMAQAABgAAAIkBAAAEAAAAzQAAAAMAAAA8AQAAAwAAAIoBAAACAAAAjQEAAAIAAACAAAAAAQAAAJsAAAABAAAAxwAAAAEAAAA2AQAAAQAAAI4BAAABAAAAASQANDQ0NDQ0NDQtNDQ0NC00NDQ0LTg0NDQtNDQ0NDQ0NDQ0NDQ0BQBBbHBoYcQBBQAAAAAAdC4DAAAAAABQ0wEAAAAAANR0AAAAAAAAAAAAAAAAAAAEACQAMTExMTExMTEtMTExMS00MTExLTgxMTEtMDAwMDAwMDAwMDBiBQBCcmF2bwAAAAAAAAAAAHP4AAAAAAAAjQf///////9HbQEAAAAAAEdtAQAAAAAAAAAAAAAAAAAkADY2NjY2NjY2LTY2NjYtNDY2Ni04NjY2LTAwMDAwMDAwMDAwOQcASGVyb09uZQAAAAAAAAAAANOQAAAAAAAALW////////+nBQEAAAAAAKcFAQAAAAAAAAAAAAAAAAAkADk5OTk5OTk5LTk5OTktNDk5OS04OTk5LTAwMDAwMDAwMDAwYgcAQ2hhcmxpZQAAAAAAAAAAAP7xAAAAAAAAAg7////////SZgEAAAAAANJmAQAAAAAAAAAAAAAAAAAkADQ0NDQ0NDQ0LTQ0NDQtNDQ0NC04NDQ0LTQ0NDQ0NDQ0NDQ0NAUAQWxwaGEBxAEFAAAAAAAwswAAAAAAAJROBAAAAAAAQCb8//////8AAAAAAAAAAAAAAAAAAAAA",

  /** Single inventory item grant after npc_claim_starter_item (subType 0). */
  huntLootStarterItemGrant:
    "U0cFCgABACQAZWVlZWVlZWUtZWVlZS03ZWVlLThlZWUtMDAwMDAwMDAwMDAzxAEAAAEAAAACAAAAAAAAAA==",
} as const;

export const expectedHuntEntityUuidList = [
  "aaaaaaaa-aaaa-7aaa-8aaa-000000000005",
  "99999999-9999-7999-8999-000000000004",
  "88888888-8888-7888-8888-000000000004",
  "77777777-7777-7777-8777-000000000004",
  "66666666-6666-7666-8666-000000000004",
  "99999999-9999-4999-8999-00000000000a",
] as const;

export const expectedHuntLootDrops = [
  {
    itemId: 39,
    amount: 1,
    groundUuid: "77777777-7777-7777-8777-000000000002",
    flagsA: 2,
    flagsB: 0,
    remainingUnits: 0,
  },
  {
    itemId: 797,
    amount: 1,
    groundUuid: "88888888-8888-7888-8888-000000000002",
    flagsA: 2,
    flagsB: 0,
    remainingUnits: 0,
  },
] as const;

export const expectedHuntLootStarterItemGrant = {
  itemId: 452,
  amount: 1,
  groundUuid: "eeeeeeee-eeee-7eee-8eee-000000000003",
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

export const expectedXpSummaryReconnect = {
  xpGain: 125,
  records: [
    {
      xpGain: 4,
      sessionXp: 36800,
      memberCount: 2,
      shares: [{ memberIndex: 1, flag: 0 }],
    },
    {
      xpGain: 108,
      sessionXp: 11860,
      memberCount: 1,
      shares: [{ memberIndex: 1, flag: 0 }],
    },
    {
      xpGain: 125,
      sessionXp: 841780,
      memberCount: 4,
      shares: [
        { memberIndex: 1, flag: 0 },
        { memberIndex: 2, flag: 0 },
        { memberIndex: 3, flag: 0 },
      ],
    },
  ],
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
  partyMembers: ["Bravo", "HeroOne", "Charlie", "Alpha"],
  partyLeaderTotals: {
    name: "Alpha",
    lootTotalValue: 328_132,
    suppliesGold: 208_500,
    profitGold: 119_632,
    profitPerMember: 29_908,
    remainderGold: 0,
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
  entries: [
    {
      header: { byteA: 1, byteB: 1, byteC: 0 },
      strings: ["UTITO_TEMPO", "Utito Tempo", "Blood_Rage.gif"],
      remainingMs: 7585,
      flag: 1,
      durationMs: 12000,
      values: [12, 7, 13, 32, 300, 166],
    },
  ],
  effectTail: {
    remainingMs: 7585,
    flag: 1,
    durationMs: 12000,
    values: [12, 7, 13, 32, 300, 166],
  },
} as const;

export const expectedSupportAbilityCastUtamoMulti = {
  strings: [
    "UTAMO_VITA",
    "Magic Shield",
    "Magic_Shield.gif",
    "UTAMO_TEMPO",
    "Utamo Tempo",
    "Protector.gif",
  ],
  entries: [
    {
      header: { byteA: 4, byteB: 1, byteC: 1 },
      strings: ["UTAMO_VITA", "Magic Shield", "Magic_Shield.gif"],
      remainingMs: 179697,
      extra: 100,
      flag: 0,
      durationMs: 11000,
      values: [11, 7, 13, 60, 300, 240],
    },
    {
      header: { byteA: 1, byteB: 1, byteC: 0 },
      strings: ["UTAMO_TEMPO", "Utamo Tempo", "Protector.gif"],
      remainingMs: 8795,
      flag: 0,
      durationMs: 11000,
      values: [11, 7, 13, 60, 300, 240],
    },
  ],
} as const;

export const expectedSupportAbilityCastUtamoTempoBurning = {
  strings: ["UTAMO_TEMPO", "Utamo Tempo", "Protector.gif"],
  entries: [
    {
      header: { byteA: 1, byteB: 1, byteC: 0 },
      strings: ["UTAMO_TEMPO", "Utamo Tempo", "Protector.gif"],
      remainingMs: 12699,
      flag: 0,
      durationMs: 12000,
      values: [12, 7, 13, 48, 350, 270],
      statusEffects: [
        {
          uuid: "cccccccc-cccc-7ccc-8ccc-000000000008",
          element: "FIRE",
          name: "Burning",
          iconPath: "/assets/icons/Burning_Icon.gif",
          totalDurationMs: 312000,
          fieldA: 1,
          amount: 25,
          tickIntervalMs: 4000,
        },
      ],
    },
    {
      header: { byteA: 2, byteB: 0, byteC: 0 },
      strings: [],
      remainingMs: 0,
      flag: 0,
      durationMs: 12000,
      values: [12, 7, 13, 48, 350, 270],
    },
  ],
} as const;

export const expectedSupportAbilityCastContinuationOnly = {
  entries: [
    {
      header: { byteA: 2, byteB: 0, byteC: 0 },
      strings: [],
      remainingMs: 0,
      flag: 0,
      durationMs: 12000,
      values: [12, 7, 13, 48, 350, 271],
    },
  ],
} as const;

export const expectedHuntAnalyzerSnapshotFreshHunt = {
  totalKills: 0,
  monsterCount: 0,
  primaryMonsterId: 0,
  monsters: [],
  rawXp: 964,
  lootBalanceGold: -964,
  xp: 172_828,
  suppliesGold: -172_829,
  lootItems: [],
  partyMembers: [
    { name: "Bravo", isLeaderRow: false, lootTotalValue: 0, suppliesGold: 1080, profitGold: -1080, transferGold: 171, receiveGold: 171, payGold: 0 },
    { name: "Leader1", isLeaderRow: true, lootTotalValue: 0, suppliesGold: 964, profitGold: -964, transferGold: 55, receiveGold: 0, payGold: 0 },
    { name: "Charlie", isLeaderRow: false, lootTotalValue: 0, suppliesGold: 1104, profitGold: -1104, transferGold: 195, receiveGold: 195, payGold: 0 },
    { name: "Delta", isLeaderRow: false, lootTotalValue: 0, suppliesGold: 488, profitGold: -488, transferGold: -421, receiveGold: 0, payGold: 421 },
  ],
  partyLeaderTotals: {
    name: "Leader1",
    lootTotalValue: 0,
    suppliesGold: 3636,
    profitGold: -3636,
    profitPerMember: -909,
    remainderGold: 0,
  },
} as const;

export const expectedSupportAbilityCastUtamoVitaByteA3 = {
  strings: ["UTAMO_VITA", "Magic Shield", "Magic_Shield.gif"],
  entries: [
    {
      header: { byteA: 3, byteB: 1, byteC: 1 },
      strings: ["UTAMO_VITA", "Magic Shield", "Magic_Shield.gif"],
      remainingMs: 180000,
      extra: 100,
      flag: 0,
      durationMs: 11000,
      values: [11, 7, 13, 60, 300, 241],
    },
  ],
  effectTail: {
    remainingMs: 180000,
    extra: 100,
    flag: 0,
    durationMs: 11000,
    values: [11, 7, 13, 60, 300, 241],
  },
} as const;
