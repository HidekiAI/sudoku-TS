# Controller Management — Live Game Viewing on TUI & Browser

> A controller (spectator/admin) mode that lets users view active games in
> real-time from either client. The server broadcasts game events through an
> Effect `Hub`, and each client subscribes via its native transport (SSE for
> browser, polling for TUI).

---

## 1. Overview

A **controller** is a user who monitors active Sudoku games without playing.
The feature spans three layers:

| Layer | What Changes | Key Addition |
|-------|-------------|--------------|
| **Server** | New endpoints + event broadcasting | `Hub<GameEvent>`, SSE streams, game list |
| **client-core** | New state phases + controller views | `mode: "controller"`, `GameApi.listGames`, `GameApi.streamGameEvents` |
| **Client (TUI)** | Controller mode UI | Game list rendering, polling spectator |
| **Client (web)** | Controller mode UI + real-time updates | `EventSource` → `Stream`, reactive spectate |

### Flow

```
  Player makes a move
        │
        ▼
  GameService.submitMove
        │
        ├─ store.modify(id, ...)      ← atomic write
        └─ Hub.publish(GameEvent)     ← broadcast to all subscribers
              │
              ├── SSE endpoint (/api/games/stream)
              │         │
              │         ├── Browser client (EventSource → Stream → DOM)
              │         │
              │         └── TUI client (Long-poll or fetch + ReadableStream)
              │
              └── WebSocket (future — if needed for bidirectional control)
```

---

## 2. Data Model — GameEvent

New shared schemas in `@sudoku-ts/shared`:

```typescript
import { Schema } from "effect";

// ── Event discriminator ────────────────────────────────────────

const GameEventSchema = Schema.TaggedUnion("_tag")({
  GameCreated: Schema.Struct({
    _tag: Schema.Literal("GameCreated"),
    id: Schema.String,
    difficulty: DifficultySchema,
    createdAt: Schema.Number,
  }),
  MoveMade: Schema.Struct({
    _tag: Schema.Literal("MoveMade"),
    id: Schema.String,
    row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    value: CellValueSchema,
    valid: Schema.Boolean,
    movesCount: Schema.Number,
  }),
  HintUsed: Schema.Struct({
    _tag: Schema.Literal("HintUsed"),
    id: Schema.String,
    row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    hintsUsed: Schema.Number,
  }),
  GameCompleted: Schema.Struct({
    _tag: Schema.Literal("GameCompleted"),
    id: Schema.String,
    elapsedSeconds: Schema.Number,
    movesCount: Schema.Number,
    hintsUsed: Schema.Number,
  }),
});

type GameEvent = Schema.Schema.Type<typeof GameEventSchema>;

// ── Game list entry (for GET /api/games) ────────────────────────

const GameListEntrySchema = Schema.Struct({
  id: Schema.String,
  difficulty: DifficultySchema,
  status: GameStatusSchema,
  movesCount: Schema.Number,
  hintsUsed: Schema.Number,
  elapsedSeconds: Schema.Number,
  currentBoard: BoardSchema,      // snapshot of the board right now
  givenMask: GivenMaskSchema,
});

type GameListEntry = Schema.Schema.Type<typeof GameListEntrySchema>;

const GameListResponseSchema = Schema.Array(GameListEntrySchema);
```

### Event Emission Points

Every game mutation in `GameService` publishes an event after the atomic
`store.modify` completes:

| Action | Event | Payload |
|--------|-------|---------|
| `createGame` | `GameCreated` | `{ id, difficulty, createdAt }` |
| `submitMove` (valid) | `MoveMade` | `{ id, row, col, value, valid: true, movesCount }` |
| `submitMove` (invalid) | `MoveMade` | `{ id, row, col, value, valid: false, movesCount }` |
| `hint` | `HintUsed` | `{ id, row, col, hintsUsed }` |
| submitMove/hint → solved | `GameCompleted` | `{ id, elapsedSeconds, movesCount, hintsUsed }` |

---

## 3. Server Architecture

### 3.1 GameEventHub — Effect Hub

A new service wrapping `Hub<GameEvent>`:

