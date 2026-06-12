# Architecture

## Runtime Stack

### Layered Dependencies

```
┌──────────────────────────────────────────────────────────┐
│                    sudoku-TS Application                  │
│  (game-routes.ts, game-service.ts, game-store.ts, ...)   │
├──────────────────────────────────────────────────────────┤
│                   Effect-TS Runtime                       │
│  (pure FP: Schema, Layer, Effect.gen, HttpRouter, etc.)  │
│  ├── @effect/schema  ── typed DTOs, decode/encode       │
│  ├── @effect/platform ── HttpRouter, OpenApi, HttpApp    │
│  │   └── OpenApi.fromApi ── auto-generates OpenAPI 3.1  │
│  └── @effect/platform-node ── NodeHttpServer, NodeRuntime│
├──────────────────────────────────────────────────────────┤
│                     Node.js                               │
│  (http.createServer, process.env, filesystem, stdio)     │
│  └── Required host runtime ── like .NET Core for F#      │
├──────────────────────────────────────────────────────────┤
│                     OS (Linux)                            │
│  (TCP stack, epoll, terminal I/O)                        │
└──────────────────────────────────────────────────────────┘
```

### The .NET Core / F# Analogy

Effect-TS is **not** a Node.js framework — it is a pure functional programming
runtime that requires a JavaScript host, just as F# requires .NET Core:

| Concept | F# / .NET World | Effect-TS / Node.js World |
|---------|-----------------|---------------------------|
| Runtime | .NET Core CLR | Node.js (V8 + libuv) |
| Language | F# | TypeScript |
| Effect system | Async / Task / Result | Effect\<T, E, R\> |
| Dependency injection | Interfaces + DI container | Context Tags + Layer |
| Schema | N/A (serializer-dependent) | @effect/schema (Schema) |
| HTTP server | Kestrel (ASP.NET Core) | @effect/platform HttpServer |
| HTTP routing | ASP.NET Core Controllers | @effect/platform HttpRouter |
| State management | ConcurrentDictionary + lock | SynchronizedRef\<HashMap\> |
| Null safety | Option\<T\> (null is rare) | Option\<T\> (never null) |

### Pure Effect-TS vs. Borrowed Technology

**Pure Effect-TS** (the runtime provides these natively):
- `Schema` — all DTO validation, encoding, type inference
- `Layer` + `Context.Tag` — dependency injection
- `Effect.gen` — structured concurrency
- `HttpRouter`, `HttpApp`, `HttpServer` — HTTP framework
- `SynchronizedRef`, `Ref`, `HashMap` — mutable state managed as effects
- `Queue`, `Stream` — push-to-pull bridging, streaming
- `Clock`, `Random`, `Config` — ambient capabilities
- `OpenApi.fromApi` — OpenAPI 3.1 spec generation (built into `@effect/platform`)
- `Option`, `Either`, `Array`, `Struct.evolve` — pure data transformations

**Borrowed** (Node.js / platform, not yet subsumed by Effect-TS):
- `NodeHttpServer` wrapper — the `node:http` `createServer` call (wrapped by
  `@effect/platform-node` in a pure `Effect`; the underlying TCP listen is
  still Node.js)
- `process.argv` / `process.env` — Node.js CLI interface (read inside
  `Effect.gen`, never at module scope)
- Swagger UI static HTML — served as an effect, but the JS/CSS bundle loads
  from CDN (Swagger UI, Apache 2.0)
- `chalk` — terminal colors in the client (MIT)
- `vitest` — test runner (MIT)

**Missing (wishlist)**:
- Database driver (postgres, sqlite) as an Effect Layer
- AI/LLM integration (Effect-AI)

**Added**:
- Web client (`packages/web-client/`) — see `docs/web-client-architecture.md`
- Client core (`packages/client-core/`) — shared client library — see `docs/client-core.md`
- Controller management (`Hub<GameEvent>`, SSE) — see `docs/controller-management.md`

**Planned (future)**:
- WASM/Electron client (`packages/wasm-client/`) — see `docs/wasm-client-design.md`
  - Game engine compiled to WASM via Rust → `wasm-pack`
  - Server becomes thin data layer
  - Desktop Electron shell with Svelte UI
  - Full offline play capability

## Directory Structure

