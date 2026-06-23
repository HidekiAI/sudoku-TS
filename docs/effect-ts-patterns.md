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
| Rust `.await` | `let x = expr.await`    | `impl Future<Output = A>` → `A`| language built-in, hardcoded to Future    |
| Rust `?`    | `let x = expr?`           | `Result<T,E>` or `Option<T>` → `T` | early-return operator, hardcoded to Result |
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

In Rust, struct update syntax (`..other`) is **safe** — naming a non-existent field is a compile error, and type inference never substitutes a different struct:

```rust
struct Person { name: String, age: i32 }

let updated = Person {
    name: "Bob".to_string(),
    ..original         // fills in age from original
};
// let bad = Person { name: "x".to_string(), nam: "y".to_string(), ..original };
//                                    ^^^^ Error: struct Person has no field 'nam'
```

Rust sidesteps the ambiguity problem because it has **nominal typing** — `Person` and `Employee` are distinct types even if they share every field; `..` never infers the wrong one. effect-ts's `Struct.evolve` achieves the same guarantee in TypeScript's structural type system by tying every key to the explicit target type.

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

### Option as Sequence — treat `None` as empty, `Some` as one element

In F# and Rust, an `Option` can be used directly wherever a sequence is expected — `None` contributes 0 elements, `Some(x)` contributes 1. This makes composition with flat-map/filter-map extremely concise:

#### F# — `option` in sequence expressions

F# special-cases `option<'T>` inside `seq {}` / list expressions — `yield!` on an option emits 0 or 1 elements:

```fsharp
// Each yield! emits 0 or 1 values — collectively behaves like flat_map
let result = seq {
    yield! Some 42           // emits 42
    yield! None              // emits nothing
    yield! Some 7            // emits 7
}
// → seq [ 42; 7 ]

// Choose = filterMap on options
let evens = [1..5] |> List.choose (fun n ->
    if n % 2 = 0 then Some (n * 10) else None
)
// → [ 20; 40 ]
```

#### Rust — `Option` implements `IntoIterator`

Rust's `Option<T>` implements `IntoIterator`, so it works in `for`, `flatten()`, `filter_map()`, and any iterator combinator:

```rust
// flatten() on Iterator<Item = Option<T>> = 0..1 elements per item
let result: Vec<i32> = [Some(1), None, Some(3)]
    .into_iter()
    .flatten()   // Some emits 1, None emits 0
    .collect();
// → vec![1, 3]

// filter_map = map + keep Somes
let evens: Vec<i32> = (1..=5)
    .filter_map(|n| if n % 2 == 0 { Some(n * 10) } else { None })
    .collect();
// → vec![20, 40]
```

#### Effect-TS — explicit via `Array.filterMap` / `Array.getSomes` / `Option.match` / `Option.toArray`

Effect-TS's `Option<T>` does **not** implement `Iterable<T>` (no `[Symbol.iterator]`). Instead, the same patterns use explicit combinators from the `Array` and `Option` modules.

**Real example — ID generation with `Array.filterMap`** (`packages/server/src/services/game-store.ts:61-68`):

```typescript
import { Array, Option, Random, Effect } from "effect";

const generateId: Effect.Effect<string> = Effect.gen(function* (_) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const indices = yield* Effect.all(
    Array.makeBy(12, () => Random.nextIntBetween(0, chars.length)),
  );
  return Array.filterMap(indices, (i) => Option.fromNullable(chars[i])).join("");
});
```

`Array.filterMap` maps each index through `Option.fromNullable` — indices outside `chars` bounds produce `None` (dropped), valid indices produce `Some(char)` (collected). The result is directly joined into a string without a `getOrElse("")` fallback. Equivalent to Rust's `indices.iter().filter_map(|i| chars.get(i)).collect::<String>()`.

**Real example — atomic DB update with `Option.match`** (`packages/server/src/services/game-store.ts:107-114`):