```typescript
// packages/server/src/services/game-event-hub.ts

import { Context, Effect, Hub, Layer, Stream } from "effect";
import type { GameEvent } from "@sudoku-ts/shared";

export class GameEventHub extends Context.Tag("GameEventHub")<
  GameEventHub,
  {
    readonly publish: (event: GameEvent) => Effect.Effect<void>;
    readonly subscribe: () => Effect.Effect<Stream.Stream<GameEvent>>;
  }
>() {}

export const GameEventHubLive = Layer.effect(
  GameEventHub,
  Effect.gen(function* (_) {
    const hub = yield* Hub.unbounded<GameEvent>();
    return {
      publish: (event) => Hub.publish(hub, event),
      subscribe: () => Hub.subscribe(hub).pipe(Effect.map(Stream.fromQueue)),
    };
  }),
);
```

### 3.2 Integration into GameService

`GameService` gains a dependency on `GameEventHub`. Each mutation publishes:

```typescript
// Inside makeGameService:
const hub = yield* GameEventHub;

const submitMove = (id: string, raw: unknown) =>
  Effect.gen(function* (_) {
    const req = yield* Schema.decodeUnknown(SubmitMoveRequestSchema)(raw);
    const result = yield* store.modify(id, (session) => {
      // ... existing modify logic ...
      return [response, updatedSession];
    });
    // Publish after atomic store update
    yield* hub.publish({
      _tag: "MoveMade",
      id,
      row: req.row,
      col: req.col,
      value: req.value,
      valid: result.valid,
      movesCount: result.solved ? 0 : 0, // replace with actual count
    });
    if (result.solved) {
      yield* hub.publish({ _tag: "GameCompleted", id, /* ... */ });
    }
    return result;
  });
```

### 3.3 Layer Composition (main.ts)

```typescript
const program = Effect.gen(function* (_) {
  yield* applyCliArgs;
  const hub = yield* makeGameEventHub;
  const store = yield* makeGameStore;
  const svc = yield* makeGameService.pipe(
    Effect.provideService(GameStore, store),
    Effect.provideService(GameEventHub, hub),
  );
  // ... server setup ...
});
```

### 3.4 SSE Endpoint — `GET /api/games/stream`

Server-Sent Events endpoint that bridges the Effect Hub to HTTP:

```typescript
// packages/server/src/routes/game-routes.ts

const streamHandler = Effect.gen(function* (_) {
  const hub = yield* GameEventHub;
  const stream = yield* hub.subscribe();
  return HttpServerResponse.stream(
    stream.pipe(
      Stream.map((event) => `data: ${JSON.stringify(event)}\n\n`),
    ),
    { contentType: "text/event-stream" },
    {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
});
```

Registered on the router:

```typescript
HttpRouter.get("/api/games/stream", streamHandler),
```

### 3.5 Per-Game SSE — `GET /api/games/:id/stream`

Filtered stream for spectating a single game:

```typescript
const gameStreamHandler = Effect.gen(function* (_) {
  const params = yield* HttpRouter.params;
  const id = params["id"] ?? "";
  const hub = yield* GameEventHub;
  const stream = yield* hub.subscribe();
  return HttpServerResponse.stream(
    stream.pipe(
      Stream.filter((event) =>
        ("id" in event ? event.id === id : false) as boolean,
      ),
      Stream.map((event) => `data: ${JSON.stringify(event)}\n\n`),
    ),
    { contentType: "text/event-stream" },
  );
});
```

### 3.6 Game List — `GET /api/games`

Lists all active (non-completed) games with snapshots:

```typescript
// In GameService
const listGames = Effect.gen(function* (_) {
  const store = yield* GameStore;
  const sessions = yield* store.listActive();     // new GameStore method
  return sessions.map((s) => ({
    id: s.id,
    difficulty: s.difficulty,
    status: s.status,
    movesCount: s.movesCount,
    hintsUsed: s.hintsUsed,
    elapsedSeconds: Math.floor((Date.now() - s.startTime) / 1000),
    currentBoard: s.board,
    givenMask: s.givenMask,
  }));
});
```

New `GameStore.listActive` method:

```typescript
const listActive = Effect.gen(function* (_) {
  const map = yield* SynchronizedRef.get(store);
  return Array.fromIterable(map).pipe(
    Array.filter(([_, s]) => s.status === "active"),
    Array.map(([_, s]) => s),
  );
});
```

---

## 4. Client Architecture (shared in `client-core`)

### 4.1 New State Phases

The `ClientState.phase` union gains two new values:

```typescript
export interface ClientState {
  readonly phase:
    | "menu"
    | "connecting"
    | "playing"
    | "completed"
    | "quit"
    | "controller"       // NEW: browsing active games list
    | "spectating"       // NEW: watching a specific live game
  readonly mode: "player" | "controller"  // WHICH role is active
  readonly gameList: GameListEntry[]       // controller: cached game list
  readonly controllerCursor: number        // controller: selected game index
  // ... existing fields ...
}
```

### 4.2 New handleKey Branches

```typescript
export function handleKey(
  state: ClientState,
  key: KeyEvent,
): Effect.Effect<ClientState, never, GameApi> {
  // ... existing phase branches ...

  if (state.phase === "controller") {
    // Arrow keys: navigate game list
    // Enter: select game → enter spectating phase
    //   → fetches full state via GET /api/games/:id
    //   → subscribes to SSE for live updates
    // q: return to menu
    // r: refresh game list
  }

  if (state.phase === "spectating") {
    // Arrow keys: move cursor (view-only highlight, no edit)
    // q: return to controller game list
    // r: toggle auto-refresh
  }
}
```

### 4.3 New GameApi Methods

```typescript
export interface GameApi {
  // ... existing methods ...

  readonly listGames: () => Effect.Effect<
    { readonly games: GameListEntry[] },
    HttpClientError | ParseResult.ParseError
  >

  readonly streamGameEvents: () => Stream.Stream<GameEvent, HttpClientError>
}
```

- `listGames` — calls `GET /api/games`, returns active game list
- `streamGameEvents` — wraps `EventSource` (browser) or polling (TUI) as a
  unified `Stream<GameEvent>`

---

## 5. TUI Client — Controller Mode

The TUI controller uses **polling** rather than SSE because:
- Node.js has no native `EventSource` (needs polyfill)
- Terminal UI is text-based — sub-second latency is unnecessary
- Polling keeps the implementation simple

### Flow

```
Controller mode activated (from menu with 'c' key)
        │
        ▼
  GET /api/games → render game list (table of active games)
        │
        ├─ Arrow up/down: move selection cursor
        ├─ Enter: select game → GET /api/games/:id → spectating mode
        │       └─ render board (read-only, auto-refresh every 2s)
        │       └─ 'r' → manual refresh
        │       └─ 'q' → return to game list
        ├─ 'r': refresh game list (re-fetch GET /api/games)
        └─ 'q': return to player menu
```

### TUI Rendering (game list)

```
  ╔══════════════════════════════════════════════════════════╗
  ║  SUDOKU — CONTROLLER                                     ║
  ║  ──────────────────────────────────────────────────────── ║
  ║                                                           ║
  ║  Active Games:                                            ║
  ║                                                           ║
  ║  ──────────────────────────────────────────────────────── ║
  ║  #  ID          Diff    Moves   Hints   Time              ║
  ║  1  abc123def   Easy    12      0       45s               ║
  ║  2  xyz789ghi   Hard    34      2       120s   ◄───      ║
  ║  3  rst456uvw   Medium  8       1       23s               ║
  ║  ──────────────────────────────────────────────────────── ║
  ║                                                           ║
  ║  ↑↓ navigate | Enter spectate | r refresh | q back        ║
  ╚══════════════════════════════════════════════════════════╝
```

### TUI Rendering (spectating)

Same board render as playing, but with a banner:

```
  ╔══════════════════════════════════════════════════════════╗
  ║  SUDOKU — SPECTATING abc123def (Easy)                     ║
  ║  ──────────────────────────────────────────────────────── ║
  ║                                                           ║
  ║    [board rendered with chalk, read-only]                  ║
  ║                                                           ║
  ║  ● PLAYING   Easy     Moves: 12   Time: 45s              ║
  ║  Spectating — auto-refresh every 2s                       ║
  ║  q quit spectate | r refresh now                          ║
  ╚══════════════════════════════════════════════════════════╝
```

No cursor interaction — the board is rendered as-is from the server snapshot.
A polling fiber (every 2 seconds via `Effect.repeat` + `Effect.sleep`) calls
`GET /api/games/:id` and sets the new state.

---

## 6. Web Client — Controller Mode

The web controller uses **native `EventSource`** for real-time updates,
wrapped as an Effect `Stream` via `Stream.async`.