```
sudoku-ts/
├── pnpm-workspace.yaml
├── .npmrc
├── .gitignore
├── package.json                         # root scripts only
├── tsconfig.base.json                   # shared TS compiler options
├── README.md
├── LICENSE
├── docs/
│   ├── architecture.md                  # this file
│   ├── decisions.md                     # ADR-style decision log
│   ├── api-contract.md                  # API endpoints + Schema shapes
│   ├── game-engine.md                   # Solver + generator details
│   ├── puzzle-generation.md             # Full generation pipeline design
│   └── effect-ts-patterns.md           # Patterns catalog
├── packages/
│   ├── shared/                          # Zero-dependency pure lib
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   │   ├── game.ts              # CellValue, Board, Coord, Difficulty, GameStatus
│   │   │   │   ├── request.ts           # CreateGameRequest, SubmitMoveRequest
│   │   │   │   ├── response.ts          # CreateGameResponse, GameStateResponse, ValidateMoveResponse
│   │   │   │   └── game-event.ts        # GameEvent tagged union for controller SSE
│   │   │   ├── engine/
│   │   │   │   ├── board.ts             # Pure board operations (getRow, getCol, setCell, etc.)
│   │   │   │   ├── solver.ts            # Backtracking solver
│   │   │   │   └── generator.ts          # Puzzle generator with difficulty levels
│   │   │   └── index.ts                 # re-exports everything
│   ├── server/                          # effect-ts HTTP server
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── game-store.ts        # GameStore Tag + Layer (Ref<SynchronizedRef<HashMap>>)
│   │   │   │   ├── game-service.ts      # GameService Tag + Layer (business logic)
│   │   │   │   └── game-event-hub.ts    # GameEventHub Tag + Hub<GameEvent> for SSE
│   │   │   ├── routes/
│   │   │   │   ├── game-routes.ts       # HttpRouter: 4 game + 2 doc + 3 controller endpoints
│   │   │   │   └── game-api.ts          # HttpApi definition → OpenAPI 3.1 spec
│   │   │   └── main.ts                  # Server bootstrap (Layer composition)
│   ├── client-core/                     # Shared client library (NEW)
│   │   └── src/
│   │       ├── state.ts                 # ClientState + pure transitions
│   │       ├── input-types.ts           # KeyEvent discriminated union
│   │       ├── handle-key.ts            # Pure state machine (menu/playing/completed/controller/spectating)
│   │       └── api.ts                   # GameApi Tag + service (HttpClient wrapper)
│   ├── client/                          # raw terminal + chalk TUI (thinned)
│   │   ├── src/
│   │   │   ├── ui/
│   │   │   │   ├── render.ts            # board → ANSI string with chalk
│   │   │   │   └── input.ts             # raw stdin keypress parser
│   │   │   └── main.ts                  # Effect.iterate game loop + controller mode
│   └── web-client/                      # Browser client (NEW)
│       ├── index.html                   # Vite entry
│       ├── vite.config.ts
│       └── src/
│           ├── main.ts                  # SubscriptionRef + fiber topology
│           ├── dom/
│           │   ├── render.ts            # DOM patching from SubscriptionRef
│           │   ├── board-view.ts        # Board → DocumentFragment
│           │   └── input.ts             # keydown → Queue<KeyEvent>
│           ├── controller/
│           │   ├── sse-client.ts        # EventSource → Stream<GameEvent>
│           │   └── controller-view.ts   # Game list + spectate DOM
│           └── styles.css
│   └── wasm-client/                      # WASM/Electron client (PLANNED)
│       ├── wasm/                         # Rust crate → wasm-pack
│       │   ├── Cargo.toml
│       │   └── src/lib.rs               # sudoku-engine WASM exports
│       ├── src/
│       │   ├── App.svelte               # Root Svelte component
│       │   ├── lib/wasm/bridge.ts       # TS ↔ WASM FFI
│       │   ├── routes/                  # Play, Spectate, Menu views
│       │   └── components/              # Board, Cell, StatusBar
│       ├── electron/                    # Electron shell
│       │   ├── main.js
│       │   ├── preload.js
│       │   └── electron-builder.yml
│       ├── vite.config.ts
│       └── svelte.config.js
```

## Data Flow

### Player Flow

