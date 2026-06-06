# sudoku-TS

Full-stack Sudoku game built with TypeScript and [effect-ts](https://effect.website/) — a learning project demonstrating functional programming end-to-end.

> **[effect.website](https://effect.website/)** — the Effect ecosystem: Schema, Layer/DI, Queue, Clock, Random, Config, HttpClient, and more.

## FP Features Demonstrated

> The core benefit of FP is that bugs surface at **compile time** rather than at runtime. Every pattern below catches a class of errors that would otherwise slip into production.

### Schema (effect/Schema)
`packages/shared/src/schemas/`
- Runtime validation + type inference from a single declaration
- Piped refinements — `Schema.Number.pipe(Schema.int(), Schema.between(0, 9))`
- Array length constraints — `Schema.Array(...).pipe(Schema.minItems(9), Schema.maxItems(9))`
- `Schema.decodeUnknown` on the server to parse + validate request bodies

### Effect System (effect/Effect)
`all packages`
- `Effect.gen` — imperative-style generator composition throughout
- `Effect.pipe` — fluent composition of effects
- Recursive game loop — pure functional loop with explicit `readKey` parameter
- `Queue.unbounded` — push-to-pull bridge for raw stdin keypress events
- `Struct.evolve` — typed copy-and-update replacing unchecked `...spread`
- `Effect.race` / `Effect.sleep` — connection retry with timeout
- `Effect.fork` / `Effect.never` — background server fiber
- `Effect.ensuring` — guaranteed stdin restoration on exit
- `Effect.scoped` — resource lifecycle management

### Dependency Injection (effect/ Layer)
`packages/server/src/services/`, `packages/client/src/api/`
- `Context.GenericTag` — service tags (`GameStore`, `GameService`, `GameApi`)
- `Layer.effect` — wrap implementations into layers
- `Effect.provideService` / `Effect.provide` — compose services at the edge
- `Layer.provide` — layer-to-layer provisioning
- Compile-time verification: missing dependencies fail at compile time, not runtime
- Layer composition: swap entire dependency graphs for testing with one line

### State Management (effect/ Ref)
`packages/server/src/services/game-store.ts`
- `SynchronizedRef<HashMap>` — concurrent-safe in-memory game sessions
- Atomic read/write via `SynchronizedRef.get` / `.update`
- `HashMap` — immutable persistent hash map operations

### Error Handling
`packages/server/src/routes/`, `packages/client/src/main.ts`
- `Effect.catchAll` — top-level and per-operation error recovery
- `Option.match` — exhaustive branching on optional values
- `Option.isNone` / `Option.isSome` — guard checks in the solver

### Pure Functions
`packages/shared/src/engine/`
- Backtracking solver returning `Option<Board>`
- Puzzle generator using `Array.makeBy` + pure board operations
- Immutable data flow: `setCell` returns a new board

### Algebraic Data Types
`packages/client/src/ui/input.ts`, `packages/client/src/state.ts`
- `KeyEvent` — 10-variant tagged union for keyboard input
- `ClientState.phase` — state machine as discriminated union

### Effect Ecosystem
- `@effect/platform` HTTP server (`HttpRouter`, `HttpServerResponse`, `HttpMiddleware`)
- `@effect/platform` HTTP client (`HttpClient`, `HttpBody`)
- `Clock.currentTimeMillis` — elapsed game time
- `Random.nextIntBetween` — Fisher-Yates shuffle, ID generation
- `Config.number` / `Config.string` — typed configuration

## Quick Start

```bash
pnpm install
pnpm build
# Terminal 1: start server
pnpm --filter @sudoku-ts/server dev
# Terminal 2: start client
pnpm --filter @sudoku-ts/client dev
```

## Project Structure

```
packages/
├── shared/      # Pure domain logic + Schema DTOs
├── server/      # HTTP game API (effect-ts Layer DI + Ref state)
└── client/      # Terminal TUI (Effect.iterate game loop)
```

See [docs/](docs/) for architecture, API contract, game engine details, and the full pattern catalog.

## License

MIT. This project and its dependency [effect](https://github.com/Effect-TS/effect) are both MIT licensed.