### 6.1 SSE Client Wrapper

```typescript
// packages/web-client/src/controller/sse-client.ts

import { Stream, Effect } from "effect";
import type { GameEvent } from "@sudoku-ts/shared";

export function fromEventSource(url: string): Stream.Stream<GameEvent> {
  return Stream.async<GameEvent>((emit) => {
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const parsed: GameEvent = JSON.parse(event.data);
        emit(Effect.succeed(Chunk.of(parsed)));
      } catch {
        // skip malformed events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on connection loss
    };

    return Effect.sync(() => es.close());
  });
}
```

### 6.2 Controller Fiber Topology

```
  stateRef (SubscriptionRef<ClientState>)
      │
      ├─ Fiber D (controller mode): when phase === "controller"
      │   ├─ on enter: call GameApi.listGames → stateRef.set(gameList)
      │   ├─ subscribe to SSE → stream GameEvents → update gameList entries
      │   │       in-place (moves count, board snapshot, status)
      │   ├─ input: navigate list (arrow keys), select (Enter), refresh ('r')
      │   └─ on 'q': stateRef.set({ ...state, phase: "menu" })
      │
      └─ Fiber E (spectating): when phase === "spectating"
          ├─ on enter: GET /api/games/:id → full state → render board
          ├─ subscribe to per-game SSE (/api/games/:id/stream) → live board updates
          ├─ input: arrow keys move read-only highlight cursor
          └─ on 'q': stateRef.set({ ...state, phase: "controller" })
```

### 6.3 Controller Mode Rendering (web)

The game list is rendered as an HTML `<table>` with live-updating rows. Each
row shows:

- Game ID (truncated)
- Difficulty (with color badge)
- Status (● active / ✓ completed)
- Moves count
- Hints used
- Elapsed time (auto-updating)

When a game is selected, the board is rendered identically to the playing view
but with a `.spectator` CSS class that disables cell editing and shows a
"SPECTATING" banner.

### 6.4 Live Board Updates

As `GameEvent.MoveMade` events arrive via SSE, the board snapshot in the
event payload replaces the local board. The SubscriptionRef update triggers
the render fiber, which applies a minimal DOM diff to the affected cells:

```typescript
// Simplified update on MoveMade event
const onMove = (event: MoveMade) => {
  stateRef.update((state) => {
    if (state.phase !== "spectating" || state.gameId !== event.id) return state;
    // Update the specific cell without re-fetching
    return Struct.evolve(state, {
      board: (b) => setCell(b, event.row, event.col, event.value),
      movesCount: () => event.movesCount,
    });
  });
};
```

This gives **sub-second latency** for board updates in the browser without
polling.

---

## 7. API Endpoints (Summary)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/games` | List all active games | None (open) |
| `GET` | `/api/games/stream` | SSE stream of all game events | None (open) |
| `GET` | `/api/games/:id/stream` | SSE stream for one game | None (open) |
| `GET` | `/api/games/:id` | Existing — full game state | None (open) |

Existing endpoints unchanged:
- `POST /api/games`
- `POST /api/games/:id/moves`
- `POST /api/games/:id/hints`

---

## 8. File-by-File Impact

### New Files

