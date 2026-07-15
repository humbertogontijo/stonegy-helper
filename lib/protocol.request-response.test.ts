import { describe, expect, it } from "vitest";
import { matchResponse } from "./protocol";

describe("matchResponse", () => {
  it("matches type-only entries", () => {
    expect(
      matchResponse({ type: "ping", data: { t: 1 } }, { type: "pong", data: { t: 1 } })
    ).toBe(true);
    expect(
      matchResponse({ type: "ping", data: { t: 1 } }, { type: "party:snapshot", data: {} })
    ).toBe(false);
  });

  it("correlates *:action_result by payload.action", () => {
    expect(
      matchResponse(
        { type: "party_disband", data: {} },
        { type: "party:action_result", data: { action: "disband", success: true } }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "party_disband", data: {} },
        { type: "party:action_result", data: { action: "start_hunt", success: true } }
      )
    ).toBe(false);

    expect(
      matchResponse(
        { type: "quest_claim_reward", data: {} },
        { type: "quest:action_result", data: { action: "claim_reward", success: true } }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "market_create_order", data: {} },
        { type: "market:action_result", data: { action: "create_order", success: true } }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "bless_buy", data: { blessingId: 8 } },
        {
          type: "bless:action_result",
          data: { action: "buy", success: true, message: "ok" },
        }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "bless_buy", data: { blessingId: 8 } },
        {
          type: "bless:action_result",
          data: { action: "snapshot", success: true },
        }
      )
    ).toBe(false);
  });

  it("resolves hunt_change_party_position on party:action_result change_position", () => {
    expect(
      matchResponse(
        { type: "hunt_change_party_position", data: { x: 2, y: 0 } },
        {
          type: "party:action_result",
          data: {
            action: "change_position",
            success: false,
            message: "Você já está nessa posição.",
          },
        }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "hunt_change_party_position", data: { x: 2, y: 0 } },
        {
          type: "party:action_result",
          data: { action: "change_position", success: true },
        }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "hunt_change_party_position", data: { x: 2, y: 0 } },
        { type: "party:action_result", data: { action: "disband", success: true } }
      )
    ).toBe(false);
  });

  it("resolves start_hunt on party:action_result or hunt_bootstrap", () => {
    expect(
      matchResponse(
        { type: "start_hunt", data: { huntId: 61 } },
        {
          type: "party:action_result",
          data: { action: "start_hunt", success: false, message: "busy" },
        }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "start_hunt", data: { huntId: 61 } },
        { type: "hunt_bootstrap", data: { huntId: 61 } }
      )
    ).toBe(true);

    expect(
      matchResponse(
        { type: "start_hunt", data: { huntId: 61 } },
        { type: "party:action_result", data: { action: "disband", success: true } }
      )
    ).toBe(false);

    expect(
      matchResponse(
        { type: "leave_hunt", data: {} },
        { type: "hunt_bootstrap", data: { huntId: 61 } }
      )
    ).toBe(false);
  });

  it("rejects action_result payloads missing action", () => {
    expect(
      matchResponse(
        { type: "start_hunt", data: {} },
        { type: "party:action_result", data: { success: true } }
      )
    ).toBe(false);
  });

  it("correlates gold_transfer by requestId on request and response", () => {
    expect(
      matchResponse(
        {
          type: "gold_transfer",
          data: { targetName: "Bob", amount: 200, requestId: "gold_transfer_current" },
        },
        {
          type: "gold_transfer_result",
          data: { success: true, requestId: "gold_transfer_current" },
        }
      )
    ).toBe(true);

    expect(
      matchResponse(
        {
          type: "gold_transfer",
          data: { targetName: "Bob", amount: 200, requestId: "gold_transfer_current" },
        },
        {
          type: "gold_transfer_result",
          data: { success: true, requestId: "gold_transfer_stale" },
        }
      )
    ).toBe(false);
  });

  it("correlates market_get_snapshot from request filters", () => {
    expect(
      matchResponse(
        {
          type: "market_get_snapshot",
          data: { page: 2, filters: { itemId: null, slot: null, vocation: null, rarity: null } },
        },
        { type: "market:snapshot", data: { page: 2 } }
      )
    ).toBe(true);

    expect(
      matchResponse(
        {
          type: "market_get_snapshot",
          data: { page: 2, filters: { itemId: null, slot: null, vocation: null, rarity: null } },
        },
        { type: "market:snapshot", data: { page: 1 } }
      )
    ).toBe(false);

    expect(
      matchResponse(
        {
          type: "market_get_snapshot",
          data: { page: 1, filters: { itemId: 82, slot: null, vocation: null, rarity: null } },
        },
        {
          type: "market:snapshot",
          data: {
            page: 1,
            filters: { itemId: 82 },
            sellOrders: [
              {
                id: "order-82",
                itemId: 82,
                tier: 0,
                isOwnOrder: false,
                isBuyOrder: false,
                eachPrice: 100,
                itemAmount: 1,
                totalPrice: 100,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        }
      )
    ).toBe(true);
  });
});
