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

| Language | Equivalent | What it unwraps | How it works |
|----------|-----------|-----------------|--------------|
| JS `await` | `const x = await promise` | `Promise<A>` → `A` | language built-in, hardcoded to Promise |
| F# `let!` | `let! x = expr` | any monadic type `M<A>` → `A` | computation expression builder desugaring |
| JS `yield*` | `const x = yield* effect` | any iterable → return value | generator protocol delegation |

`yield*` is **protocol-based**, not hardcoded to one type — the same syntax works on anything implementing `[Symbol.iterator]()`. This is why effect-ts chose it over `await`: you can swap the runtime (sync, async, test, retry, etc.) without changing your code.

## Schema (`packages/shared/src/schemas/`)

```typescript
// Runtime validation + TypeScript type inference in one declaration
const DifficultySchema = Schema.Literal("easy", "medium", "hard", "expert")
type Difficulty = Schema.Schema.Type<typeof DifficultySchema>
// → "easy" | "medium" | "hard" | "expert"

// Constrained types with piped refinements
const CellValueSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 9)
)

// Fixed-length arrays
const RowSchema = Schema.Array(CellValueSchema).pipe(
  Schema.minItems(9),
  Schema.maxItems(9)
)
```

## Schema Decode (`packages/server/src/services/game-service.ts`)

```typescript
// Parse + validate JSON body in one step
const req = yield* Schema.decodeUnknown(CreateGameRequestSchema)(raw)
// raw: unknown → typed CreateGameRequest
// Throws ParseError if validation fails — caught by Effect handler
```

## Layer / Tag DI (`packages/server/src/services/`)

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

```typescript
// Concurrent-safe mutable state
const store = yield* Ref.SynchronizedRef.make(HashMap.empty<string, GameSession>())

// Read
const map = yield* store.get
const session = HashMap.get(map, id)

// Update (atomic)
yield* store.update(map => {
  const updated = { ...session, ...patch }
  return HashMap.set(map, id, updated)
})
```

## Effect.gen (`all packages`)

```typescript
// Imperative-style composition inside Effect
const createGame: GameService["createGame"] = (raw) =>
  Effect.gen(function*(_) {
    const req = yield* Schema.decodeUnknown(CreateGameRequestSchema)(raw)
    const { puzzle, solution } = yield* generateWithUniqueSolution(req.difficulty)
    const givenMask = buildGivenMask(puzzle)
    const id = yield* store.create(req.difficulty, puzzle, solution, givenMask)
    return { id, board: puzzle, givenMask, difficulty: req.difficulty }
  })
```

## Effect.iterate (`packages/client/src/main.ts`)

```typescript
// Pure functional game loop
Effect.iterate(initialState, state =>
  Effect.gen(function*(_) {
    yield* render(state)
    const key = yield* readKey()
    return updateState(state, key)
  })
)
```

## Option (`packages/shared/src/engine/solver.ts`)

```typescript
// Solver returns Option.Option<Board>
export function solve(board: Board): Option.Option<Board> {
  const result = solveInternal(copyBoard(board))
  return result // Some(board) | None
}
```

## Effect.catchTag / Effect.catchAll (`packages/server/src/routes/`)

```typescript
// Structured error handling
yield* gameService.createGame(body).pipe(
  Effect.catchTag("ParseError", (e) =>
    Effect.succeed(HttpResponse.json({ error: "Invalid request" }, { status: 400 }))
  ),
  Effect.catchAll((e) =>
    Effect.succeed(HttpResponse.json({ error: e.message }, { status: 500 }))
  )
)
```

## Clock (`packages/server/src/services/game-service.ts`)

```typescript
const now = yield* Clock.currentTimeMillis
const elapsedSeconds = Math.floor((now - session.startTime) / 1000)
```

## Random (`packages/shared/src/engine/generator.ts`)

```typescript
const idx = yield* Random.nextIntBetween(0, chars.length)
```

## HttpClient (`packages/client/src/api/`)

```typescript
const client = HttpClient.fetch()
const response = yield* client.post("http://localhost:3000/api/games", {
  body: JSON.stringify({ difficulty }),
  headers: { "content-type": "application/json" }
})
const data = yield* response.json
```

## Terminal I/O (`packages/client/src/ui/`)

```typescript
// Read keypress via raw stdin
const readKey: Effect.Effect<KeyEvent> =
  Effect.async<KeyEvent>((resume) => {
    process.stdin.setRawMode(true)
    process.stdin.once("data", (data) => {
      resume(Effect.succeed(parseKey(data)))
    })
  })
```