| File | Purpose |
|------|---------|
| `packages/server/src/services/game-event-hub.ts` | `GameEventHub` Tag + Hub implementation |
| `packages/shared/src/schemas/game-event.ts` | `GameEvent` Schema + types |
| `packages/web-client/src/controller/sse-client.ts` | `EventSource` → `Stream` wrapper |
| `packages/web-client/src/controller/controller-view.ts` | Game list + spectate DOM rendering |
| `packages/web-client/src/controller/controller-view.css` | Controller-specific styles |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Export `game-event.ts` |
| `packages/server/src/services/game-store.ts` | Add `listActive()` method |
| `packages/server/src/services/game-service.ts` | Inject `GameEventHub`, publish on mutations |
| `packages/server/src/routes/game-routes.ts` | Add 3 new routes (game list, 2 SSE streams) |
| `packages/server/src/routes/game-api.ts` | Add new endpoints to HttpApi |
| `packages/server/src/main.ts` | Provide `GameEventHubLive` Layer |
| `packages/client-core/src/state.ts` | Add `mode`, `gameList`, `controllerCursor & phases |
| `packages/client-core/src/handle-key.ts` | Add controller/spectating state machine branches |
| `packages/client-core/src/api.ts` | Add `listGames()`, `streamGameEvents()` |
| `packages/client/src/main.ts` | Add 'c' key → controller mode in menu, polling spectate fiber |
| `packages/client/src/ui/render.ts` | Add controller game list render, spectating render |
| `packages/web-client/src/main.ts` | Add controller/spectate fiber wiring |
| `packages/web-client/src/dom/input.ts` | Add 'c' key mapping |

---

## 9. Security Notes

For this learning project, controller mode is **unauthenticated and open**:

- Anyone can list active games
- Anyone can subscribe to the SSE stream (which exposes game IDs and board
  state)
- No distinction between player and controller roles at the server level

In a production deployment, the SSE endpoint would require:
- Authentication (JWT or session cookie)
- Authorization (admin/spectator role)
- Rate limiting to prevent resource exhaustion on open SSE connections

---

## 10. Future UI Framework Integration

The controller mode in the web client is built with plain DOM operations.
Like the main game client, the controller view is swappable to any framework
(React, Svelte, Solid, Vue) by replacing the `controller/` directory.

### Adapter Boundary

Everything server-side and in `client-core` stays identical regardless of UI
framework:

| Layer | Framework-Agnostic? | What Changes Per Framework |
|-------|-------------------|---------------------------|
| `GameEventHub` (server) | ✅ Yes | Nothing |
| SSE endpoints (server) | ✅ Yes | Nothing |
| `GameEvent` schemas (shared) | ✅ Yes | Nothing |
| `ClientState.mode: "controller"` (client-core) | ✅ Yes | Nothing |
| `handleKey` controller branches (client-core) | ✅ Yes | Nothing |
| `GameApi.listGames()` / `GameApi.streamGameEvents()` (client-core) | ✅ Yes | Nothing |
| SSE → `Stream<GameEvent>` | ✅ Yes | Nothing |
| Game list rendering | ❌ Changes | DOM / JSX / template |
| Spectate board rendering | ❌ Changes | DOM / JSX / template |
| Controller keyboard input | ❌ Changes | keydown / React + SyntheticEvent |

### What a React Controller Would Look Like

```tsx
// components/ControllerGameList.tsx
function ControllerGameList({
  games,
  selectedIndex,
  onSelect,
}: {
  games: GameListEntry[];
  selectedIndex: number;
  onSelect: (id: string) => void;
}) {
  return (
    <table className="game-list">
      <thead>
        <tr><th>Diff</th><th>Moves</th><th>Time</th></tr>
      </thead>
      <tbody>
        {games.map((g, i) => (
          <tr
            key={g.id}
            className={i === selectedIndex ? "selected" : ""}
            onClick={() => onSelect(g.id)}
          >
            <td>{g.difficulty}</td>
            <td>{g.movesCount}</td>
            <td>{g.elapsedSeconds}s</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

The SSE subscription would live in a custom hook:

```tsx
// hooks/useGameEvents.ts
function useGameEvents(api: GameApi): Stream<GameEvent> {
  const [events, setEvents] = useState<GameEvent[]>([]);
  useEffect(() => {
    const fiber = Effect.runFork(
      api.streamGameEvents().pipe(
        Stream.runForEach((event) => Effect.sync(() => {
          setEvents((prev) => [...prev, event]);
        })),
      ),
    );
    return () => Fiber.interrupt(fiber);
  }, []);
  return events;
}
```

### Migration Path (same as game client)

```bash
# 1. npm install react react-dom @types/react @types/react-dom
# 2. Add @vitejs/plugin-react
# 3. Replace controller/ with components/ + hooks/
# 4. Keep sse-client.ts (EventSource wrapper is framework-agnostic Effect)
# 5. Delete controller-view.ts, controller-view.css
```

---

## 11. Future Considerations

| Feature | Notes |
|---------|-------|
| **Controller actions** | End game, remove game, ban player — would need auth layer |
| **WebSocket transport** | Replace SSE with WebSocket for bidirectional control messages |
| **Persisted game history** | Save completed games to database for post-mortem analysis |
| **Controller per-game filters** | Filter by difficulty, player, time range |
| **Multiple concurrent SSE clients** | Hub scales to many subscribers; test with 50+ |
