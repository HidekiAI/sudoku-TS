# API Contract

> All DTOs defined with effect/Schema in `packages/shared/src/schemas/`.

## Base Types

```typescript
// packages/shared/src/schemas/game.ts

const CellValueSchema = Schema.Number.pipe(Schema.int(), Schema.between(0, 9))
// 0 = empty, 1-9 = number

const CoordSchema = Schema.Struct({
  row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8))
})

const RowSchema = Schema.Array(CellValueSchema).pipe(Schema.minItems(9), Schema.maxItems(9))
const BoardSchema = Schema.Array(RowSchema).pipe(Schema.minItems(9), Schema.maxItems(9))

const DifficultySchema = Schema.Literal("easy", "medium", "hard", "expert")
const GameStatusSchema = Schema.Literal("active", "completed", "abandoned")
```

## Endpoints

### POST /api/games

Create a new game.

**Request:**
```json
{ "difficulty": "easy" }
```
```typescript
// Schema:
const CreateGameRequestSchema = Schema.Struct({
  difficulty: DifficultySchema
})
```

**Response (201):**
```json
{
  "id": "abc123def456",
  "board": [[5,3,0,0,7,0,0,0,0], ...],
  "givenMask": [[true,true,false,...], ...],
  "difficulty": "easy"
}
```
```typescript
const CreateGameResponseSchema = Schema.Struct({
  id: Schema.String,
  board: BoardSchema,
  givenMask: Schema.Array(Schema.Array(Schema.Boolean)....),
  difficulty: DifficultySchema
})
```

### GET /api/games/:id

Get current game state.

**Response (200):**
```json
{
  "id": "abc123def456",
  "board": [[...], ...],
  "givenMask": [[...], ...],
  "difficulty": "easy",
  "hintsUsed": 0,
  "movesCount": 12,
  "status": "active",
  "elapsedSeconds": 45
}
```

### POST /api/games/:id/moves

Submit a move.

**Request:**
```json
{ "row": 0, "col": 2, "value": 5 }
```

**Response (200) — correct:**
```json
{ "valid": true, "message": "Correct", "solved": false, "board": [[...], ...] }
```

**Response (200) — solved:**
```json
{ "valid": true, "message": "Puzzle solved!", "solved": true, "board": [[...], ...] }
```

**Response (200) — incorrect:**
```json
{ "valid": false, "message": "Incorrect value", "solved": false, "board": [[...], ...] }
```

## Controller Endpoints

### GET /api/games

List all active games. Returns an array of game summaries.

**Response (200):**
```json
[
  {
    "id": "abc123def456",
    "difficulty": "easy",
    "status": "active",
    "movesCount": 12,
    "hintsUsed": 0,
    "elapsedSeconds": 45,
    "currentBoard": [[5,3,0,0,7,0,0,0,0], ...],
    "givenMask": [[true,true,false,...], ...]
  }
]
```

```typescript
const GameListEntrySchema = Schema.Struct({
  id: Schema.String,
  difficulty: DifficultySchema,
  status: GameStatusSchema,
  movesCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  hintsUsed: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  elapsedSeconds: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  currentBoard: BoardSchema,
  givenMask: GivenMaskSchema,
});

const GameListResponseSchema = Schema.Array(GameListEntrySchema);
```

### GET /api/games/stream (SSE)

Server-Sent Events stream of all game lifecycle events. One `data:` line per
event, newline-delimited (`\n\n`).

**Response (200):** `text/event-stream`

```json
data: {"_tag":"GameCreated","id":"abc123","difficulty":"easy","createdAt":1712345678}

data: {"_tag":"MoveMade","id":"abc123","row":0,"col":3,"value":9,"valid":true,"movesCount":13}

data: {"_tag":"GameCompleted","id":"abc123","elapsedSeconds":312,"movesCount":47,"hintsUsed":2}
```

### GET /api/games/:id/stream (SSE)

Filtered SSE stream — same format as above, but only emits events for the
specified game ID.

### GameEvent Schema

```typescript
const GameEventSchema = Schema.TaggedUnion("_tag")({
  GameCreated: Schema.Struct({
    _tag: Schema.Literal("GameCreated"),
    id: Schema.String,
    difficulty: DifficultySchema,
    createdAt: Schema.Number,
  }),
  MoveMade: Schema.Struct({
    _tag: Schema.Literal("MoveMade"),
    id: Schema.String,
    row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    value: CellValueSchema,
    valid: Schema.Boolean,
    movesCount: Schema.Number,
  }),
  HintUsed: Schema.Struct({
    _tag: Schema.Literal("HintUsed"),
    id: Schema.String,
    row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
    hintsUsed: Schema.Number,
  }),
  GameCompleted: Schema.Struct({
    _tag: Schema.Literal("GameCompleted"),
    id: Schema.String,
    elapsedSeconds: Schema.Number,
    movesCount: Schema.Number,
    hintsUsed: Schema.Number,
  }),
});
```

## Error Responses (4xx/5xx)

```json
{ "error": "Game not found: abc123" }
```
```json
{ "error": "Invalid request body" }
```
