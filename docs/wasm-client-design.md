# WASM / Desktop Client Design

> **Note on project scope:** This workspace is primarily a learning vehicle
> for Effect-TS. The server-heavy architecture (`packages/server/` with
> Schema, Layer, Hub, SynchronizedRef) is the main pedagogical target. The
> WASM/Electron client described here represents a **different architectural
> trade-off** — it is documented as a design-direction reference, not an
> immediate implementation plan. Actual implementation would depend on
> demand for offline play, horizontal scaling, or desktop distribution.

> A browser-based GUI client that shifts game logic from the server to the
> client via WebAssembly. The server becomes a thin data layer — it serves
> the WASM binary and persists game state, but all solving, validation, and
> generation runs locally in the client.

## Motivation

The current three clients (TUI, web-DOM, React-wired) all follow a
**server-heavy** architecture:

```
  Client (thin)              Server (fat)
  ┌──────────────┐          ┌──────────────────────┐
  │ Render board  │          │  GameService          │
  │ Capture input │  HTTP    │  ├─ generatePuzzle    │
  │ Show messages │ ◄──────► │  ├─ validateMove      │
  └──────────────┘          │  ├─ solve             │
                            │  ├─ hasUniqueSolution  │
                            │  └─ hints             │
                            │  GameStore             │
                            │  GameEventHub          │
                            └──────────────────────┘
```

This is deliberate — this project is about learning Effect-TS, and the
server showcases Schema, Layer, Hub, SynchronizedRef, etc. But it means:

- **Every move requires a round-trip** — latency-dependent, no offline play.
- **Server does all CPU work** — puzzles are generated server-side, moves
  validated server-side. Under many concurrent players, the server bears the
  full computational load.
- **No offline capability** — the TUI client is useless without a running
  server. The web client is equally dependent.

### The WASM Alternative

A WASM-based client flips the architecture:

```
  Client (fat — WASM)          Server (thin)
  ┌──────────────────────┐     ┌──────────────────────┐
  │  WASM Engine          │     │  Serve WASM binary   │
  │  ├─ generatePuzzle   │     │  Serve puzzle data    │
  │  ├─ validateMove     │     │  Persist game state   │
  │  ├─ solve            │     │  Leaderboard stats    │
  │  ├─ hasUniqueSolution│     │  Controller SSE       │
  │  └─ hints            │     └──────────────────────┘
  │                       │
  │  UI (Svelte / React)  │
  │  ├─ Board component   │
  │  ├─ Input handling    │
  │  └─ WASM bridge       │
  └──────────────────────┘
```

| Aspect | Server-heavy (current) | WASM client (future) |
|--------|----------------------|----------------------|
| Latency per move | ~50ms HTTP round-trip | ~0.1ms local call |
| Offline play | Impossible | Full offline support |
| Server CPU cost | O(moves × players) | O(1) — just data storage |
| Horizontal scaling | Needs many app servers | Static file CDN + DB cluster |
| Client install | Browser tab | Browser or Electron/Tauri |

## Architecture

### WASM Module — The Game Engine

The core game engine (`board.ts`, `solver.ts`, `generator.ts`) is pure logic:
no I/O, no Effect dependencies, just functions over data. This makes it an
ideal WASM compilation target.

