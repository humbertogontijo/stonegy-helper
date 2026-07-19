# Stonegy Helper

[![CI](https://github.com/humbertogontijo/stonegy-helper/actions/workflows/ci.yml/badge.svg)](https://github.com/humbertogontijo/stonegy-helper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Browser extension and local Node helper that control [Stonegy](https://stonegy-online.com/). The extension **reuses the game's own WebSocket** on stonegy-online.com; the Node helper runs headless DirectWs sessions for party members and serves a party-driven UI on `http://127.0.0.1:17865`.

Supports **Chrome**, **Firefox**, and **Safari** (macOS / iOS).

If this project helps you, you can [buy me a coffee](https://buymeacoffee.com/humbertogontijo).

## Install from releases

Download the latest artifacts from [GitHub Releases](https://github.com/humbertogontijo/stonegy-helper/releases):

| Asset | Use |
|-------|-----|
| `stonegy-helper-chrome-v*.zip` | Chrome / Edge (load unpacked or store upload) |
| `stonegy-helper-firefox-v*.zip` | Firefox (temporary add-on or AMO upload) |
| `stonegy-helper-safari-v*.zip` | Safari Xcode project (self-sign in Xcode) |

## How it works

Three communication planes (see [ARCHITECTURE.md](ARCHITECTURE.md) for details):

1. **Game WS** — A page script (`apps/extension/content/page-bridge.iife.ts`) wraps `window.WebSocket` before the game loads. When Stonegy opens `wss://server-game-01.api-stonegy.com/`, the extension mirrors frames into a shared `GameSession`. Bot actions reuse that socket (no separate game auth). The local helper runs headless sessions over its own DirectWs connection with a JWT.
2. **Extension↔helper control WS** — While the game tab is connected, the extension claims the character on `ws://127.0.0.1:17865/v1/extension` so the helper does not open a competing DirectWs session. Settings, live `BotState`, and UI commands for that character flow over this socket. On release or control-WS close, the claim is cleared; the character stays offline until you Connect manually in the helper UI.
3. **UI** — The popup talks to the live character via `chrome.runtime`; managed party mates use HTTP + SSE against the local helper. Shared panels live in `@stonegy/ui`.

## Development setup

```bash
bun install
```

This repo is a **Bun workspaces** monorepo:

| Path | Package | Role |
|------|---------|------|
| `apps/extension` | `@stonegy/extension` | Chrome / Firefox / Safari extension |
| `apps/server` | `@stonegy/server` | Local Hono host + multi-party UI |
| `packages/helper` | `@stonegy/helper` | Shared bot runtime (protocol, domain, core) |
| `packages/game-data` | `@stonegy/game-data` | Generated game catalogs |
| `packages/ui` | `@stonegy/ui` | Shared React shell (extension popup + server UI) |

Bun 1.3+ recommended.

## Chrome / Edge

```bash
bun run build:chrome
# → dist/ (load unpacked)
# → release/stonegy-helper-chrome-v{version}.zip
```

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

For a release zip, unpack it and load that folder the same way.

Dev with HMR:

```bash
bun run dev
```

## Firefox

```bash
bun run build:firefox
# → dist-firefox/
# → release/stonegy-helper-firefox-v{version}.zip
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `dist-firefox/manifest.json` (or the unzipped release folder’s `manifest.json`)

## Safari (macOS / iOS)

Safari builds produce an **Xcode project**, not a signed `.app`. CI and local builds never require Apple credentials. You sign with your own Apple ID in Xcode.

### From a release zip

1. Download `stonegy-helper-safari-v*.zip` and unzip it.
2. Open `Stonegy Helper.xcodeproj` in Xcode.
3. Select the **Stonegy Helper** target → **Signing & Capabilities**.
4. Choose your **Team** (a free Personal Team / Apple ID is enough to Run locally).
5. Select a macOS or iOS destination and click **Run**.
6. In Safari: enable the extension under **Settings → Extensions** (macOS) or **Settings → Apps → Safari → Extensions** (iOS).

App Store / wide iOS distribution needs a paid Apple Developer Program membership. That is out of scope for this repo’s CI.

### Build from source

Requires Xcode and `xcrun safari-web-extension-converter`.

```bash
bun run build:safari
# → safari/Stonegy Helper/ (Xcode project)
# → release/stonegy-helper-safari-v{version}.zip
```

Optional flags:

```bash
bun apps/extension/scripts/build-safari.mjs --xcodebuild   # also compile macOS Release (needs your local signing)
bun apps/extension/scripts/build-safari.mjs --open         # open the project in Xcode after conversion
bun apps/extension/scripts/build-safari.mjs --no-package   # skip the release zip
```

Optional local team (gitignored): create `safari-signing.local.json` so rebuilds keep your team ID:

```json
{ "developmentTeam": "YOUR_TEAM_ID" }
```

The pipeline builds into `dist/`, patches Safari-unsupported manifest keys (`world`, `type`, `use_dynamic_url`), bundles a classic background script, and converts to `safari/`.

## Local server (multi-character / party)

`@stonegy/server` is a zero-arg local host that owns headless sessions and a party-driven UI (Hono API + Vite client on the same port).

```bash
bun install
bun run server            # Hono API + Vite UI on :17865 (dev middleware)
# production UI:
# bun run build:server && NODE_ENV=production bun run server
```

Then open [http://127.0.0.1:17865](http://127.0.0.1:17865).

- **Add login** opens a Chromium window for Stonegy login (Turnstile included), then lets you pick characters to save as profiles.
- Click **Connect** on a profile to start a headless session (sessions are manual — nothing auto-connects).
- The page renders one popup shell per distinct party.
- Profiles and per-character settings live under `~/.stonegy-helper/` (`profiles.json`, `<characterUuid>.json`). Legacy `auth.json` is migrated into `profiles.json` as `lastAccountToken`.

Environment variables:

| Variable | Purpose |
|----------|---------|
| `STONEGY_CHROME_PATH` | Optional path to Chrome/Chromium/Edge for browser login |

The extension auto-probes `http://127.0.0.1:17865` (no pairing token). When the helper is running, party-member tabs in the extension popup can control managed remote characters over HTTP. Settings for the live (claimed) character sync over `/v1/extension`, not HTTP.

When both the extension and helper are running, the extension shares the live game JWT with the helper via `POST /v1/credentials/sync` (from the WebSocket `auth` frame, or the `jwtToken` cookie as a fallback). That seeds `lastAccountToken` and upserts a profile for the live character. Use the helper UI’s **Add login** only when running the server without the extension. After updating the extension, reload it on the browser’s extensions page so the service worker picks up new permissions (`cookies`).

## Usage

1. Optionally start the local server (`bun run server`) for multi-character headless sessions.
2. Open [https://stonegy-online.com/](https://stonegy-online.com/) and log in normally.
3. Select your character so the game authenticates over WebSocket.
4. Click the **Stonegy Helper** extension icon — tabs are the live character’s party members.
5. Use the feature tabs — Market, Loot, Battle, Hunt, and Tasks.

### Popup features

- **Character header** — shows logged-in character, vocation, level, gold, stamina, party, and hunt context
- **Market** — scan prices and auto-buy profitable flips
- **Loot** — route hunt drops to quick sell or market
- **Battle** — healing, spells, equipment presets, and party position
- **Hunt** — auto hunt loop, lure lock, and party ready checks
- **Tasks** — run monster task quests end-to-end

## Releasing (maintainers)

Create and push a version tag. The release workflow syncs `package.json` and `manifest.json` from the tag before building, so zip names and the extension version match the tag (e.g. `v1.0.0` → `stonegy-helper-chrome-v1.0.0.zip`).

```bash
git tag v1.0.0
git push origin v1.0.0
```

To bump versions locally (optional):

```bash
bun run set-version -- 1.0.0
git add package.json apps/extension/manifest.json apps/*/package.json packages/*/package.json && git commit -m "chore: release v1.0.0"
```

The [Release](https://github.com/humbertogontijo/stonegy-helper/actions/workflows/release.yml) workflow builds Chrome, Firefox, and Safari artifacts and publishes a GitHub Release. You can also run it manually via **Actions → Release → Run workflow** (uses the current `package.json` version when not triggered by a tag).

## Protocol notes

Text messages use JSON with this shape:

```json
{
  "type": "auth",
  "data": { }
}
```

Examples from captured traffic:

| Action | Message type |
|--------|----------------|
| Auth (game sends) | `auth` |
| Keepalive | `ping` / `pong` |
| Session data | `session_bootstrap` |
| Start hunt | `start_hunt` |
| Party ready | `party_ready_check_confirm` |
| Market list | `market_get_snapshot` |
| Market buy | `market_resolve_order` |

Binary frames (opcode 2) are logged as base64 but most bot actions use JSON text frames.

## Architecture

The bot core lives in `packages/helper` (`@stonegy/helper`):

- **GameSession** — single message pipeline: normalize wire events → update projections → run workflows
- **CommandBus** — send JSON commands on the game socket (ordered sends) and wait for typed responses via independent waiters (no polling sync)
- **Projections** — pure reducers split by domain (party, hunt, market, inventory, quests)
- **Workflows** — feature automation (auto-hunt, tasker, loot sell on hunt finish, market scanner)

Adapters:

- `apps/extension/adapters/extension/session-host.ts` — thin Chrome service worker glue (storage, popup RPC, page bridge)
- `apps/server/src/main.ts` — local Hono server, supervisor, DirectWs sessions, Vite-served party UI

```
Game tab WebSocket → page-bridge → ExtensionSessionHost → GameSession
Server DirectWs    → DirectWsTransport            → GameSession
Extension popup / server UI ← BotTransport (chrome | HTTP+SSE)
```

## Project layout

```
apps/extension/                # Browser extension (Chrome / Firefox / Safari builds)
apps/server/                   # Hono API + multi-party UI (Vite client)
packages/helper/               # Shared bot runtime (@stonegy/helper)
packages/game-data/            # Generated catalogs (@stonegy/game-data)
packages/ui/                   # Shared React shell (@stonegy/ui)
scripts/                       # Codegen + version tooling
```

## Extending the bot

Add a service under `packages/helper/src/core/services/` and register it in `packages/helper/src/core/services/register.ts`. Services receive inbound events via `onEvent()` and are dispatched by `ServiceRegistry`. Use `session.commands.run(SendMessageTypes.…)` for outbound actions. Use `@stonegy/helper/protocol` for typed message builders.

Example custom send from popup:

```json
{"type":"party_ready_check_confirm","data":{"readyCheckId":"..."}}
```

## Limitations

- Requires an open Stonegy tab with an authenticated session.
- Reload the game tab after installing/updating the extension so the WebSocket hook loads early enough.

## Regenerating game data

`packages/game-data/src/{hunts,quests,monsters,items,battle-options}.ts` are generated from live Stonegy assets:

```bash
bun run generate:game-data
```

The script verifies SHA256/record counts and stamps file headers. Re-run after game content updates.

## Operational risks (helper / store review)

- **Helper tokens** — JWTs are stored in `~/.stonegy-helper/profiles.json` (mode `0600`). The localhost API trusts `127.0.0.1` with no pairing token. The extension keeps the live JWT in service-worker memory only and POSTs it to the helper; it is not written to `chrome.storage`.
- **Helper Cloudflare bypass** — `got-scraping` impersonates a browser TLS fingerprint to reach `api-stonegy.com`. This is fragile and may violate game ToS; treat headless sessions as best-effort.
- **Keep-alive** — the extension can simulate DOM activity and block idle WebSocket closes (codes 4001/4002) so AFK disconnects do not drop the session. Document this for store review.
- **Mobile bypass** — on Safari/iOS the content script may spoof standalone display-mode to skip the “install as app” overlay.

## Support

Enjoying Stonegy Helper? [Buy me a coffee](https://buymeacoffee.com/humbertogontijo).

## License

[MIT](LICENSE)

## Disclaimer

Use automation responsibly and in accordance with Stonegy's terms of service.
