import { describe, expect, it } from "vitest";
import { waitForFeatureEventMessage } from "./feature-enable";

describe("waitForFeatureEventMessage", () => {
  it("names the event and action the user must wait for", () => {
    expect(
      waitForFeatureEventMessage("party:snapshot", "enabling auto hunt")
    ).toBe(
      "Wait for party:snapshot before enabling auto hunt — party status is not synced yet."
    );
  });

  it("describes task snapshot feedback consistently", () => {
    expect(
      waitForFeatureEventMessage("tasks:snapshot", "running Task now")
    ).toContain("Wait for tasks:snapshot before running Task now");
  });
});
