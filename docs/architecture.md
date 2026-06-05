# Architecture

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
│   │   │   │   └── game-routes.ts       # HttpRouter with 3 endpoints
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
│    • Terminal I/O                       │   • Schema validation
│    • HttpClient                         │   • Layer DI (Tag + Layer)
│    • Effect.iterate game loop           │   • Ref.SynchronizedRef<HashMap>
│    • Option/Either for errors           │   • Effect.gen business logic
└──────────┘                              └──────────┘
```

## Server Layer Architecture

```
  main.ts
    │
    ├── HttpServer.serve(router)          ← @effect/platform
    │     │
    │     ├── GameServiceLive             ← business logic
    │     │     │
    │     │     └── GameStoreLive          ← state (Ref<HashMap>)
    │     │
    │     └── NodeHttpServer.layer         ← Node.js adapter
    │
    └── NodeRuntime.layer                 ← runtime bootstrap
```

## Client Loop

```
Effect.iterate(initialState, state =>
  Effect.gen(function*(_) {
    yield* render(state)                  // print board + status
    const key = yield* readKey()          // raw keypress
    const newState = updateState(state, key)
    return newState
  })
)
// Runs until state.status === "quit" | "completed"
```

## Key effect-ts Features by Module

| Package | Feature | Usage |
|---------|---------|-------|
| shared | Schema | All DTOs — decode requests, encode responses, infer types |
| server | Tag + Layer | GameStore, GameService as services |
| server | Ref.SynchronizedRef | Concurrent game session HashMap |
| server | Schema.decodeUnknown | Parse + validate request bodies |
| server | Effect.catchTag | Structured error handling |
| client | Effect.iterate | Main game loop |
| client | HttpClient | Server communication |
| client | Terminal | stdin/stdout as Effect |
| client | Option | Key parsing results |
