import { matchesMarketSnapshotToRequest } from "./market/attribution";
import type { MarketFilters } from "./types";
import {
  ReceiveMessageTypes,
  SendMessageTypes,
  type SelectArrowPayload,
  type SelectHealPayload,
  type SelectManaPotionPayload,
  type SelectSkillsPayload,
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
  type HuntPhaseUpdatePayload,
  type BosstiaryUpdatePayload,
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
  type SelectArrowPayload,
  type SelectHealPayload,
  type SelectManaPotionPayload,
  type SelectSkillsPayload,
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
  null,
  null,
  null,
  null,
];

export type RequestResponseMatchArgs = {
  request: { type: string; data?: unknown };
  response: StonegyMessage;
};

export type RequestResponseEntry = {
  /** Receive type(s) that can settle this send (any match wins). */
  response: string | readonly string[];
  /**
   * Deeper correlation after the type filter. Omit when type alone is enough.
   * Receives the outbound request and inbound response.
   */
  match?: (args: RequestResponseMatchArgs) => boolean;
};

/** Type-only entry — any message of `response` settles the send. */
function respond(response: string | readonly string[]): RequestResponseEntry {
  return { response };
}

function readAction(message: { data?: unknown }): string | null {
  const action = (message.data as Record<string, unknown> | undefined)?.action;
  return typeof action === "string" ? action : null;
}

function readRequestId(message: { data?: unknown }): string | null {
  const requestId = (message.data as Record<string, unknown> | undefined)?.requestId;
  return typeof requestId === "string" ? requestId : null;
}

/** `*:action_result` entry correlated by payload `action`. */
function actionResult(responseType: string, action: string): RequestResponseEntry {
  return {
    response: responseType,
    match: ({ response }) => readAction(response) === action,
  };
}

function normalizeResponseTypes(response: string | readonly string[]): readonly string[] {
  return typeof response === "string" ? [response] : response;
}

