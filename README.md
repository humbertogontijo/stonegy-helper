# Stonegy Helper

Chrome extension that controls [Stonegy](https://stonegy-online.com/) by **reusing the game's own WebSocket** to `wss://api-stonegy.com/`. The game page handles login and authentication; the extension only intercepts that connection and lets you send/read protocol messages.

## How it works

1. A page script (`content/page-bridge.js`) wraps `window.WebSocket` before the game loads.
2. When Stonegy opens `wss://api-stonegy.com/`, the extension captures that socket instance.
3. Incoming/outgoing frames are mirrored to the background worker.
4. Bot actions send JSON through the same socket the game uses — no separate auth token needed.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository folder

Or build a zip for distribution:

```bash
npm run build:chrome
# release/stonegy-helper-v0.1.0.zip
```

## Safari (macOS / iOS)

Requires Xcode and the Safari Web Extension converter (`xcrun safari-web-extension-converter`).

```bash
npm run build:safari

# Optional: compile the macOS target with xcodebuild after conversion
node scripts/build-safari.mjs --xcodebuild
```

This builds the extension into `dist/`, patches unsupported manifest keys for Safari (`world`, `type`, `use_dynamic_url`), bundles a classic background script, converts it into `safari/`, and opens an Xcode project you can run on macOS or archive for iOS.

Cross-browser page access lives in `lib/page-bridge/`. The WebSocket hook is an IIFE bundle injected via a synchronous `<script>` tag at `document_start`.

## CLI

The CLI runs the bot headlessly over a direct WebSocket session (no browser tab required). Start an interactive session to connect to a character and toggle features from the terminal.

```bash
npm install
npm run stonegy -- run --token YOUR_TOKEN
npm run stonegy -- run --token YOUR_TOKEN --character "My Char"
```

Environment variables:

| Variable | Purpose |
|----------|---------|
| `STONEGY_TOKEN` | Bearer JWT (alternative to `--token`) |

Before starting, the CLI loads characters from `/api/character` and prompts you to pick one. Pass `--character <uuid|name>` to skip the prompt.

Settings and feature master states are saved per character under `~/.stonegy-helper/`.

Global install (optional):

```bash
npm link
stonegy-helper run --token YOUR_TOKEN
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

- **CLI tokens** — prefer `STONEGY_TOKEN` over `--token` (argv is visible in `ps` / shell history). Tokens are not written under `~/.stonegy-helper/`.
- **CLI Cloudflare bypass** — `got-scraping` impersonates a browser TLS fingerprint to reach `api-stonegy.com`. This is fragile and may violate game ToS; treat the CLI as best-effort.
- **Keep-alive** — the extension can simulate DOM activity and block idle WebSocket closes (codes 4001/4002) so AFK disconnects do not drop the session. Document this for store review.
- **Mobile bypass** — on Safari/iOS the content script may spoof standalone display-mode to skip the “install as app” overlay.

## Disclaimer

Use automation responsibly and in accordance with Stonegy's terms of service.