```
┌──────────┐     POST /api/games         ┌──────────┐
│          │     { difficulty }           │          │
│  Client  │ ──────────────────────────>  │  Server  │
│  (TUI /  │                              │  (TS)    │
│   Web)   │ <──────────────────────────  │          │
│          │     201 { id, board, ... }   │          │
│          │                              │          │
│          │     POST /api/games/:id/moves│          │
│          │     { row, col, value }      │          │
│          │ ──────────────────────────>  │          │
│          │ <──────────────────────────  │          │
│          │     200 { valid, solved, ..} │          │
│          │                              │          │
│    effect-ts powers:                    │   effect-ts powers:
│    • Queue (keyboard → events)         │   • Schema validation
│    • HttpClient                         │   • Layer DI (Tag + Layer)
│    • Effect.gen / SubscriptionRef       │   • SynchronizedRef<HashMap>
│    • Option/Either for errors           │   • Effect.gen business logic
│    • ClientState (pure transitions)     │   • Clock for elapsed time
└──────────┘                              └──────────┘
```

### Controller (Spectator) Flow

```
┌──────────┐     GET /api/games           ┌──────────┐
│          │ ──────────────────────────>  │          │
│          │ <──────────────────────────  │          │
│          │     [{ id, difficulty, ... }]│          │
│          │                              │          │
│  Client  │     GET /api/games/:id       │  Server  │
│  (ctrl)  │ ──────────────────────────>  │  (TS)    │
│          │ <──────────────────────────  │          │
│          │     { board, status, ... }   │          │
│          │                              │          │
│          │     GET /api/games/stream    │  Hub<GameEvent>
│          │ ──────────────────────────>  │    ↑      │
│          │ <═════ SSE (text/event-stream) ═══╝      │
│          │     { _tag: "MoveMade", ... }│          │
│          │     { _tag: "GameCompleted"} │          │
│          │                              │          │
│    Shared client-core powers:           │   New powers:
│    • ClientState.mode: "controller"     │   • GameEventHub Tag + Hub
│    • gameList + controllerCursor        │   • Hub.publish on every mutation
│    • handleKey (controller/spectating)  │   • SSE stream from Hub.subscribe
│    • GameApi.listGames()                │   • GameStore.listActive()
│    • GameApi.streamGameEvents()         │   • Per-game filtered SSE
└──────────┘                              └──────────┘
```

## Server Layer Architecture

```
  game-api.ts
    │
    └── HttpApi.make("sudoku") + HttpApiGroup + HttpApiEndpoint
          │
          ├── OpenApi.fromApi(api)        ← auto-generates OpenAPI 3.1 spec
          └── Serves as the typed contract for all endpoints

  game-routes.ts
    │
    ├── 4 game routes (POST/GET /api/games*, POST .../moves, .../hints)
    ├── 3 controller routes:
    │     GET /api/games                ← list active games
    │     GET /api/games/stream         ← SSE: all game events
    │     GET /api/games/:id/stream     ← SSE: single game events
    ├── GET /openapi.json               ← serves the auto-generated spec
    └── GET /docs                       ← Swagger UI HTML (loaded from CDN)

  game-event-hub.ts
    │
    └── Hub.unbounded<GameEvent>        ← pub/sub channel for game mutations
          │
          ├── GameService.publish()     ← called after each store.modify
          └── SSE routes subscribe()    ← Hub.subscribe → Stream → HTTP stream

  main.ts
    │
    ├── parseArg / applyCliArgs           ← CLI port/host overrides (pure Effect)
    ├── makeGameEventHub                  ← Hub.unbounded<GameEvent>
    ├── makeGameStore                     ← SynchronizedRef<HashMap>
    ├── makeGameService                   ← business logic + hub injection
    └── NodeHttpServer.make.serve(router, corsWithLogging)
          │
          ├── Effect.provideService(GameStore)
          ├── Effect.provideService(GameService)
          ├── Effect.provideService(GameEventHub)
          └── Effect.fork → Effect.never
```

## Client Architecture (Two Variants)

### TUI Client Loop (Recursive Effect.gen)

```
makeReadKey()
  → { readKey, restoreStdin }
    → gameLoop(initialState, readKey)

gameLoop(state, readKey):
  if state.phase == "quit" → return state                // base case
  if state.phase == "connecting"
    → tryConnect(state, readKey)                         // race: keypress vs retry
  render(state)                                          // chalk → console.log
  key = yield* readKey                                   // Queue.take(keyEvents)
  newState = yield* handleKey(state, key)                // Effect (may call API)
  gameLoop(newState, readKey)                            // tail recurse
```

