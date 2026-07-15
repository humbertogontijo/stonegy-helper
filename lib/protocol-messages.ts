import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

export const emptyPayloadSchema = z.object({}).strict();

/** Allows extra keys — for payloads the server may extend over time. */
export function looseObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).passthrough();
}

/** Rejects unknown keys — for payloads we believe are fully modeled. */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

/** Fully open JSON object payloads. */
export const openPayloadSchema = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Message type constants
// ---------------------------------------------------------------------------

export const SendMessageTypes = {
  AUTH: "auth",
  PING: "ping",
  CHAT_SEND: "chat_send",
  WEAPON_MASTERY_GET_STATE: "weapon_mastery_get_state",
  WEAPON_MASTERY_SELECT_PERK: "weapon_mastery_select_perk",
  TRAINING_GET_SNAPSHOT: "training_get_snapshot",
  START_TRAINING: "start_training",
  FINISH_TRAINING: "finish_training",
  TRAINING_PRESENCE_SUBSCRIBE: "training_presence_subscribe",
  TRAINING_PRESENCE_UNSUBSCRIBE: "training_presence_unsubscribe",
  PARTY_GET_SNAPSHOT: "party_get_snapshot",
  FRIENDS_GET_SNAPSHOT: "friends_get_snapshot",
  TRADE_GET_SNAPSHOT: "trade_get_snapshot",
  BLESS_GET_SNAPSHOT: "bless_get_snapshot",
  BLESS_BUY: "bless_buy",
  DEATH_MODAL_ACK: "death_modal_ack",
  QUEST_GET_SNAPSHOT: "quest_get_snapshot",
  QUEST_DELIVER_MONSTER_TASK: "quest_deliver_monster_task",
  QUEST_CLAIM_REWARD: "quest_claim_reward",
  QUEST_START_MONSTER_TASK: "quest_start_monster_task",
  START_HUNT: "start_hunt",
  LEAVE_HUNT: "leave_hunt",
  PARTY_READY_CHECK_CONFIRM: "party_ready_check_confirm",
  PARTY_LEAVE: "party_leave",
  PARTY_CREATE: "party_create",
  PARTY_ACCEPT_INVITE: "party_accept_invite",
  PARTY_REJECT_INVITE: "party_reject_invite",
  PARTY_DISBAND: "party_disband",
  PARTY_LOOT_SPLITTER_RESET: "party_loot_splitter_reset",
  GOLD_TRANSFER: "gold_transfer",
  HUNT_CHANGE_PARTY_POSITION: "hunt_change_party_position",
  HUNT_LURE_ID: "hunt_lure_id",
  QUICK_SELL_ITEMS: "quick_sell_items",
  QUICK_SELL_SET_PREFERENCES: "quick_sell_set_preferences",
  SELECT_ARROW: "select_arrow",
  SELECT_HEAL: "select_heal",
  SELECT_MANA_POTION: "select_mana_potion",
  SELECT_SKILLS: "select_skills",
  MARKET_GET_SNAPSHOT: "market_get_snapshot",
  MARKET_CREATE_ORDER: "market_create_order",
  MARKET_RESOLVE_ORDER: "market_resolve_order",
  COIN_MARKET_GET_SNAPSHOT: "coin_market_get_snapshot",
  COIN_MARKET_RESOLVE_ORDER: "coin_market_resolve_order",
  GET_TASKS: "get_tasks",
  RANKING_GET_SNAPSHOT: "ranking_get_snapshot",
  WHEEL_OF_DESTINY_GET_SNAPSHOT: "wheel_of_destiny_get_snapshot",
  OUTFIT_SAVE: "outfit_save",
  SET_AUTO_FINISH_HUNT_BY_GOLD: "set_auto_finish_hunt_by_gold",
  SET_AUTO_FINISH_HUNT_BY_CAPACITY: "set_auto_finish_hunt_by_capacity",
  NPC_CLAIM_STARTER_ITEM: "npc_claim_starter_item",
  NPC_BUY_ITEM: "npc_buy_item",
  APPEARANCE_SHOP_BUY: "appearance_shop_buy",
  DEPOT_MOVE_ITEM: "depot_move_item",
  HOUSE_PUBLIC_SNAPSHOT: "house_public_snapshot",
  ADD_DAILY_BOSS: "add_daily_boss",
  START_BOSS_FIGHT: "start_boss_fight",
} as const;

export const ReceiveMessageTypes = {
  PONG: "pong",
  SESSION_BOOTSTRAP: "session_bootstrap",
  ACCOUNT_SESSION_REPLACED: "account_session_replaced",
  ACCOUNT_SNAPSHOT: "account:snapshot",
  UPDATE_LEVELINFO: "update_levelinfo",
  EQUIPMENT_UPDATE: "equipment:update",
  EQUIPMENT_PATCH: "equipment:patch",
  UPDATE_BATTLE_CONFIG: "update_battle_config",
  STORE_PRODUCTS: "store:products",
  BOOST_INVENTORY_SNAPSHOT: "boost_inventory:snapshot",
  HOUSE_SNAPSHOT: "house:snapshot",
  PREY_SNAPSHOT: "prey:snapshot",
  DAILY_REWARD_SNAPSHOT: "daily_reward:snapshot",
  WHEEL_OF_DESTINY_SNAPSHOT: "wheel_of_destiny:snapshot",
  TRAINING_BOOTSTRAP: "training_bootstrap",
  TRAINING_FINISHED: "training_finished",
  FRIENDS_SNAPSHOT: "friends:snapshot",
  TRADE_SNAPSHOT: "trade:snapshot",
  PARTY_SNAPSHOT: "party:snapshot",
  PARTY_ACTION_RESULT: "party:action_result",
  WEAPON_MASTERY_ACTION_RESULT: "weapon_mastery:action_result",
  GOLD_TRANSFER_RESULT: "gold_transfer_result",
  GOLD_BALANCE: "gold_balance",
  BLESS_SNAPSHOT: "bless:snapshot",
  BLESS_ACTION_RESULT: "bless:action_result",
  PLAYER_DEATH: "player_death",
  CHAT_MESSAGE: "chat:message",
  SYSTEM_MESSAGE: "system:message",
  HUNT_BOOTSTRAP: "hunt_bootstrap",
  HUNT_UPDATE_PLAYERS: "hunt:update_players",
  HUNT_PHASE_UPDATE: "hunt:phase_update",
  HUNT_FINISHED: "hunt_finished",
  HUNT_UPDATE_LURE: "hunt_update_lure",
  MARKET_SNAPSHOT: "market:snapshot",
  MARKET_ACTION_RESULT: "market:action_result",
  COIN_MARKET_SNAPSHOT: "coin_market:snapshot",
  COIN_MARKET_ACTION_RESULT: "coin_market:action_result",
  TASKS_SNAPSHOT: "tasks:snapshot",
  QUEST_ACTION_RESULT: "quest:action_result",
  RANKING_SNAPSHOT: "ranking:snapshot",
  OUTFIT_SNAPSHOT: "outfit:snapshot",
  OUTFIT_ACTION_RESULT: "outfit:action_result",
  NPC_STARTER_ITEM_CLAIM_RESULT: "npc:starter_item_claim_result",
  NPC_ITEM_SHOP_PURCHASE_RESULT: "npc:item_shop_purchase_result",
  APPEARANCE_SHOP_PURCHASE_RESULT: "appearance_shop:purchase_result",
  CHARACTER_PATCH: "character:patch",
  DEPOT_PATCH: "depot:patch",
  HOUSE_PUBLIC_SNAPSHOT: "house:public_snapshot",
  BOSS_ROTATION_UPDATE: "boss_rotation:update",
  BOSSTIARY_UPDATE: "bosstiary:update",
} as const;

export type SendMessageType = (typeof SendMessageTypes)[keyof typeof SendMessageTypes];
export type ReceiveMessageType = (typeof ReceiveMessageTypes)[keyof typeof ReceiveMessageTypes];

// ---------------------------------------------------------------------------
// Shared primitive schemas
// ---------------------------------------------------------------------------

const itemIdSchema = z.union([z.string(), z.number()]).nullable();

export const autoEquipSlotSchema = strictObject({
  enabled: z.boolean(),
  emergencyItemId: itemIdSchema,
  defaultItemId: itemIdSchema,
  equipLifePercentLte: z.number(),
  restoreLifePercentGte: z.number(),
});

