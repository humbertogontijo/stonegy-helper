import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { login } from "./auth";
import { listCharacters } from "./characters";

const scrapingRequest = vi.fn();

vi.mock("./scraping-session", () => ({
  scrapingRequest: (...args: unknown[]) => scrapingRequest(...args),
}));

describe("api client", () => {
  beforeEach(() => {
    scrapingRequest.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts credentials to /api/auth", async () => {
    scrapingRequest.mockResolvedValue({
      statusCode: 200,
      body: { token: "jwt-token" },
    });

    const response = await login({
      username: "user@example.com",
      password: "secret",
      turnstileToken: "turnstile",
    });

    expect(response.token).toBe("jwt-token");
    expect(scrapingRequest).toHaveBeenCalledWith("/api/auth", {
      method: "POST",
      body: {
        username: "user@example.com",
        password: "secret",
        turnstileToken: "turnstile",
      },
    });
  });

  it("loads characters with bearer token", async () => {
    scrapingRequest.mockResolvedValue({
      statusCode: 200,
      body: {
        characters: [{ id: "abc", name: "Hero" }],
        account: {
          unlockedMapLayouts: [],
          unlockedEmotes: [],
          selectedCharacterSelectMapLayoutId: null,
        },
      },
    });

    const response = await listCharacters("jwt-token");

    expect(response.characters).toHaveLength(1);
    expect(scrapingRequest).toHaveBeenCalledWith("/api/character", {
      token: "jwt-token",
    });
  });

  it("surfaces a clear message on 401", async () => {
    scrapingRequest.mockResolvedValue({
      statusCode: 401,
      body: { message: "Unauthorized" },
    });

    await expect(listCharacters("expired")).rejects.toMatchObject({
      status: 401,
      message: expect.stringMatching(/token expired|re-login/i),
    });
  });
});
