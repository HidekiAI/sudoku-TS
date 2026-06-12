# Client Core — `@sudoku-ts/client-core`

> Shared client library that both TUI and web clients import. Pure functions,
> Effect descriptors, and types — no I/O, no terminal dependencies, no DOM.

## Motivation

When the project had only a TUI client, all client code lived in
`packages/client/`. Adding a browser client revealed the duplication:

- `state.ts` — pure state transitions, zero I/O
- `api/game-api.ts` — `GameApi` service with `HttpClient`, zero terminal/DOM
- `handleKey` logic — pure state machine
- `KeyEvent` type — shared across input sources

Extracting these into a shared `@sudoku-ts/client-core` package eliminates
duplication and enforces a clean architecture boundary: client-specific code
owns I/O; shared code owns logic.

## Package Structure

```
packages/client-core/
├── package.json           # name: "@sudoku-ts/client-core"
│                          # deps: effect, @effect/platform, @sudoku-ts/shared
├── tsconfig.json          # extends base, no DOM lib (runs on Node + browser)
└── src/
    ├── index.ts           # barrel re-exports
    ├── state.ts           # ClientState interface + pure transitions
    ├── input-types.ts     # KeyEvent discriminated union
    ├── handle-key.ts      # handleKey(state, key) → Effect<ClientState, never, GameApi>
    ├── api.ts             # GameApi Tag + makeGameApi + GameApiLive
    └── api.test.ts        # Api client tests (mocked HttpClient)
```

## Module Breakdown

### `state.ts` — ClientState and Transitions

Extracted identically from the existing TUI client. Zero changes.

```typescript
export interface ClientState {
  readonly phase: "menu" | "connecting" | "playing" | "completed" | "quit"
  readonly mode: "player" | "controller"     // NEW: player vs spectator mode
  readonly gameId: string
  readonly difficulty: Difficulty
  readonly board: Board
  readonly givenMask: boolean[][]
  readonly conflicts: boolean[][]
  readonly cursor: { readonly row: number; readonly col: number }
  readonly status: GameStatus
  readonly message: string
  readonly hintsUsed: number
  readonly movesCount: number
  readonly elapsedSeconds: number
}
```

The `mode` field is added for controller management — when `mode ===
"controller"`, the client shows the game list and spectate views instead of the
playing interface.

Transitions (all pure functions):

| Function | Signature | Effect |
|----------|-----------|--------|
| `setGame` | `(state, gameId, difficulty, board, givenMask) → ClientState` | Start playing |
| `updateBoard` | `(state, board, message, solved, conflict?) → ClientState` | Apply server response |
| `moveCursor` | `(state, dRow, dCol) → ClientState` | Arrow key movement |
| `showMessage` | `(state, message) → ClientState` | Display a message |
| `quit` | `(state) → ClientState` | Exit |
| `setConnecting` | `(state) → ClientState` | Connection in progress |
| `setControllerMode` | `(state) → ClientState` | Enter controller/spectator mode |
| `setGameList` | `(state, games) → ClientState` | Update controller game list |
| `selectSpectateGame` | `(state, gameId) → ClientState` | Select game to spectate |

### `input-types.ts` — KeyEvent

Shared across both clients so `handleKey` works identically regardless of
input source:

```typescript
export type KeyEvent =
  | { readonly kind: "up" }
  | { readonly kind: "down" }
  | { readonly kind: "left" }
  | { readonly kind: "right" }
  | { readonly kind: "number"; readonly value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }
  | { readonly kind: "erase" }
  | { readonly kind: "hint" }
  | { readonly kind: "quit" }
  | { readonly kind: "enter" }
  | { readonly kind: "char"; readonly value: string }
  | { readonly kind: "unknown" };
```

### `handle-key.ts` — State Machine

The `handleKey` function is the core game controller — it takes the current
state and a key event, and returns the next state as an `Effect` (because
submitting moves requires async API calls).

```typescript
export function handleKey(
  state: ClientState,
  key: KeyEvent,
): Effect.Effect<ClientState, never, GameApi>
```

The state machine is organized by `state.phase`:

- **menu**: Select difficulty (`e`/`m`/`h`/`x`), start game (Enter), quit (`q`)
- **playing**: Move cursor, place number, erase, hint, quit
- **completed**: New game (Enter), quit (`q`)
- **controller**: Select game from list, spectate, return to menu
- **spectating**: Scroll view, return to game list, quit

The `controller` and `spectating` phases are new additions for Controller
Management (see `docs/controller-management.md`).

### `api.ts` — GameApi Service

The `GameApi` interface defines every server interaction as typed Effect
operations:

