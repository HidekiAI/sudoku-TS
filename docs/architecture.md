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
- Mobile or web client

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
│   │   │   │   └── response.ts          # CreateGameResponse, GameStateResponse, ValidateMoveResponse
│   │   │   ├── engine/
│   │   │   │   ├── board.ts             # Pure board operations (getRow, getCol, setCell, etc.)
│   │   │   │   ├── solver.ts            # Backtracking solver
│   │   │   │   └── generator.ts          # Puzzle generator with difficulty levels
│   │   │   └── index.ts                 # re-exports everything
│   ├── server/                          # effect-ts HTTP server
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── game-store.ts        # GameStore Tag + Layer (Ref<SynchronizedRef<HashMap>>)
│   │   │   │   └── game-service.ts      # GameService Tag + Layer (business logic)
│   │   │   ├── routes/
│   │   │   │   ├── game-routes.ts       # HttpRouter: 4 game + 2 doc endpoints
│   │   │   │   └── game-api.ts          # HttpApi definition → OpenAPI 3.1 spec
│   │   │   └── main.ts                  # Server bootstrap (Layer composition)
│   └── client/                          # raw terminal + chalk TUI
│       ├── src/
│       │   ├── api/
│       │   │   └── game-api.ts          # HttpClient wrapper as Service
│       │   ├── ui/
│       │   │   ├── render.ts            # board → ANSI string with chalk
│       │   │   └── input.ts             # raw stdin keypress parser
│       │   ├── state.ts                 # ClientState type + pure update
│       │   └── main.ts                  # Effect.iterate game loop
```

## Data Flow

```
┌──────────┐     POST /api/games         ┌──────────┐
│          │     { difficulty }           │          │
│  Client  │ ──────────────────────────>  │  Server  │
│  (TUI)   │                              │  (TS)    │
│          │ <──────────────────────────  │          │
│          │     201 { id, board, ... }   │          │
│          │                              │          │
│          │     POST /api/games/:id/moves│          │
│          │     { row, col, value }      │          │
│          │ ──────────────────────────>  │          │
│          │ <──────────────────────────  │          │
│          │     200 { valid, solved, ..} │          │
│          │                              │          │
│    effect-ts powers:                    │   effect-ts powers:
│    • Queue (raw stdin → events)        │   • Schema validation
│    • HttpClient                         │   • Layer DI (Tag + Layer)
│    • Recursive game loop (Effect.gen)  │   • SynchronizedRef<HashMap>
│    • Option/Either for errors           │   • Effect.gen business logic
│    • makeReadKey (one-shot setup)       │   • Clock for elapsed time
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
    ├── GET /openapi.json                 ← serves the auto-generated spec
    └── GET /docs                          ← Swagger UI HTML (loaded from CDN)

  main.ts
    │
    ├── parseArg / applyCliArgs           ← CLI port/host overrides (pure Effect)
    ├── makeGameStore                      ← SynchronizedRef<HashMap>
    ├── makeGameService                   ← business logic
    └── NodeHttpServer.make.serve(router, corsWithLogging)
          │
          ├── Effect.provideService(GameStore)
          ├── Effect.provideService(GameService)
          └── Effect.fork → Effect.never
```

## Client Loop

The game loop is a recursive function — `readKey` is created once by `makeReadKey()` and passed as an explicit parameter through every iteration:

```
makeReadKey()
  → { readKey, restoreStdin }
    → gameLoop(initialState, readKey)

gameLoop(state, readKey):
  if state.phase == "quit" → return state                // base case
  render(state)                                          // pure string → console.log
  key = yield* readKey                                   // Queue.take(keyEvents)
  newState = handleKey(state, key)                       // pure transition
  gameLoop(newState, readKey)                            // tail recurse
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
| GET | /api/games/:id | Get game state |
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