**Compilation strategy:** Rewrite the engine in **Rust** (language priority
#1), compile to WASM via `wasm-pack`. The Rust crate exposes a C-compatible
ABI or `wasm-bindgen` bindings:

```rust
// sudoku-engine crate (Rust → WASM)
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Puzzle {
    pub board: Vec<Vec<u8>>,
    pub solution: Vec<Vec<u8>>,
    pub given_mask: Vec<Vec<bool>>,
}

#[wasm_bindgen]
pub fn generate_puzzle(difficulty: &str) -> Puzzle {
    // Pure Rust implementation of the generation algorithm
}

#[wasm_bindgen]
pub fn validate_move(board: Vec<Vec<u8>>, row: u8, col: u8, value: u8) -> bool {
    // Pure Rust implementation of constraint checking
}

#[wasm_bindgen]
pub fn solve(board: Vec<Vec<u8>>) -> Option<Vec<Vec<u8>>> {
    // Pure Rust backtracking solver
}

#[wasm_bindgen]
pub fn has_unique_solution(board: Vec<Vec<u8>>) -> bool {
    // Pure Rust uniqueness check
}
```

The WASM module is **tiny and fast** — sudoku constraint checking is O(27)
per placement, a solver compiles to <1KB of WASM instructions, and generation
finishes in <10ms even in interpreted WASM.

### Client-Side Data Flow

```
  User presses '5'
        │
        ▼
  UI component captures KeyboardEvent
        │
        ▼
  WASM bridge: validate_move(board, row, col, 5)
        │
        ├─ true  → update local board, check solved via WASM
        │             if solved → show celebration
        │
        └─ false → highlight conflict, show message
        │
        ▼
  UI re-renders (local state, no HTTP call)
        │
        ▼
  Optionally: POST result to server for persistence
  (fire-and-forget, non-blocking)
```

The HTTP round-trip is eliminated for every interactive action. The server is
contacted only for:

- Initial puzzle data fetch (or generated entirely locally)
- Persisting completed games (leaderboard, statistics)
- Controller/spectator SSE subscription
- Multiplayer coordination (future)

### Desktop Wrappers

The WASM engine and UI are portable across desktop targets with no engine
changes:

| Target | Wrapper | UI Framework | Packaging |
|--------|---------|-------------|-----------|
| **Browser** | None (WASM runs natively) | Svelte / React / Plain DOM | Vite build |
| **Electron** (preferred) | `main.js` + `BrowserWindow` | Same UI code | `electron-builder` |
| **Tauri** | Rust shell + webview | Svelte (first-class Tauri support) | `tauri build` |

#### Electron Architecture

```
  ┌─────────── Electron App ──────────────────────┐
  │                                                │
  │  ┌─────────────┐     ┌──────────────────────┐  │
  │  │ main process │     │ renderer process      │  │
  │  │ (Node.js)    │     │                      │  │
  │  │              │     │  ┌────────────────┐   │  │
  │  │  File I/O    │     │  │  UI (Svelte)    │   │  │
  │  │  Auto-update │     │  │  Components     │   │  │
  │  │  Native menu │     │  └───────┬─────────┘   │  │
  │  └──────┬───────┘     │          │             │  │
  │         │ IPC         │  ┌───────▼─────────┐   │  │
  │         ◄─────────────►  │  WASM Bridge    │   │  │
  │                         │  (wasm-bindgen) │   │  │
  │                         │  sudoku-engine  │   │  │
  │                         │  .wasm binary   │   │  │
  │                         └─────────────────┘   │  │
  │                                                │  │
  │                         ┌────────────────┐    │  │
  │                         │  Server API     │   │  │
  │                         │  (persistence,  │   │  │
  │                         │   leaderboard)  │   │  │
  │                         └────────────────┘    │  │
  └──────────────────────────────────────────────────┘
```

**Why Electron is preferred** over Tauri for this project:

| Criterion | Electron | Tauri |
|-----------|----------|-------|
| JavaScript/TS runtime | Node.js built-in | Requires Rust sidecar |
| Effect-TS integration | Runs directly in main/renderer | Would need Node.js integration |
| WASM loading | Standard web API | Standard web API |
| Bundle complexity | Single language (TS) | Two languages (TS + Rust) |
| Maturity | Very mature, extensive docs | Growing, but fewer examples |
| Sandbox security | Context isolation + sandbox | Native Rust security model |

Electron lets the entire application remain in TypeScript — the WASM engine
is the only Rust code. If Effect-TS were ever needed in a background process
(files, notifications, auto-update), it runs natively in Electron's Node.js
without bridging.

Svelte is the recommended UI framework for the WASM client because:

- **Smallest bundle size** — important when shipping a WASM binary alongside
  the JS bundle. Svelte adds ~3KB gzip vs React's ~15KB.
- **First-class Tauri support** — if a future port to Tauri is desired,
  Svelte has official templates and the best DX.
- **Compile-time reactivity** — no virtual DOM, no diffing overhead.
  State changes compile to direct DOM updates, which pairs well with
  WASM's fast compute + minimal UI overhead.
- **Runes (`$state`, `$derived`, `$effect`)** — Svelte 5's reactive
  primitives align with Effect's `SubscriptionRef` and `Stream` patterns.

### Package Structure

```
packages/wasm-client/
├── package.json              # deps: @sudoku-ts/shared, svelte
├── tsconfig.json             # lib: ["DOM", "ESNext"]
├── vite.config.ts            # @sveltejs/vite-plugin-svelte
├── svelte.config.js
├── index.html
├── src/
│   ├── main.ts               # Bootstrap: load WASM, mount Svelte app
│   ├── App.svelte            # Root component: router (play / spectate)
│   ├── lib/
│   │   ├── wasm/
│   │   │   ├── bridge.ts     # TypeScript wrapper around WASM imports
│   │   │   └── sudoku_engine.wasm  # Compiled Rust → WASM binary
│   │   ├── state.ts          # Svelte stores wrapping ClientState
│   │   └── api.ts            # Thin server API (persistence only)
│   ├── routes/
│   │   ├── Play.svelte       # Game board UI
│   │   ├── Spectate.svelte   # Controller/spectator view
│   │   └── Menu.svelte       # Main menu
│   └── components/
│       ├── Board.svelte      # 9×9 grid component
│       ├── Cell.svelte       # Individual cell
│       └── StatusBar.svelte  # Timer, moves, hints display
├── electron/                 # Electron shell (optional)
│   ├── main.js               # Electron main process
│   ├── preload.js            # Context bridge
│   └── electron-builder.yml  # Packaging config
└── wasm/                     # Rust crate
    ├── Cargo.toml
    └── src/
        └── lib.rs            # sudoku-engine WASM exports
```

### What's Shared vs. What's New

| Module | Reuse | Status |
|--------|-------|--------|
| `@sudoku-ts/shared` schemas | ✅ Schema types (Board, Difficulty, GameEvent) | Unchanged |
| `@sudoku-ts/shared` engine (TS) | ❌ Ported to Rust | Rewritten in Rust |
| `@sudoku-ts/client-core` | ❌ Replaced by Svelte stores | WASM bridge replaces handleKey |
| WASM engine binary | **New** | Rust → wasm-pack |
| `bridge.ts` | **New** | TypeScript ↔ WASM FFI |
| `App.svelte` + components | **New** | Svelte UI |
| Electron shell | **New** | Desktop packaging |

### Build Pipeline

```bash
# Step 1: Compile Rust engine to WASM
cd packages/wasm-client/wasm
wasm-pack build --target web --out-dir ../src/lib/wasm

# Step 2: Install frontend deps
cd packages/wasm-client
pnpm install

# Step 3: Dev (browser)
pnpm dev              # Vite dev server, WASM loaded from URL

# Step 4: Dev (Electron)
pnpm electron:dev     # Vite + Electron main process

# Step 5: Production build
pnpm build            # Vite build
pnpm electron:build   # electron-builder → .exe/.dmg/.AppImage
```

### Performance Comparison

| Operation | Server-heavy (HTTP) | WASM (local) | Speedup |
|-----------|-------------------|-------------|---------|
| Generate easy puzzle | ~10ms server + ~50ms network | ~5ms local | ~12× |
| Validate move | ~2ms server + ~50ms network | ~0.01ms local | ~5000× |
| Request hint | ~5ms server + ~50ms network | ~0.1ms local | ~500× |
| Solve entire board | ~5ms server + ~50ms network | ~3ms local | ~18× |
| Unique solution check | ~50ms server + ~50ms network | ~30ms local | ~3× |

Note: The server-heavy numbers already include the server-side computation
time. For the WASM client, the computation happens on the user's machine,
freeing server resources entirely.

### When to Use Which Client

| Scenario | Server-heavy client | WASM/Electron client |
|----------|--------------------|---------------------|
| Learning Effect-TS | ✅ Demonstrates Schema, Layer, Hub | ❌ Hides server logic |
| Quick play (open browser) | ✅ No install needed | ❌ Requires WASM download |
| Offline / travel | ❌ Needs server | ✅ Full offline |
| Competitive / low-latency | ❌ Network round-trip per move | ✅ Zero latency |
| High concurrency (1000s of players) | ❌ Server CPU bottleneck | ✅ Scales to CDN |
| Desktop integration (notifications, tray) | ❌ Browser tab | ✅ Electron/Tauri |

### Example: Svelte + WASM Bridge

```svelte
<!-- Board.svelte -->
<script lang="ts">
  import { wasm } from "../lib/wasm/bridge";
  import Cell from "./Cell.svelte";

  let { board, givenMask, cursor, conflicts } = $props();

  function onCellClick(row: number, col: number) {
    cursor = { row, col };
  }

  function onKeyDown(event: KeyboardEvent) {
    // Map key → (row, col, value), then call WASM validator
    const { row, col, value } = mapKey(event, cursor);
    if (value === undefined) return;

    const valid = wasm.validate_move(board, row, col, value);
    if (valid) {
      board = board.map((r, ri) =>
        ri === row ? r.map((c, ci) => (ci === col ? value : c)) : r,
      );
      // Check solved via WASM
      const solved = wasm.is_board_solved(board, solution);
      if (solved) celebration = true;
    } else {
      showConflict(row, col);
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="board" role="grid">
  {#each board as row, r}
    <div class="row">
      {#each row as cell, c}
        <Cell
          value={cell}
          isGiven={givenMask[r][c]}
          isCursor={cursor.row === r && cursor.col === c}
          isConflict={conflicts[r][c]}
          onclick={() => onCellClick(r, c)}
        />
      {/each}
    </div>
  {/each}
</div>
```

### WASM Bridge TypeScript Wrapper

```typescript
// src/lib/wasm/bridge.ts
import type { Board, Difficulty } from "@sudoku-ts/shared";

// WASM module loaded asynchronously
let wasm: typeof import("./sudoku_engine");

export async function initWasm(): Promise<void> {
  wasm = await import("./sudoku_engine");
}

export function generatePuzzle(difficulty: Difficulty): {
  board: Board;
  solution: Board;
  givenMask: boolean[][];
} {
  return wasm.generate_puzzle(difficulty);
}

export function validateMove(
  board: Board, row: number, col: number, value: number,
): boolean {
  return wasm.validate_move(board, row, col, value);
}

export function solve(board: Board): Board | null {
  const result = wasm.solve(board);
  return result ?? null;
}

export function hasUniqueSolution(board: Board): boolean {
  return wasm.has_unique_solution(board);
}
```

## File Impact

### New Files

| File | Purpose |
|------|---------|
| `packages/wasm-client/wasm/Cargo.toml` | Rust crate config |
| `packages/wasm-client/wasm/src/lib.rs` | Rust game engine → WASM exports |
| `packages/wasm-client/src/lib/wasm/bridge.ts` | TypeScript WASM wrapper |
| `packages/wasm-client/src/App.svelte` | Root Svelte component |
| `packages/wasm-client/src/routes/Play.svelte` | Game play view |
| `packages/wasm-client/src/routes/Spectate.svelte` | Controller view |
| `packages/wasm-client/src/routes/Menu.svelte` | Main menu |
| `packages/wasm-client/src/components/Board.svelte` | Board grid |
| `packages/wasm-client/src/components/Cell.svelte` | Cell widget |
| `packages/wasm-client/src/components/StatusBar.svelte` | Status display |
| `packages/wasm-client/electron/main.js` | Electron main process |
| `packages/wasm-client/electron/preload.js` | Context bridge |
| `packages/wasm-client/electron/electron-builder.yml` | Packaging config |
| `packages/wasm-client/vite.config.ts` | Vite + Svelte config |
| `packages/wasm-client/svelte.config.js` | Svelte compiler config |
| `packages/wasm-client/index.html` | Entry point |

### Modified Files

| File | Change |
|------|--------|
| `package.json` (root) | Add `wasm-client` to workspace |
| `pnpm-workspace.yaml` | Add `wasm-client` to packages glob (already matches) |

## Future Considerations

| Item | Notes |
|------|-------|
| **Rust engine parity** | Must match TypeScript engine output exactly for cross-play between server-heavy and WASM clients |
| **WASM size optimization** | `wasm-opt` to shrink binary; Sudoku engine should be <5KB |
| **Electron auto-update** | `electron-updater` for seamless updates |
| **Offline sync** | Queue completed games locally, push to server when online |
| **Tauri port** | If Rust native shell is desired, Svelte makes the migration path simple |
| **Shared leaderboard** | Both client types POST to the same `/api/leaderboard` endpoint |
