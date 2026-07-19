import { serveStatic } from "@hono/node-server/serve-static";
import { getRequestListener } from "@hono/node-server";
import { createServer, type Server as HttpServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { attachExtensionBridge } from "./extension-bridge";
import { migrateFromAuthJson } from "./profile-store";
import { createHelperApp, HELPER_HOST, HELPER_PORT } from "./routes";
import { Supervisor } from "./supervisor";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const isDev = process.env.NODE_ENV !== "production";

function listenHttp(
  server: HttpServer,
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(HELPER_PORT, HELPER_HOST, () => {
      console.log(`[server] listening on http://${HELPER_HOST}:${HELPER_PORT}`);
      if (label) {
        console.log(`[server] ${label}`);
      }
      resolve();
    });
  });
}

async function attachViteDev(
  app: ReturnType<typeof createHelperApp>,
  supervisor: Supervisor
): Promise<void> {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: join(appDir, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "custom",
  });

  const apiListener = getRequestListener(app.fetch);
  const clientRoot = join(appDir, "client");

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/v1")) {
      void apiListener(req, res);
      return;
    }

    vite.middlewares(req, res, () => {
      void (async () => {
        try {
          const template = readFileSync(join(clientRoot, "index.html"), "utf8");
          const html = await vite.transformIndexHtml(url, template);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        } catch (error) {
          if (vite.ssrFixStacktrace && error instanceof Error) {
            vite.ssrFixStacktrace(error);
          }
          console.error("[server] vite html error:", error);
          res.statusCode = 500;
          res.end(error instanceof Error ? error.message : String(error));
        }
      })();
    });
  });

  attachExtensionBridge(server, supervisor);
  await listenHttp(server, "vite middleware (dev)");
}

async function attachStatic(
  app: ReturnType<typeof createHelperApp>,
  supervisor: Supervisor
): Promise<void> {
  const uiDir = join(appDir, "dist/client");
  if (existsSync(uiDir)) {
    const relativeRoot = relative(process.cwd(), uiDir) || "dist/client";
    app.use("/*", serveStatic({ root: relativeRoot }));
    app.get("/", (c) => {
      const index = join(uiDir, "index.html");
      return c.html(readFileSync(index, "utf8"));
    });
  } else {
    app.get("/", (c) =>
      c.html(
        `<!doctype html><html><body style="font-family:sans-serif;background:#0b0f14;color:#ddd;padding:2rem">
        <h1>Stonegy Helper</h1>
        <p>API is up on <code>http://${HELPER_HOST}:${HELPER_PORT}</code>.</p>
        <p>Build the UI with <code>bun run build:server</code> then restart with <code>NODE_ENV=production bun run server</code>.</p>
        <p><a href="/v1/health" style="color:#d4af37">/v1/health</a></p>
        </body></html>`
      )
    );
  }

  const apiListener = getRequestListener(app.fetch);
  const server = createServer((req, res) => {
    void apiListener(req, res);
  });
  attachExtensionBridge(server, supervisor);
  await listenHttp(server, "");
}

async function main(): Promise<void> {
  await migrateFromAuthJson();

  const pkgPath = join(appDir, "package.json");
  const version =
    (JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string }).version ?? "0.0.0";

  const supervisor = new Supervisor();
  const app = createHelperApp(supervisor, version);
  supervisor.start();

  if (isDev) {
    await attachViteDev(app, supervisor);
  } else {
    await attachStatic(app, supervisor);
  }

  const shutdown = () => {
    console.log("[server] shutting down…");
    supervisor.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[server] fatal:", error);
  process.exit(1);
});
