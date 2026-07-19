import { describe, expect, it } from "vitest";
import { mastersFromBotState, readFeatureMaster } from "./featureMasterStorage";
import type { BotState } from "@stonegy/helper/types";

function stubState(masters?: Record<string, boolean>): BotState {
  return {
    featureMasters: masters,
  } as BotState;
}

describe("featureMasterStorage", () => {
  it("defaults all masters off when state is missing", () => {
    const masters = mastersFromBotState(null);
    expect(Object.values(masters).every((v) => v === false)).toBe(true);
  });

  it("reads masters from BotState", () => {
    const state = stubState({ loot: true, market: false });
    expect(readFeatureMaster("loot", state)).toBe(true);
    expect(readFeatureMaster("market", state)).toBe(false);
    expect(readFeatureMaster("hunt", state)).toBe(false);
  });
});
