# effect-ts Patterns Catalog

> Every effect-ts feature demonstrated in this project, indexed by file.

## How `yield*` Works (the key to effect-ts)

`yield*` is a JavaScript language feature that **delegates iteration** to a sub-iterator and forwards values in both directions. The engine desugars it internally to a `while` loop over plain `yield`:

```javascript
// What you write:
const x = yield* inner

// What the engine effectively does:
const iter = inner[Symbol.iterator]()
let result = iter.next(undefined)
while (!result.done) {
  const sentBack = yield result.value   // ← forward the yielded value up
  result = iter.next(sentBack)          // ← forward the reply back in
}
const x = result.value                  // ← yield* evaluates to this
```

effect-ts uses this as a **request-response channel**:

1. `yield* effect` — the effect object is iterable: its first `.next()` yields itself (the descriptor)
2. That `yield` sends the descriptor up to effect-ts's runtime (the caller of `.next()`)
3. The runtime interprets the descriptor (runs the computation, resolves dependencies, etc.)
4. The runtime calls `generator.next(interpretedValue)` — the interpreted value flows through `yield*` back into the inner iterator's `.next(sentBack)`
5. The inner iterator returns `{ done: true, value: sentBack }`
6. `yield*` evaluates to the interpreted value

Compare to other languages:

| Language    | Equivalent                | What it unwraps               | How it works                              |
| ----------- | ------------------------- | ----------------------------- | ----------------------------------------- |
| JS `await`  | `const x = await promise` | `Promise<A>` → `A`            | language built-in, hardcoded to Promise   |
| F# `let!`   | `let! x = expr`           | any monadic type `M<A>` → `A` | computation expression builder desugaring |
| JS `yield*` | `const x = yield* effect` | any iterable → return value   | generator protocol delegation             |

### Why `function*` over `async function`?

Both let you write sequential-looking code over non-immediate values, but they differ in **who drives**:

|                   | `async function`                              | `function*`                                                            |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| Returns           | `Promise<A>`                                  | `Generator<A>`                                                         |
| Pauses on         | `await`                                       | `yield` / `yield*`                                                     |
| Resumes when      | promise resolves                              | caller calls `.next(val)`                                              |
| Control direction | **push** — promise pushes result when ready   | **pull** — caller pulls values via `.next()`                           |
| Eagerness         | `async fn()` starts a promise **immediately** | `function*()` returns a lazy descriptor — nothing runs until `.next()` |

```javascript
async function push() {
  const x = await fetch("/data"); // microtask queue drives this
  return x.json();
}

function* pull() {
  const x = yield fetch("/data"); // caller decides when via .next()
  return x.json();
}
```

This makes generators **pull-based/deferred** (aka Lazy evaluation/deferred execution, "Effect as data", or in my term "lazy-friendly") — the runtime sees every yielded Effect descriptor before deciding what to do. With `async/await`, control is handed to the Promise microtask queue at the first `await`, and you can no longer intercept, retry, or mock individual steps.

effect-ts exploits this: because `Effect.gen` uses `function*`, the runtime is a plain loop calling `.next()` — it can run effects synchronously, asynchronously, in tests with mocked dependencies, with retry logic, with logging, or over the wire, all without changing the generator code.

`yield*` is **protocol-based**, not hardcoded to one type — the same syntax works on anything implementing `[Symbol.iterator]()`. This is why effect-ts chose it over `await`: you can swap the runtime (sync, async, test, retry, etc.) without changing your code.

## Schema — Single-Declaration Validation + Type Inference (`packages/shared/src/schemas/`)

The core pattern: declare once, get runtime validation + TypeScript types from the same source.

```typescript
// Constrained types with piped refinements
const CellValueSchema = Schema.Number.pipe(Schema.int(), Schema.between(0, 9));

// Fixed-length arrays
const RowSchema = Schema.Array(CellValueSchema).pipe(
  Schema.minItems(9),
  Schema.maxItems(9),
);

// Structs — automatic type inference
const CoordSchema = Schema.Struct({
  row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
});
type Coord = Schema.Schema.Type<typeof CoordSchema>;
// → { readonly row: number; readonly col: number }
```

### Discriminated Unions with Schema.TaggedUnion

Not currently used in this project, but the natural Schema-native way to model `KeyEvent` or `ClientState.phase`:

