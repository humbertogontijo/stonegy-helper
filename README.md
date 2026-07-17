# Stonegy Helper

[![CI](https://github.com/humbertogontijo/stonegy-helper/actions/workflows/ci.yml/badge.svg)](https://github.com/humbertogontijo/stonegy-helper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Browser extension and CLI that control [Stonegy](https://stonegy-online.com/) by **reusing the game's own WebSocket** to `wss://api-stonegy.com/`. The game page handles login and authentication; the extension only intercepts that connection and lets you send/read protocol messages.

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

1. A page script (`content/page-bridge.js`) wraps `window.WebSocket` before the game loads.
2. When Stonegy opens `wss://api-stonegy.com/`, the extension captures that socket instance.
3. Incoming/outgoing frames are mirrored to the background worker.
4. Bot actions send JSON through the same socket the game uses — no separate auth token needed.

## Development setup

```bash
npm install
```

Node.js 22+ recommended.

## Chrome / Edge

```bash
npm run build:chrome
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
npm run dev
```

## Firefox

```bash
npm run build:firefox
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
npm run build:safari
# → safari/Stonegy Helper/ (Xcode project)
# → release/stonegy-helper-safari-v{version}.zip
```

Optional flags:

```bash
node scripts/build-safari.mjs --xcodebuild   # also compile macOS Release (needs your local signing)
node scripts/build-safari.mjs --open         # open the project in Xcode after conversion
node scripts/build-safari.mjs --no-package   # skip the release zip
```

Optional local team (gitignored): create `safari-signing.local.json` so rebuilds keep your team ID:

```json
{ "developmentTeam": "YOUR_TEAM_ID" }
```

The pipeline builds into `dist/`, patches Safari-unsupported manifest keys (`world`, `type`, `use_dynamic_url`), bundles a classic background script, and converts to `safari/`.

## CLI

The CLI runs the bot headlessly over a direct WebSocket session (no browser tab required).

```bash
npm install
npm run stonegy -- run
npm run stonegy -- run --character "My Char"
npm run stonegy -- run --token YOUR_TOKEN
```

If you omit `--token` / `STONEGY_TOKEN`, the CLI:

1. Reuses `~/.stonegy-helper/auth.json` when present
2. Otherwise opens a Chromium window to Stonegy’s login page (Cloudflare Turnstile included), waits for the session cookie after you sign in, and stores the JWT locally

You only need to complete login (and optionally character select) — entering the game world is not required. Use `--login` to force a fresh browser login.

Environment variables:

| Variable | Purpose |
|----------|---------|
| `STONEGY_TOKEN` | Bearer JWT (alternative to `--token`) |
| `STONEGY_CHROME_PATH` | Optional path to Chrome/Chromium/Edge for browser login |

Before starting, the CLI loads characters from `/api/character` and prompts you to pick one. Pass `--character <uuid|name>` to skip the prompt.

Settings and feature master states are saved per character under `~/.stonegy-helper/`.

Global install (optional):

```bash
npm link
stonegy-helper run
```

### Interactive commands

Once connected, use the menu to:

- **Arm/disarm features** (Market, Loot, Battle, Hunt, Tasks)
- **Toggle sub-features** (interval scan, auto hunt, auto tasker, etc.)
- **Show full status** — party, hunt, and sub-feature states
- **Quit** — graceful disconnect (Ctrl+C also works)

## Usage

1. Open [https://stonegy-online.com/](https://stonegy-online.com/) and log in normally.
2. Select your character so the game authenticates over WebSocket.
3. Click the **Stonegy Helper** extension icon.
4. Use the feature tabs — Market, Loot, Battle, Hunt, and Tasks.

### Popup features

- **Character header** — shows logged-in character, vocation, level, gold, stamina, party, and hunt context
- **Market** — scan prices and auto-buy profitable flips
- **Loot** — route hunt drops to quick sell or market
- **Battle** — healing, spells, equipment presets, and party position
- **Hunt** — auto hunt loop, lure lock, and party ready checks
- **Tasks** — run monster task quests end-to-end

## Releasing (maintainers)

1. Bump `version` in `package.json` and `manifest.json` to the same value.
2. Commit the bump.
3. Create and push a tag matching that version:

```bash
git tag v1.2.1
git push origin v1.2.1
```

The [Release](https://github.com/humbertogontijo/stonegy-helper/actions/workflows/release.yml) workflow builds Chrome, Firefox, and Safari artifacts and publishes a GitHub Release. You can also run it manually via **Actions → Release → Run workflow**.

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

The bot core lives in `lib/core/`:

- **GameSession** — single message pipeline: normalize wire events → update projections → run workflows
- **CommandBus** — send JSON commands on the game socket (ordered sends) and wait for typed responses via independent waiters (no polling sync)
- **Projections** — pure reducers split by domain (party, hunt, market, inventory, quests)
- **Workflows** — feature automation (auto-hunt, tasker, loot sell on hunt finish, market scanner)

Adapters:

- `adapters/extension/session-host.ts` — thin Chrome service worker glue (storage, popup RPC, page bridge)
- `cli/main.ts` — headless CLI over direct WebSocket

```
Game tab WebSocket → page-bridge → ExtensionSessionHost → GameSession
CLI WebSocket      → DirectWsTransport            → GameSession
```

## Project layout

```
manifest.json
background/service-worker.ts   # Extension entry (delegates to session-host)
content/page-bridge.iife.js    # WebSocket hook (MAIN world, IIFE bundle)
content/content.js             # Extension ↔ page bridge
lib/core/                      # Event/command architecture
adapters/                      # Extension + CLI adapters
lib/page-bridge/               # Cross-browser page access (Chrome + Safari)
lib/protocol.js                # Message builders
popup/                         # Control panel UI
```

## Extending the bot

Add a service under `lib/core/services/` and register it in `lib/core/services/register.ts`. Services receive inbound events via `onEvent()` and are dispatched by `ServiceRegistry`. Use `session.commands.run(SendMessageTypes.…)` for outbound actions. Use `lib/protocol.ts` for typed message builders.

Example custom send from popup:

```json
{"type":"party_ready_check_confirm","data":{"readyCheckId":"..."}}
```

## Limitations

- Requires an open Stonegy tab with an authenticated session.
- Reload the game tab after installing/updating the extension so the WebSocket hook loads early enough.

## Regenerating game data

`lib/data/{hunts,quests,monsters,items,battle-options}.ts` are generated from live Stonegy assets:

```bash
npm run generate:game-data
```

The script verifies SHA256/record counts and stamps file headers. Re-run after game content updates.

## Operational risks (CLI / store review)

- **CLI tokens** — prefer `STONEGY_TOKEN` or the stored login token over `--token` (argv is visible in `ps` / shell history). Interactive login writes `~/.stonegy-helper/auth.json` with mode `0600`.
- **CLI Cloudflare bypass** — `got-scraping` impersonates a browser TLS fingerprint to reach `api-stonegy.com`. This is fragile and may violate game ToS; treat the CLI as best-effort.
- **Keep-alive** — the extension can simulate DOM activity and block idle WebSocket closes (codes 4001/4002) so AFK disconnects do not drop the session. Document this for store review.
- **Mobile bypass** — on Safari/iOS the content script may spoof standalone display-mode to skip the “install as app” overlay.

## Support

Enjoying Stonegy Helper? [Buy me a coffee](https://buymeacoffee.com/humbertogontijo).

## License

[MIT](LICENSE)

## Disclaimer

Use automation responsibly and in accordance with Stonegy's terms of service.