export const battleConfigSchema = strictObject({
  selectedHeal: z.string(),
  selectedHealPercent: z.number(),
  selectedHealSecondary: z.string(),
  selectedHealPercentSecondary: z.number(),
  selectedHealTertiary: z.string(),
  selectedHealPercentTertiary: z.number(),
  selectedHealQuaternary: z.string(),
  selectedHealPercentQuaternary: z.number(),
  selectedManaPotion: z.string(),
  selectedManaPotionPercent: z.number(),
  selectedArrow: z.string().nullable(),
  selectedSkills: z.array(z.string().nullable()),
  selectedSkillsMinCreatures: z.record(z.string(), z.number()),
  selectedSupportSkill: z.string().nullable(),
  selectedSupportSkills: z.array(z.string().nullable()),
  autoEquip: strictObject({
    ring: autoEquipSlotSchema,
    neck: autoEquipSlotSchema,
  }),
  autoFinishHuntByGold: z.boolean().optional(),
  autoFinishHuntByCapacity: z.boolean().optional(),
  quickSellDeselectedItemIds: z.array(z.number()),
  homeMapPreference: z.string(),
  lootFilterExcludedItemIds: z.array(z.number()),
  homeTutorialRewards: z.record(z.string(), z.unknown()).optional(),
  guideTutorialProgress: z.record(z.string(), z.unknown()).optional(),
  initialOnboardingChoice: z.record(z.string(), z.unknown()).optional(),
});

export const marketFiltersSchema = looseObject({
  itemId: z.number().nullable().optional(),
  slot: z.string().nullable().optional(),
  vocation: z.string().nullable().optional(),
  rarity: z.number().nullable().optional(),
});

export const marketOrderSchema = strictObject({
  id: z.string(),
  itemId: z.number(),
  tier: z.number(),
  isOwnOrder: z.boolean(),
  isBuyOrder: z.boolean(),
  eachPrice: z.number(),
  itemAmount: z.number(),
  totalPrice: z.number(),
  createdAt: z.string(),
});

export const marketSnapshotSchema = strictObject({
  page: z.number().optional(),
  totalPages: z.number().optional(),
  filters: marketFiltersSchema.optional(),
  requestedItemId: z.number().nullable().optional(),
  selectedItemTradableAmount: z.number().optional(),
  sellOrders: z.array(marketOrderSchema).optional(),
  buyOrders: z.array(marketOrderSchema).optional(),
});

export const activeMonsterTaskSchema = strictObject({
  questId: z.number(),
  missionId: z.number(),
  monsterId: z.number().nullable(),
  requiredAmount: z.number().nullable(),
  currentAmount: z.number().nullable(),
  met: z.boolean(),
  questTitle: z.string().optional(),
  missionTitle: z.string().optional(),
});

export const xpRateBreakdownSchema = looseObject({
  baseRate: z.number().optional(),
  premiumRateAdd: z.number().optional(),
  xpBoostRateAdd: z.number().optional(),
  totalRate: z.number().optional(),
  xpBoostRemainingMs: z.number().optional(),
});

export const characterSkillsSchema = looseObject({
  magic: z.number().optional(),
  magicPercent: z.number().optional(),
  fist: z.number().optional(),
  fistPercent: z.number().optional(),
  shielding: z.number().optional(),
  shieldingPercent: z.number().optional(),
  axe: z.number().optional(),
  axePercent: z.number().optional(),
  club: z.number().optional(),
  clubPercent: z.number().optional(),
  sword: z.number().optional(),
  swordPercent: z.number().optional(),
  distance: z.number().optional(),
  distancePercent: z.number().optional(),
});

export const updateLevelInfoSchema = strictObject({
  level: z.number().optional(),
  goldCoins: z.number().optional(),
  xp: z.number().optional(),
  infos: looseObject({
    level: z.number().optional(),
    expToNextLevel: z.number().optional(),
    remainingExpToNextLevel: z.number().optional(),
    percentageToNextLevel: z.number().optional(),
  }).optional(),
  xpGainrate: z.number().optional(),
  xpRateBreakdown: xpRateBreakdownSchema.optional(),
  xpBoostRemainingMs: z.number().optional(),
  skills: characterSkillsSchema.optional(),
});

export const protocolPartyMemberSchema = looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  level: z.number().optional(),
  vocation: z.string().optional(),
  avatarSelected: z.number().optional(),
  isOnline: z.boolean().optional(),
  isLeader: z.boolean().optional(),
});

export const partyReadyCheckSchema = strictObject({
  id: z.string(),
  mode: z.string().optional(),
  startedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  initiatedBy: z.string().optional(),
  memberStatuses: z.record(z.string(), z.string()).optional(),
});

export const partyLootSplitterTotalsSchema = strictObject({
  lootTotalValue: z.number(),
  suppliesGold: z.number(),
  balanceGold: z.number(),
});

export const partyLootSplitterMemberSchema = strictObject({
  playerId: z.string(),
  name: z.string(),
  isLeader: z.boolean(),
  lootTotalValue: z.number(),
  suppliesGold: z.number(),
  balanceGold: z.number(),
  settlementDeltaGold: z.number(),
  transferFromLeaderGold: z.number(),
  owedToLeaderGold: z.number(),
});

export const partyLootSplitterSplitSchema = strictObject({
  profitPerMember: z.number(),
  remainderToLeader: z.number(),
  members: z.array(partyLootSplitterMemberSchema),
});

export const partyLootSplitterSchema = strictObject({
  leaderId: z.string(),
  leaderName: z.string(),
  totals: partyLootSplitterTotalsSchema,
  splitter: partyLootSplitterSplitSchema,
});

export const partyReceivedInviteSchema = strictObject({
  id: z.string(),
  partyId: z.string(),
  createdAt: z.string(),
  sender: protocolPartyMemberSchema,
});

export const protocolPartySchema = looseObject({
  id: z.string().optional(),
  leaderId: z.string().optional(),
  members: z.array(protocolPartyMemberSchema).optional(),
  maxMembers: z.number().optional(),
  status: z.string().optional(),
  currentHuntId: z.union([z.string(), z.number()]).nullable().optional(),
  lootSplitter: partyLootSplitterSchema.nullable().optional(),
  readyCheck: partyReadyCheckSchema.nullable().optional(),
});

export const partySnapshotSchema = strictObject({
  meId: z.string().optional(),
  party: protocolPartySchema.nullable().optional(),
  receivedInvites: z.array(partyReceivedInviteSchema).optional(),
});

export const protocolCharacterSchema = looseObject({
  id: z.union([z.string(), z.number()]).optional(),
  nickname: z.string().optional(),
  vocation: z.string().optional(),
  stamina: z.number().optional(),
  lastStaminaUpdate: z.string().optional(),
  activeMonsterTasks: z.array(activeMonsterTaskSchema).optional(),
  finishedTasks: z.array(z.number()).optional(),
  finishedQuests: z.array(z.number()).optional(),
});

export const sessionBootstrapSchema = looseObject({
  character: protocolCharacterSchema.optional(),
  staminaConfig: looseObject({
    maxStaminaMs: z.number().optional(),
    recoveryFactor: z.number().optional(),
    consumptionIntervalMs: z.number().optional(),
    consumptionAmountMs: z.number().optional(),
    bossConsumesStamina: z.boolean().optional(),
  }).optional(),
});

export const protocolHuntSchema = looseObject({
  id: z.number().optional(),
  title: z.string().optional(),
  mode: z.string().optional(),
  questFight: looseObject({
    questId: z.number().optional(),
    missionId: z.number().optional(),
  }).nullable().optional(),
  bossFight: looseObject({
    bossId: z.number().optional(),
    id: z.number().optional(),
  }).nullable().optional(),
});

export const huntBootstrapSchema = looseObject({
  hunt: protocolHuntSchema.nullable().optional(),
  analyzer: looseObject({
    party: protocolPartySchema.optional(),
  }).optional(),
});

export const trainingExerciseWeaponSchema = z.record(z.string(), z.unknown());

export const activeTrainingSchema = strictObject({
  id: z.string(),
  characterId: z.string(),
  trainingType: z.string(),
  exerciseWeapon: trainingExerciseWeaponSchema.nullable(),
  trainingMaxTimeMS: z.number(),
  createdAt: z.string(),
  skillToTrain: z.string(),
});

export const trainingProjectedSchema = strictObject({
  mainSkillName: z.string(),
  mainSkillLevel: z.number(),
  mainSkillProgress: z.number(),
  magicLevel: z.number(),
  magicProgress: z.number(),
  shieldingLevel: z.number(),
  shieldingProgress: z.number(),
  exerciseWeaponChargesLeft: z.number().nullable(),
});

export const trainingScenePositionSchema = strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const trainingSceneSchema = strictObject({
  type: z.string(),
  houseMapId: z.number().nullable(),
  playerPosition: trainingScenePositionSchema,
  targetPosition: trainingScenePositionSchema,
  targetDummyItemId: z.number().nullable(),
  trainingSkillBonusPercent: z.number(),
});

export const trainingStateSchema = strictObject({
  activeTraining: activeTrainingSchema,
  endDate: z.string(),
  serverTime: z.string(),
  vocation: z.string(),
  currentSkillLevel: z.number(),
  currentSkillProgress: z.number(),
  baseShieldingLevel: z.number(),
  baseShieldingProgress: z.number(),
  elapsedMs: z.number(),
  isCompleted: z.boolean(),
  attackCycle: z.number(),
  exerciseWeapon: trainingExerciseWeaponSchema.nullable(),
  projected: trainingProjectedSchema,
  scene: trainingSceneSchema,
});