```typescript
export interface GameApi {
  readonly createGame: (
    difficulty: Difficulty,
  ) => Effect.Effect<CreateGameResponse, HttpClientError | ParseResult.ParseError>

  readonly submitMove: (
    gameId: string, row: number, col: number, value: number,
  ) => Effect.Effect<ValidateMoveResponse, HttpClientError | ParseResult.ParseError>

  readonly getHint: (
    gameId: string, row: number, col: number,
  ) => Effect.Effect<HintResponse, HttpClientError | ParseResult.ParseError>

  readonly getGame: (
    gameId: string,
  ) => Effect.Effect<GameStateResponse, HttpClientError | ParseResult.ParseError>

  readonly listGames: () => Effect.Effect<
    GameListEntry[], HttpClientError | ParseResult.ParseError
  >

  readonly streamGameEvents: () => Stream.Stream<GameEvent, HttpClientError>
}
```

`listGames` and `streamGameEvents` are new endpoints for controller management.
`streamGameEvents` returns a `Stream` backed by SSE (browser) or polling (TUI).

```typescript
export const GameApi = Context.GenericTag<GameApi>("GameApi");

export const makeGameApi = Effect.gen(function* (_) {
  const client = yield* HttpClient.HttpClient;
  // ... implementation using client.post, client.get, etc.
  return { createGame, submitMove, getHint, getGame, listGames, streamGameEvents };
});

export const GameApiLive = Layer.effect(GameApi, makeGameApi);
```

## Dependency Graph

```
  @sudoku-ts/shared
  (engine, schemas — pure, zero deps)
        ↑
  @sudoku-ts/client-core
  (state, GameApi, handleKey, KeyEvent)
       ↕        ↑          ↑
  @sudoku-ts/client    @sudoku-ts/web-client
  (chalk, stdin)       (Vite, DOM, keydown)
```

`client-core` depends on:
- `effect` — `Effect`, `Context`, `Stream`, `SubscriptionRef`
- `@effect/platform` — `HttpClient`, `FetchHttpClient`
- `@sudoku-ts/shared` — schemas, board types, engine

`client-core` does NOT depend on:
- `@effect/platform-node` (TUI-only)
- `chalk` (TUI-only)
- `vite` (web-only)
- DOM types (web-only)

## Framework Adapter Boundary

`client-core` is the **adapter boundary** for any UI framework. Because it has
zero DOM, zero terminal, and zero runtime-specific dependencies, it can be
imported by any web framework (React, Svelte, Solid, Vue) with no changes.

### The Contract

```
  client-core owns:
    • ClientState — what the UI renders
    • handleKey — how user input changes state
    • GameApi — how to talk to the server
    • KeyEvent — the input vocabulary

  The UI framework owns:
    • Rendering state to pixels (DOM, SVG, Canvas)
    • Capturing user input (keyboard, mouse, touch)
    • Composing the component tree

  They connect via:
    • SubscriptionRef<ClientState>  (push: state → UI)
    • Queue<KeyEvent>               (push: UI → state machine)
    • GameApi Tag                   (Effect Layer, provided at bootstrap)
```

### How Each Framework Would Wire In

| Framework | State subscription | Input binding | Bundle impact |
|-----------|------------------|---------------|---------------|
| **Plain DOM** (current) | `SubscriptionRef.changes` → `Stream.runForEach(render)` | `keydown` → `Queue.unsafeOffer` | Zero — no framework |
| **React** | `useSyncExternalStore('subscribe', getSnapshot)` | onKeyDown handler → `Queue.unsafeOffer` | +react +react-dom (~15KB gzip) |
| **Svelte** | `$state` + store subscription via `onMount` | `on:keydown` → `Queue.unsafeOffer` | +svelte (~3KB gzip) |
| **Solid** | `createSignal` + `SubscriptionRef.changes` | `onKeyDown` → `Queue.unsafeOffer` | +solid-js (~4KB gzip) |
| **Vue** | `ref()` + watcher on `SubscriptionRef` | `@keydown` → `Queue.unsafeOffer` | +vue (~10KB gzip) |

### What Never Changes

The following files in `client-core` are **UI-framework-invariant**:

```typescript
// Never modified — shared across all current and future UI clients
import { initialState, setGame, updateBoard, moveCursor, handleKey } from "@sudoku-ts/client-core";
import { GameApi, GameApiLive } from "@sudoku-ts/client-core";
import type { KeyEvent, ClientState } from "@sudoku-ts/client-core";
```

This means tests written for `client-core` protect **all** UI clients
simultaneously — if a state transition bug is found and fixed here, every
framework benefits without additional test code.

## Testing

All tests in `client-core` are pure Effect tests — no DOM, no terminal, no
mocking framework. Dependencies (`GameApi`) are provided via `Layer` in tests:

```typescript
// handle-key test example
it("starts game on Enter in menu phase", () =>
  Effect.gen(function* (_) {
    const state = initialState;
    const result = yield* handleKey(state, { kind: "enter" });
    assert(result.phase === "connecting");
  }).pipe(
    Effect.provideService(GameApi, mockGameApi),
    Effect.runPromise,
  ));
```

Test layers mirror `@sudoku-ts/server` test patterns — the `GameApi` service
is replaced with a mock that returns fixed data, using `Layer.provideService`.
