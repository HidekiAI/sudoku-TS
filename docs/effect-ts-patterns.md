# effect-ts Patterns Catalog

> Every effect-ts feature demonstrated in this project, indexed by file.

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
