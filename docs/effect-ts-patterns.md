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

## Compile-Time Guarantees

The overarching goal of FP in this project: **make bugs impossible at the type level**. Every pattern below catches a specific class of runtime errors at compile time:

| What used to be a runtime error | Now caught at compile time by | Where |
|---|---|---|
| `null is not an object` / `undefined is not a function` | `Option<T>` — absence is explicit in the type | `solver.ts:38` |
| `data.map is not a function` (wrong shape) | `Schema.decodeUnknown` — typed at the boundary | `game-service.ts:36` |
| "Cannot read property of undefined" (missing dependency) | `Tag` + `Layer` — unprovided service fails to compile | `main.ts` composition |
| "X is not a function" (wrong error handler) | `Effect.catchTag("ParseError")` — typed error tags | `game-routes.ts` |
| "Unhandled promise rejection" | `Effect` has no implicit unhandled state — errors must be handled or passed up | all routes |
| Mutating shared state by accident | `readonly` fields + pure functions returning new objects | `state.ts`, `board.ts` |
| Missing a case in a switch | Tagged union (`KeyEvent`) — exhaustive matching | `input.ts` |
| Wrong environment variable type | `Config.number("PORT").pipe(Config.withDefault(8000))` | `main.ts:32` |
| Randomness making tests flaky | `Random.nextIntBetween` as `Effect` — seedable in tests | `generator.ts` |
| Race condition on shared state | `SynchronizedRef` — atomic reads and writes | `game-store.ts` |

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

**Client state** (`packages/client/src/state.ts`) — every field is `readonly`, every update returns a new object via `Struct.evolve` (typed copy-and-update, see below):

```typescript
export interface ClientState {
  readonly phase: "menu" | "connecting" | "playing" | "completed" | "quit"
  readonly board: Board
  readonly cursor: { readonly row: number; readonly col: number }
  // ...
}

// Typed copy-and-update — each key must exist on ClientState,
// each value is a transform function checked against the field type:
export function setGame(state: ClientState, ...): ClientState {
  return Struct.evolve(state, {
    phase: () => "playing" as const,
    gameId: () => gameId,
    board: () => board,
    // ...
  })
}
export function moveCursor(state: ClientState, dRow: number, dCol: number): ClientState {
  return Struct.evolve(state, {
    cursor: () => ({ row, col }),
  })
}
```

**Board operations** (`packages/shared/src/engine/board.ts`) — pure functions, no side effects:

```typescript
// Immutable set: map over rows, replace only the target cell
export function setCell(
  board: Board,
  row: number,
  col: number,
  value: CellValue,
): Board {
  return board.map((r, ri) =>
    ri === row
      ? r.map((c, ci) => (ci === col ? value : c))
      : ([...r] as Board[number]),
  ) as Board;
}
```

**Completion detection** — `isBoardSolved` replaces the old `isBoardFull` (which only checked for zeros). The puzzle is only completed when every cell matches the pregenerated solution exactly:

```typescript
export function isBoardSolved(board: Board, solution: Board): boolean {
  return board.every((row, r) =>
    row.every((cell, c) => cell === solution[r]?.[c]),
  );
}
```

**Rule of thumb:** if a function returns `void` and takes data as an argument, it's probably not FP. Here, every data transformation returns a new value. The only mutation is inside `SynchronizedRef` (managed by effect-ts) and `console.log` / `process.stdin` (terminal I/O, wrapped as `Effect.sync`).

```typescript
// Parse + validate JSON body in one step
const req = yield * Schema.decodeUnknown(CreateGameRequestSchema)(raw);
// raw: unknown → typed CreateGameRequest
// Throws ParseError if validation fails — caught by Effect handler
```

## Struct.update / Struct.evolve / Lens — Typed Copy-and-Update

The `...spread` pattern (`{ ...obj, field: value }`) is the standard way to produce a new object with one field changed. It's simple and works, but it has no guard rails — a typo introduces a **new property** silently rather than producing an error:

```typescript
// spread silently creates a new property instead of updating one
return { ...state, statuss: "completed" }
//       ^^ "statuss" is NOT a field of ClientState
// No error. Now state has both `status` and `statuss`.
```

In F#, the `with` keyword catches typos at compile time — `{ state with Statuss = "x" }` is a compiler error. But a subtler bug arises from **type inference ambiguity** when two record types share field names:

