# sudoku-TS

Full-stack Sudoku game built with TypeScript and [effect-ts](https://effect.website/) (MIT license) — a learning project demonstrating functional programming end-to-end.

## Architecture

Monorepo (pnpm workspace) with three packages:

| Package | Role | Key Libraries |
|---------|------|---------------|
| `@sudoku-ts/shared` | Pure domain logic + DTOs | effect/Schema, effect/Random |
| `@sudoku-ts/server` | HTTP game API | effect/Schema, @effect/platform, effect/Layer, effect/Ref |
| `@sudoku-ts/client` | Terminal TUI | @effect/platform (HttpClient, Terminal), chalk |

## Why effect/Schema over Zod?

Both provide runtime validation + TypeScript type inference, but effect/Schema is the natural fit here:

- **Single paradigm** — no impedance mismatch between validation and the rest of the stack (Effect, Layer, Ref, etc.)
- **ParseError** integrates natively with Effect's error channel via `Effect.catchTag`
- **Schema transformations** (`pipe`, `compose`) follow the same functional patterns used everywhere else
- **JSON Schema generation** comes free for documentation

See [ADR 003](docs/decisions.md#003--effectschema-over-zod) for the full rationale.

## Quick Start

```bash
pnpm install
pnpm build
# Terminal 1: start server
pnpm --filter @sudoku-ts/server dev
# Terminal 2: start client
pnpm --filter @sudoku-ts/client dev
```

## Project Docs

- [Architecture](docs/architecture.md) — directory layout, data flow, DI graph
- [API Contract](docs/api-contract.md) — endpoints, request/response schemas
- [Game Engine](docs/game-engine.md) — solver algorithm, generator strategy
- [effect-ts Patterns](docs/effect-ts-patterns.md) — indexed catalog of every feature used
- [Design Decisions](docs/decisions.md) — ADR log

## License

This project is licensed under the [MIT License](LICENSE). The [effect](https://github.com/Effect-TS/effect) library used by this project is also [MIT licensed](https://github.com/Effect-TS/effect/blob/main/LICENSE).