export const RequestResponseMap: Readonly<Record<string, RequestResponseEntry>> = {
  [SendMessageTypes.AUTH]: respond(ReceiveMessageTypes.SESSION_BOOTSTRAP),
  [SendMessageTypes.PING]: respond(ReceiveMessageTypes.PONG),
  [SendMessageTypes.TRAINING_GET_SNAPSHOT]: respond(ReceiveMessageTypes.TRAINING_BOOTSTRAP),
  [SendMessageTypes.START_TRAINING]: respond(ReceiveMessageTypes.TRAINING_BOOTSTRAP),
  [SendMessageTypes.FINISH_TRAINING]: respond(ReceiveMessageTypes.TRAINING_FINISHED),
  [SendMessageTypes.PARTY_GET_SNAPSHOT]: respond(ReceiveMessageTypes.PARTY_SNAPSHOT),
  [SendMessageTypes.FRIENDS_GET_SNAPSHOT]: respond(ReceiveMessageTypes.FRIENDS_SNAPSHOT),
  [SendMessageTypes.TRADE_GET_SNAPSHOT]: respond(ReceiveMessageTypes.TRADE_SNAPSHOT),
  [SendMessageTypes.BLESS_GET_SNAPSHOT]: respond(ReceiveMessageTypes.BLESS_SNAPSHOT),
  [SendMessageTypes.BLESS_BUY]: actionResult(ReceiveMessageTypes.BLESS_ACTION_RESULT, "buy"),
  [SendMessageTypes.QUEST_GET_SNAPSHOT]: respond(ReceiveMessageTypes.TASKS_SNAPSHOT),
  [SendMessageTypes.QUEST_DELIVER_MONSTER_TASK]: actionResult(
    ReceiveMessageTypes.QUEST_ACTION_RESULT,
    "deliver_monster_task"
  ),
  [SendMessageTypes.QUEST_CLAIM_REWARD]: actionResult(
    ReceiveMessageTypes.QUEST_ACTION_RESULT,
    "claim_reward"
  ),
  [SendMessageTypes.QUEST_START_MONSTER_TASK]: actionResult(
    ReceiveMessageTypes.QUEST_ACTION_RESULT,
    "start_monster_task"
  ),
  // Failures arrive as party:action_result; success bootstraps the hunt.
  [SendMessageTypes.START_HUNT]: {
    response: [
      ReceiveMessageTypes.PARTY_ACTION_RESULT,
      ReceiveMessageTypes.HUNT_BOOTSTRAP,
    ],
    match: ({ response }) =>
      response.type === ReceiveMessageTypes.HUNT_BOOTSTRAP ||
      readAction(response) === "start_hunt",
  },
  [SendMessageTypes.LEAVE_HUNT]: respond(ReceiveMessageTypes.HUNT_FINISHED),
  [SendMessageTypes.PARTY_READY_CHECK_CONFIRM]: {
    response: ReceiveMessageTypes.PARTY_SNAPSHOT,
    match: ({ request, response }) => {
      const readyCheckId =
        typeof (request.data as { readyCheckId?: unknown } | undefined)?.readyCheckId === "string"
          ? (request.data as { readyCheckId: string }).readyCheckId
          : null;
      if (readyCheckId == null) {
        return true;
      }
      const party = (response.data as { party?: { readyCheck?: { id?: string } | null } } | undefined)
        ?.party;
      const currentId = party?.readyCheck?.id;
      // Cleared ready check = confirm applied; still-present id must match this confirm.
      return currentId == null || currentId === readyCheckId;
    },
  },
  [SendMessageTypes.PARTY_LEAVE]: actionResult(ReceiveMessageTypes.PARTY_ACTION_RESULT, "leave"),
  [SendMessageTypes.PARTY_CREATE]: actionResult(ReceiveMessageTypes.PARTY_ACTION_RESULT, "create"),
  [SendMessageTypes.PARTY_ACCEPT_INVITE]: actionResult(
    ReceiveMessageTypes.PARTY_ACTION_RESULT,
    "accept_invite"
  ),
  [SendMessageTypes.PARTY_REJECT_INVITE]: actionResult(
    ReceiveMessageTypes.PARTY_ACTION_RESULT,
    "reject_invite"
  ),
  [SendMessageTypes.PARTY_DISBAND]: actionResult(
    ReceiveMessageTypes.PARTY_ACTION_RESULT,
    "disband"
  ),
  [SendMessageTypes.PARTY_LOOT_SPLITTER_RESET]: actionResult(
    ReceiveMessageTypes.PARTY_ACTION_RESULT,
    "loot_splitter_reset"
  ),
  [SendMessageTypes.HUNT_CHANGE_PARTY_POSITION]: actionResult(
    ReceiveMessageTypes.PARTY_ACTION_RESULT,
    "change_position"
  ),
  [SendMessageTypes.GOLD_TRANSFER]: {
    response: ReceiveMessageTypes.GOLD_TRANSFER_RESULT,
    match: ({ request, response }) => {
      const requestId = readRequestId(request);
      return requestId != null && requestId === readRequestId(response);
    },
  },
  [SendMessageTypes.QUICK_SELL_ITEMS]: respond(ReceiveMessageTypes.GOLD_BALANCE),
  [SendMessageTypes.HUNT_LURE_ID]: respond(ReceiveMessageTypes.HUNT_UPDATE_LURE),
  [SendMessageTypes.SELECT_ARROW]: respond(ReceiveMessageTypes.UPDATE_BATTLE_CONFIG),
  [SendMessageTypes.SELECT_HEAL]: respond(ReceiveMessageTypes.UPDATE_BATTLE_CONFIG),
  [SendMessageTypes.SELECT_MANA_POTION]: respond(ReceiveMessageTypes.UPDATE_BATTLE_CONFIG),
  [SendMessageTypes.SELECT_SKILLS]: respond(ReceiveMessageTypes.UPDATE_BATTLE_CONFIG),
  [SendMessageTypes.MARKET_GET_SNAPSHOT]: {
    response: ReceiveMessageTypes.MARKET_SNAPSHOT,
    match: ({ request, response }) => matchesMarketSnapshotToRequest(request, response),
  },
  [SendMessageTypes.MARKET_CREATE_ORDER]: actionResult(
    ReceiveMessageTypes.MARKET_ACTION_RESULT,
    "create_order"
  ),
  [SendMessageTypes.MARKET_RESOLVE_ORDER]: actionResult(
    ReceiveMessageTypes.MARKET_ACTION_RESULT,
    "resolve_order"
  ),
  [SendMessageTypes.COIN_MARKET_GET_SNAPSHOT]: respond(ReceiveMessageTypes.COIN_MARKET_SNAPSHOT),
  [SendMessageTypes.GET_TASKS]: respond(ReceiveMessageTypes.TASKS_SNAPSHOT),
  [SendMessageTypes.RANKING_GET_SNAPSHOT]: respond(ReceiveMessageTypes.RANKING_SNAPSHOT),
  [SendMessageTypes.WHEEL_OF_DESTINY_GET_SNAPSHOT]: respond(
    ReceiveMessageTypes.WHEEL_OF_DESTINY_SNAPSHOT
  ),
  [SendMessageTypes.NPC_CLAIM_STARTER_ITEM]: respond(
    ReceiveMessageTypes.NPC_STARTER_ITEM_CLAIM_RESULT
  ),
  [SendMessageTypes.NPC_BUY_ITEM]: respond(ReceiveMessageTypes.NPC_ITEM_SHOP_PURCHASE_RESULT),
  [SendMessageTypes.APPEARANCE_SHOP_BUY]: respond(
    ReceiveMessageTypes.APPEARANCE_SHOP_PURCHASE_RESULT
  ),
  [SendMessageTypes.HOUSE_PUBLIC_SNAPSHOT]: respond(ReceiveMessageTypes.HOUSE_PUBLIC_SNAPSHOT),
  [SendMessageTypes.ADD_DAILY_BOSS]: respond(ReceiveMessageTypes.BOSS_ROTATION_UPDATE),
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

export function getRequestResponseEntry(sendType: string): RequestResponseEntry | null {
  return RequestResponseMap[sendType] ?? null;
}

export function getResponseTypesForSend(sendType: string): readonly string[] {
  const entry = getRequestResponseEntry(sendType);
  if (!entry) {
    return [];
  }
  return normalizeResponseTypes(entry.response);
}

/** Primary (first) mapped response type, or null when the send has no waiter. */
export function getResponseTypeForSend(sendType: string): string | null {
  return getResponseTypesForSend(sendType)[0] ?? null;
}

export function formatResponseTypesForSend(sendType: string): string | null {
  const types = getResponseTypesForSend(sendType);
  return types.length > 0 ? types.join(" | ") : null;
}

/**
 * Whether `response` settles `request` per {@link RequestResponseMap}:
 * type membership, then the entry's optional `match` checker.
 */
export function matchResponse(
  request: { type: string; data?: unknown },
  response: StonegyMessage
): boolean {
  const entry = getRequestResponseEntry(request.type);
  if (!entry) {
    return false;
  }

  const types = normalizeResponseTypes(entry.response);
  if (!types.includes(response.type)) {
    return false;
  }

  if (!entry.match) {
    return true;
  }

  return entry.match({ request, response });
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

export function selectArrowMessage(data: SelectArrowPayload): string {
  return buildMessage(SendMessageTypes.SELECT_ARROW, data);
}

export function selectHealMessage(data: SelectHealPayload): string {
  return buildMessage(SendMessageTypes.SELECT_HEAL, data);
}

export function selectManaPotionMessage(data: SelectManaPotionPayload): string {
  return buildMessage(SendMessageTypes.SELECT_MANA_POTION, data);
}

export function selectSkillsMessage(data: SelectSkillsPayload): string {
  return buildMessage(SendMessageTypes.SELECT_SKILLS, data);
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
  selectedChoiceId: number | string | null = null
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