```typescript
yield* SynchronizedRef.update(store, (map) =>
  Option.match(HashMap.get(map, id), {
    onNone: () => map,
    onSome: (session) => HashMap.set(map, id, { ...session, ...patch }),
  }),
);
```

`HashMap.get` returns `Option<GameSession>` — `Option.match` handles both branches inline without a separate `isNone` guard or `.value` access. The `onNone` path returns the map unchanged; `onSome` merges the patch and returns the updated map.

**Building blocks:**

```typescript
// Option.toArray — Some → [v], None → []  (F# yield! / Rust flatten on single)
Option.toArray(Option.some(42))   // → [42]
Option.toArray(Option.none())     // → []

// Iterate over an Option as a 0-or-1-element container:
for (const x of Option.toArray(myOption)) {
  // runs 0 or 1 times
}

// Array.getSomes — filter out Nones  (Rust flatten, F# choose with identity)
const options = [Option.some(1), Option.none(), Option.some(3)];
pipe(options, Array.getSomes)   // → [1, 3]
```

**Real example — `findEmpty` uses `Array.filterMap` with `Array.flatMap`** (`packages/shared/src/engine/solver.ts:54-68`):

```typescript
// Rust: (0..9).flat_map(|r| (0..9).map(move |c| (r, c)))
//        .find(|&(r, c)| board[r][c] == 0)
export function findEmpty(board: Board): Option.Option<[number, number]> {
  return Array.head(
    Array.filterMap(
      Array.flatMap(
        Array.makeBy(9, (r) =>
          Array.makeBy(9, (c) => [r, c] as [number, number]),
        ),
        (pair) => pair,
      ),
      ([r, c]) =>
        board[r]?.[c] === 0
          ? Option.some([r, c] as [number, number])
          : Option.none(),
    ),
  );
}
```

#### Summary table

| Pattern | F# | Rust | Effect-TS |
|---|---|---|---|
| Option → 0..1 elements | `yield! someOpt` | `option.flatten()` (single) | `Option.toArray(someOpt)` |
| Filter-map over iterable | `Seq.choose fn xs` | `xs.iter().filter_map(fn)` | `Array.filterMap(xs, fn)` |
| Keep only Somes | `Seq.choose id xs` | `xs.iter().flatten()` | `Array.getSomes(xs)` |
| Pattern match | `match x with \| Some v -> ... \| None -> ...` | `match x { Some(v) => ..., None => ... }` | `Option.match(x, { onSome: v => ..., onNone: () => ... })` |
| For-loop over option | `for x in someOpt do ...` | `for x in someOpt { ... }` | `for (const x of Option.toArray(someOpt)) { ... }` |
| Short-circuit on None | `Option.defaultValue` / `match` | `?` operator | `Option.getOrThrow` / `yield*` (in Effect.gen) |

#### Key difference

F# and Rust give `Option` **first-class sequence status** — the type is iterable by default, so it plugs directly into `for`, `yield!`, `flatten()`, `filter_map()`, etc. Effect-TS keeps `Option` as a standalone type with its own combinators and requires an explicit conversion (`Option.toArray`) or uses `Array.filterMap`/`Array.getSomes` for the collection-level pattern. Same power, identical semantics, more explicit — no hidden magic, no risk of accidentally iterating an `Option` when you meant to match on it.

## Either — Typed Success-or-Failure (`packages/shared/src/schemas/response.test.ts`)

`Either<L, R>` is the direct analogue of Rust's `Result<T, E>` — a pure (non-effectful) value that is either a success (`Right`) or a failure (`Left`). While `Effect<T, E, R>` carries the same success/error distinction with added effect tracking (I/O, dependencies, async), `Either` is for pure computations that can fail in isolation:

