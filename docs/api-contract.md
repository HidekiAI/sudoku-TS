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

## Error Responses (4xx/5xx)

```json
{ "error": "Game not found: abc123" }
```
```json
{ "error": "Invalid request body" }
```
