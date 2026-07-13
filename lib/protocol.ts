import type { MarketFilters } from "./types";
import {
  ReceiveMessageTypes,
  SendMessageTypes,
  type BattleConfigPayload,
  type SendMessageType,
  type SendPayloadMap,
  type StartTrainingPayload,
  type StonegyMessage,
} from "./protocol-messages";

export {
  ReceiveMessageTypes,
  SendMessageTypes,
  type AccountSessionReplacedPayload,
  type ActionResultPayload,
  type AuthPayload,
  type BattleConfigPayload,
  type ChatMessagePayload,
  type ChatSendPayload,
  type CoinMarketGetSnapshotPayload,
  type CoinMarketSnapshotPayload,
  type EmptyPayload,
  type GoldBalancePayload,
  type GoldTransferPayload,
  type HuntBootstrapPayload,
  type HuntChangePartyPositionPayload,
  type HuntFinishedPayload,
  type HuntFinishedReason,
  type HuntLureIdPayload,
  type HuntUpdateLurePayload,
  type HuntUpdatePlayersPayload,
  type MarketCreateOrderPayload,
  type MarketGetSnapshotPayload,
  type MarketResolveOrderPayload,
  type MessagePayload,
  type PartyActionResultPayload,
  type PartyInvitePayload,
  type PartyReadyCheckConfirmPayload,
  type PartyReceivedInvite,
  type PartySnapshotPayload,
  type PingSendPayload,
  type ProtocolCharacter,
  type ProtocolHunt,
  type ProtocolParty,
  type ProtocolPartyMember,
  type PongPayload,
  type QuestAction,
  type QuestActionResultPayload,
  type QuestClaimRewardPayload,
  type QuestTaskPayload,
  type QuickSellItemsPayload,
  type QuickSellSetPreferencesPayload,
  type ReceiveMessage,
  type ReceiveMessageType,
  type ReceivePayload,
  type ReceivePayloadMap,
  type SendMessage,
  type SendMessageType,
  type SendPayload,
  type SendPayloadMap,
  type SessionBootstrapPayload,
  type StartHuntPayload,
  type StartTrainingPayload,
  type StonegyMessage,
  type SystemMessagePayload,
  type TasksSnapshotPayload,
  type TrainingBootstrapPayload,
  type TrainingFinishedPayload,
  type TrainingPresencePayload,
  type UpdateLevelInfoPayload,
} from "./protocol-messages";

export const DEFAULT_HUNT_SKILLS: Array<string | null> = [
  "Divine Caldera",
  "Ethereal Spear",
  "Avalanche Rune",
  null,
];