```typescript
const MoveSchema = Schema.TaggedUnion("_tag")({
  PlaceNumber: Schema.Struct({
    _tag: Schema.Literal("PlaceNumber"),
    row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    value: Schema.Number.pipe(Schema.int(), Schema.between(1, 9)),
  }),
  Erase: Schema.Struct({
    _tag: Schema.Literal("Erase"),
    row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  }),
  Quit: Schema.Struct({ _tag: Schema.Literal("Quit") }),
});
// type Move = { _tag: "PlaceNumber"; row: number; col: number; value: number }
//            | { _tag: "Erase"; row: number; col: number }
//            | { _tag: "Quit" }
```

## Immutability (the bedrock FP pattern)

Across the entire codebase — no mutation, no class setters, no `void` returns.

> **Note:** effect-ts **rewards** immutability — its APIs (`pipe`, `Ref.update`, `HashMap`, Schema decode returning fresh objects) all compose naturally with pure data flow — but it does not _enforce_ it. You can absolutely abuse it:
>
> ```typescript
> // This compiles and runs — no guard rails
> const bad = Effect.gen(function* () {
>   const arr = [1, 2, 3];
>   arr.sort(); // mutable in-place
>   arr.push(4); // also fine
>   let counter = 0; // mutable state
>   counter++;
>   return arr;
> });
> ```
>
> It's a carrot, not a stick. sudoku-TS deliberately opts into strict immutability as a **project convention**: every interface field is `readonly`, every state transition returns a new object, every board operation is a pure function. This is an architectural choice, not something effect-ts imposes.
>
> ### On the "iceberg effect"
>
> FP with effect-ts also helps keep code **traceable** — no hidden execution paths or deep inheritance chains:
>
> - `pipe(a, b, c)` — every transformation is visible and linear
> - `Effect.gen` blocks — straight-line code, no virtual dispatch
> - `Tag` + `Layer` — every dependency is declared at the composition boundary (`main.ts`), not buried in constructors
>
> Compare to OOP where a method call might traverse 4 levels of inheritance before landing on the actual implementation. effect-ts's explicitness means what you see is what runs — less iceberg.

**Client state** (`packages/client/src/state.ts`) — every field is `readonly`, every update returns a new object:

```typescript
export interface ClientState {
  readonly phase: "menu" | "connecting" | "playing" | "completed" | "quit"
  readonly board: Board
  readonly cursor: { readonly row: number; readonly col: number }
  // ...
}

// Always returns new state, never mutates:
export function setGame(state: ClientState, ...): ClientState {
  return { ...state, phase: "playing", board, ... }
}
export function moveCursor(state: ClientState, dRow: number, dCol: number): ClientState {
  return { ...state, cursor: { row, col } }
}
```

**Board operations** (`packages/shared/src/engine/board.ts`) — pure functions, no side effects:

```typescript
// Immutable set: deep clone → mutate copy → return clone
export function setCell(
  board: Board,
  row: number,
  col: number,
  value: CellValue,
): Board {
  const copy = copyBoard(board); // board.map(row => [...row])
  copy[row]![col] = value;
  return copy; // original board unchanged
}

export function copyBoard(board: Board): Board {
  return board.map((row) => [...row]) as Board;
}
```

**Rule of thumb:** if a function returns `void` and takes data as an argument, it's probably not FP. Here, every data transformation returns a new value. The only mutation is inside `SynchronizedRef` (managed by effect-ts) and `console.log` / `process.stdin` (terminal I/O, wrapped as `Effect.sync`).

```typescript
// Parse + validate JSON body in one step
const req = yield * Schema.decodeUnknown(CreateGameRequestSchema)(raw);
// raw: unknown → typed CreateGameRequest
// Throws ParseError if validation fails — caught by Effect handler
```

## Layer / Tag DI (`packages/server/src/services/`)

The functional equivalent of constructor injection — services declare their requirements via `Tag`, implementations get wired together at the program edge. Instead of passing dependencies through constructors or globals, every dependency is resolved from context at runtime.

```typescript
// 1. Define service interface
export interface GameStore { ... }
// 2. Create a Tag
export const GameStore = Context.GenericTag<GameStore>("GameStore")
// 3. Implement in an Effect
export const makeGameStore = Effect.gen(function*(_) { ... })
// 4. Wrap as a Layer
export const GameStoreLive = Layer.fromEffect(GameStore, makeGameStore)
// 5. Compose at the edge
Layer.provide(GameServiceLive),
Layer.provide(GameStoreLive),
```

## Ref / HashMap (`packages/server/src/services/game-store.ts`)

Mutable state in FP is managed through controlled references, not raw variables. `SynchronizedRef` provides atomic concurrent access, and `HashMap` is an immutable persistent map — each `set` returns a new map instead of mutating in place.