Controller mode: menu key `c` enters `"controller"` phase — same recursive
loop but `handleKey` dispatches to controller/spectating branches. A polling
fiber refreshes the game list every 2s via `Effect.repeat`.

### Web Client Loop (SubscriptionRef + Fibers)

```
stateRef = SubscriptionRef.make(initialState)

Fiber A (keyboard):
  Queue.unbounded<KeyEvent> ←── keydown handler
  loop:
    key = Queue.take
    current = stateRef.get
    newState = yield* handleKey(current, key)  // same handleKey from client-core
    stateRef.set(newState)

Fiber B (render):
  SubscriptionRef.changes(stateRef) → Stream<ClientState>
  Stream.runForEach(render)         → DOM patches

Fiber C (connecting retry):
  watches stateRef.phase === "connecting"
  Effect.repeat(Effect.sleep(2000) + api.createGame(...))
  stateRef.set(setGame(...)) on success

Controller mode:
  Fiber D: SSE subscription (EventSource → Stream<GameEvent>)
    → updates game list in place
  Fiber E: spectate polling/filtered SSE
    → live board updates for selected game
```

## OpenAPI / Swagger Support

### How it works

The API contract is defined declaratively via `HttpApi` / `HttpApiGroup` /
`HttpApiEndpoint` in `packages/server/src/routes/game-api.ts`. Each endpoint
declares its method, path, request body schema, path parameter schema, and
success response schema. From this definition, `OpenApi.fromApi(api)` in
`@effect/platform` generates an **OpenAPI 3.1.0** specification automatically —
no annotations, no serialization boilerplate.

The spec is served at two URLs:

| URL | Content |
|-----|---------|
| `GET /openapi.json` | Raw OpenAPI 3.1 JSON spec |
| `GET /docs` | Swagger UI HTML (loads spec from `/openapi.json`, renders interactive docs) |

### Why not `HttpApiBuilder.serve`?

The `@effect/platform` `HttpApiBuilder.serve()` API provides end-to-end layer-based
server startup with automatic spec generation, but its type-level layer dependency
resolution does not fully compose with existing service layers (GameStore, GameService).
The current approach uses `HttpRouter` for actual routing (proven, clean type inference)
and derives the OpenAPI spec from the `HttpApi` definition separately.

### Endpoints documented

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/games | Create a new game |
| GET | /api/games | List all active games (controller) |
| GET | /api/games/:id | Get game state |
| GET | /api/games/:id/stream | SSE stream for one game (controller) |
| GET | /api/games/stream | SSE stream of all game events (controller) |
| POST | /api/games/:id/moves | Submit a move |
| POST | /api/games/:id/hints | Request a hint |
| GET | /openapi.json | Raw OpenAPI spec |
| GET | /docs | Swagger UI |

## Dependencies & Licenses

| Package | License | Category |
|---------|---------|----------|
| effect | MIT | Runtime |
| @effect/platform | MIT | Runtime |
| @effect/platform-node | MIT | Runtime |
| TypeScript | Apache 2.0 | Language |
| Node.js | Node.js License (MIT-based) | Host |
| pnpm | MIT | Package manager |
| vitest | MIT | Testing |
| chalk | MIT | Client rendering |
| Swagger UI | Apache 2.0 | API docs (CDN) |

## Key effect-ts Features by Module

| Package | Feature | Usage |
|---------|---------|-------|
| shared | Schema | All DTOs — decode requests, encode responses, infer types |
| shared | Array | Pure loops — map, flatMap, makeBy, every, reduce replace for/push |
| shared | Option | Solver return values, no null — findEmpty, solve return Option |
| shared | Random | Seedable puzzle generation — shuffle, nextIntBetween |
| server | Tag + Layer | GameStore, GameService as services |
| server | SynchronizedRef | Concurrent game session HashMap |
| server | Schema.decodeUnknown | Parse + validate request bodies |
| server | Effect.catchTag | Structured error handling |
| server | Clock | Elapsed time tracking |
| client | Queue | Raw stdin → parsed key events, push-to-pull bridge |
| client | Recursive gameLoop | Pure functional loop with explicit readKey parameter |
| client | HttpClient | Server communication |
| client | Effect.sync | Console I/O wrapped as Effect |
