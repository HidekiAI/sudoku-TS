# Web Client Architecture

> Pure-Effect browser-based Sudoku client using Vite + DOM rendering + SubscriptionRef reactive topology.

## Overview

The web client is a browser port of the terminal TUI client. It shares all game
logic (`state.ts`, `handleKey`, `GameApi`) via the `@sudoku-ts/client-core`
package. The only client-specific code is the I/O boundary:

| Boundary | TUI (`packages/client/`) | Web (`packages/web-client/`) |
|----------|--------------------------|------------------------------|
| Render engine | `chalk` + `console.log` | DOM element updates |
| Input source | Raw stdin (`process.stdin`) | `keydown` event listener |
| Game loop | Recursive `Effect.gen` | SubscriptionRef + fibers |
| Build tool | `tsc` (Node.js) | Vite (bundler) |

## Build Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | ^6.x | Dev server, HMR, production bundling |
| TypeScript | ^5.8 | With DOM lib for browser types |
| Vitest | ^4.x (workspace) | Unit tests with `jsdom` environment |

### Vite Configuration

```typescript
// packages/web-client/vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: { outDir: "dist" },
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
});
```

The dev server proxies `/api/*` requests to the Effect-TS backend, avoiding
CORS issues during development. Production builds serve the static assets
alongside the backend or behind a reverse proxy.

### File Structure

```
packages/web-client/
├── index.html                    # Vite HTML entry point
├── package.json                  # vite, effect, @effect/platform, @sudoku-ts/client-core
├── tsconfig.json                 # extends base, lib: ["DOM", "ESNext"]
├── vite.config.ts
└── src/
    ├── main.ts                   # Bootstrap: SubscriptionRef, fiber topology, cleanup
    ├── dom/
    │   ├── render.ts             # SubscriptionRef → Stream → DOM patching
    │   ├── board-view.ts         # Pure: ClientState → DocumentFragment
    │   └── input.ts              # keydown → Queue<KeyEvent>, returns cleanup Effect
    ├── controller/               # Controller (spectator) mode
    │   ├── controller-view.ts    # Game list, spectate layout rendering
    │   └── sse-client.ts         # EventSource → Stream<GameEvent> wrapper
    └── styles.css                # Board grid, cursor, conflict, responsive layout
```

## Reactive Fiber Topology

The web client replaces the TUI's recursive `Effect.gen` loop with a
multi-fiber reactive architecture built on `SubscriptionRef`. This is the
fundamental architectural difference between the two clients.

### Core Idea

A single `SubscriptionRef<ClientState>` serves as the central state atom.
Multiple fibers observe and mutate it via different patterns:

1. **Input fiber** — pushes `ClientState` mutations from keyboard events
2. **Render fiber** — subscribes to state changes, applies DOM diffs
3. **Connecting fiber** — polls the server when `phase === "connecting"`
4. **Controller fiber** — subscribes to SSE stream, updates state (controller mode)

```
  main.ts entry
      │
      ├─ SubscriptionRef.make(initialState) ──→ stateRef
      │
      ├─ Fiber A: keyboard listener
      │   ├─ Queue.unbounded<KeyEvent>       ←── keydown handler
      │   ├─ loop:
      │   │     Queue.take
      │   │   → current = stateRef.get
      │   │   → newState = handleKey(current, key)
      │   │   → stateRef.set(newState)
      │   └─ returns cleanup Effect (removeEventListener)
      │
      ├─ Fiber B: reactive render
      │   ├─ SubscriptionRef.changes(stateRef)  →  Stream<ClientState>
      │   ├─ Stream.runForEach(render)          →  DOM updates
      │   └─ implicit cleanup (stream interruption)
      │
      ├─ Fiber C: connecting-phase retry
      │   ├─ watches stateRef; when phase === "connecting":
      │   ├─ Effect.repeat(Effect.sleep(2000) + api.createGame(...))
      │   └─ stateRef.set(setGame(...)) on success
      │
      └─ cleanup: window.addEventListener("beforeunload", interruptAll)
```

### Why SubscriptionRef Over Recursive Loop?

| Aspect | TUI recursive loop | Web SubscriptionRef |
|--------|--------------------|--------------------|
| Render-blocking `Queue.take` | Yes — loop halts until keypress | No — render runs independently in its own fiber |
| Multiple input sources | Single `readKey` parameter | Any fiber can set state |
| "connecting" retry | Embedded in `tryConnect` + `Effect.race` | Background fiber, non-blocking |
| Controller mode | Would require restructuring loop | Natural — insert a controller-input fiber |
| HMR compatibility | N/A (Node.js) | Fibers survive Vite HMR |

### Fiber Interruption Strategy

The cleanup protocol ensures no dangling fibers:

