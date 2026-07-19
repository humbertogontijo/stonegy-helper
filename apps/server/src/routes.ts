import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { listCharacters } from "@stonegy/helper/api/characters";
import { interactiveBrowserLogin } from "./login-flow";
import { saveAuthToken } from "./auth-store";
import type { Supervisor } from "./supervisor";
import {
  loadProfiles,
  removeProfile,
  syncCredentialsFromExtension,
  upsertProfile,
  type HelperProfile,
} from "./profile-store";
export { HELPER_HOST, HELPER_PORT } from "@stonegy/helper/helper-endpoint";

export function createHelperApp(supervisor: Supervisor, version: string): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    })
  );

  app.get("/v1/health", (c) => c.json({ ok: true, version }));

  app.get("/v1/profiles", async (c) => {
    const file = await loadProfiles();
    return c.json({
      profiles: file.profiles.map(publicProfile),
      lastAccountToken: file.lastAccountToken ? true : false,
      hasLastAccountToken: !!file.lastAccountToken,
    });
  });

  app.post("/v1/profiles", async (c) => {
    const body = (await c.req.json()) as Partial<HelperProfile>;
    if (
      typeof body.token !== "string" ||
      typeof body.characterId !== "string" ||
      typeof body.characterName !== "string"
    ) {
      return c.json({ ok: false, error: "token, characterId, characterName required" }, 400);
    }
    const profile = await upsertProfile({
      token: body.token,
      characterId: body.characterId,
      characterName: body.characterName,
      worldId: typeof body.worldId === "number" ? body.worldId : undefined,
    });
    return c.json({ ok: true, profile: publicProfile(profile) });
  });

  /** Extension → helper: share game JWT without auto-connecting the live character. */
  app.post("/v1/credentials/sync", async (c) => {
    const body = (await c.req.json()) as {
      token?: unknown;
      characterId?: unknown;
      characterName?: unknown;
      worldId?: unknown;
    };
    if (
      typeof body.token !== "string" ||
      typeof body.characterId !== "string" ||
      typeof body.characterName !== "string"
    ) {
      return c.json({ ok: false, error: "token, characterId, characterName required" }, 400);
    }
    try {
      const result = await syncCredentialsFromExtension({
        token: body.token,
        characterId: body.characterId,
        characterName: body.characterName,
        worldId: typeof body.worldId === "number" ? body.worldId : undefined,
      });
      if (result.changed) {
        console.log(
          `[helper] credentials sync ${result.profile.characterName} (${result.profile.characterId})${
            result.created ? " created" : ""
          }`
        );
      }
      // Only refresh sessions that are already connected; do not cold-seed.
      for (const characterId of result.reconnectCharacterIds) {
        void supervisor.reconnectOwned(characterId, "credentials-synced");
      }
      return c.json({
        ok: true,
        profile: publicProfile(result.profile),
        created: result.created,
        reconnectCharacterIds: result.reconnectCharacterIds,
      });
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.delete("/v1/profiles/:characterId", async (c) => {
    const characterId = c.req.param("characterId");
    await supervisor.disconnect(characterId);
    const removed = await removeProfile(characterId);
    return c.json({ ok: removed });
  });

  app.post("/v1/login", async (c) => {
    try {
      const token = await interactiveBrowserLogin();
      await saveAuthToken(token);
      const file = await loadProfiles();
      file.lastAccountToken = token;
      const { saveProfiles } = await import("./profile-store");
      await saveProfiles(file);
      return c.json({ ok: true, token });
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  });

  app.get("/v1/characters", async (c) => {
    const token = c.req.query("token") || (await loadProfiles()).lastAccountToken;
    if (!token) {
      return c.json({ ok: false, error: "No token — login first" }, 400);
    }
    try {
      const response = await listCharacters(token);
      return c.json({ ok: true, characters: response.characters, token });
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  });

  app.get("/v1/parties", async (c) => {
    const parties = await supervisor.listParties();
    return c.json({ parties });
  });

  app.get("/v1/sessions/:characterId/state", async (c) => {
    const characterId = c.req.param("characterId");
    const state = supervisor.getSessionState(characterId);
    if (!state) {
      return c.json({ ok: false, error: "Session not connected" }, 404);
    }
    return c.json(state);
  });

  app.post("/v1/sessions/:characterId/command", async (c) => {
    const characterId = c.req.param("characterId");
    const body = (await c.req.json()) as {
      channel?: string;
      payload?: Record<string, unknown>;
    };
    if (typeof body.channel !== "string") {
      return c.json({ ok: false, error: "channel required" }, 400);
    }
    const result = await supervisor.handleSessionCommand(
      characterId,
      body.channel,
      body.payload ?? {}
    );
    if (result.ok === false && result.error === "Session not connected") {
      return c.json(result, 404);
    }
    return c.json(result);
  });

  app.post("/v1/sessions/:characterId/connect", async (c) => {
    const characterId = c.req.param("characterId");
    const result = await supervisor.requestConnect(characterId, "api", { force: true });
    if (!result.ok) {
      return c.json(
        {
          ok: false,
          error: result.error ?? "Connect failed",
          connecting: supervisor.isConnecting(characterId),
          connected: !!supervisor.getSession(characterId),
        },
        500
      );
    }
    return c.json({
      ok: true,
      connecting: supervisor.isConnecting(characterId),
      connected: !!supervisor.getSession(characterId),
    });
  });

  app.post("/v1/sessions/:characterId/disconnect", async (c) => {
    const characterId = c.req.param("characterId");
    await supervisor.disconnect(characterId);
    return c.json({ ok: true });
  });

  app.get("/v1/events", (c) => {
    return streamSSE(c, async (stream) => {
      // Snapshot so clients do not need a separate /v1/parties poll on connect.
      const parties = await supervisor.listParties();
      await stream.writeSSE({
        event: "parties",
        data: JSON.stringify(parties),
      });

      const unsubscribe = supervisor.events.subscribe(async (evt) => {
        await stream.writeSSE({
          event: evt.event,
          data: JSON.stringify(evt.data),
        });
      });
      // Keep alive until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
    });
  });

  return app;
}

function publicProfile(profile: HelperProfile) {
  return {
    characterId: profile.characterId,
    characterName: profile.characterName,
    worldId: profile.worldId,
    updatedAt: profile.updatedAt,
    // Never expose full JWT in list responses used by UI chrome
    hasToken: !!profile.token,
  };
}