export const trainingBootstrapSchema = strictObject({
  training: trainingStateSchema.nullable().optional(),
});

export const trainingFinishedSchema = strictObject({
  success: z.boolean(),
});

export const boostInventoryItemSchema = z.record(z.string(), z.unknown());

export const boostInventorySnapshotSchema = strictObject({
  boostInventory: z.array(boostInventoryItemSchema),
});

export const houseItemPositionSchema = strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const characterHouseItemSchema = strictObject({
  inventory: z.string(),
  itemId: z.number(),
  position: houseItemPositionSchema,
});

export const characterHouseSchema = strictObject({
  id: z.string(),
  characterId: z.string(),
  houseSelected: z.number(),
  score: z.number(),
  items: z.array(characterHouseItemSchema),
});

export const unlockedHouseSchema = z.record(z.string(), z.unknown());

export const houseSnapshotSchema = strictObject({
  characterHouse: characterHouseSchema.nullable(),
  unlockedHouses: z.array(unlockedHouseSchema),
  goldCoins: z.number(),
});

export const tradeInviteSchema = z.record(z.string(), z.unknown());

export const activeTradeSchema = z.record(z.string(), z.unknown());

export const tradeSnapshotSchema = strictObject({
  meId: z.string(),
  activeTrade: activeTradeSchema.nullable(),
  receivedInvites: z.array(tradeInviteSchema),
  sentInvites: z.array(tradeInviteSchema),
});

export const preySlotSchema = strictObject({
  slot: z.number(),
  option: z.string(),
  bonusType: z.string().nullable(),
  bonusValue: z.number().nullable(),
  remainingMs: z.number(),
  bonusPercent: z.number().nullable(),
  freeRerollAt: z.number(),
  lockedCreatureId: z.number().nullable(),
  selectedCreatureId: z.number().nullable(),
  availableCreatureIds: z.array(z.number()),
  unlocked: z.boolean(),
  isActive: z.boolean(),
  nextFreeRerollInMs: z.number(),
});

export const preySnapshotSchema = strictObject({
  wildcards: z.number(),
  unlockedSlots: z.number(),
  slots: z.array(preySlotSchema),
});

export const dailyRewardClaimAmountSchema = strictObject({
  baseAmount: z.number(),
  streakBonusAmount: z.number(),
  premiumBonusAmount: z.number(),
  totalAmount: z.number(),
  projectedStreak: z.number(),
  streakTier: z.number(),
});

export const dailyRewardClaimPreviewSchema = strictObject({
  day: z.number(),
  type: z.string(),
  amount: dailyRewardClaimAmountSchema,
});

export const dailyRewardExerciseOptionSchema = strictObject({
  boostItemId: z.number(),
  name: z.string(),
  image: z.string(),
});

export const dailyRewardSequenceDaySchema = strictObject({
  day: z.number(),
  type: z.string(),
});

export const dailyRewardStreakTierMinStreakSchema = strictObject({
  tier1: z.number(),
  tier2: z.number(),
});

export const dailyRewardTypeConfigSchema = strictObject({
  type: z.string(),
  tierBaseAmounts: z.array(z.number()),
  premiumBonusAmount: z.number(),
});

export const dailyRewardConfigSchema = strictObject({
  resetHour: z.number(),
  sequence: z.array(dailyRewardSequenceDaySchema),
  streakTierMinStreak: dailyRewardStreakTierMinStreakSchema,
  rewardTypeConfigs: z.array(dailyRewardTypeConfigSchema),
});

export const dailyRewardSnapshotSchema = strictObject({
  canClaim: z.boolean(),
  streak: z.number(),
  nextRewardDay: z.number(),
  currentCycleStartMs: z.number(),
  nextResetAtMs: z.number(),
  lastClaimedCycleStartMs: z.number(),
  claimPreview: dailyRewardClaimPreviewSchema,
  exerciseOptions: z.array(dailyRewardExerciseOptionSchema),
  config: dailyRewardConfigSchema,
});

export const wheelOfDestinySnapshotSchema = strictObject({
  level: z.number(),
  vocation: z.string(),
  perks: z.record(z.string(), z.number()),
  pointsMax: z.number(),
  pointsUsed: z.number(),
  pointsLeft: z.number(),
  code: z.string(),
});

export const protocolFriendSchema = strictObject({
  id: z.string(),
  name: z.string(),
  level: z.number(),
  vocation: z.string(),
  avatarSelected: z.number(),
  isOnline: z.boolean(),
});

export const friendRequestSchema = z.record(z.string(), z.unknown());

export const friendsSnapshotSchema = strictObject({
  meId: z.string(),
  friends: z.array(protocolFriendSchema),
  receivedRequests: z.array(friendRequestSchema),
  sentRequests: z.array(friendRequestSchema),
  pendingReceivedCount: z.number(),
  pendingSentCount: z.number(),
});

export const blessingSchema = strictObject({
  id: z.number(),
  name: z.string(),
  tier: z.string(),
  iconPath: z.string(),
  owned: z.boolean(),
  cost: z.number(),
});

export const blessSnapshotSchema = strictObject({
  ownedCount: z.number(),
  skillLossReductionPercent: z.number(),
  itemLossPercent: z.number(),
  hasAolEquipped: z.boolean(),
  blessings: z.array(blessingSchema),
});

export const playerDeathPayloadSchema = strictObject({
  expLost: z.number(),
  levelBefore: z.number(),
  levelAfter: z.number(),
  itemsDeathLost: z.array(z.unknown()),
  blessingsBeforeDeathCount: z.number(),
  hadAolEquipped: z.boolean(),
  aolConsumed: z.boolean(),
  mode: z.string(),
  deathAt: z.string(),
  killedByMonsterId: z.number().nullable().optional(),
});

export const rgbColorSchema = looseObject({
  r: z.number().optional(),
  g: z.number().optional(),
  b: z.number().optional(),
});

export const outfitSavePayloadSchema = looseObject({
  headColor: rgbColorSchema.optional(),
  bodyColor: rgbColorSchema.optional(),
  armColor: rgbColorSchema.optional(),
  legColor: rgbColorSchema.optional(),
  characterId: z.string(),
  outfitSelected: z.number(),
  isMale: z.boolean(),
  mountId: z.number().nullable(),
  displayAddon1: z.boolean(),
  displayAddon2: z.boolean(),
  avatarId: z.number(),
  requestId: z.string(),
});

export const setAutoFinishHuntPayloadSchema = strictObject({
  enabled: z.boolean(),
});

export const outfitCatalogEntrySchema = looseObject({
  id: z.number(),
  name: z.string(),
  isFree: z.boolean().optional(),
  isPremium: z.boolean().optional(),
  isStore: z.boolean().optional(),
  hasAddon1: z.boolean().optional(),
  hasAddon2: z.boolean().optional(),
  break: z.boolean().optional(),
  chance: z.number().optional(),
  taming: z.record(z.string(), z.unknown()).optional(),
});

export const outfitSnapshotPayloadSchema = looseObject({
  outfits: z.array(outfitCatalogEntrySchema).optional(),
  unlockedOutfits: z.array(z.unknown()).optional(),
  mounts: z.array(outfitCatalogEntrySchema).optional(),
  unlockedMount: z.array(z.unknown()).optional(),
  requestId: z.string().optional(),
});

