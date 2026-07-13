import type { MarketSnapshotData } from "../market/types";
import type { BinaryReader } from "./reader.ts";
import type { BinaryMarketOrder, MarketSnapshotBody } from "./types.ts";

const MARKET_ORDER_RESERVED_BYTES = 5;
const MARKET_ORDER_CREATED_AT_BYTES = 8;

function decodeMarketOrder(reader: BinaryReader, isBuyOrder: boolean): BinaryMarketOrder {
  const idLen = reader.u16();
  const id = new TextDecoder().decode(reader.bytes(idLen));
  const itemId = reader.u16();
  const flags = reader.bytes(MARKET_ORDER_RESERVED_BYTES);
  // Prices must stay exact — reject listings that cannot be represented safely in JS Number.
  const eachPrice = reader.u64Safe();
  const itemAmount = reader.u32();
  const totalPrice = reader.u64Safe();
  reader.skip(MARKET_ORDER_CREATED_AT_BYTES);

  return {
    id,
    itemId,
    tier: flags[0] ?? 0,
    isOwnOrder: flags[3] === 1,
    isBuyOrder,
    eachPrice,
    itemAmount,
    totalPrice,
    createdAt: "",
  };
}

function decodeMarketOrderList(reader: BinaryReader, isBuyOrder: boolean): BinaryMarketOrder[] {
  const count = reader.u16();
  const orders: BinaryMarketOrder[] = [];

  for (let index = 0; index < count; index += 1) {
    orders.push(decodeMarketOrder(reader, isBuyOrder));
  }

  return orders;
}

function decodeOrderAnchors(
  reader: BinaryReader,
  sellCount: number,
  buyCount: number
) {
  const sellOrderAnchors: number[] = [];
  const buyOrderAnchors: number[] = [];

  for (let index = 0; index < sellCount; index += 1) {
    if (reader.remaining < 8) {
      throw new RangeError(`Market sell anchor ${index + 1} needs 8 bytes`);
    }
    sellOrderAnchors.push(reader.u64());
  }

  for (let index = 0; index < buyCount; index += 1) {
    if (reader.remaining < 8) {
      throw new RangeError(`Market buy anchor ${index + 1} needs 8 bytes`);
    }
    buyOrderAnchors.push(reader.u64());
  }

  if (reader.remaining > 0) {
    reader.rest();
  }

  return { sellOrderAnchors, buyOrderAnchors };
}


export function decodeMarketSnapshot(reader: BinaryReader): MarketSnapshotBody {
  const page = reader.u16();
  // Browse snapshots reuse this u16 as sell-order chunk size; see resolveMarketSnapshotTotalPages.
  const totalPages = reader.u16();
  const requestedItemId = reader.u32();
  const selectedItemTradableAmount = reader.u32();
  reader.skip(16);

  const sellOrders = decodeMarketOrderList(reader, false);
  const buyOrders = decodeMarketOrderList(reader, true);
  const { sellOrderAnchors, buyOrderAnchors } = decodeOrderAnchors(
    reader,
    sellOrders.length,
    buyOrders.length
  );

  return {
    page,
    totalPages,
    requestedItemId: requestedItemId || null,
    selectedItemTradableAmount,
    sellOrders,
    buyOrders,
    sellOrderAnchors,
    buyOrderAnchors,
  };
}

export function marketSnapshotBodyToData(body: MarketSnapshotBody): MarketSnapshotData {
  return {
    page: body.page,
    totalPages: body.totalPages,
    requestedItemId: body.requestedItemId,
    selectedItemTradableAmount: body.selectedItemTradableAmount,
    sellOrders: body.sellOrders,
    buyOrders: body.buyOrders,
  };
}
