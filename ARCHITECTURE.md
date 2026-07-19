# Architecture

Stonegy Helper is an event-driven game automation stack. After the services/states migration, **domain `*State` classes own game data**; **feature `*Service` classes own automation**; the popup / server UI consume a projected `SessionView` / `BotState`.

## Pipeline

```mermaid
flowchart LR
  Wire["Transport wire"] --> Norm["events/normalize"]
  Norm --> Domains["states/*State<br/>source of truth"]
  Domains --> Cores["*.service.ts<br/>master-gated"]
  Cores --> Bus["CommandBus"]
  Bus --> Transport["Transport"]
  Domains --> View["projectSessionView"]
  View --> UI["Popup / server UI"]
  Norm --> Debug["debug telemetry"]
  Norm -.-> Traces["flow traces<br/>(when present)"]
  Cores -.-> Traces
```

Inbound path (`GameSession.handleWireMessage`):

1. `recordDebugWireMessage` — wire + schema telemetry
2. `normalizeWireMessage` → `GameEvent[]`
3. `services.applyDomains(event)` — always runs (`PartyState`, `SessionState`, `HuntState`, …)
4. `CommandBus.notifyResponse` for matching outbound waits
5. `services.applyCores(event)` — only masters that are on
6. `projectSessionView` → `toBotState` → host `onChange`

Outbound game actions go through `session.commands` (`CommandBus`) only — never raw transport from services.

## Layering

Dependency direction: **protocol → domain → core → adapters**.

| Layer | Current paths | Role |
| --- | --- | --- |
| Protocol | `packages/helper/src/binary/`, `packages/helper/src/protocol.ts`, `packages/helper/src/protocol-messages.ts` | Wire decode / message types |
| Domain (pure) | `packages/helper/src/domain/` (e.g. `loot-sell.ts`), plus legacy `packages/helper/src/inventory.ts`, `packages/helper/src/market/*`, `packages/helper/src/hunts.ts`, … | Session-free game logic; **no imports from `packages/helper/src/core/`** (type-only `Settings` ok) |
| Core | `packages/helper/src/core/` | Session, events, commands, services + states, projections, feature metadata |
| Adapters | `apps/extension/adapters/extension/`, `apps/server/` | Extension + server hosts; timers, storage, UI wiring |

Settings schema + persist/apply helpers live in `@stonegy/helper` (`settings.ts`, `settings-persist.ts`). Each host still stores locally (chrome.storage vs `~/.stonegy-helper/{id}.json`). While the extension claims a character on `ws://127.0.0.1:17865/v1/extension`, settings + feature masters sync both ways over that control WebSocket (`type: "settings"`); disk on the helper is updated via the supervisor. When not claimed, chrome.storage stays local until the next claim. Credentials still use `POST /v1/credentials/sync`.

**In progress:** pure modules migrate under `packages/helper/src/domain/` — done for loot-sell, tasks, hunt guards, party invite-filter, tools auto-training; market re-exported via `packages/helper/src/domain/market`.

### Communication planes

Three separate channels (do not conflate “bridge” / “transport”):

| Plane | Path | Role |
| --- | --- | --- |
| **Game WS** | page-bridge (tab) or DirectWs (headless) | Frames on `wss://server-game-01.api-stonegy.com/` into `GameSession` |
| **Extension↔helper control WS** | `ws://127.0.0.1:17865/v1/extension` | Claim / release / settings / state / command RPC while the tab holds the character |
| **UI BotTransport** | `chrome.runtime` or HTTP+SSE | Popup / server UI → host (`bot:*` channels) |

Ownership: when the extension’s game WS is up it **claims** the character; the supervisor disconnects any headless session for that id. On release or control-WS close, the claim is cleared and the character stays offline until you Connect manually in the helper UI.

Shared bot RPC lives in `packages/helper/src/core/session-commands.ts` (`handleSessionCommand`); hosts pass optional hooks for chrome-only channels and persist side effects.

### Core layout

```
packages/helper/src/core/
  session.ts              # process owner: transport, settings, registry, CommandBus
  session-commands.ts     # shared bot:* RPC (extension + server hosts)
  settings.ts             # Settings type + defaults
  settings-persist.ts     # pickPersistedSettings + applySettingsPatch (shared hosts)
  events/                 # normalize, schemas, debug-telemetry, flow-trace
  commands/               # CommandBus + registry/policy
  services/
    states/*.state.ts     # DomainState — game data (always dispatched)
    *.service.ts          # Feature services — automation (master-gated)
    register.ts           # DI wiring
    registry.ts           # applyDomains / applyCores / projectSessionView
  features/instances/     # UI labels, tab order, sub-feature metadata
  projections/            # SessionView types, patch, toBotState, project-events (tests)
  replay/                 # wire capture → GameSession replay harness
  transports/             # page-bridge, direct-ws
```

### Communication rules

- `states/` **never** import feature services.
- Services get other states/services via **constructor DI** (`register.ts`).
- Cross-service work: `ctx.emit(event)` (re-enters registry) or `session.commands`.
- Domain states always run; cores are skipped when their feature master is off.

## Where does X go?

| Change | Put it in |
| --- | --- |
| New game data field from wire | Domain `*State` (`packages/helper/src/core/services/states/`) + projection slice |
| New automation behavior | `*Service` (`*.service.ts`), gated by feature master + settings |
| Pure selection / pricing / math | Domain module (`packages/helper/src/market/pricing.ts`, etc.; target `packages/helper/src/domain/`) — no `GameSession` |
| UI labels / tab / sub-feature metadata | `packages/helper/src/core/features/instances/` |
| Outbound game action | `CommandBus` only (`session.commands.run` / `sendRaw`) |
| Wire decode / new opcode shape | `packages/helper/src/binary/` or `packages/helper/src/protocol*` + `events/normalize` (+ schema in `events/schemas/`) |

## Feature masters vs settings

- **Masters** (`FeatureMasters`: `market` \| `loot` \| `battle` \| `hunt` \| `tasks` \| `tools`) gate the **whole** core service. Registry skips `onEvent` / stops timers when off; turning off clears related settings via `getFeatureMasterOffPatch`.
- **Settings** (`packages/helper/src/core/settings.ts`) gate **sub-behaviors** inside a service (e.g. `autoHuntEnabled`, `marketScanEnabled`, `autoSellLoot`). Sub-feature metadata in `features/instances/` maps settings → UI toggles.

Masters = power switch for a feature tab. Settings = knobs for behaviors under that tab.

## Debugging

- **Debug telemetry** (`events/debug-telemetry.ts`): every wire message is recorded; unknown types and payload schema mismatches are bucketed. Exposed on `BotState.debug` for the Debug panel / CLI.
- **Flow traces** (`events/flow-trace.ts` + `Service.traceFlow`): per-run records of guards, phases, and outcomes on loot / market / hunt / tasks / tools. Copy from Debug panel (“Copy last flow” / “Copy flow traces”).
- Prefer **exporting a capture** (debug events + wire payloads) over ad-hoc logging. Replay captures with `packages/helper/src/core/replay/harness.ts` to turn bugs into regression fixtures.

Each feature service exposes a named flow phase via `snapshot()` (`lootFlow`, `marketFlow`, `huntFlow`, `toolsFlow`, tasker flow).

## Key types

- `GameEvent` — normalized inbound unit
- `DomainState` / `Service` — registry participants
- `SessionView` — projected snapshot (not the store of domain fields)
- `BotState` — settings + view + telemetry for hosts