1. `Fiber.all` groups all fibers into a single parent
2. `Effect.fork` returns a `Fiber.RuntimeFiber` for each
3. `beforeunload` handler calls `Fiber.interrupt` on all fibers
4. Each fiber's finalizer (acquire/release via `Scope`) cleans up DOM listeners

```typescript
// Pseudocode for main.ts bootstrap
Effect.gen(function* (_) {
  const stateRef = yield* SubscriptionRef.make(initialState);
  const queue = yield* Queue.unbounded<KeyEvent>();

  // Fiber A: keyboard → state
  const inputFiber = yield* keyboardToStateFiber(queue, stateRef).pipe(
    Effect.fork,
  );

  // Fiber B: state → DOM
  const renderFiber = yield* SubscriptionRef.changes(stateRef).pipe(
    Stream.runForEach(render),
    Effect.fork,
  );

  // Fiber C: connecting retry
  const connectFiber = yield* connectingFiber(stateRef).pipe(Effect.fork);

  // Cleanup on page unload
  yield* addBeforeUnloadListener(() =>
    Fiber.interrupt(inputFiber, renderFiber, connectFiber),
  );

  yield* Effect.never; // Keep main fiber alive
});
```

## DOM Rendering Strategy

### Board View

The board is rendered as a CSS Grid of `<div>` elements. Each cell is a
`<button>` or `<span>` with CSS classes for state:

| CSS Class | Purpose |
|-----------|---------|
| `.cell` | Base cell styling |
| `.cell--given` | Fixed clue cell (cyan, bold) |
| `.cell--player` | Player-entered value |
| `.cell--cursor` | Currently selected cell |
| `.cell--conflict` | Cell with a conflict |
| `.cell--empty` | Empty cell (shows `.` or blank) |

### Granular DOM Updates

Rather than rebuilding the entire DOM on every render (which would lose focus
state and cause flicker), the render function performs targeted updates:

```typescript
export function render(state: ClientState): Effect<void> {
  return Effect.sync(() => {
    updateStatusLine(state);
    updateMessage(state);
    if (state.phase === "completed") updateBoardReadOnly(state);
    else updateBoardInteractive(state);
  });
}
```

Each `update*` function queries the DOM for existing elements and only modifies
cells/rows that changed. The cursor cell receives a `.cell--cursor` class for
CSS-based highlighting.

## Browser Input Handling

Replaces `process.stdin.on("data")` with `window.addEventListener("keydown")`:

```typescript
export function makeBrowserInput(
  queue: Queue.Queue<KeyEvent>,
): Effect.Effect<() => void> {
  return Effect.sync(() => {
    const handler = (event: KeyboardEvent) => {
      const key = mapKeyboardEvent(event);
      if (key !== null) {
        event.preventDefault();
        Queue.unsafeOffer(queue, key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
}
```

### KeyboardEvent → KeyEvent Mapping

| Keyboard Event | KeyEvent |
|---------------|----------|
| ArrowUp | `{ kind: "up" }` |
| ArrowDown | `{ kind: "down" }` |
| ArrowLeft | `{ kind: "left" }` |
| ArrowRight | `{ kind: "right" }` |
| Digit1-9 | `{ kind: "number", value: 1-9 }` |
| Digit0 / Backspace / Delete | `{ kind: "erase" }` |
| KeyQ | `{ kind: "quit" }` |
| KeyH / Slash | `{ kind: "hint" }` |
| Enter | `{ kind: "enter" }` |
| WASD / HJKL | Same as arrows (lowercase) |
| KeyE / KeyM / KeyX | `{ kind: "char", value: "e"/"m"/"x" }` |

## State, API, and Game Logic

All shared code lives in `@sudoku-ts/client-core`:

| Module | Location | Purpose |
|--------|----------|---------|
| `ClientState` + transitions | `client-core/src/state.ts` | Pure state machine |
| `KeyEvent` type | `client-core/src/input-types.ts` | Shared event vocabulary |
| `handleKey(state, key) → Effect` | `client-core/src/handle-key.ts` | Pure state machine logic |
| `GameApi` interface + Tag | `client-core/src/api.ts` | HTTP client abstraction |
| `makeGameApi` + `GameApiLive` | `client-core/src/api.ts` | Effect-based API client |

The web client imports these directly:

```typescript
import { initialState, setGame, handleKey, GameApi } from "@sudoku-ts/client-core";
```

No modification is needed — these modules are completely DOM-agnostic.

## Future UI Framework Integration

The web client is built with plain DOM operations to keep the Effect-only
philosophy and zero framework dependencies. However, the architecture is
designed so that any web UI framework (React, Svelte, Solid, Vue) can replace
the `dom/` layer without touching `client-core` or the fiber topology.

### Adapter Boundary

The interface between Effect business logic and the UI layer is three functions:

