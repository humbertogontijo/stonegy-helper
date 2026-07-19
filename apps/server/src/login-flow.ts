import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import WebSocket from "ws";
import { STONEGY_LOGIN_URL } from "@stonegy/helper/api/constants";
import { saveAuthToken } from "./auth-store";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_POLL_MS = 500;
const DEBUGGER_READY_MS = 30_000;
const JWT_COOKIE_NAME = "jwtToken";

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

type ChromeCookie = {
  name: string;
  value: string;
  domain?: string;
};

class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: CdpMessage) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly ws: WebSocket) {
    ws.on("message", (data) => {
      let message: CdpMessage;
      try {
        message = JSON.parse(String(data)) as CdpMessage;
      } catch {
        return;
      }
      if (typeof message.id !== "number") {
        return;
      }
      const waiter = this.pending.get(message.id);
      if (!waiter) {
        return;
      }
      this.pending.delete(message.id);
      waiter.resolve(message);
    });
  }

  async send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const message = await new Promise<CdpMessage>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
    if (message.error) {
      throw new Error(message.error.message ?? `CDP ${method} failed`);
    }
    return message.result ?? {};
  }

  async evaluate<T>(expression: string): Promise<T | undefined> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const remote = result.result as
      | { value?: unknown; unserializableValue?: string; exceptionDetails?: unknown }
      | undefined;
    if (result.exceptionDetails || remote?.exceptionDetails) {
      throw new Error("Injected login script threw an exception");
    }
    return remote?.value as T | undefined;
  }

  async readJwtCookie(): Promise<string | undefined> {
    const result = await this.send("Network.getAllCookies");
    const cookies = (result.cookies as ChromeCookie[] | undefined) ?? [];
    const match = cookies.find(
      (cookie) =>
        cookie.name === JWT_COOKIE_NAME &&
        typeof cookie.value === "string" &&
        cookie.value.length > 0 &&
        (!cookie.domain || cookie.domain.includes("stonegy"))
    );
    return match?.value;
  }

  close() {
    for (const waiter of this.pending.values()) {
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    this.ws.close();
  }
}

function commandOnPath(command: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function chromeCandidates(): string[] {
  const envPath = process.env.STONEGY_CHROME_PATH?.trim();
  const mac = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Arc.app/Contents/MacOS/Arc",
  ];
  const linux = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "brave-browser",
  ];
  const win = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  if (process.platform === "darwin") {
    return [...(envPath ? [envPath] : []), ...mac, ...linux];
  }
  if (process.platform === "win32") {
    return [...(envPath ? [envPath] : []), ...win, ...linux];
  }
  return [...(envPath ? [envPath] : []), ...linux];
}

function resolveChromePath(): string | undefined {
  for (const candidate of chromeCandidates()) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    if (commandOnPath(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a free port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson<T>(url: string, timeoutMs: number): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return (await response.json()) as T;
      }
    } catch {
      // debugger not ready yet
    }
    await sleep(150);
  }
  throw new Error("Timed out waiting for Chrome remote debugging");
}

