# Design Decisions

> ADR-style log. Each entry: title, context, decision, consequences.

## 001 — effect-ts over plain TypeScript

**Context:** Goal is to learn and demonstrate effect-ts features (Schema, Layer, Effect, Stream).

**Decision:** Use effect-ts end-to-end across all packages. `fp-ts` is avoided since effect-ts subsumes it.

**Consequences:** Steeper learning curve but single functional paradigm across the whole project.

---

## 002 — Raw stdin + chalk over ink/blessed/ratatui

**Context:** Client TUI framework choice. User has no React experience (eliminates ink). Blessed is abandoned and callback-heavy.

**Decision:** Raw terminal I/O via `@effect/platform` `Terminal` module + `chalk` for colors. All rendering is a pure `state → string` function.

**Consequences:** ~80 lines of terminal plumbing (raw mode, escape sequence parsing, cursor positioning). But 100% of the codebase stays in effect-ts.

---

## 003 — effect/Schema over Zod

**Context:** Type-safe DTO validation and serialization needed for the shared API contract between server and client.

**Decision:** Use effect/Schema. Provides runtime validation, TypeScript type inference, JSON Schema generation, and composable transformations in one package.

**Consequences:** Tight integration with Effect error handling (`ParseError`). Schema types are the single source of truth.

---

## 004 — Full game server (not just generation API)

**Context:** Server role — minimal puzzle generation only vs. full game state management.

**Decision:** Server owns game state (board, hints, timer, move history). Client is thin — submits moves and receives validated results.

**Consequences:** Server demonstrates Layer DI, Ref state management, and Schema validation. Client is simpler but still demonstrates HttpClient and Effect.iterate.

---

## 005 — pnpm over npm/yarn

**Context:** Package manager for monorepo.

**Decision:** pnpm with workspace protocol (`@sudoku-ts/shared: "workspace:*"`).

**Consequences:** Disk-efficient, strict module isolation, fast installs.

---

## 006 — In-memory state (no database)

**Context:** State persistence for game sessions.

**Decision:** `Ref.SynchronizedRef<HashMap<string, GameSession>>` — in-memory only.

**Consequences:** Data lost on restart. Acceptable for a learning project. Can be replaced with a database Layer later.

---

## 007 — TypeScript client (not Rust ratatui)

**Context:** Client language choice. Ratatui is mature but adds a language boundary.

**Decision:** All-TypeScript. Shared schemas and types are used directly without serialization boundary.

**Consequences:** No code generation or schema duplication. Single `pnpm build` compiles everything.

---

## 008 — Backtracking solver (not dancing links)

**Context:** Solving algorithm for validation and generation.

**Decision:** Simple backtracking with constraint propagation. Fast enough for 9×9 grids.

**Consequences:** ~40 lines of code. Solves any valid puzzle in <10ms. No algorithm library dependencies.

---

## 009 — Functional-first coding discipline

**Context:** Code style and paradigm guidance.

**Decision:** All code must follow functional programming principles:
- Pure functions wherever possible; all side effects expressed as `Effect`
- No `class` or mutability (except inside `Ref`/`SynchronizedRef` internals)
- Data transformation via `pipe`, `Option`, `Either`, `Array` from `effect`
- Avoid imperative loops (`for`/`while`); use recursion or `Effect.iterate` / `Effect.repeat`
- Types over tests: prefer strict typing + Schema validation over unit tests

**Consequences:** Codebase stays consistent with effect-ts philosophy. Easier to reason about and refactor.

---

## 010 — No CLAUDE.md in git repos; opencode config files OK

**Context:** Which dotfiles belong in version control.

**Decision:** OpenCode configuration files (`.opencode/`, `AGENTS.md`, `opencode.json`) are welcome in repos. Files related to Claude AI (`CLAUDE.md`, `.claude/`) must never be committed.

**Consequences:** Clear boundary — opencode project tooling is shared; Claude-specific instructions stay local only.

---

## 011 — OpenAPI spec from HttpApi definition, served via HttpRouter

**Context:** Need API documentation. `@effect/platform` provides `OpenApi.fromApi`
and `HttpApiBuilder.serve()` for automatic OpenAPI spec generation, but the full
`HttpApiBuilder.serve()` layer composition has unresolved TypeScript type
inference issues with custom service layers (GameStore, GameService).

**Decision:** Define the API contract with `HttpApi`/`HttpApiGroup`/`HttpApiEndpoint`
for type safety and spec generation, but serve routes via `HttpRouter` (the
proven lower-level API). The OpenAPI spec is generated with `OpenApi.fromApi(api)`
and served at `/openapi.json`. Swagger UI is served as static HTML at `/docs`.

**Consequences:**
- Type-safe route definitions (request/response shapes checked against Schema)
- Auto-generated OpenAPI 3.1 spec without annotations
- Swagger UI accessible at `/docs` with "Try it out" support
- Two route definitions to maintain (HttpApi + HttpRouter) — but the HttpApi
  is purely declarative and serves as the single source of truth for schemas
- No dependency on `HttpApiBuilder.serve()` layer type resolution

---

## 012 — Hints provide annotations, not answers (future)

**Context:** Current hint mechanic fills the correct value into the cell, which gives away the answer. A more instructive approach is to populate the cell's pencil-mark annotations with valid candidates.

**Decision (deferred):** When implemented, `POST /api/games/:id/hints` should compute all valid candidates for the target cell and return them as an annotation set. The client renders them as small numbers in the cell (standard Sudoku pencil-mark style). The cell is *not* filled — the player still has to decide.