```
  client-core (unchanged across frameworks)
    │
    ├── SubscriptionRef<ClientState>  ←── state atom
    ├── GameApi Tag                   ←── API calls
    ├── handleKey(state, key) → Effect  ←── state machine
    └── KeyEvent type                 ←── input vocabulary
          │
          ▼
    ┌──────────────────────────────────────────┐
    │         Framework Adapter                 │
    │  (the only part that changes per UI)      │
    │                                          │
    │  React:  useSyncExternalStore + JSX      │
    │  Svelte: $state + .svelte components     │
    │  Solid:  createSignal + JSX              │
    │  Vue:    ref() + .vue components         │
    │  Plain:  dom/render.ts + dom/input.ts    │
    └──────────────────────────────────────────┘
```

### What a React Integration Would Look Like

If a future contributor wants React, they replace `dom/` with a `components/`
directory and wire `SubscriptionRef` via `useSyncExternalStore`:

```typescript
// hooks/useGameState.ts — the bridge
import { useSyncExternalStore } from "react";
import { SubscriptionRef, Effect, Fiber } from "effect";
import type { ClientState } from "@sudoku-ts/client-core";

export function useGameState(stateRef: SubscriptionRef<ClientState>) {
  return useSyncExternalStore(
    (onStoreChange) => {
      const fiber = Effect.runFork(
        SubscriptionRef.changes(stateRef).pipe(
          Stream.runForEach(() => Effect.sync(onStoreChange)),
        ),
      );
      return () => Fiber.interrupt(fiber);
    },
    () => SubscriptionRef.unsafeGet(stateRef),
  );
}
```

```tsx
// components/Board.tsx
export function Board({ state }: { state: ClientState }) {
  return (
    <div className="board">
      {state.board.map((row, r) => (
        <div className="row" key={r}>
          {row.map((cell, c) => (
            <Cell
              key={`${r}-${c}`}
              value={cell}
              isGiven={state.givenMask[r]?.[c] ?? false}
              isCursor={state.cursor.row === r && state.cursor.col === c}
              isConflict={state.conflicts[r]?.[c] ?? false}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### What Would Stay vs. Change

| File/Module | Plain DOM | React | Svelte |
|-------------|-----------|-------|--------|
| `client-core/` | ✅ Same | ✅ Same | ✅ Same |
| `main.ts` (fibers, SubscriptionRef, GameApi) | ✅ Same | ✅ Same | ✅ Same |
| `dom/render.ts` | Here | ❌ Remove | ❌ Remove |
| `dom/board-view.ts` | Here | ❌ Remove | ❌ Remove |
| `dom/input.ts` | Here | ❌ Remove | ❌ Remove |
| `components/Board.tsx` | — | ✅ Add | — |
| `components/Cell.tsx` | — | ✅ Add | — |
| `hooks/useGameState.ts` | — | ✅ Add | — |
| `routes/Board.svelte` | — | — | ✅ Add |
| `package.json` +react +react-dom | ✅ Add | — |
| CSS | `styles.css` | `Board.module.css` | `<style>` in Svelte |

### Migration Path

```bash
# Step 1: npm install react react-dom @types/react @types/react-dom
# Step 2: Add vite React plugin: @vitejs/plugin-react
# Step 3: Move main.ts → main.tsx, replace dom/ with components/ + hooks/
# Step 4: Import SubscriptionRef + GameApi from client-core (identical code)
# Step 5: Delete dom/render.ts, dom/board-view.ts, dom/input.ts
```

The `main.ts` bootstrap (fiber topology, GameApi Layer, cleanup) stays
**identical** across all frameworks — only the UI rendering layer changes.

## Dev Workflow

```bash
# Terminal 1: Start backend
cd packages/server && pnpm dev

# Terminal 2: Start web client (with API proxy)
cd packages/web-client && pnpm dev
# Opens http://localhost:5173

# Production build
cd packages/web-client && pnpm build
# Outputs to dist/ — serve static files + backend
```

## Production Deployment

The web client is a static SPA. The Vite build produces:

- `dist/index.html` — Entry point
- `dist/assets/index-*.js` — Bundled JS (code-split by route)
- `dist/assets/index-*.css` — Bundled CSS

Serve alongside the Effect-TS backend:

```nginx
# nginx example
location /api/ {
    proxy_pass http://localhost:8000;
}
location / {
    root /path/to/web-client/dist;
    try_files $uri $uri/ /index.html;
}
```

## Testing

`packages/web-client/` uses the workspace `vitest` config with `jsdom`:

```typescript
// vitest.config.ts (in web-client package)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
```

### Test Layers

| Layer | What | How |
|-------|------|-----|
| Shared logic | `state.ts`, `handleKey` | Tests inherited from `client-core` |
| DOM rendering | `board-view.ts` | Render to `document.body.innerHTML` in jsdom |
| Input mapping | `input.ts` | Dispatch `KeyboardEvent` + assert KeyEvent output |
| Integration | Game loop fibers | Full page load + mock `GameApi`, assert DOM state |
