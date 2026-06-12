# Wishlist

> Future feature ideas. Not planned, not committed — just tracked so they don't get forgotten.
>
> Items marked with ✅ are documented and planned — see referenced docs.

## Web client (✅ planned — see docs/web-client-architecture.md)

- [x] Documentation complete — see `docs/web-client-architecture.md`
- [ ] Package scaffold: `packages/web-client/` + Vite config
- [ ] DOM rendering: board grid, cursor, conflicts
- [ ] Browser input: keydown → Queue<KeyEvent>
- [ ] SubscriptionRef fiber topology
- [ ] Connecting retry fiber

## Client-core extraction (✅ planned — see docs/client-core.md)

- [x] Documentation complete — see `docs/client-core.md`
- [ ] `packages/client-core/` package scaffold
- [ ] Extract `state.ts`, `input-types.ts`, `handle-key.ts`, `api.ts`
- [ ] Update `packages/client/` to import from `@sudoku-ts/client-core`
- [ ] Version bump 0.1.0 → 0.2.0

## Controller management (✅ planned — see docs/controller-management.md)

- [x] Documentation complete — see `docs/controller-management.md`
- [ ] Server: GameEventHub + Hub integration + SSE endpoints
- [ ] Shared: GameEvent schemas
- [ ] client-core: controller/spectating phases in handleKey
- [ ] TUI client: controller mode (polling game list + spectate)
- [ ] Web client: controller mode (SSE game list + real-time spectate)

## WASM/Electron client (✅ planned — see docs/wasm-client-design.md)

- [x] Documentation complete — see `docs/wasm-client-design.md`
- [ ] Rust crate: port game engine (board, solver, generator) from TS to Rust
- [ ] `wasm-pack` compilation target
- [ ] TypeScript WASM bridge (`bridge.ts`)
- [ ] Svelte UI: Board, Cell, StatusBar components
- [ ] Electron shell: main process, preload, packaging
- [ ] Full offline play (no server needed for gameplay)
- [ ] Cross-play compatible with server-heavy clients (same game format)

## Annotations (pencil marks)

- Per-cell candidate set (`Set<CellValue>[][]` or `boolean[][][]`)
- Input mode toggle: "place value" vs "toggle annotation"
- Render annotations as small numbers in empty cells (3×3 mini-grid)
- Hint endpoint populates annotations with valid candidates instead of filling the cell
- Annotations stored server-side for persistence

## Leaderboard

- Server tracks completed games with time, moves, hints used
- `GET /api/leaderboard` returns top times per difficulty
- Client shows leaderboard on completion or from menu

## Undo / move history

- Server stores move history per session
- `POST /api/games/:id/undo` reverts last move
- Client bindings (e.g. Ctrl+Z)

## Timer display

- Real-time elapsed timer in client (currently updates only on keypress)
- Could use `Effect.interval` / `Stream` for per-second ticks

## Difficulty unlock progression

- Easy → Medium → Hard → Expert: must complete one to unlock next
- Track unlock state client-side (localStorage)

## Themes / color schemes

- Multiple color palettes (high-contrast, dark, colorblind-friendly)
- Configurable via menu or config file

## Effect-AI hint integration

- Replace or augment the current hint mechanic (which fills the correct value) with an AI-powered suggestion system
- When the player requests a hint, call an LLM (via Effect-AI or direct OpenAI API) to analyze the board and suggest:
  - Which cell to focus on next (e.g. "Look at row 3, column 5 — only one candidate fits")
  - A reasoning chain: "This cell must be 7 because row 3 already has 1,2,5, column 5 has 3,4,6, and box 2 has 8,9"
  - Difficulty-appropriate hints (easy = direct single candidate, hard = X-wing or swordfish patterns)
- Effect-AI provides typed, effectful LLM calls with structured output via Schema
- Candidate integration points:
  - `POST /api/games/:id/ai-hint` — returns `{ reasoning: string, suggestion: { row, col, value? } }`
  - Client renders the reasoning text alongside the board
  - Optional: rate-limit AI hints, track usage separately from regular hints
- Infrastructure needed:
  - `@effect/ai` package (or direct OpenAI REST client wrapped as an Effect service)
  - `AiHintService` Tag + Layer
  - API key config via `Config.redacted`
  - Backend-only: no AI calls from the client TUI