| Concept | Rust `Result` | effect-ts `Either` | effect-ts `Effect` |
|---|---|---|---|
| Success value | `Ok(T)` | `Either.right(v)` / `Right<R>` | Success channel `T` |
| Error value | `Err(E)` | `Either.left(e)` / `Left<L>` | Error channel `E` |
| Pure fallible | `Result<T, E>` | `Either<L, R>` | — |
| Effectful fallible | `async fn → Result<T, E>` | — | `Effect<T, E, R>` |
| Inspection | `match` | `Either.match({ onLeft, onRight })` | `Effect.match({ onSuccess, onFailure })` |
| Map success | `.map()` | `.pipe(Either.map(f))` | `.pipe(Effect.map(f))` |
| Chain | `.and_then()` | `.pipe(Either.flatMap(f))` | `yield*` / `.pipe(Effect.flatMap(f))` |
| Map error | `.map_err()` | `.pipe(Either.mapLeft(f))` | `.pipe(Effect.mapError(f))` |
| From optional | `.ok_or(err)` | `Either.fromOption(() => err)(opt)` | `Effect.fromOption(() => err)(opt)` |
| Unwrap | `.unwrap()` / `?` | `Either.getOrThrow` | `Effect.runSync` / `yield*` |

### When to use `Either` vs `Effect`

| Use `Either<L, R>` | Use `Effect<T, E, R>` |
|---|---|
| Pure function that can fail (no I/O) | Any operation with I/O, async, or dependency requirements |
| Validation / parsing without side effects | Schema decoding at a service boundary (needs DI context) |
| Business logic returning success/failure | Operations needing retry, timeout, concurrent state |
| Intermediate data transformation with error paths | Operations composing multiple fallible steps that share deps |

### Rust-equivalent pattern matching

```typescript
import { Either, pipe } from "effect";

// Rust: match result { Ok(v) => ..., Err(e) => ... }
const message = Either.match(result, {
  onLeft: (e) => `Error: ${e}`,
  onRight: (v) => `Success: ${v}`,
});

// Rust: result.map(|v| v * 2)
const doubled = pipe(result, Either.map((v) => v * 2));

// Rust: result.and_then(|v| Ok(v + 1))
const chained = pipe(result, Either.flatMap((v) => Either.right(v + 1)));

// Rust: result.map_err(|e| format!("wrapped: {e}"))
const wrapped = pipe(result, Either.mapLeft((e) => `wrapped: ${e}`));

// Rust: result.ok_or(Error::new("missing"))
const fromOpt: Either<string, number> = pipe(
  Option.some(42),
  Either.fromOption(() => "missing"),
);
// → Either.right(42)

// Rust: if let Ok(v) = result { ... }
if (Either.isRight(result)) {
  const valid: R = result.right; // typed access to the success
} else {
  const error: L = result.left;  // typed access to the failure
}
```

### `Schema.decodeUnknownEither` — pure validation at test boundaries

The project uses `Schema.decodeUnknownEither` in tests to validate schemas without entering the Effect runtime:

```typescript
// Instead of Schema.decodeUnknown(...) which returns Effect,
// decodeUnknownEither returns Either<ParseError, T> directly:
const result = Schema.decodeUnknownEither(ResponseSchema)(raw);

if (Either.isRight(result)) {
  // result.right: typed response
} else {
  // result.left: ParseError with path + message
}
```

This is the functional equivalent of Rust's `serde_json::from_str::<T>(input)` — it returns a `Result<T, Error>` in one pure call, with no I/O or async context required.

### Error channel vs. Either — when to use which

The same intuition applies as choosing between Rust's `Result<T, E>` and `panic!`:

- **Use the error channel (`E` in `Effect<T, E, R>`)** for errors that the caller is expected to handle — network failures, validation errors, missing resources. These are the `Err` / `Left` of the Effect world.
- **Use defects / `Cause.die`** for programming errors that should never happen — index-out-of-bounds, assertion failures, unreachable branches. These are the `panic!` / `unreachable!()` equivalents.
- **Use `Either` inside a pure function** when the computation has no I/O but can still fail — like parsing a single value or transforming data with possible malformed input.