```typescript
// Concurrent-safe mutable state
const store =
  yield * Ref.SynchronizedRef.make(HashMap.empty<string, GameSession>());

// Read
const map = yield * store.get;
const session = HashMap.get(map, id);

// Update (atomic)
yield *
  store.update((map) => {
    const updated = { ...session, ...patch };
    return HashMap.set(map, id, updated);
  });
```

## Effect.gen (`all packages`)

The primary way to write effectful code that looks like normal imperative code — `Effect.gen` is to `Effect` what `async` is to `Promise`. Inside the generator, `yield*` unwraps each `Effect<T>` into `T`, and a `return` wraps the value back into an `Effect`.

```typescript
// Imperative-style composition inside Effect
const createGame: GameService["createGame"] = (raw) =>
  Effect.gen(function* (_) {
    const req = yield* Schema.decodeUnknown(CreateGameRequestSchema)(raw);
    const { puzzle, solution } = yield* generateWithUniqueSolution(
      req.difficulty,
    );
    const givenMask = buildGivenMask(puzzle);
    const id = yield* store.create(req.difficulty, puzzle, solution, givenMask);
    return { id, board: puzzle, givenMask, difficulty: req.difficulty };
  });
```

## Effect.iterate (`packages/client/src/main.ts`)

A pure functional loop — instead of `while(true)` with mutable state, `Effect.iterate` threads state through each iteration as an immutable value. The loop terminates when the state hits a terminal phase (`"quit"` or `"completed"`).

```typescript
// Pure functional game loop
Effect.iterate(initialState, (state) =>
  Effect.gen(function* (_) {
    yield* render(state);
    const key = yield* readKey();
    return updateState(state, key);
  }),
);
```

## Option (`packages/shared/src/engine/solver.ts`)

The standard FP way to model a value that may or may not exist — avoids `null` and `undefined` by making absence explicit in the type. The solver returns `Option<Board>` to distinguish "solved" from "unsolvable" without sentinel values.

```typescript
// Solver returns Option.Option<Board>
export function solve(board: Board): Option.Option<Board> {
  const result = solveInternal(copyBoard(board));
  return result; // Some(board) | None
}
```

## Effect.catchTag / Effect.catchAll (`packages/server/src/routes/`)

Structured error handling — instead of `try/catch` with its untyped `Error` objects, effect-ts lets you catch specific error types by tag. `Effect.catchTag("ParseError")` catches only `Schema` parse errors, while `Effect.catchAll` is the final fallback.

```typescript
// Structured error handling
yield *
  gameService.createGame(body).pipe(
    Effect.catchTag("ParseError", (e) =>
      Effect.succeed(
        HttpResponse.json({ error: "Invalid request" }, { status: 400 }),
      ),
    ),
    Effect.catchAll((e) =>
      Effect.succeed(HttpResponse.json({ error: e.message }, { status: 500 })),
    ),
  );
```

## Clock (`packages/server/src/services/game-service.ts`)

Accessing time as an `Effect` rather than a direct `Date.now()` call makes it testable — you can provide a fake clock in tests to get deterministic timestamps without waiting for real time to pass.

```typescript
const now = yield * Clock.currentTimeMillis;
const elapsedSeconds = Math.floor((now - session.startTime) / 1000);
```

## Random (`packages/shared/src/engine/generator.ts`)

Randomness as an `Effect` makes it pure and testable — the generator produces a description of randomness rather than impure `Math.random()` calls. A test runtime can provide a seeded random for reproducible results.

```typescript
const idx = yield * Random.nextIntBetween(0, chars.length);
```

## HttpClient (`packages/client/src/api/`)

HTTP requests as `Effect` values — instead of raw `fetch` calls that start immediately and must be wrapped in try/catch, the client returns an `Effect` that can be retried, timed out, or mocked in tests before execution.

```typescript
const client = HttpClient.fetch();
const response =
  yield *
  client.post("http://localhost:3000/api/games", {
    body: JSON.stringify({ difficulty }),
    headers: { "content-type": "application/json" },
  });
const data = yield * response.json;
```

## Terminal I/O (`packages/client/src/ui/`)

Wrapping raw Node.js `process.stdin` in `Effect.async` turns a callback-based API into a first-class `Effect` — composable with the rest of the program, testable via dependency injection, and automatically handled by effect-ts's runtime.

```typescript
// Read keypress via raw stdin
const readKey: Effect.Effect<KeyEvent> = Effect.async<KeyEvent>((resume) => {
  process.stdin.setRawMode(true);
  process.stdin.once("data", (data) => {
    resume(Effect.succeed(parseKey(data)));
  });
});
```