export const RequestResponseMap: Readonly<Record<string, string>> = {
  [SendMessageTypes.AUTH]: ReceiveMessageTypes.SESSION_BOOTSTRAP,
  [SendMessageTypes.PING]: ReceiveMessageTypes.PONG,
  [SendMessageTypes.TRAINING_GET_SNAPSHOT]: ReceiveMessageTypes.TRAINING_BOOTSTRAP,
  [SendMessageTypes.START_TRAINING]: ReceiveMessageTypes.TRAINING_BOOTSTRAP,
  [SendMessageTypes.FINISH_TRAINING]: ReceiveMessageTypes.TRAINING_FINISHED,
  [SendMessageTypes.PARTY_GET_SNAPSHOT]: ReceiveMessageTypes.PARTY_SNAPSHOT,
  [SendMessageTypes.FRIENDS_GET_SNAPSHOT]: ReceiveMessageTypes.FRIENDS_SNAPSHOT,
  [SendMessageTypes.TRADE_GET_SNAPSHOT]: ReceiveMessageTypes.TRADE_SNAPSHOT,
  [SendMessageTypes.BLESS_GET_SNAPSHOT]: ReceiveMessageTypes.BLESS_SNAPSHOT,
  [SendMessageTypes.QUEST_GET_SNAPSHOT]: ReceiveMessageTypes.TASKS_SNAPSHOT,
  [SendMessageTypes.QUEST_DELIVER_MONSTER_TASK]: ReceiveMessageTypes.QUEST_ACTION_RESULT,
  [SendMessageTypes.QUEST_CLAIM_REWARD]: ReceiveMessageTypes.QUEST_ACTION_RESULT,
  [SendMessageTypes.QUEST_START_MONSTER_TASK]: ReceiveMessageTypes.QUEST_ACTION_RESULT,
  [SendMessageTypes.START_HUNT]: ReceiveMessageTypes.HUNT_BOOTSTRAP,
  [SendMessageTypes.LEAVE_HUNT]: ReceiveMessageTypes.HUNT_FINISHED,
  [SendMessageTypes.PARTY_READY_CHECK_CONFIRM]: ReceiveMessageTypes.PARTY_SNAPSHOT,
  [SendMessageTypes.PARTY_LEAVE]: ReceiveMessageTypes.PARTY_ACTION_RESULT,
  [SendMessageTypes.PARTY_CREATE]: ReceiveMessageTypes.PARTY_ACTION_RESULT,
  [SendMessageTypes.PARTY_ACCEPT_INVITE]: ReceiveMessageTypes.PARTY_ACTION_RESULT,
  [SendMessageTypes.PARTY_REJECT_INVITE]: ReceiveMessageTypes.PARTY_ACTION_RESULT,
  [SendMessageTypes.PARTY_DISBAND]: ReceiveMessageTypes.PARTY_ACTION_RESULT,
  [SendMessageTypes.PARTY_LOOT_SPLITTER_RESET]: ReceiveMessageTypes.PARTY_ACTION_RESULT,
  [SendMessageTypes.GOLD_TRANSFER]: ReceiveMessageTypes.GOLD_TRANSFER_RESULT,
  [SendMessageTypes.QUICK_SELL_ITEMS]: ReceiveMessageTypes.GOLD_BALANCE,
  [SendMessageTypes.HUNT_LURE_ID]: ReceiveMessageTypes.HUNT_UPDATE_LURE,
  [SendMessageTypes.UPDATE_BATTLE_CONFIG]: ReceiveMessageTypes.UPDATE_BATTLE_CONFIG,
  [SendMessageTypes.MARKET_GET_SNAPSHOT]: ReceiveMessageTypes.MARKET_SNAPSHOT,
  [SendMessageTypes.MARKET_CREATE_ORDER]: ReceiveMessageTypes.MARKET_ACTION_RESULT,
  [SendMessageTypes.MARKET_RESOLVE_ORDER]: ReceiveMessageTypes.MARKET_ACTION_RESULT,
  [SendMessageTypes.COIN_MARKET_GET_SNAPSHOT]: ReceiveMessageTypes.COIN_MARKET_SNAPSHOT,
  [SendMessageTypes.GET_TASKS]: ReceiveMessageTypes.TASKS_SNAPSHOT,
  [SendMessageTypes.RANKING_GET_SNAPSHOT]: ReceiveMessageTypes.RANKING_SNAPSHOT,
  [SendMessageTypes.WHEEL_OF_DESTINY_GET_SNAPSHOT]: ReceiveMessageTypes.WHEEL_OF_DESTINY_SNAPSHOT,
  [SendMessageTypes.NPC_CLAIM_STARTER_ITEM]: ReceiveMessageTypes.NPC_STARTER_ITEM_CLAIM_RESULT,
  [SendMessageTypes.NPC_BUY_ITEM]: ReceiveMessageTypes.NPC_ITEM_SHOP_PURCHASE_RESULT,
  [SendMessageTypes.APPEARANCE_SHOP_BUY]: ReceiveMessageTypes.APPEARANCE_SHOP_PURCHASE_RESULT,
  [SendMessageTypes.HOUSE_PUBLIC_SNAPSHOT]: ReceiveMessageTypes.HOUSE_PUBLIC_SNAPSHOT,
  [SendMessageTypes.ADD_DAILY_BOSS]: ReceiveMessageTypes.BOSS_ROTATION_UPDATE,
};