### Relationship: `Either` as a snapshot of `Effect`

An `Effect<T, E, R>` that has been run (via `Effect.runSync` or `Effect.runPromise`) produces either a success value `T` or — if captured via `Effect.either` — an `Either<E, T>`:

```typescript
// Capture both success and failure as a pure value
const captured: Effect<Either<E, T>, never, R> = Effect.either(myEffect);

// Run it — the outer Effect never fails; the Either captures the inner error
const either = yield* Effect.either(myEffect);
// either: Either<E, T> — same as Rust's Result<T, E>
```

`Effect.either` is the analogue of pattern-matching on a Rust `Result` to transform the error into the success channel — after `.either`, the Effect's error channel is `never` and errors are embedded in the `Either` value.

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

## Error Handling Philosophy — Like Rust `Result<T, E>`, Never `throw`

`Effect<T, E, R>` is the direct analogue of `Result<T, E>` in Rust:

| Concept | Rust | effect-ts |
|---------|------|-----------|
| Success type | `Ok(T)` | `Effect<T, ...>` (success channel) |
| Error type | `Err(E)` | `Effect<..., E, ...>` (error channel) |
| Requirements / context | — | `Effect<..., ..., R>` (dependency channel) |

**Core discipline**: Every function that can fail **must** declare its error type in the `E` channel. Errors are **never silently swallowed** — no try/catch hiding, no `catch {}` blocks, no `.unwrap()` equivalents in production.

### Rules enforced in this project

1. **No hidden exceptions.** If an operation can fail, its return type reflects it:
   ```typescript
   // ❌ Bad: Hides the failure path
   const createGame = (raw: unknown): Effect<CreateGameResponse>
   
   // ✅ Good: Declares every possible error
   const createGame = (
     raw: unknown,
   ): Effect<CreateGameResponse, HttpClientError | ParseResult.ParseError>
   ```

2. **Error handlers sit at the top, never in the middle.** Only the outermost chain (e.g., `main.ts`, route handlers) calls `Effect.catchAll` to convert errors to user-facing messages. Middle layers propagate errors upward through `yield*`:
   ```typescript
   // Top-level (main.ts) — the ONLY place that catches errors:
   yield* api.createGame(difficulty).pipe(
     Effect.catchAll(() => Effect.succeed(Option.none())),
   )
   ```

3. **No `unwrap()` / non-null assertions.** TypeScript's `!` and `as` are the equivalent of Rust's `.unwrap()` — they bypass compile-time guarantees and can panic at runtime. Every non-null assertion in this project was replaced with `Option` / `??` / `Schema.decodeUnknown`:
   ```typescript
   // ❌ Bad: non-null assertion (like Rust's .unwrap())
   const byte = buf[cursor]!
   
   // ✅ Good: optional chaining with fallback (like Rust's unwrap_or)
   const byte = buf[cursor] ?? 0
   ```

4. **ATOMICITY: SynchronizedRef.modify over get-then-update.** The Time-of-Check Time-of-Use (TOCTOU) race between `store.get(id)` and `store.update(id, patch)` is the effect-ts equivalent of a double-checked locking bug. The fix is `store.modify(id, fn)` which performs the entire read-modify-write atomically — the callback `fn` is a pure function (no effects), so the runtime can guarantee linearizability:
   ```typescript
   // ❌ Bad: Non-atomic read-modify-write (TOCTOU race)
   const session = yield* store.get(id)
   const boardAfter = setCell(session.board, row, col, value)
   yield* store.update(id, { board: boardAfter })
   
   // ✅ Good: Atomic modify via SynchronizedRef.modify
   return yield* store.modify(id, (session) => {
     const boardAfter = setCell(session.board, row, col, value)
     return [response, { ...session, board: boardAfter }]
   })
   ```

