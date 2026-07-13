import { describe, expect, it } from "vitest";
import { isStonegyGameUrl } from "./game-tab";

describe("isStonegyGameUrl", () => {
  it("matches the primary Stonegy domain", () => {
    expect(isStonegyGameUrl("https://stonegy-online.com/")).toBe(true);
    expect(isStonegyGameUrl("https://stonegy-online.com/game")).toBe(true);
  });

  it("matches Stonegy subdomains", () => {
    expect(isStonegyGameUrl("https://play.stonegy-online.com/world")).toBe(true);
  });

  it("rejects unrelated hosts and schemes", () => {
    expect(isStonegyGameUrl("https://example.com/stonegy-online.com")).toBe(false);
    expect(isStonegyGameUrl("http://stonegy-online.com/")).toBe(false);
    expect(isStonegyGameUrl(undefined)).toBe(false);
  });
});