**Consequences:**
- Needs a per-cell annotation data structure: `Set<CellValue>[][]` or `boolean[][][]`
- Server computes candidates via `isSafe(board, row, col, num)` for num 1-9
- Client render needs annotation display (e.g. 3×3 mini-grid of small numbers)
- Input mode toggle needed: "place value" vs "toggle annotation"
- Annotations must be stored server-side for persistence (or reconstructed from board state)
- Hint endpoint returns `{ row, col, candidates: CellValue[] }` instead of `{ value: CellValue }`

---

## 013 — SubscriptionRef over recursive Effect.gen for web client

**Context:** The web client needs a reactive game loop. The TUI's recursive
`Effect.gen` + `Queue.take` pattern blocks a single fiber on keyboard input,
which is acceptable in the terminal but doesn't map well to the browser's
event-driven model. Multiple concurrent concerns (keyboard input, server
polling, SSE subscription, rendering) must coexist.

**Decision:** Use `SubscriptionRef<ClientState>` as the central state atom
with a multi-fiber topology. Each concern gets its own fiber that reads and
writes to the shared `SubscriptionRef`. The render fiber subscribes to
`SubscriptionRef.changes` as a `Stream` and applies DOM diffs reactively.

**Alternatives considered:**
- **Single Effect.gen loop with polling** — would work but mixes concerns
  (connecting retry, SSE subscription, rendering) into one fiber, making
  cancellation and HMR tricky.
- **Redux-style single store** — Effect provides no native Redux; a custom
  implementation would reinvent `SubscriptionRef`.
- **Solid.js / Svelte reactivity** — external framework would break the
  pure-Effect constraint.

**Consequences:**
- Render runs independently — `Queue.take` never blocks DOM updates.
- Controller mode (SSE subscription) slots in as a new fiber without
  restructuring the loop.
- Fibers are cancellable → clean HMR support via `Fiber.interrupt`.
- Slightly more complex setup than the recursive TUI loop.

---

## 014 — Client-core extraction (shared client library)

**Context:** Adding a web client revealed that `state.ts`, `api/game-api.ts`,
`KeyEvent`, and `handleKey` were duplicated across client packages. The TUI
and web clients share 100% of game logic and only differ in I/O (render +
input).

**Decision:** Extract shared client code into `@sudoku-ts/client-core`:
- `state.ts` — `ClientState` type + pure transitions
- `input-types.ts` — `KeyEvent` discriminated union
- `handle-key.ts` — state machine (menu → playing → completed → controller → spectating)
- `api.ts` — `GameApi` Tag + service implementation with `HttpClient`

Both `@sudoku-ts/client` (TUI) and `@sudoku-ts/web-client` (browser) depend on
`@sudoku-ts/client-core`.

**Consequences:**
- Single source of truth for all client game logic.
- Tests for `state.ts`, `handle-key.ts`, and `api.ts` live in `client-core`
  — run once, benefit both clients.
- `client-core` has zero I/O dependencies (no `chalk`, no DOM types, no
  `@effect/platform-node`).
- TUI client shrinks by ~100 lines (removed duplicated state/api/handleKey).

---

## 015 — Three-package client structure

**Context:** Client code organization — keep TUI alive alongside web, or
replace it entirely.

**Decision:** Keep both. Three packages with a clear dependency chain:

```
  @sudoku-ts/shared
        ↑
  @sudoku-ts/client-core
       ↕        ↑
  @sudoku-ts/client    @sudoku-ts/web-client
  (chalk, stdin)       (Vite, DOM, keydown)
```

- `client/` remains the reference TUI implementation
- `web-client/` is the new browser implementation
- `client-core/` is the shared library both import

**Consequences:**
- TUI is preserved as a development tool and fallback (works over SSH, no
  browser needed).
- Web client demonstrates the same Effect patterns in a browser context.
- `pnpm -r build` compiles all packages; `pnpm -r test` runs all tests.
- Version bump 0.1.0 → 0.2.0 reflects the addition of `client-core` and
  `web-client` packages.

---

## 016 — Hub-based event broadcasting for controller management

**Context:** The controller (spectator) feature needs to broadcast game
mutations (moves, hints, completion) to multiple subscribers in real time.
Polling introduces latency and wasted bandwidth. The TUI client can poll, but
the web client should receive instant updates.

**Decision:** Server uses `Hub.unbounded<GameEvent>()` from Effect as a
pub/sub channel. `GameService` publishes a `GameEvent` after every atomic
`store.modify`. SSE endpoints (`GET /api/games/stream`, `GET
/api/games/:id/stream`) bridge the Hub to HTTP via `Hub.subscribe` → `Stream`
→ `HttpResponse.stream`. The web client consumes SSE via native `EventSource`
wrapped as `Stream.async`. The TUI client polls `GET /api/games/:id` every 2s
for simplicity (no `EventSource` in Node.js without a polyfill).

**Alternatives considered:**
- **WebSocket** — bidirectional, heavier setup; controller mode is read-only
  so SSE is sufficient.
- **Polling-only** — simple but adds 2s latency for web client.
- **Long polling** — more complex than SSE with no benefit.

**Consequences:**
- Web client gets sub-second board updates during spectating.
- TUI client uses polling (simpler, adequate for terminal latency tolerance).
- `GameEventHub` is a new server Layer (`game-event-hub.ts`).
- `GameService` gains a dependency on `GameEventHub` — requires Layer
  composition update in `main.ts`.
- `GameStore` gains a `listActive()` method for `GET /api/games`.