> **Rust analogy**: `store.modify` is to `get`+`update` what `RefCell::borrow_mut` is to separate `borrow`+`replace` — the latter pair invites data races; the former guarantees exclusive access for the duration of the operation.

### Exceptions (literally)

The one place where `try/catch` is tolerated: **interop with callback-based APIs** where the boundary between Effect and imperative code makes `Effect.catchAll` impractical. In those cases:
- The catch block **must** document why the suppression is safe (e.g., `"stdin might already be destroyed — non-fatal during cleanup"`)
- The catch should be as narrow as possible (no `catch {}` — always name the specific error if the API supports it)

## Fallback Safety — When to `??` / `unwrap_or` vs. When to Fail

Every `??` default (TypeScript) or `unwrap_or(default)` (Rust) is a **deliberate architectural choice** between two options: silently degrade or loudly fail. The rule: **only self-heal when the fallback is a provable no-op**. Otherwise, propagate the error through the type system.

### Three Safe Categories

**1. Schema-guaranteed bounds** — Array access where the index is validated by `Schema`, caller contract, or construction pattern (e.g., `Array.makeBy(9, ...)` producing indices 0-8 into a 9-element board):

```typescript
// TypeScript — board[r]?.[col] ?? 0
// Safety: row/col are 0-8 (Schema.between(0,8)), board is 9×9.
// 0 is the empty-cell sentinel — a no-op in every validation check.
```

```rust
// Rust — board.get(r).and_then(|row| row.get(col)).copied().unwrap_or(0)
// Safety: same — r/col validated upstream, 0 is the empty sentinel.
```

**2. Type-level guarantee with no runtime cost** — Access satisfied by the type system where the index is in-bounds but `noUncheckedIndexedAccess` requires an explicit fallback:

```typescript
// TypeScript — buf[cursor] ?? 0
// Safety: cursor < buf.length is checked on the same line (guard before access).
// The `?? 0` satisfies noUncheckedIndexedAccess without a `!` assertion.
```

```rust
// Rust — buf.get(cursor).copied().unwrap_or(0)
// Safety: same guard before access. unwrap_or here is expressiveness, not
// error masking — the bounds check already guarantees safety.
```

**3. Fallback sentinel that maps to correct failure** — Where the fallback value itself triggers the correct error handling path downstream:

```typescript
// TypeScript — params["id"] ?? ""
// Safety: HttpRouter only dispatches this handler when `:id` is present in
// the path. An empty string reaches store.get(id), which returns a "not found"
// error — the correct 404 behavior.
```

```rust
// Rust — params.get("id").map(String::as_str).unwrap_or("")
// Safety: same — router guarantees presence; empty string produces the right
// 404 path downstream.
```

### When NOT to Self-Heal (Fail Instead)

- **Data integrity violations** — If a board row has the wrong length or a cell value is out of range, `?? 0` would mask a bug. Let `Schema.decodeUnknown` reject it with a `ParseError`.
- **Missing required configuration** — If `API_URL` is unset in production, `?? "http://localhost:8000"` would silently connect to the wrong server. (The actual production deployment always sets `API_URL` via Docker env, so the default is purely a dev convenience — this is an acceptable exception.)
- **Logical errors** — If a hashmap lookup fails and the key **should** exist (e.g., a game ID validated by the ID schema), use `Option.getOrThrow` / `expect` / `unwrap` in tests only, and propagate via `Option` / `Either` in production.

### Rust Equivalents

| TypeScript | Rust | When |
|---|---|---|
| `arr[i] ?? 0` | `arr.get(i).copied().unwrap_or(0)` | Safe fallback — sentinel is a no-op |
| `obj[key] ?? ""` | `obj.get(key).map(String::as_str).unwrap_or("")` | Safe fallback — triggers no-op or correct error |
| `Schema.decodeUnknown(...)` | `serde_json::from_str::<T>(...)?` | Fallible — propagate error |
| `store.keys[id] ?? fail` | `store.keys.get(id).ok_or(Error::NotFound)?` | Required key missing — **fail** |

