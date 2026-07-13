import type { MarketSnapshotData } from "../types";

/** Trimmed from captured `market:snapshot` traffic (browse + item filter). */
export const sampleMarketSnapshotBrowse: MarketSnapshotData = {
  page: 1,
  totalPages: 12,
  requestedItemId: null,
  selectedItemTradableAmount: 0,
  sellOrders: [
    {
      id: "3d942825-1a56-4e55-9d5f-d72ab37b5fdc",
      itemId: 1346,
      tier: 0,
      isOwnOrder: false,
      isBuyOrder: false,
      eachPrice: 90,
      itemAmount: 2,
      totalPrice: 180,
      createdAt: "2026-07-07T14:47:44.880Z",
    },
    {
      id: "9f95203d-115a-46e7-9209-8491d941b9a3",
      itemId: 1251,
      tier: 0,
      isOwnOrder: false,
      isBuyOrder: false,
      eachPrice: 248,
      itemAmount: 74,
      totalPrice: 18352,
      createdAt: "2026-07-07T14:47:38.844Z",
    },
  ],
  buyOrders: [
    {
      id: "buy-1346",
      itemId: 1346,
      tier: 0,
      isOwnOrder: false,
      isBuyOrder: true,
      eachPrice: 75,
      itemAmount: 10,
      totalPrice: 750,
      createdAt: "2026-07-07T14:40:00.000Z",
    },
  ],
};

export const sampleMarketSnapshotItem1346: MarketSnapshotData = {
  requestedItemId: 1346,
  selectedItemTradableAmount: 5,
  sellOrders: [
    {
      id: "sell-low",
      itemId: 1346,
      tier: 0,
      isOwnOrder: false,
      isBuyOrder: false,
      eachPrice: 90,
      itemAmount: 2,
      totalPrice: 180,
      createdAt: "2026-07-07T14:47:44.880Z",
    },
    {
      id: "sell-high",
      itemId: 1346,
      tier: 0,
      isOwnOrder: false,
      isBuyOrder: false,
      eachPrice: 120,
      itemAmount: 1,
      totalPrice: 120,
      createdAt: "2026-07-07T14:47:50.000Z",
    },
  ],
  buyOrders: [
    {
      id: "buy-1346",
      itemId: 1346,
      tier: 0,
      isOwnOrder: false,
      isBuyOrder: true,
      eachPrice: 75,
      itemAmount: 10,
      totalPrice: 750,
      createdAt: "2026-07-07T14:40:00.000Z",
    },
  ],
};
