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