### Every `??` in This Codebase Is Annotated

Search for `// Safety:` comments preceding each `??` or `getOrElse` to find the justification. If a new `??` is added without a `// Safety:` comment, the review will flag it.

## Logging — `Console.log` vs `Effect.log` and Structured Error Reporting

Logging inside an Effect program is itself an `Effect` — both `Console.log` and the `Effect.log` family return `Effect<void>` (zero error channel, zero requirements), so they compose naturally with any `Effect<A, E, R>` pipeline.

### `Console.log` / `Console.error` — direct stdout/stderr

Used throughout `packages/server/src/main.ts` for HTTP request logging and startup messages:

```typescript
yield* Console.log(`Sudoku server started on http://${host}:${port}`);
yield* Console.log(`→ ${req.method} ${req.url}`);
yield* Console.log(`← ${req.method} ${req.url} ${resp.status}`);
```

`Console.log` is a lightweight, side-effect-only `Effect<void>` — it writes a string to stdout and succeeds. `Console.error` writes to stderr and is used for crash reporting:

```typescript
// Crashed server — log structured JSON to stderr
yield* Console.error(
  JSON.stringify({
    kind: "crashed",
    message: `Server error: ${e}`,
  }),
);
```

| API | Target | Returns | Used for |
|---|---|---|---|
| `Console.log(...args)` | stdout | `Effect<void>` | General info, request logs |
| `Console.error(...args)` | stderr | `Effect<void>` | Errors, crash reports |

Because both return `Effect<void>`, they can be inserted anywhere in an `Effect.gen` block with `yield*` or chained with `.pipe()` — no special wrapping needed.

### `Effect.log` / `Effect.logError` — structured, level-aware logging

Effect provides a built-in structured logging API that associates every log entry with the current **fiber id**, **span**, and **log annotations** — all of which are inherited from the calling Effect's context:

```typescript
import { Effect } from "effect";

// Five log levels, each returning Effect<void, never, never>:
Effect.logTrace("entering hot path");
Effect.logDebug("cache miss for key %s", key);
Effect.logInfo("game created: %s", gameId);
Effect.logWarning("rate limit approaching: %d req/s", rpm);
Effect.logError("store lookup failed: %s", id);
Effect.logFatal("unrecoverable: %o", error);
```

`Effect.log` (without level suffix) defaults to `INFO`. All variants accept printf-style format strings and spread arguments, just like `console.log`.

### Logging errors in `Effect<A, E, R>` pipelines

The most common pattern for logging errors without swallowing them is `Effect.tapError` — it peeks at the error channel, logs it, and re-raises the same error:

```typescript
// Unlike catchAll, tapError does NOT recover — it inspects and re-fails
yield* store.get(id).pipe(
  Effect.tapError((e) => Effect.logError("store.get failed: %s", e.message)),
  // error still propagates to caller — nothing swallowed
);
```

If you want to log **and** recover (provide a fallback), chain `catchAll` separately:

```typescript
yield* store.get(id).pipe(
  Effect.tapError((e) => Effect.logError("store.get failed: %s", e.message)),
  Effect.catchAll(() => Effect.succeed(defaultSession)),
);
```

| API | Effect on error channel | Effect on success channel | Use case |
|---|---|---|---|
| `Effect.tapError(f)` | Preserves error (re-raises) | Passes through unchanged | Log errors without swallowing |
| `Effect.catchAll(f)` | Replaces error with success | — | Recover from errors |
| `Effect.tapErrorLog(message)` | Preserves error | Passes through unchanged | Shorthand for `tapError` + `logError` |

### Structured result logging at program exit

Both `Console.log` and `Effect.logInfo` work at the top-level boundary to produce structured output. In this project, the client's `main.ts` converts the final game state into a `RunResult` JSON blob and prints it:

```typescript
type RunResult = {
  readonly kind: "quit" | "completed" | "crashed";
  readonly message: string;
  readonly movesCount: number;
  readonly hintsUsed: number;
  readonly elapsedSeconds: number;
  readonly difficulty: string;
};