export const AuthBootstrapReceiveTypes = [
  ReceiveMessageTypes.ACCOUNT_SNAPSHOT,
  ReceiveMessageTypes.UPDATE_LEVELINFO,
  ReceiveMessageTypes.EQUIPMENT_UPDATE,
  ReceiveMessageTypes.UPDATE_BATTLE_CONFIG,
  ReceiveMessageTypes.STORE_PRODUCTS,
  ReceiveMessageTypes.BOOST_INVENTORY_SNAPSHOT,
  ReceiveMessageTypes.HOUSE_SNAPSHOT,
  ReceiveMessageTypes.PREY_SNAPSHOT,
  ReceiveMessageTypes.DAILY_REWARD_SNAPSHOT,
  ReceiveMessageTypes.WHEEL_OF_DESTINY_SNAPSHOT,
  ReceiveMessageTypes.TRAINING_BOOTSTRAP,
  ReceiveMessageTypes.FRIENDS_SNAPSHOT,
  ReceiveMessageTypes.TRADE_SNAPSHOT,
  ReceiveMessageTypes.PARTY_SNAPSHOT,
] as const;

export function getResponseTypeForSend(sendType: string): string | null {
  return RequestResponseMap[sendType] ?? null;
}

export function buildMessage<T extends SendMessageType>(
  type: T,
  data: SendPayloadMap[T] = {} as SendPayloadMap[T]
): string {
  return JSON.stringify({ type, data });
}

export function parseMessage(raw: unknown): StonegyMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StonegyMessage;
    if (parsed && typeof parsed.type === "string") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function pingMessage(t = performance.now()): string {
  return buildMessage(SendMessageTypes.PING, { t });
}

export function startHuntMessage(huntId: number, skillsSelected: Array<string | null>): string {
  return buildMessage(SendMessageTypes.START_HUNT, { huntId, skillsSelected });
}

export function marketGetSnapshotMessage(
  page = 1,
  filters: MarketFilters = {},
  referenceOrderId?: string | null
): string {
  return buildMessage(SendMessageTypes.MARKET_GET_SNAPSHOT, {
    page,
    filters: {
      itemId: filters.itemId ?? null,
      slot: filters.slot ?? null,
      vocation: filters.vocation ?? null,
      rarity: filters.rarity ?? null,
    },
    ...(referenceOrderId ? { referenceOrderId } : {}),
  });
}

export function marketResolveOrderMessage(
  orderId: string,
  amount: number,
  side: "buy" | "sell" = "sell"
): string {
  return buildMessage(SendMessageTypes.MARKET_RESOLVE_ORDER, { orderId, amount, side });
}

export function marketCreateOrderMessage(options: {
  itemId: number;
  eachPrice: number;
  itemAmount: number;
  tier?: number;
  isBuyOrder?: boolean;
}): string {
  return buildMessage(SendMessageTypes.MARKET_CREATE_ORDER, {
    itemId: options.itemId,
    tier: options.tier ?? 0,
    eachPrice: options.eachPrice,
    itemAmount: options.itemAmount,
    isBuyOrder: options.isBuyOrder ?? false,
  });
}

export function coinMarketGetSnapshotMessage(
  buyPage = 1,
  sellPage = 1,
  myPage = 1
): string {
  return buildMessage(SendMessageTypes.COIN_MARKET_GET_SNAPSHOT, {
    buyPage,
    sellPage,
    myPage,
  });
}

export function partyReadyCheckConfirmMessage(readyCheckId: string): string {
  return buildMessage(SendMessageTypes.PARTY_READY_CHECK_CONFIRM, { readyCheckId });
}

export function quickSellItemsMessage(
  itemIds: number[],
  deselectedItemIds: number[] = []
): string {
  const normalizedIds = itemIds.filter((itemId) => Number.isFinite(itemId) && itemId > 0);
  const normalizedDeselected = deselectedItemIds.filter(
    (itemId) => Number.isFinite(itemId) && itemId > 0
  );

  return buildMessage(SendMessageTypes.QUICK_SELL_ITEMS, {
    itemIds: normalizedIds,
    ...(normalizedDeselected.length ? { deselectedItemIds: normalizedDeselected } : {}),
  });
}

export function quickSellSetPreferencesMessage(deselectedItemIds: number[] = []): string {
  return buildMessage(SendMessageTypes.QUICK_SELL_SET_PREFERENCES, {
    deselectedItemIds: deselectedItemIds.filter((itemId) => Number.isFinite(itemId) && itemId > 0),
  });
}

