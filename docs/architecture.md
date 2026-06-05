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
│    • Queue (raw stdin → events)        │   • Schema validation
│    • HttpClient                         │   • Layer DI (Tag + Layer)
│    • Recursive game loop (Effect.gen)  │   • SynchronizedRef<HashMap>
│    • Option/Either for errors           │   • Effect.gen business logic
│    • makeReadKey (one-shot setup)       │   • Clock for elapsed time
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