Effect.runPromise(/* ... */).then((state) => {
  const result: RunResult = { kind: "quit", message: state.message, /* ... */ };
  console.log(JSON.stringify(result, null, 2));
});
```

The server does the same on graceful shutdown:

```typescript
const result: RunResult = {
  kind: "shutdown",
  message: "Server shut down gracefully",
  port,
  host,
};
yield* Console.log(JSON.stringify(result));
```

Both produce structured JSON at the top level — machine-parseable and human-readable, suitable for log aggregators or container orchestration systems.

### When to use `Console.*` vs `Effect.log`

| Use `Console.log` / `Console.error` | Use `Effect.log` / `Effect.logError` |
|---|---|
| Ad-hoc logging, request traces, startup messages | Production logging where level routing matters |
| When you need stdout/stderr separation | When you need fiber-span correlation |
| Simple scripts, TUI programs | Server applications with log aggregation |
| Quick debugging output | When log level filtering is required (e.g., suppress DEBUG in prod) |

Both APIs coexist peacefully — `Console.log` is a thin wrapper around `process.stdout.write`, while `Effect.log` routes through Effect's `Logger` system (configurable via `Logger.replace`).

effect-ts is not a wholesale replacement for JavaScript — it targets specific pain points (type-safe errors, DI, concurrency, lazy evaluation). For simple pure expressions, native JS is often terser. **Using native JS for what it's good at is a strength, not a compromise.**

### Example: `hasNoConflicts`

```typescript
// effect-ts HashSet approach (hypothetical):
import { HashSet, Array } from "effect";
function hasNoConflicts(values: CellValue[]): boolean {
  const filtered = values.filter((v) => v !== 0);
  return HashSet.size(HashSet.fromIterable(filtered)) === filtered.length;
}

// Native JS — same semantics, half the tokens:
function hasNoConflicts(values: CellValue[]): boolean {
  const filtered = values.filter((v) => v !== 0);
  return new Set(filtered).size === filtered.length;
}
```

The native version is shorter and equally pure — `new Set` is constructed and discarded, no mutation escapes. There is zero benefit to replacing it with `HashSet`.

### Comparison across languages

Here is the same algorithm in all four languages:

| Language | Expression | Notes |
|---|---|---|
| **JS (native)** | `new Set(filtered).size === filtered.length` | Built-in, one call |
| **effect-ts** | `HashSet.size(HashSet.fromIterable(filtered)) === filtered.length` | Two calls, same semantics |
| **Rust** | `set.len() == filtered.len()` | After explicit `HashSet::from_iter` |
| **F#** | `Set.count (Set.ofArray filtered) = filtered.Length` | Closest to JS — single composeable call |

### When to use native JS vs effect-ts

| Use native JS | Use effect-ts |
|---|---|
| `Set`, `Map` for simple dedup/lookup | `HashMap` when you need persistent/immutable semantics across updates |
| `Array.filter`/`.map`/`.find` for small known-size arrays | `Array` combinators when chaining with other effectful operations |
| `Math.max`/`Math.min` on primitives | `Number.clamp` doesn't exist natively; effect-ts has no special offering here |
| `Date.now()` in non-testable code | `Clock.currentTimeMillis` when you need testability or managed time |
| `for` loop with early exit | `Array.every` / `Stream` for composable lazy iteration |
| `JSON.parse`/`JSON.stringify` | `Schema.decodeUnknown` + `Schema.encodeSync` — validation + types |

**The rule of thumb:** if the operation is a pure expression with no side effects and no need for testability/lazy evaluation/error tracking, native JS is the right tool. effect-ts exists to fill gaps native JS doesn't solve well — it doesn't replace every built-in.