```fsharp
type Person   = { Name: string; Age: int }
type Pet      = { Name: string; Species: string }

let p = { Name = "Fluffy"; Age = 3 }
// F# infers this as Pet (first match by field names),
// then errors: Pet has no Age.
// It backtracks to Person — but in complex cases the
// inferred type can silently be the wrong one.

// Worse — overlapping fields across related types:
type Person   = { Name: string; Age: int }
type Employee = { Name: string; Age: int; Salary: decimal }

let x = { Name = "Alice"; Age = 30 }        // infers Person
let y = { x with Salary = 5000m }            // Error: Person has no Salary
// But if the developer intended x to be Employee,
// the error message is confusing — they thought
// `with` was extending the record.
```

The F# fix is to annotate the binding: `let x: Employee = ...`. effect-ts avoids both problems entirely — `Struct.update` explicitly names the target type via the generic parameter, and TypeScript never guesses types from field names alone.

effect-ts provides two typed alternatives that reject misspelled keys and wrong value types at compile time:

### Struct.update / Struct.evolve

```typescript
import { Struct } from "effect"

// Single field — key must exist on the type, fn signature matches the field
const next = Struct.update("status", () => "completed" as const)(state)
// Struct.update("statuss", () => "completed")(state)
//   ^^ Error: '"statuss"' is not a key of ClientState

// Multiple fields — every key is checked, every fn is type-checked per field
const evolved = Struct.evolve(state, {
  phase: () => "completed" as const,
  status: () => "completed" as const,
  message: () => "Puzzle solved!" as const,
  // turkeys: () => 0,      // Error: not a key of ClientState
  // hintsUsed: (s: string) => s + 1, // Error: hintsUsed is number, not string
})
```

### Lens (optics)

`Lens` is a composable, reusable path into a nested structure. Once created, it can be used to read, set, or transform a nested value:

```typescript
import { Lens, pipe } from "effect"

// Create a Lens into a specific property
const cursorRow = Lens.id<ClientState>()
  .pipe(Lens.property("cursor"))
  .pipe(Lens.property("row"))

// Read through the lens
pipe(state, Lens.get(cursorRow))   // → number

// Set through the lens (returns new object, never mutates)
pipe(state, Lens.set(cursorRow, 3)) // → { ...state, cursor: { ...state.cursor, row: 3 } }

// Transform through the lens
pipe(state, Lens.update(cursorRow, (r) => Math.min(r + 1, 8)))
```

Lenses compose: a single `Lens<Whole, Part>` plus `pipe(Lens.set(...))` replaces nested spread chains.

### Migration: what we changed from (and why it's tempting not to)

Before this project adopted `Struct.evolve`, every state transition used spread:

```typescript
// Before — tempting because it's so short:
export function updateBoard(state, board, message, solved, conflict) {
  return {
    ...state,                             // spread all existing fields
    board,                                // override board
    movesCount: state.movesCount + 1,     // increment
    message,                              // override message
    conflicts: newConflicts,               // override conflicts
    phase: solved ? "completed" : state.phase,  // conditional
    status: solved ? "completed" : state.status, // conditional
  }
}
```

The temptation is the **10:1 signal-to-noise ratio** — every line is meaningful, nothing is boilerplate. But it only takes one typo:

```typescript
return { ...state, messsage: "hi" }  // `messsage` is a new property, not an error
```

After:

```typescript
// After — every key is checked to exist, every transform fn is type-checked:
export function updateBoard(state, board, message, solved, conflict) {
  return Struct.evolve(state, {
    board: () => board,
    movesCount: (n) => n + 1,            // (n: number) => number — checked
    message: () => message,
    conflicts: () => newConflicts,
    phase: (p) => solved ? "completed" : p,  // (p: "menu"|"playing"|...) => same type
    status: (s) => solved ? "completed" : s,  // (s: GameStatus) => GameStatus
    // mesage: () => "x"                 // Error: not a key of ClientState
  })
}
```

The `(n) => n + 1` pattern shows the transform explicitly — `movesCount` is a number and the function adds 1. A typo on the key name is a compile error instead of a silent bug.

The comparison with `...spread`:

```typescript
// Spread — works, but unchecked at the type level
return { ...state, phase: "completed", status: "completed" }

// Struct.evolve — every key and value is type-checked
return Struct.evolve(state, {
  phase: () => "completed" as const,
  status: () => "completed" as const,
})
```

### Used throughout `packages/client/src/state.ts`

## Layer / Tag DI (`packages/server/src/services/`)

The functional equivalent of constructor injection — services declare their requirements via `Tag`, implementations get wired together at the program edge. Instead of passing dependencies through constructors or globals, every dependency is resolved from context at runtime.

This is one of effect-ts's headline features. Most TypeScript/JS FP libraries have no DI story — you manage dependencies via closures or module-level singletons. effect-ts provides a **first-class, type-safe, composable** DI mechanism built into the core library.