type TargetInfo = {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

async function connectToLoginPage(debugPort: number): Promise<CdpSession> {
  const started = Date.now();
  while (Date.now() - started < DEBUGGER_READY_MS) {
    const targets = await waitForJson<TargetInfo[]>(
      `http://127.0.0.1:${debugPort}/json/list`,
      2_000
    ).catch(() => [] as TargetInfo[]);

    const page =
      targets.find(
        (target) =>
          target.type === "page" &&
          typeof target.webSocketDebuggerUrl === "string" &&
          (target.url.includes("stonegy-online.com") || target.url === "about:blank")
      ) ??
      targets.find(
        (target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string"
      );

    if (page?.webSocketDebuggerUrl) {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      const session = new CdpSession(ws);
      await session.send("Runtime.enable");
      await session.send("Page.enable");
      await session.send("Network.enable");
      if (!page.url.includes("stonegy-online.com")) {
        await session.send("Page.navigate", { url: STONEGY_LOGIN_URL });
        await sleep(800);
      }
      return session;
    }

    await sleep(150);
  }
  throw new Error("Could not attach to the Chrome login tab");
}

/** Non-blocking banner — user signs in with Stonegy's own form + Turnstile. */
function buildBannerScript(): string {
  return `(() => {
  if (window.__stonegyHelperLoginBanner) return true;
  window.__stonegyHelperLoginBanner = true;
  const style = document.createElement("style");
  style.textContent = \`
    #stonegy-helper-cli-banner {
      position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
      padding: 10px 16px; text-align: center;
      font: 600 13px/1.4 "Segoe UI", system-ui, sans-serif;
      color: #1a1208; background: #d7a35c;
      box-shadow: 0 2px 12px rgba(0,0,0,0.35);
    }
  \`;
  const banner = document.createElement("div");
  banner.id = "stonegy-helper-cli-banner";
  banner.textContent =
    "Stonegy Helper CLI — sign in here (Cloudflare included). Character select is enough; you do not need to enter the game.";
  document.documentElement.appendChild(style);
  document.documentElement.appendChild(banner);
  return true;
})()`;
}

function readJwtFromDocumentCookie(): string {
  return `(() => {
    const match = document.cookie.match(/(?:^|;\\s*)${JWT_COOKIE_NAME}=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  })()`;
}

async function pollForToken(session: CdpSession, timeoutMs: number): Promise<string> {
  const started = Date.now();
  let bannerReady = false;
  let lastStatusAt = 0;

  while (Date.now() - started < timeoutMs) {
    if (!bannerReady) {
      try {
        bannerReady = Boolean(await session.evaluate<boolean>(buildBannerScript()));
      } catch {
        // page may still be navigating
      }
    }

    try {
      const fromNetwork = await session.readJwtCookie();
      if (fromNetwork) {
        return fromNetwork;
      }
    } catch {
      // Network domain may briefly fail across navigations
    }

    try {
      const fromDocument = await session.evaluate<string | null>(readJwtFromDocumentCookie());
      if (fromDocument) {
        return fromDocument;
      }
    } catch {
      // execution context destroyed during SPA navigation
    }

    const elapsed = Date.now() - started;
    if (elapsed - lastStatusAt >= 15_000) {
      lastStatusAt = elapsed;
      const seconds = Math.round(elapsed / 1000);
      console.log(`Still waiting for login… (${seconds}s) — finish sign-in in the browser window.`);
    }

    await sleep(TOKEN_POLL_MS);
  }

  throw new Error(
    "Login timed out. Sign in on the Stonegy login page (email/password + Cloudflare), then wait until the CLI continues — no need to enter the game world."
  );
}

async function withChromeLogin<T>(run: (session: CdpSession) => Promise<T>): Promise<T> {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error(
      "No Chrome/Chromium/Edge browser found for login. Install Chrome, set STONEGY_CHROME_PATH, or pass --token / STONEGY_TOKEN."
    );
  }

  const debugPort = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "stonegy-helper-login-"));
  let child: ChildProcess | undefined;
  let session: CdpSession | undefined;
  let finished = false;

  try {
    child = spawn(
      chromePath,
      [
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-extensions",
        `--app=${STONEGY_LOGIN_URL}`,
      ],
      {
        stdio: "ignore",
      }
    );

    const earlyExit = new Promise<never>((_, reject) => {
      child?.once("error", (error) => {
        if (finished) {
          return;
        }
        reject(new Error(`Failed to launch browser: ${error.message}`));
      });
      child?.once("exit", (code, signal) => {
        if (finished) {
          return;
        }
        reject(
          new Error(
            `Browser exited before login finished (code ${code ?? "?"}${signal ? `, signal ${signal}` : ""})`
          )
        );
      });
    });

    try {
      session = await Promise.race([connectToLoginPage(debugPort), earlyExit]);
      return await Promise.race([run(session), earlyExit]);
    } finally {
      finished = true;
    }
  } finally {
    session?.close();
    if (child && !child.killed) {
      child.kill();
      await sleep(200);
      try {
        child.kill("SIGKILL");
      } catch {
        // already exited
      }
    }
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Opens Stonegy's login page (Cloudflare Turnstile included). After a normal
 * sign-in, captures the `jwtToken` cookie and stores it for the CLI.
 */
export async function interactiveBrowserLogin(): Promise<string> {
  console.log(
    "No token found — opening Stonegy login. Sign in normally (Cloudflare Turnstile included)."
  );
  console.log("Waiting for session cookie… (character select is enough; joining the world is optional)");

  const token = await withChromeLogin((session) => pollForToken(session, LOGIN_TIMEOUT_MS));
  await saveAuthToken(token);
  console.log("Login successful — token saved to ~/.stonegy-helper/auth.json");
  return token;
}