export function npcBuyItemMessage(itemId: number, quantity: number): string {
  return buildMessage(SendMessageTypes.NPC_BUY_ITEM, { itemId, quantity });
}

export function huntChangePartyPositionMessage(x: number, y: number): string {
  return buildMessage(SendMessageTypes.HUNT_CHANGE_PARTY_POSITION, { x, y });
}

export function huntLureIdMessage(lureId: number): string {
  return buildMessage(SendMessageTypes.HUNT_LURE_ID, { lureId });
}

export function updateBattleConfigMessage(config: BattleConfigPayload): string {
  return buildMessage(SendMessageTypes.UPDATE_BATTLE_CONFIG, config);
}

export function chatSendMessage(channel: string, message: string): string {
  return buildMessage(SendMessageTypes.CHAT_SEND, { channel, message });
}

export function questGetSnapshotMessage(): string {
  return buildMessage(SendMessageTypes.QUEST_GET_SNAPSHOT, {});
}

export function leaveHuntMessage(): string {
  return buildMessage(SendMessageTypes.LEAVE_HUNT, {});
}

export function partyGetSnapshotMessage(): string {
  return buildMessage(SendMessageTypes.PARTY_GET_SNAPSHOT, {});
}

export function partyCreateMessage(): string {
  return buildMessage(SendMessageTypes.PARTY_CREATE, {});
}

export function partyLeaveMessage(): string {
  return buildMessage(SendMessageTypes.PARTY_LEAVE, {});
}

export function partyAcceptInviteMessage(inviteId: string): string {
  return buildMessage(SendMessageTypes.PARTY_ACCEPT_INVITE, { inviteId });
}

export function partyRejectInviteMessage(inviteId: string): string {
  return buildMessage(SendMessageTypes.PARTY_REJECT_INVITE, { inviteId });
}

export function partyDisbandMessage(): string {
  return buildMessage(SendMessageTypes.PARTY_DISBAND, {});
}

export function partyLootSplitterResetMessage(): string {
  return buildMessage(SendMessageTypes.PARTY_LOOT_SPLITTER_RESET, {});
}

function goldTransferRequestId(): string {
  return `gold_transfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function goldTransferMessage(
  targetName: string,
  amount: number,
  requestId = goldTransferRequestId()
): string {
  return buildMessage(SendMessageTypes.GOLD_TRANSFER, { targetName, amount, requestId });
}

export function questDeliverMonsterTaskMessage(questId: number, missionId: number): string {
  return buildMessage(SendMessageTypes.QUEST_DELIVER_MONSTER_TASK, { questId, missionId });
}

export function questClaimRewardMessage(
  questId: number,
  missionId: number,
  selectedChoiceId: number | null = null
): string {
  return buildMessage(SendMessageTypes.QUEST_CLAIM_REWARD, {
    questId,
    missionId,
    selectedChoiceId,
  });
}

export function questStartMonsterTaskMessage(questId: number, missionId: number): string {
  return buildMessage(SendMessageTypes.QUEST_START_MONSTER_TASK, { questId, missionId });
}

export function startTrainingMessage(options: {
  trainingType?: StartTrainingPayload["trainingType"];
  exerciseWeaponBoostId?: number | null;
  skillToTrain: StartTrainingPayload["skillToTrain"];
}): string {
  return buildMessage(SendMessageTypes.START_TRAINING, {
    trainingType: options.trainingType ?? "DEFAULT",
    exerciseWeaponBoostId: options.exerciseWeaponBoostId ?? null,
    skillToTrain: options.skillToTrain,
  });
}

export function finishTrainingMessage(): string {
  return buildMessage(SendMessageTypes.FINISH_TRAINING, {});
}

export function trainingPresenceSubscribeMessage(trainingId: string): string {
  return buildMessage(SendMessageTypes.TRAINING_PRESENCE_SUBSCRIBE, { trainingId });
}

export function trainingPresenceUnsubscribeMessage(trainingId: string): string {
  return buildMessage(SendMessageTypes.TRAINING_PRESENCE_UNSUBSCRIBE, { trainingId });
}