export const outfitActionResultPayloadSchema = looseObject({
  action: z.string().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
  requestId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Send payload schemas
// ---------------------------------------------------------------------------

export const authPayloadSchema = strictObject({
  tokenKey: z.string(),
  characterId: z.string().optional(),
  worldId: z.number().optional(),
  clientDeviceType: z.string().optional(),
});

export const pingSendPayloadSchema = strictObject({ t: z.number() });

export const chatSendPayloadSchema = strictObject({
  channel: z.string(),
  message: z.string(),
});

export const weaponMasterySelectPerkPayloadSchema = strictObject({
  weaponKey: z.string(),
  tier: z.number(),
  perkId: z.string(),
});

export const questTaskPayloadSchema = strictObject({
  questId: z.number(),
  missionId: z.number(),
});

export const questClaimRewardPayloadSchema = strictObject({
  questId: z.number(),
  missionId: z.number(),
  selectedChoiceId: z.union([z.number(), z.string()]).nullable(),
});

export const blessBuyPayloadSchema = strictObject({
  blessingId: z.number(),
});

export const startHuntPayloadSchema = strictObject({
  huntId: z.number(),
  skillsSelected: z.array(z.string().nullable()),
});

export const partyReadyCheckConfirmPayloadSchema = strictObject({
  readyCheckId: z.string(),
});

export const partyInvitePayloadSchema = strictObject({ inviteId: z.string() });

export const goldTransferPayloadSchema = strictObject({
  targetName: z.string(),
  amount: z.number(),
  requestId: z.string(),
});

export const goldTransferResultPayloadSchema = strictObject({
  success: z.boolean().optional(),
  message: z.string().optional(),
  requestId: z.string(),
});

/** Synthetic receive type bridged from binary 0x0d gold wallet pushes. */
export const goldBalancePayloadSchema = strictObject({
  goldCoins: z.number(),
});

export const huntChangePartyPositionPayloadSchema = strictObject({
  x: z.number(),
  y: z.number(),
});

export const huntLureIdPayloadSchema = strictObject({ lureId: z.number() });

export const quickSellItemsPayloadSchema = strictObject({
  itemIds: z.array(z.number()),
  deselectedItemIds: z.array(z.number()).optional(),
});

export const quickSellSetPreferencesPayloadSchema = strictObject({
  deselectedItemIds: z.array(z.number()),
});

/** 1-based heal slot: 1=primary … 4=quaternary. */
export const selectHealPayloadSchema = strictObject({
  selectedHeal: z.string(),
  selectedHealPercent: z.number(),
  healIdx: z.number().int().min(1).max(4),
});

export const selectArrowPayloadSchema = strictObject({
  selectedArrow: z.string().nullable(),
});

export const selectManaPotionPayloadSchema = strictObject({
  selectedManaPotion: z.string().optional(),
  selectedManaPotionPercent: z.number(),
});

export const selectSkillsPayloadSchema = strictObject({
  selectedSkills: z.array(z.string().nullable()),
  selectedSupportSkill: z.string().nullable(),
  selectedSupportSkills: z.array(z.string().nullable()),
  selectedSkillsMinCreatures: z.record(z.string(), z.number()),
});

export const npcBuyItemPayloadSchema = strictObject({
  itemId: z.number(),
  quantity: z.number(),
});

export const appearanceShopBuyPayloadSchema = strictObject({
  shopId: z.string(),
  offerId: z.string(),
});

export const depotMoveItemPayloadSchema = strictObject({
  inventoryId: z.string(),
  toDepot: z.boolean(),
  depotBoxIndex: z.number(),
});

export const housePublicSnapshotPayloadSchema = strictObject({
  houseId: z.number(),
});

export const bossIdPayloadSchema = strictObject({
  bossId: z.number(),
});

export const marketGetSnapshotPayloadSchema = strictObject({
  page: z.number(),
  filters: marketFiltersSchema,
  referenceOrderId: z.string().nullable().optional(),
});

export const marketCreateOrderPayloadSchema = strictObject({
  itemId: z.number(),
  tier: z.number().optional(),
  eachPrice: z.number(),
  itemAmount: z.number(),
  isBuyOrder: z.boolean(),
});

export const marketResolveOrderPayloadSchema = strictObject({
  orderId: z.string(),
  amount: z.number(),
  side: z.enum(["buy", "sell"]).optional(),
});

export const coinMarketGetSnapshotPayloadSchema = strictObject({
  buyPage: z.number(),
  sellPage: z.number(),
  myPage: z.number(),
});

export const coinMarketResolveOrderPayloadSchema = strictObject({
  orderId: z.string(),
  amount: z.number(),
  buyPage: z.number().optional(),
  sellPage: z.number().optional(),
  myPage: z.number().optional(),
});

export const coinMarketActionResultPayloadSchema = looseObject({
  action: z.string().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
});

export const paginationInfoSchema = strictObject({
  page: z.number(),
  pageSize: z.number(),
  totalOrders: z.number(),
  totalPages: z.number(),
});

export const coinMarketOrderSchema = looseObject({
  id: z.string().optional(),
  worldId: z.number().optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  amount: z.number().optional(),
  remainingAmount: z.number().optional(),
  unitGoldPrice: z.number().optional(),
  totalGold: z.number().optional(),
  createdAt: z.string().optional(),
  isOwn: z.boolean().optional(),
  isOwnCharacter: z.boolean().optional(),
});

export const coinMarketLimitsSchema = strictObject({
  maxOrderAmount: z.number(),
  maxUnitGoldPrice: z.number(),
  maxTotalGold: z.number(),
});

export const rankingEntrySchema = strictObject({
  id: z.string(),
  top: z.number(),
  totalExp: z.number(),
  level: z.number(),
  name: z.string(),
  vocation: z.string(),
});

export const rankingNextUpdateSchema = strictObject({
  hours: z.number(),
  minutes: z.number(),
});

export const rankingGetSnapshotPayloadSchema = strictObject({
  requestId: z.string(),
  searchText: z.string(),
});

export const rankingSnapshotPayloadSchema = strictObject({
  requestId: z.string(),
  ranking: z.array(rankingEntrySchema),
  nextUpdate: rankingNextUpdateSchema,
});

export const startTrainingPayloadSchema = strictObject({
  trainingType: z.string(),
  exerciseWeaponBoostId: z.number().nullable(),
  skillToTrain: z.string(),
});

export const trainingPresencePayloadSchema = strictObject({
  trainingId: z.string(),
});

export const sendPayloadSchemas = {
  [SendMessageTypes.AUTH]: authPayloadSchema,
  [SendMessageTypes.PING]: pingSendPayloadSchema,
  [SendMessageTypes.CHAT_SEND]: chatSendPayloadSchema,
  [SendMessageTypes.WEAPON_MASTERY_GET_STATE]: emptyPayloadSchema,
  [SendMessageTypes.WEAPON_MASTERY_SELECT_PERK]: weaponMasterySelectPerkPayloadSchema,
  [SendMessageTypes.TRAINING_GET_SNAPSHOT]: emptyPayloadSchema,
  [SendMessageTypes.START_TRAINING]: startTrainingPayloadSchema,
  [SendMessageTypes.FINISH_TRAINING]: emptyPayloadSchema,
  [SendMessageTypes.TRAINING_PRESENCE_SUBSCRIBE]: trainingPresencePayloadSchema,
  [SendMessageTypes.TRAINING_PRESENCE_UNSUBSCRIBE]: trainingPresencePayloadSchema,
  [SendMessageTypes.PARTY_GET_SNAPSHOT]: emptyPayloadSchema,
  [SendMessageTypes.FRIENDS_GET_SNAPSHOT]: emptyPayloadSchema,
  [SendMessageTypes.TRADE_GET_SNAPSHOT]: emptyPayloadSchema,
  [SendMessageTypes.BLESS_GET_SNAPSHOT]: emptyPayloadSchema,
  [SendMessageTypes.BLESS_BUY]: blessBuyPayloadSchema,
  [SendMessageTypes.DEATH_MODAL_ACK]: emptyPayloadSchema,
  [SendMessageTypes.QUEST_GET_SNAPSHOT]: emptyPayloadSchema,
  [SendMessageTypes.QUEST_DELIVER_MONSTER_TASK]: questTaskPayloadSchema,
  [SendMessageTypes.QUEST_CLAIM_REWARD]: questClaimRewardPayloadSchema,
  [SendMessageTypes.QUEST_START_MONSTER_TASK]: questTaskPayloadSchema,
  [SendMessageTypes.START_HUNT]: startHuntPayloadSchema,
  [SendMessageTypes.LEAVE_HUNT]: emptyPayloadSchema,
  [SendMessageTypes.PARTY_READY_CHECK_CONFIRM]: partyReadyCheckConfirmPayloadSchema,
  [SendMessageTypes.PARTY_LEAVE]: emptyPayloadSchema,
  [SendMessageTypes.PARTY_CREATE]: emptyPayloadSchema,
  [SendMessageTypes.PARTY_ACCEPT_INVITE]: partyInvitePayloadSchema,
  [SendMessageTypes.PARTY_REJECT_INVITE]: partyInvitePayloadSchema,
  [SendMessageTypes.PARTY_DISBAND]: emptyPayloadSchema,
  [SendMessageTypes.PARTY_LOOT_SPLITTER_RESET]: emptyPayloadSchema,
  [SendMessageTypes.GOLD_TRANSFER]: goldTransferPayloadSchema,
  [SendMessageTypes.HUNT_CHANGE_PARTY_POSITION]: huntChangePartyPositionPayloadSchema,
  [SendMessageTypes.HUNT_LURE_ID]: huntLureIdPayloadSchema,
  [SendMessageTypes.QUICK_SELL_ITEMS]: quickSellItemsPayloadSchema,
  [SendMessageTypes.QUICK_SELL_SET_PREFERENCES]: quickSellSetPreferencesPayloadSchema,
  [SendMessageTypes.SELECT_ARROW]: selectArrowPayloadSchema,
  [SendMessageTypes.SELECT_HEAL]: selectHealPayloadSchema,
  [SendMessageTypes.SELECT_MANA_POTION]: selectManaPotionPayloadSchema,
  [SendMessageTypes.SELECT_SKILLS]: selectSkillsPayloadSchema,
  [SendMessageTypes.MARKET_GET_SNAPSHOT]: marketGetSnapshotPayloadSchema,
  [SendMessageTypes.MARKET_CREATE_ORDER]: marketCreateOrderPayloadSchema,
  [SendMessageTypes.MARKET_RESOLVE_ORDER]: marketResolveOrderPayloadSchema,
  [SendMessageTypes.COIN_MARKET_GET_SNAPSHOT]: coinMarketGetSnapshotPayloadSchema,
  [SendMessageTypes.COIN_MARKET_RESOLVE_ORDER]: coinMarketResolveOrderPayloadSchema,
  [SendMessageTypes.GET_TASKS]: emptyPayloadSchema,
  [SendMessageTypes.RANKING_GET_SNAPSHOT]: rankingGetSnapshotPayloadSchema,
  [SendMessageTypes.WHEEL_OF_DESTINY_GET_SNAPSHOT]: emptyPayloadSchema,
  [SendMessageTypes.OUTFIT_SAVE]: outfitSavePayloadSchema,
  [SendMessageTypes.SET_AUTO_FINISH_HUNT_BY_GOLD]: setAutoFinishHuntPayloadSchema,
  [SendMessageTypes.SET_AUTO_FINISH_HUNT_BY_CAPACITY]: setAutoFinishHuntPayloadSchema,
  [SendMessageTypes.NPC_CLAIM_STARTER_ITEM]: emptyPayloadSchema,
  [SendMessageTypes.NPC_BUY_ITEM]: npcBuyItemPayloadSchema,
  [SendMessageTypes.APPEARANCE_SHOP_BUY]: appearanceShopBuyPayloadSchema,
  [SendMessageTypes.DEPOT_MOVE_ITEM]: depotMoveItemPayloadSchema,
  [SendMessageTypes.HOUSE_PUBLIC_SNAPSHOT]: housePublicSnapshotPayloadSchema,
  [SendMessageTypes.ADD_DAILY_BOSS]: bossIdPayloadSchema,
  [SendMessageTypes.START_BOSS_FIGHT]: bossIdPayloadSchema,
} as const satisfies Record<SendMessageType, z.ZodType>;

// ---------------------------------------------------------------------------
// Receive payload schemas
// ---------------------------------------------------------------------------

export const pongPayloadSchema = looseObject({ t: z.number().optional() });

export const accountSessionReplacedPayloadSchema = looseObject({
  message: z.string().optional(),
});

export const huntFinishedPayloadSchema = looseObject({
  reason: z.string().optional(),
});

export const huntUpdateLurePayloadSchema = strictObject({
  lureId: z.number().optional(),
});

export const huntUpdatePlayersPayloadSchema = looseObject({
  players: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const huntPhaseUpdatePayloadSchema = looseObject({
  mode: z.string().optional(),
  phase: z.string().optional(),
  phaseStartedAt: z.number().optional(),
  phaseEndsAt: z.number().optional(),
});

export const tasksSnapshotPayloadSchema = looseObject({
  activeMonsterTasks: z.array(activeMonsterTaskSchema).optional(),
});

export const questActionResultPayloadSchema = looseObject({
  action: z.string().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
});

export const actionResultPayloadSchema = looseObject({
  action: z.string().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
  display: z.string().optional(),
});

export const npcStarterItemClaimResultPayloadSchema = looseObject({
  success: z.boolean().optional(),
  message: z.string().optional(),
  itemId: z.number().optional(),
});

export const npcItemShopPurchaseResultPayloadSchema = looseObject({
  success: z.boolean().optional(),
  message: z.string().optional(),
  itemId: z.number().optional(),
  quantity: z.number().optional(),
  price: z.number().optional(),
  totalPrice: z.number().optional(),
});

export const appearanceShopPurchaseResultPayloadSchema = looseObject({
  shopId: z.string().optional(),
  offerId: z.string().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
  rewardType: z.string().optional(),
  outfitId: z.number().optional(),
  goldCost: z.number().optional(),
});

export const characterPatchPayloadSchema = looseObject({
  unlockedAddons1: z.array(z.number()).optional(),
  unlockedAddons2: z.array(z.number()).optional(),
});

export const depotInventoryItemSchema = looseObject({
  id: z.string().optional(),
  characterId: z.string().optional(),
  itemId: z.number().optional(),
  amount: z.number().optional(),
  equipedSlot: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  isUnique: z.boolean().optional(),
  charges: z.number().nullable().optional(),
  rarity: z.string().nullable().optional(),
  extraAttributes: z.array(z.string()).optional(),
  tier: z.number().optional(),
});

export const depotPatchPayloadSchema = looseObject({
  boxIndex: z.number().optional(),
  upserts: z.array(depotInventoryItemSchema).optional(),
  depotCount: z.number().optional(),
  depotLimit: z.number().optional(),
});

export const housePublicSnapshotReceivePayloadSchema = looseObject({
  houseId: z.number().optional(),
  publicHouse: z.unknown().nullable().optional(),
  top: z.array(z.unknown()).optional(),
});

export const bossRotationEntrySchema = looseObject({
  id: z.number().optional(),
  monsterId: z.number().optional(),
  rarity: z.number().optional(),
  bossType: z.string().optional(),
  recommendedLevel: z.number().optional(),
  monster: z.unknown().optional(),
});

export const bossRotationUpdatePayloadSchema = looseObject({
  availableBosses: z.array(z.number()).optional(),
  killedBosses: z.array(z.number()).optional(),
  bosses: z.array(bossRotationEntrySchema).optional(),
  nextRotations: rankingNextUpdateSchema.optional(),
  resetAt: z.string().optional(),
  serverTime: z.string().optional(),
});

export const bosstiaryUpdatePayloadSchema = looseObject({
  bossId: z.number().optional(),
  killCount: z.number().optional(),
  bossPoints: z.number().optional(),
});

export const partyActionResultPayloadSchema = strictObject({
  action: z.string().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
  display: z.string().optional(),
  cooldownRemainingMs: z.number().optional(),
});

export const chatMessagePayloadSchema = looseObject({
  channel: z.string().optional(),
  message: z.string().optional(),
  sender: z.string().optional(),
});

export const systemMessagePayloadSchema = looseObject({
  message: z.string().optional(),
});

export const equipmentSlotPatchSchema = looseObject({
  extraAttributes: z.array(z.string()).optional(),
});

export const equipmentPatchPayloadSchema = looseObject({
  slots: z.record(z.string(), equipmentSlotPatchSchema.nullable()),
});

export const coinMarketSnapshotPayloadSchema = looseObject({
  worldId: z.number().optional(),
  buyPage: paginationInfoSchema.optional(),
  sellPage: paginationInfoSchema.optional(),
  myPage: paginationInfoSchema.optional(),
  buyOrders: z.array(coinMarketOrderSchema).optional(),
  sellOrders: z.array(coinMarketOrderSchema).optional(),
  myOrders: z.array(coinMarketOrderSchema).optional(),
  limits: coinMarketLimitsSchema.optional(),
});

export const receivePayloadSchemas = {
  [ReceiveMessageTypes.PONG]: pongPayloadSchema,
  [ReceiveMessageTypes.SESSION_BOOTSTRAP]: sessionBootstrapSchema,
  [ReceiveMessageTypes.ACCOUNT_SESSION_REPLACED]: accountSessionReplacedPayloadSchema,
  [ReceiveMessageTypes.ACCOUNT_SNAPSHOT]: openPayloadSchema,
  [ReceiveMessageTypes.UPDATE_LEVELINFO]: updateLevelInfoSchema,
  [ReceiveMessageTypes.EQUIPMENT_UPDATE]: openPayloadSchema,
  [ReceiveMessageTypes.EQUIPMENT_PATCH]: equipmentPatchPayloadSchema,
  [ReceiveMessageTypes.UPDATE_BATTLE_CONFIG]: battleConfigSchema,
  [ReceiveMessageTypes.STORE_PRODUCTS]: openPayloadSchema,
  [ReceiveMessageTypes.BOOST_INVENTORY_SNAPSHOT]: boostInventorySnapshotSchema,
  [ReceiveMessageTypes.HOUSE_SNAPSHOT]: houseSnapshotSchema,
  [ReceiveMessageTypes.PREY_SNAPSHOT]: preySnapshotSchema,
  [ReceiveMessageTypes.DAILY_REWARD_SNAPSHOT]: dailyRewardSnapshotSchema,
  [ReceiveMessageTypes.WHEEL_OF_DESTINY_SNAPSHOT]: wheelOfDestinySnapshotSchema,
  [ReceiveMessageTypes.TRAINING_BOOTSTRAP]: trainingBootstrapSchema,
  [ReceiveMessageTypes.TRAINING_FINISHED]: trainingFinishedSchema,
  [ReceiveMessageTypes.FRIENDS_SNAPSHOT]: friendsSnapshotSchema,
  [ReceiveMessageTypes.TRADE_SNAPSHOT]: tradeSnapshotSchema,
  [ReceiveMessageTypes.PARTY_SNAPSHOT]: partySnapshotSchema,
  [ReceiveMessageTypes.PARTY_ACTION_RESULT]: partyActionResultPayloadSchema,
  [ReceiveMessageTypes.WEAPON_MASTERY_ACTION_RESULT]: actionResultPayloadSchema,
  [ReceiveMessageTypes.GOLD_TRANSFER_RESULT]: goldTransferResultPayloadSchema,
  [ReceiveMessageTypes.GOLD_BALANCE]: goldBalancePayloadSchema,
  [ReceiveMessageTypes.BLESS_SNAPSHOT]: blessSnapshotSchema,
  [ReceiveMessageTypes.BLESS_ACTION_RESULT]: actionResultPayloadSchema,
  [ReceiveMessageTypes.PLAYER_DEATH]: playerDeathPayloadSchema,
  [ReceiveMessageTypes.CHAT_MESSAGE]: chatMessagePayloadSchema,
  [ReceiveMessageTypes.SYSTEM_MESSAGE]: systemMessagePayloadSchema,
  [ReceiveMessageTypes.HUNT_BOOTSTRAP]: huntBootstrapSchema,
  [ReceiveMessageTypes.HUNT_UPDATE_PLAYERS]: huntUpdatePlayersPayloadSchema,
  [ReceiveMessageTypes.HUNT_PHASE_UPDATE]: huntPhaseUpdatePayloadSchema,
  [ReceiveMessageTypes.HUNT_FINISHED]: huntFinishedPayloadSchema,
  [ReceiveMessageTypes.HUNT_UPDATE_LURE]: huntUpdateLurePayloadSchema,
  [ReceiveMessageTypes.MARKET_SNAPSHOT]: marketSnapshotSchema,
  [ReceiveMessageTypes.MARKET_ACTION_RESULT]: actionResultPayloadSchema,
  [ReceiveMessageTypes.COIN_MARKET_SNAPSHOT]: coinMarketSnapshotPayloadSchema,
  [ReceiveMessageTypes.COIN_MARKET_ACTION_RESULT]: coinMarketActionResultPayloadSchema,
  [ReceiveMessageTypes.TASKS_SNAPSHOT]: tasksSnapshotPayloadSchema,
  [ReceiveMessageTypes.QUEST_ACTION_RESULT]: questActionResultPayloadSchema,
  [ReceiveMessageTypes.RANKING_SNAPSHOT]: rankingSnapshotPayloadSchema,
  [ReceiveMessageTypes.OUTFIT_SNAPSHOT]: outfitSnapshotPayloadSchema,
  [ReceiveMessageTypes.OUTFIT_ACTION_RESULT]: outfitActionResultPayloadSchema,
  [ReceiveMessageTypes.NPC_STARTER_ITEM_CLAIM_RESULT]: npcStarterItemClaimResultPayloadSchema,
  [ReceiveMessageTypes.NPC_ITEM_SHOP_PURCHASE_RESULT]: npcItemShopPurchaseResultPayloadSchema,
  [ReceiveMessageTypes.APPEARANCE_SHOP_PURCHASE_RESULT]: appearanceShopPurchaseResultPayloadSchema,
  [ReceiveMessageTypes.CHARACTER_PATCH]: characterPatchPayloadSchema,
  [ReceiveMessageTypes.DEPOT_PATCH]: depotPatchPayloadSchema,
  [ReceiveMessageTypes.HOUSE_PUBLIC_SNAPSHOT]: housePublicSnapshotReceivePayloadSchema,
  [ReceiveMessageTypes.BOSS_ROTATION_UPDATE]: bossRotationUpdatePayloadSchema,
  [ReceiveMessageTypes.BOSSTIARY_UPDATE]: bosstiaryUpdatePayloadSchema,
} as const satisfies Record<ReceiveMessageType, z.ZodType>;

// ---------------------------------------------------------------------------
// Types derived from schemas
// ---------------------------------------------------------------------------

export type EmptyPayload = z.infer<typeof emptyPayloadSchema>;
export type AutoEquipSlot = z.infer<typeof autoEquipSlotSchema>;
export type BattleConfigPayload = z.infer<typeof battleConfigSchema>;
export type MarketFilters = z.infer<typeof marketFiltersSchema>;
export type MarketOrder = z.infer<typeof marketOrderSchema>;
export type MarketSnapshotData = z.infer<typeof marketSnapshotSchema>;
export type ActiveMonsterTask = z.infer<typeof activeMonsterTaskSchema>;
export type XpRateBreakdown = z.infer<typeof xpRateBreakdownSchema>;
export type CharacterSkills = z.infer<typeof characterSkillsSchema>;
export type UpdateLevelInfoPayload = z.infer<typeof updateLevelInfoSchema>;
export type ProtocolPartyMember = z.infer<typeof protocolPartyMemberSchema>;
export type PartyReadyCheck = z.infer<typeof partyReadyCheckSchema>;
export type PartyLootSplitterTotals = z.infer<typeof partyLootSplitterTotalsSchema>;
export type PartyLootSplitterMember = z.infer<typeof partyLootSplitterMemberSchema>;
export type PartyLootSplitterSplit = z.infer<typeof partyLootSplitterSplitSchema>;
export type PartyLootSplitter = z.infer<typeof partyLootSplitterSchema>;
export type PartyReceivedInvite = z.infer<typeof partyReceivedInviteSchema>;
export type ProtocolParty = z.infer<typeof protocolPartySchema>;
export type PartySnapshotPayload = z.infer<typeof partySnapshotSchema>;
export type ProtocolCharacter = z.infer<typeof protocolCharacterSchema>;
export type SessionBootstrapPayload = z.infer<typeof sessionBootstrapSchema>;
export type ProtocolHunt = z.infer<typeof protocolHuntSchema>;
export type HuntBootstrapPayload = z.infer<typeof huntBootstrapSchema>;
export type HuntUpdateLurePayload = z.infer<typeof huntUpdateLurePayloadSchema>;
export type HuntUpdatePlayersPayload = z.infer<typeof huntUpdatePlayersPayloadSchema>;
export type HuntPhaseUpdatePayload = z.infer<typeof huntPhaseUpdatePayloadSchema>;
export type TasksSnapshotPayload = z.infer<typeof tasksSnapshotPayloadSchema>;
export type QuestActionResultPayload = z.infer<typeof questActionResultPayloadSchema>;
export type ActionResultPayload = z.infer<typeof actionResultPayloadSchema>;
export type PartyActionResultPayload = z.infer<typeof partyActionResultPayloadSchema>;
export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;
export type SystemMessagePayload = z.infer<typeof systemMessagePayloadSchema>;
export type AccountSessionReplacedPayload = z.infer<typeof accountSessionReplacedPayloadSchema>;
export type PongPayload = z.infer<typeof pongPayloadSchema>;
export type CoinMarketSnapshotPayload = z.infer<typeof coinMarketSnapshotPayloadSchema>;
export type TrainingExerciseWeapon = z.infer<typeof trainingExerciseWeaponSchema>;
export type ActiveTraining = z.infer<typeof activeTrainingSchema>;
export type TrainingProjected = z.infer<typeof trainingProjectedSchema>;
export type TrainingScenePosition = z.infer<typeof trainingScenePositionSchema>;
export type TrainingScene = z.infer<typeof trainingSceneSchema>;
export type TrainingState = z.infer<typeof trainingStateSchema>;
export type TrainingBootstrapPayload = z.infer<typeof trainingBootstrapSchema>;
export type TrainingFinishedPayload = z.infer<typeof trainingFinishedSchema>;
export type BoostInventoryItem = z.infer<typeof boostInventoryItemSchema>;
export type BoostInventorySnapshotPayload = z.infer<typeof boostInventorySnapshotSchema>;
export type HouseItemPosition = z.infer<typeof houseItemPositionSchema>;
export type CharacterHouseItem = z.infer<typeof characterHouseItemSchema>;
export type CharacterHouse = z.infer<typeof characterHouseSchema>;
export type UnlockedHouse = z.infer<typeof unlockedHouseSchema>;
export type HouseSnapshotPayload = z.infer<typeof houseSnapshotSchema>;
export type TradeInvite = z.infer<typeof tradeInviteSchema>;
export type ActiveTrade = z.infer<typeof activeTradeSchema>;
export type TradeSnapshotPayload = z.infer<typeof tradeSnapshotSchema>;
export type PreySlot = z.infer<typeof preySlotSchema>;
export type PreySnapshotPayload = z.infer<typeof preySnapshotSchema>;
export type DailyRewardClaimAmount = z.infer<typeof dailyRewardClaimAmountSchema>;
export type DailyRewardClaimPreview = z.infer<typeof dailyRewardClaimPreviewSchema>;
export type DailyRewardExerciseOption = z.infer<typeof dailyRewardExerciseOptionSchema>;
export type DailyRewardSequenceDay = z.infer<typeof dailyRewardSequenceDaySchema>;
export type DailyRewardStreakTierMinStreak = z.infer<typeof dailyRewardStreakTierMinStreakSchema>;
export type DailyRewardTypeConfig = z.infer<typeof dailyRewardTypeConfigSchema>;
export type DailyRewardConfig = z.infer<typeof dailyRewardConfigSchema>;
export type DailyRewardSnapshotPayload = z.infer<typeof dailyRewardSnapshotSchema>;
export type WheelOfDestinySnapshotPayload = z.infer<typeof wheelOfDestinySnapshotSchema>;
export type ProtocolFriend = z.infer<typeof protocolFriendSchema>;
export type FriendRequest = z.infer<typeof friendRequestSchema>;
export type FriendsSnapshotPayload = z.infer<typeof friendsSnapshotSchema>;
export type Blessing = z.infer<typeof blessingSchema>;
export type BlessSnapshotPayload = z.infer<typeof blessSnapshotSchema>;
export type BlessBuyPayload = z.infer<typeof blessBuyPayloadSchema>;
export type PlayerDeathPayload = z.infer<typeof playerDeathPayloadSchema>;

/** Game client auth frame (matches stonegy-online.com WebSocket handshake). */
export type AuthPayload = z.infer<typeof authPayloadSchema>;
export type PingSendPayload = z.infer<typeof pingSendPayloadSchema>;
export type ChatSendPayload = z.infer<typeof chatSendPayloadSchema>;
export type QuestTaskPayload = z.infer<typeof questTaskPayloadSchema>;
export type QuestClaimRewardPayload = z.infer<typeof questClaimRewardPayloadSchema>;
export type StartHuntPayload = z.infer<typeof startHuntPayloadSchema>;
export type PartyReadyCheckConfirmPayload = z.infer<typeof partyReadyCheckConfirmPayloadSchema>;
export type PartyInvitePayload = z.infer<typeof partyInvitePayloadSchema>;
export type GoldTransferPayload = z.infer<typeof goldTransferPayloadSchema>;
export type GoldTransferResultPayload = z.infer<typeof goldTransferResultPayloadSchema>;
export type GoldBalancePayload = z.infer<typeof goldBalancePayloadSchema>;
export type HuntChangePartyPositionPayload = z.infer<typeof huntChangePartyPositionPayloadSchema>;
export type HuntLureIdPayload = z.infer<typeof huntLureIdPayloadSchema>;
export type QuickSellItemsPayload = z.infer<typeof quickSellItemsPayloadSchema>;
export type QuickSellSetPreferencesPayload = z.infer<typeof quickSellSetPreferencesPayloadSchema>;
export type SelectArrowPayload = z.infer<typeof selectArrowPayloadSchema>;
export type SelectHealPayload = z.infer<typeof selectHealPayloadSchema>;
export type SelectManaPotionPayload = z.infer<typeof selectManaPotionPayloadSchema>;
export type SelectSkillsPayload = z.infer<typeof selectSkillsPayloadSchema>;
export type NpcBuyItemPayload = z.infer<typeof npcBuyItemPayloadSchema>;
export type NpcItemShopPurchaseResultPayload = z.infer<typeof npcItemShopPurchaseResultPayloadSchema>;
export type AppearanceShopBuyPayload = z.infer<typeof appearanceShopBuyPayloadSchema>;
export type DepotMoveItemPayload = z.infer<typeof depotMoveItemPayloadSchema>;
export type HousePublicSnapshotPayload = z.infer<typeof housePublicSnapshotPayloadSchema>;
export type AppearanceShopPurchaseResultPayload = z.infer<
  typeof appearanceShopPurchaseResultPayloadSchema
>;
export type CharacterPatchPayload = z.infer<typeof characterPatchPayloadSchema>;
export type DepotPatchPayload = z.infer<typeof depotPatchPayloadSchema>;
export type HousePublicSnapshotReceivePayload = z.infer<
  typeof housePublicSnapshotReceivePayloadSchema
>;
export type BossIdPayload = z.infer<typeof bossIdPayloadSchema>;
export type BossRotationUpdatePayload = z.infer<typeof bossRotationUpdatePayloadSchema>;
export type BosstiaryUpdatePayload = z.infer<typeof bosstiaryUpdatePayloadSchema>;
export type MarketGetSnapshotPayload = z.infer<typeof marketGetSnapshotPayloadSchema>;
export type MarketCreateOrderPayload = z.infer<typeof marketCreateOrderPayloadSchema>;
export type MarketResolveOrderPayload = z.infer<typeof marketResolveOrderPayloadSchema>;
export type CoinMarketGetSnapshotPayload = z.infer<typeof coinMarketGetSnapshotPayloadSchema>;
export type StartTrainingPayload = z.infer<typeof startTrainingPayloadSchema>;
export type TrainingPresencePayload = z.infer<typeof trainingPresencePayloadSchema>;

export type TrainingType = StartTrainingPayload["trainingType"];
export type SkillToTrain = StartTrainingPayload["skillToTrain"];

export type PartyVocation = ProtocolPartyMember["vocation"];
export type PartyStatus = ProtocolParty["status"];
export type PartyReadyCheckMemberStatus = NonNullable<PartyReadyCheck["memberStatuses"]>[string];
export type HuntFinishedPayload = z.infer<typeof huntFinishedPayloadSchema>;
export type HuntFinishedReason = NonNullable<HuntFinishedPayload["reason"]>;
export type QuestAction = NonNullable<QuestActionResultPayload["action"]>;
export type PartyAction = NonNullable<PartyActionResultPayload["action"]>;
export type PartyActionDisplay = NonNullable<PartyActionResultPayload["display"]>;
export type PreySlotOption = PreySlot["option"];
export type DailyRewardType = DailyRewardClaimPreview["type"];
export type BlessingTier = Blessing["tier"];

/** Auth bootstrap snapshots — only fields used by the bot are typed explicitly. */
export type AccountSnapshotPayload = z.infer<typeof openPayloadSchema>;
export type EquipmentUpdatePayload = z.infer<typeof openPayloadSchema>;
export type EquipmentPatchPayload = z.infer<typeof equipmentPatchPayloadSchema>;
export type StoreProductsPayload = z.infer<typeof openPayloadSchema>;

export type SendPayloadMap = {
  [K in SendMessageType]: z.infer<(typeof sendPayloadSchemas)[K]>;
};

export type ReceivePayloadMap = {
  [K in ReceiveMessageType]: z.infer<(typeof receivePayloadSchemas)[K]>;
};

export type SendMessage<T extends SendMessageType = SendMessageType> = {
  [K in SendMessageType]: { type: K; data?: SendPayloadMap[K] };
}[T];

export type ReceiveMessage<T extends ReceiveMessageType = ReceiveMessageType> = {
  [K in ReceiveMessageType]: { type: K; data?: ReceivePayloadMap[K] };
}[T];

export type StonegyMessage = SendMessage | ReceiveMessage;

export type SendPayload<T extends SendMessageType> = SendPayloadMap[T];
export type ReceivePayload<T extends ReceiveMessageType> = ReceivePayloadMap[T];
export type MessagePayload<T extends StonegyMessage["type"]> = Extract<
  StonegyMessage,
  { type: T }
>["data"];

export type SendMessageTypeFromSchema = keyof typeof sendPayloadSchemas;
export type ReceiveMessageTypeFromSchema = keyof typeof receivePayloadSchemas;
export type SendPayloadFromSchema<T extends SendMessageTypeFromSchema> = z.infer<
  (typeof sendPayloadSchemas)[T]
>;
export type ReceivePayloadFromSchema<T extends ReceiveMessageTypeFromSchema> = z.infer<
  (typeof receivePayloadSchemas)[T]
>;

// ---------------------------------------------------------------------------
// Binary payload schemas
//
// Kept next to JSON send/receive schemas so JSON→binary migrations are visible:
// when the game moves a message from JSON to binary, share (or move) the schema
// between receivePayloadSchemas and binaryPayloadSchemas. GOLD_BALANCE /
// goldBalancePayloadSchema is the precedent (JSON receive + binary 0x0d).
//
// Keys of binaryPayloadSchemas match StonegyBinaryMessageType enum values.
// ---------------------------------------------------------------------------

export const entityRefSchema = strictObject({
  bytes: z.instanceof(Uint8Array),
  hex: z.string(),
});
export type EntityRef = z.infer<typeof entityRefSchema>;

export const huntEntitySpawnEntrySchema = looseObject({
  marker: z.number(),
  uuid: z.string(),
  value: z.number(),
  fieldB: z.number().optional(),
  fieldC: z.number().optional(),
  fieldD: z.number().optional(),
  payloadLen: z.number().optional(),
});
export type HuntEntitySpawnEntry = z.infer<typeof huntEntitySpawnEntrySchema>;

export const huntEntitySpawnBodySchema = looseObject({
  entityCount: z.number(),
  huntId: z.number(),
  lureId: z.number(),
  entities: z.array(huntEntitySpawnEntrySchema),
  footerFlags: z.array(z.number()).optional(),
});
export type HuntEntitySpawnBody = z.infer<typeof huntEntitySpawnBodySchema>;

export const monsterLootDropEntrySchema = strictObject({
  groundUuid: z.string(),
  itemId: z.number(),
  amount: z.number(),
  /** Same layout as inventory snapshot flagsA (high word = remaining charge/duration). */
  flagsA: z.number(),
  flagsB: z.number(),
  remainingUnits: z.number(),
});
export type MonsterLootDropEntry = z.infer<typeof monsterLootDropEntrySchema>;

export const monsterLootBodySchema = strictObject({
  subType: z.literal(1),
  totalLootValue: z.number(),
  dropCount: z.number(),
  drops: z.array(monsterLootDropEntrySchema),
});
export type MonsterLootBody = z.infer<typeof monsterLootBodySchema>;

export const itemGrantBodySchema = strictObject({
  subType: z.literal(0),
  // Same item fields as a single monster_loot drop entry.
  groundUuid: z.string(),
  itemId: z.number(),
  amount: z.number(),
  flagsA: z.number(),
  flagsB: z.number(),
  remainingUnits: z.number(),
});
export type ItemGrantBody = z.infer<typeof itemGrantBodySchema>;

export const entityUuidListBodySchema = strictObject({
  subType: z.literal(0),
  entityCount: z.number(),
  entityUuids: z.array(z.string()),
});
export type EntityUuidListBody = z.infer<typeof entityUuidListBodySchema>;

export const decodedHuntFrameBodySchema = z.discriminatedUnion("kind", [
  strictObject({ kind: z.literal("monster_loot"), data: monsterLootBodySchema }),
  strictObject({ kind: z.literal("item_grant"), data: itemGrantBodySchema }),
  strictObject({ kind: z.literal("entity_uuid_list"), data: entityUuidListBodySchema }),
]);
export type DecodedHuntFrameBody = z.infer<typeof decodedHuntFrameBodySchema>;

export const huntAnalyzerMonsterEntrySchema = strictObject({
  killCount: z.number(),
  monsterId: z.number(),
});
export type HuntAnalyzerMonsterEntry = z.infer<typeof huntAnalyzerMonsterEntrySchema>;

export const huntAnalyzerLootItemSchema = strictObject({
  amount: z.number(),
  itemId: z.number(),
});
export type HuntAnalyzerLootItem = z.infer<typeof huntAnalyzerLootItemSchema>;

export const huntAnalyzerPartyMemberSchema = looseObject({
  playerId: z.string(),
  name: z.string(),
  lootTotalValue: z.number(),
  suppliesGold: z.number(),
  profitGold: z.number(),
  balanceGold: z.number(),
  huntTimeMs: z.number().optional(),
  isSummaryRow: z.boolean().optional(),
});
export type HuntAnalyzerPartyMember = z.infer<typeof huntAnalyzerPartyMemberSchema>;

export const huntAnalyzerSnapshotBodySchema = looseObject({
  subType: z.number(),
  sessionRefA: z.number(),
  sessionRefB: z.number(),
  sessionMetrics: z.array(z.number()),
  totalKills: z.number(),
  monsterCount: z.number(),
  primaryMonsterId: z.number(),
  monsters: z.array(huntAnalyzerMonsterEntrySchema),
  rawXp: z.number(),
  lootBalanceGold: z.number(),
  xp: z.number(),
  suppliesGold: z.number(),
  lootItems: z.array(huntAnalyzerLootItemSchema),
  partyMembers: z.array(huntAnalyzerPartyMemberSchema),
  partyLeaderTotals: huntAnalyzerPartyMemberSchema.optional(),
});
export type HuntAnalyzerSnapshotBody = z.infer<typeof huntAnalyzerSnapshotBodySchema>;

export const analyzerStatsBodySchema = strictObject({
  subType: z.number(),
  fieldA: z.number(),
  fieldB: z.number(),
  values: z.array(z.number()),
});
export type AnalyzerStatsBody = z.infer<typeof analyzerStatsBodySchema>;

export const killEventBodySchema = strictObject({
  xp: z.number(),
  entityRef: entityRefSchema,
  flag: z.number(),
});
export type KillEventBody = z.infer<typeof killEventBodySchema>;

export const entityUpdateBodySchema = strictObject({
  subType: z.number(),
  indexA: z.number(),
  indexB: z.number(),
  entityRefs: z.array(entityRefSchema),
});
export type EntityUpdateBody = z.infer<typeof entityUpdateBodySchema>;

export const vitalDeltaBodySchema = looseObject({
  targetIndex: z.number(),
  statKind: z.number(),
  sourceIndex: z.number(),
  delta: z.number(),
  extra: z.number().optional(),
  tail: z.number().optional(),
});
export type VitalDeltaBody = z.infer<typeof vitalDeltaBodySchema>;

export const combatDamageBodySchema = strictObject({
  attackerIndex: z.number(),
  targetIndex: z.number(),
  damageKind: z.number(),
  amount: z.number(),
  flag: z.number(),
});
export type CombatDamageBody = z.infer<typeof combatDamageBodySchema>;

export const statusEffectBodySchema = strictObject({
  mode: z.number(),
  targetIndex: z.number(),
  effectId: z.number(),
  value: z.number(),
  duration: z.number(),
  flags: z.number(),
});
export type StatusEffectBody = z.infer<typeof statusEffectBodySchema>;

/** Alias — shared with JSON ReceiveMessageTypes.GOLD_BALANCE. */
export type GoldBalanceBody = GoldBalancePayload;

/** Inventory item entry embedded in ground-item binary frames. */
export const binaryInventoryItemEntrySchema = looseObject({
  uuid: z.string(),
  itemId: z.number(),
  amount: z.number(),
  flagsA: z.number(),
  flagsB: z.number(),
  remainingUnits: z.number(),
  meta: z.number().optional(),
  suffix: z.number().optional(),
});

export const groundItemUpdateBodySchema = looseObject({
  entityRef: entityRefSchema,
  subType: z.number(),
  count: z.number(),
  header: z.array(z.number()).optional(),
  items: z.array(binaryInventoryItemEntrySchema).optional(),
  appearance: z.array(z.number()).optional(),
  relatedEntityRef: entityRefSchema.optional(),
  extra: z.number().optional(),
  item: binaryInventoryItemEntrySchema.optional(),
});
export type GroundItemUpdateBody = z.infer<typeof groundItemUpdateBodySchema>;

export const playerVitalsBodySchema = looseObject({
  currentHp: z.number(),
  currentMana: z.number(),
  huntTimeMs: z.number(),
  raw: z.instanceof(Uint8Array),
});
export type PlayerVitalsBody = z.infer<typeof playerVitalsBodySchema>;

export const xpGainBodySchema = strictObject({
  kind: z.number(),
  xpGain: z.number(),
  sessionXp: z.number(),
});
export type XpGainBody = z.infer<typeof xpGainBodySchema>;

export const sessionMetricBodySchema = strictObject({
  byteA: z.number(),
  byteB: z.number(),
  staminaMs: z.number(),
  field: z.number(),
});
export type SessionMetricBody = z.infer<typeof sessionMetricBodySchema>;

export const counterTripletBodySchema = strictObject({
  kind: z.number(),
  a: z.number(),
  b: z.number(),
  c: z.number(),
});
export type CounterTripletBody = z.infer<typeof counterTripletBodySchema>;

/**
 * Binary receive payloads, keyed by StonegyBinaryMessageType numeric values.
 * Mirrors receivePayloadSchemas: when the game migrates a JSON message to binary,
 * its schema moves (or is shared) between the two maps.
 */
export const binaryPayloadSchemas: Partial<Record<number, z.ZodType>> = {
  0x02: huntEntitySpawnBodySchema, // HuntEntitySpawn
  0x05: huntAnalyzerSnapshotBodySchema, // HuntAnalyzerSnapshot
  0x06: killEventBodySchema, // KillEvent
  0x08: entityUpdateBodySchema, // EntityUpdate
  // 0x09 VitalDelta — multiplexed (vital_delta | combat_damage); validated per-kind below
  0x0a: decodedHuntFrameBodySchema, // HuntLoot — body IS the discriminated union
  0x0b: analyzerStatsBodySchema, // AnalyzerStats
  0x0c: counterTripletBodySchema, // CounterTriplet
  0x0d: goldBalancePayloadSchema, // GoldBalance — shared with JSON GOLD_BALANCE
  0x14: playerVitalsBodySchema, // PlayerUpdate
  0x15: xpGainBodySchema, // XpGain
  0x16: sessionMetricBodySchema, // SessionMetric
  0x18: statusEffectBodySchema, // StatusEffect
  // 0x19 AutoAttack — multiplexed (combat_damage | auto_attack | support_ability_cast)
  0x1a: groundItemUpdateBodySchema, // GroundItemUpdate
};

/** Per-kind schemas for multiplexed binary types (VitalDelta 0x09, AutoAttack 0x19). */
export const binaryBodyKindSchemas: Partial<Record<string, z.ZodType>> = {
  vital_delta: vitalDeltaBodySchema,
  combat_damage: combatDamageBodySchema,
};