### Why it matters

**1. Compile-time verification.** If `GameService` requires `GameStore` and you forget to provide it, the program doesn't compile. No runtime "cannot read property of undefined" from a missing dependency.

**2. Layer composition.** `Layer.provide(ServiceLive, StoreLive)` builds the dependency graph declaratively. Swapping implementations for tests is one line — replace the Live Layer with a Test Layer.

**3. Scoped resources.** Layers can manage lifecycle (acquire/release). Database connections, file handles, server sockets are created and torn down automatically via effect-ts's `Scope` — no manual `dispose()` calls or `finally` blocks.

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

## SynchronizedRef / HashMap (`packages/server/src/services/game-store.ts`)

Mutable state in FP is managed through controlled references, not raw variables. `SynchronizedRef` provides atomic concurrent access, and `HashMap` is an immutable persistent map — each `set` returns a new map instead of mutating in place.

```typescript
import { SynchronizedRef, HashMap } from "effect";

// Concurrent-safe mutable state
const store = yield* SynchronizedRef.make(
  HashMap.empty<string, GameSession>(),
);

// Read
const map = yield* SynchronizedRef.get(store);
const session = HashMap.get(map, id);

// Update (atomic) with immutable map
yield* SynchronizedRef.update(store, (map) => {
  const updated: GameSession = { ...current, ...patch };
  return HashMap.set(map, id, updated);
});
```

The `store.update` callback receives the current map, returns a new map — `SynchronizedRef` ensures atomicity so concurrent requests don't lose writes.

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

## Recursive Game Loop (`packages/client/src/main.ts`)

The game loop is a pure recursive function — each call threads an immutable `ClientState` through, calls `render` to print the board, reads a keypress, and recurses. No `while(true)`, no mutable state.

The `readKey` effect is created once at startup by `makeReadKey()` and passed as an explicit parameter — the loop never needs to know how keypresses are sourced.

```typescript
function gameLoop(
  state: ClientState,
  readKey: Effect.Effect<KeyEvent>,
): Effect.Effect<ClientState, never, GameApi> {
  if (state.phase === "quit")
    return Effect.succeed(state);

  return Effect.gen(function* (_) {
    yield* render(state);
    const key = yield* readKey;
    const newState = yield* handleKey(state, key);
    return yield* gameLoop(newState, readKey);  // tail recursion
  });
}
```

Terminal states (`"quit"`, `"completed"`) short-circuit via `handleKey` returning `initialState` or `quit(state)`. The recursion naturally terminates because the next iteration of `gameLoop` hits the base case.

## Option (`packages/shared/src/engine/solver.ts`)

The standard FP way to model a value that may or may not exist — avoids `null` and `undefined` by making absence explicit in the type. The solver returns `Option<Board>` to distinguish "solved" from "unsolvable" without sentinel values.

```typescript
// Solver returns Option.Option<Board>
export function solve(board: Board): Option.Option<Board> {
  return solveInternal(board.map((row) => [...row]) as Board);
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

## Queue + Raw Stdin (`packages/client/src/ui/input.ts`)

The terminal input handler is built on `Queue.unbounded<KeyEvent>` — raw `stdin` data events write parsed key events into the queue, and a `readKey` effect dequeues one event at a time. This eliminates all module-level mutable state (no `rawActive`, `pending`, `buffer`, `queued`, or `resolveRead` globals).

`makeReadKey()` returns a one-shot setup `Effect` containing the `readKey` consumer and a `restoreStdin` finalizer — the caller wires them at the program entry point:

```typescript
export function makeReadKey(): Effect.Effect<{
  readonly readKey: Effect.Effect<KeyEvent>;
  readonly restoreStdin: Effect.Effect<void>;
}> {
  return Effect.gen(function* (_) {
    const queue = yield* Queue.unbounded<KeyEvent>();

    function onData(chunk: Buffer) {
      const combined = Buffer.concat([inputPending, chunk]);
      const { events, pending } = drainBuffer(combined);
      inputPending = pending;
      for (const event of events) {
        Queue.unsafeOffer(queue, event);
      }
    }

    process.stdin.on("data", onData);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const readKey: Effect.Effect<KeyEvent> =
      Queue.take(queue);

    const restoreStdin: Effect.Effect<void> = Effect.sync(() => {
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      process.stdin.setRawMode(false);
    });

    return { readKey, restoreStdin };
  });
}
```

The queue acts as a **buffer between the push-based `onData` callback and the pull-based game loop** — the callback writes events as they arrive, and the game loop reads them one by one via `Queue.take`, which naturally suspends when the queue is empty.
