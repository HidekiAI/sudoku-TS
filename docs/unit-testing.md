# Unit Testing Plan — sudoku-TS

> Why effect-ts makes testing trivial, and what we test at every layer.

## Philosophy

effect-ts converts every side effect into a typed `Effect<T, E, R>` — the same way Rust converts every fallible operation into `Result<T, E>`. This makes testing *easier* than traditional mocking frameworks because:

1. **Pure functions** (no effects) are synchronous, deterministic, and take inputs → return outputs. Test them directly — no setup, no mocks.
2. **Effectful functions** declare their dependencies in the `R` channel. Swap any dependency at test time via `Layer.provideService` — no `jest.mock()`, no proxyquire, no magic.
3. **Environment effects** (`Random`, `Clock`) have official test doubles (`TestRandom`, `TestClock`) — seed the RNG or fast-forward time deterministically.
4. **HTTP / I/O** can be replaced with `Layer`-provided test clients that return fixed data.

**Rule**: If a test requires `jest.mock()` or `sinon.stub()`, the design is wrong. The dependency should be in the `R` channel instead.

## Layer 1: Pure Functions (zero setup)

These are synchronous, deterministic functions with no `Effect` return type. Test them directly with plain assertions.

### `packages/shared/src/engine/board.ts` — 12 functions

```
Test board (9×9):
  5 3 0 | 0 7 0 | 0 0 0
  6 0 0 | 1 9 5 | 0 0 0
  0 9 8 | 0 0 0 | 0 6 0
  ──────┼───────┼──────
  8 0 0 | 0 6 0 | 0 0 3
  4 0 0 | 8 0 3 | 0 0 1
  7 0 0 | 0 2 0 | 0 0 6
  ──────┼───────┼──────
  0 6 0 | 0 0 0 | 2 8 0
  0 0 0 | 4 1 9 | 0 0 5
  0 0 0 | 0 8 0 | 0 7 9
```

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `getRow` returns row 0 | `board, 0` | `[5,3,0,0,7,0,0,0,0]` | Row access — any board operation starts here |
| `getCol` returns column 0 | `board, 0` | `[5,6,0,8,4,7,0,0,0]` | Column access — validation, rendering |
| `getBox` returns box (0,0) — top-left | `board, 0, 0` | `[5,3,0,6,0,0,0,9,8]` | Box access — validation, rendering |
| `getBox` returns box (2,2) — bottom-right | `board, 6, 6` | `[2,8,0,0,0,5,0,7,9]` | Box coordinate math for the last box |
| `isValidPlacement` — number already in row | `board, 0, 2, 5` | `false` | Row conflict: row 0 already has 5 at col 0 |
| `isValidPlacement` — number already in col | `board, 0, 2, 6` | `false` | Col conflict: col 2 already has 0 at row 1 (wait — 0 is empty). Use col 2 with value 3: col 2 = `[0,0,8,0,0,0,0,0,0]`, so value 8 → false. |
| `isValidPlacement` — number already in box | `board, 0, 2, 8` | `false` | Box (0,0) already has 8 at (2,2) |
| `isValidPlacement` — legal placement | `board, 0, 2, 1` | `true` | No 1 in row 0, col 2, or box (0,0) |
| `isValidPlacement` — self-collision avoidance | `board, 0, 0, 5` (cell already has 5) | `true` | Placement clears candidate cell before checking — a cell is never "conflicting with itself" |
| `isValidPlacement` — value 0 is always legal | `board, 0, 0, 0` | `true` | Zero = empty = always valid |
| `setCell` returns new board with updated cell | `board, 0, 0, 9` | `board[0][0] === 9` | Immutable update: original board unchanged, new board has value |
| `setCell` does not mutate original | `board, 0, 0, 9` | original `board[0][0]` still `5` | FP immutability contract — callers rely on this |
| `isBoardSolved` — exact match | `board, board` | `false` (board is incomplete) | Completion detection |
| `isBoardSolved` — full match vs. solution | `solution, solution` | `true` | A full board matching the solution is solved |
| `isBoardSolved` — mismatch | `board, solution` where board has one wrong cell | `false` | Single wrong cell = unsolved |
| `isBoardFull` — incomplete board | `board` | `false` | Board has zeros |
| `isBoardFull` — full board | `fullBoard` (no zeros) | `true` | All cells filled |
| `countEmptyCells` — count zeros | `board` | `55` (81 - 26 given) | Cell removal counting |
| `difficultyToRemoveCount` — easy | `"easy"` | `35` | Easy = 35 removals |
| `difficultyToRemoveCount` — expert | `"expert"` | `58` | Expert = 58 removals |
| `copyBoard` — deep clone is independent | `board` | `copy[0][0] = 99` does not affect `board[0][0]` | Mutation isolation |
| `findConflicts` — board with duplicate in row | board: `[5,3,0,...]` and row has two 5s | includes `(0, 0)`, `(0, ...)` | Conflict highlighting |
| `findConflicts` — no conflicts on valid board | valid partial board | `[]` | Empty = no conflicts |

### `packages/shared/src/engine/solver.ts` — 5 exported + 4 internal functions

```
Test board (the same standard puzzle):
  5 3 0 | 0 7 0 | 0 0 0
  6 0 0 | 1 9 5 | 0 0 0
  0 9 8 | 0 0 0 | 0 6 0
  8 0 0 | 0 6 0 | 0 0 3
  4 0 0 | 8 0 3 | 0 0 1
  7 0 0 | 0 2 0 | 0 0 6
  0 6 0 | 0 0 0 | 2 8 0
  0 0 0 | 4 1 9 | 0 0 5
  0 0 0 | 0 8 0 | 0 7 9
```

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `findEmpty` — board has empty cells | test board | `Option.some([0, 2])` | First zero is at row 0, col 2 |
| `findEmpty` — full board | `fullBoard` (no zeros) | `Option.none()` | No empty cells = base case for solver |
| `isSafe` — number safe in empty cell | `board, 0, 2, 1` | `true` | No 1 in row 0, col 2, or box (0,0) |
| `isSafe` — number conflicts with row | `board, 0, 2, 5` | `false` | Row 0 already has 5 at col 0 |
| `isSafe` — number conflicts with col | `board, 0, 2, 6` | `false` | Col 2 has 0 at row 2, 8 at row 2 — actually let's check: col 2 = [0,0,8,...]. So no conflict with 6. Use `board, 0, 2, 8` → false (col 2 has 8) |
| `isSafe` — number conflicts with box | `board, 2, 2, 8` | `false` | Box (0,0) already has 8 at (2,2) |
| `solve` — valid puzzle returns solved board | test board | `Option.some(board)` where every cell is 1-9 | Backtracking finds the unique solution |
| `solve` — unsolvable board returns None | board with a single conflicting cell forced | `Option.none()` | Algorithm terminates and reports impossibility |
| `solve` — does not mutate input | test board | After `solve`, input board is unchanged | Immutability contract |
| `hasUniqueSolution` — valid puzzle returns true | test board (known unique) | `true` | Puzzle quality gate |
| `hasUniqueSolution` — ambiguous puzzle returns false | board with only 2-3 givens | `false` | `countSolutionsUntilTwo` short-circuits at 2 |
| `hasUniqueSolution` — empty board returns false | all-zero board | `false` | Empty board has many solutions |
| `hasUniqueSolution` — full board returns true | completed valid board | `true` | Single completed state = trivially unique |
| `isValidBoardFast` — valid board passes | valid board | `true` | Fast validation |
| `isValidBoardFast` — invalid row | board with duplicate in a row | `false` | Row-level rejection |
| `isValidBoardFast` — invalid col | board with duplicate in a column | `false` | Col-level rejection |
| `isValidBoardFast` — invalid box | board with duplicate in a 3×3 | `false` | Box-level rejection |

### `packages/client/src/state.ts` — 6 state transition functions

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `setGame` transitions to "playing" with reset state | initial state + valid args | `phase === "playing"`, `cursor === {row:0,col:0}`, `movesCount === 0` | Game start — all fields reset |
| `setGame` sets board, givenMask, difficulty | initial state + args | exact field values | Data flow into state |
| `updateBoard` increments movesCount | state with `movesCount=5` + valid args | `movesCount === 6` | Each move advances counter |
| `updateBoard` sets conflict at correct coordinate | state + conflict `{row:2,col:3,isConflict:true}` | `conflicts[2][3] === true` | FP conflict update — regression-proofs the `!` fix |
| `updateBoard` clears conflict at coordinate | state + conflict `{row:2,col:3,isConflict:false}` | `conflicts[2][3] === false` | Conflict removal |
| `updateBoard` sets phase to "completed" when solved | state + `solved=true` | `phase === "completed"` | Win transition |
| `updateBoard` preserves phase when not solved | state + `solved=false` | `phase` unchanged | No accidental completion |
| `updateBoard` does not mutate input state | state + valid args | original `state.board` unchanged | Immutability contract |
| `moveCursor` moves right | state with cursor at `(4,4)`, `dCol=1` | `cursor === {row:4,col:5}` | Right arrow |
| `moveCursor` clamps at 8 | state with cursor at `(4,8)`, `dCol=1` | `cursor === {row:4,col:8}` | Right edge |
| `moveCursor` clamps at 0 | state with cursor at `(4,0)`, `dCol=-1` | `cursor === {row:4,col:0}` | Left edge |
| `moveCursor` moves up | state with cursor at `(4,4)`, `dRow=-1` | `cursor === {row:3,col:4}` | Up arrow |
| `quit` sets phase to "quit" | any state | `phase === "quit"` | Exit transition |
| `showMessage` sets message | state + "Hello" | `message === "Hello"` | Message display |
| `setConnecting` sets phase to "connecting" | any state | `phase === "connecting"` | Connection state |

---

## Layer 2: Effectful with Controllable Dependencies

These functions return `Effect<T, E, R>` where `R` includes `Random` or `Clock`. In tests, provide `TestRandom` / `TestClock` via `Layer`.

### `packages/shared/src/engine/generator.ts`

**Approach**: `TestRandom` from `effect-testing` (not yet installed). Inject a seeded RNG so shuffle order is deterministic across runs.

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `fillDiagonalBoxes` produces 3 valid 3×3 boxes | nothing (pure effect) | Each box contains 1-9 with no duplicates | Diagonal generation is the first step — if this is wrong, everything fails |
| `fillDiagonalBoxes` returns 9×9 board | nothing | `board.length === 9`, each row `length === 9` | Structural invariant |
| `fillRemainingCells` fills a completely empty diagonal | board with only diagonal boxes filled | `Option.some(board)` where board has no zeros | Backtracking completes the board |
| `fillRemainingCells` returns None on impossible board | board with conflicting diagonal | `Option.none()` | Backtracking fails gracefully |
| `generate` removes correct number of cells per difficulty | `"easy"` | Puzzle has exactly 35 zeros | Difficulty-based removal |
| `generate` returns both puzzle and solution | `"easy"` | `solution` is a valid complete board, `puzzle` is a subset | Generation contract |
| `generateWithUniqueSolution` returns unique puzzle | `"medium"` | `hasUniqueSolution(result.puzzle) === true` | Quality gate — retries until unique |
| `generateWithUniqueSolution` eventually succeeds | `"expert"` | Always returns a result (not infinite loop) | Termination — retry recursion terminates |
| `buildGivenMask` marks non-zero cells | puzzle | `mask[r][c] === (puzzle[r][c] !== 0)` | Given-cell marking for render |

### `packages/server/src/services/game-store.ts`

**Approach**: Create store instance directly in test (no Layer needed — call `Effect.runPromise(makeGameStore)`), then exercise methods.

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `create` returns a non-empty string ID | difficulty, board, solution, givenMask | `typeof id === "string" && id.length > 0` | Game session identity |
| `create` stores retrievable session | same args | `get(id)` returns session with matching fields | Read-after-write |
| `create` generates different IDs for consecutive calls | 2 calls | `id1 !== id2` | No collisions |
| `get` fails for non-existent ID | `"nonexistent"` | Effect fails with error | 404 routes depend on this |
| `update` applies patch to all fields | `id, { board: newBoard, movesCount: 3 }` | `get(id).movesCount === 3`, `board === newBoard` | Partial update |
| `update` is no-op for non-existent ID | `"nonexistent", { board }` | No error, no side effects | Defensive safety |
| `modify` atomically reads and writes | `id, (s) => [s.movesCount, { ...s, movesCount: s.movesCount + 1 }] as const` | Returns `s.movesCount`, then `get(id).movesCount === s.movesCount + 1` | Time-of-Check Time-of-Use (TOCTOU) fix — returns the OLD value before increment |
| `modify` pure callback receives the session | modified callback | callback receives exact session from store | Correct scope |
| `exists` returns true for existing game | after `create` | `true` | Route pre-checks |
| `exists` returns false for non-existing | no game created | `false` | Route pre-checks |
| Concurrent `modify` calls don't interleave | 10 concurrent increments via `Effect.all` | Final `movesCount === original + 10` | Linearizability under `SynchronizedRef` |

---

## Layer 3: Service Logic

### `packages/server/src/services/game-service.ts`

**Approach**: Provide a mock `GameStore` via `Layer.provideService(GameStore, mockStore)`. The mock store is a plain object implementing `GameStore` with in-memory `Map`.

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `createGame` decodes valid request and calls store.create | `{ difficulty: "easy" }` | Returns response with `id`, `board`, `givenMask`, `difficulty` | Schema decode + generation wiring |
| `createGame` fails on invalid request | `{}` | Effect fails with `ParseResult.ParseError` | Schema rejects missing field |
| `getGame` returns session with elapsed seconds | existing game ID | `elapsedSeconds >= 0` | Clock-based timing |
| `getGame` fails on non-existent ID | `"nonexistent"` | Effect fails | 404 routing |
| `submitMove` correct value updates board | valid row/col/value from solution | `response.valid === true`, `response.solved === false` | Happy path |
| `submitMove` incorrect value marks invalid | value != solution cell | `response.valid === false`, `response.message === "Incorrect value"` | Wrong guess feedback |
| `submitMove` rejects completed game | game with `status="completed"` | `response.valid === false`, `response.message === "Game is already completed"` | Status guard |
| `submitMove` rejects given cell | row/col where `givenMask[row][col] === true` | `response.valid === false`, `response.message === "Cannot change a given cell"` | Clue immutability |
| `submitMove` sets solved=true when board complete | fill all cells to match solution | `response.solved === true`, `response.message === "Puzzle solved!"` | Win detection |
| `submitMove` status is "completed" after solving | same | `store.get(id).status === "completed"` | Persisted completion |
| `submitMove` concurrent requests don't race | 2 concurrent moves (one correct, one wrong) | Both responses are valid (no lost updates) | TOCTOU (Time-of-Check Time-of-Use) regression |
| `hint` returns correct value from solution | valid row/col | `response.value === solution[row][col]` | Hint reveals correct answer |
| `hint` updates board in store | valid row/col | `store.get(id).board[row][col] === solution[row][col]` | Hint writes the value |
| `hint` increments hintsUsed | valid row/col | `store.get(id).hintsUsed === session.hintsUsed + 1` | Hint counter |
| `hint` returns solved=true when board complete | the hint fills the last empty cell | `response.solved === true` | Hint-triggered completion |
| `hint` response value is never > 9 | all valid row/col combos | `response.value >= 0 && response.value <= 9` | Regression: range was 0-8, fixed to 0-9 |

---

## Layer 4: I/O Boundaries

### `packages/client/src/api/game-api.ts`

**Approach**: Provide a test `HttpClient` using `@effect/platform`'s testing utilities, or wrap a simple fetch mock in a `Layer`.

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `createGame` sends POST to `/api/games` | `"easy"` | HTTP request was made to correct URL | URL construction |
| `createGame` decodes valid response | mock returns `{ id, board, givenMask, difficulty }` | Returns `CreateGameResponse` | Schema validation on happy path |
| `createGame` fails on malformed response | mock returns `{ bad: "data" }` | Effect fails with `ParseResult.ParseError` | Schema validation catches server errors |
| `createGame` fails on network error | mock throws | Effect fails with `HttpClientError` | Error channel typed correctly |
| `submitMove` sends POST with row/col/value body | valid args | HTTP request body contains `{ row, col, value }` | Request body shape |
| `submitMove` decodes `ValidateMoveResponse` | mock returns valid response | Returns typed response | Schema validation |
| `getHint` sends POST with correct URL | valid args | URL contains `/hints` | Endpoint routing |

### `packages/client/src/ui/input.ts`

**Approach**: `parseEscape` and `drainBuffer` are pure functions — test directly. `makeReadKey` can be integration-tested with a controlled stdin stream.

| Test | Input | Expected | Why |
|------|-------|----------|-----|
| `parseEscape(0x41)` returns up | ESC[ A | `Option.some({ kind: "up" })` | Up arrow ANSI |
| `parseEscape(0x42)` returns down | ESC[ B | `Option.some({ kind: "down" })` | Down arrow ANSI |
| `parseEscape(0x43)` returns right | ESC[ C | `Option.some({ kind: "right" })` | Right arrow ANSI |
| `parseEscape(0x44)` returns left | ESC[ D | `Option.some({ kind: "left" })` | Left arrow ANSI |
| `parseEscape(0x99)` returns none | unknown byte | `Option.none()` | No crash on arbitrary bytes |
| `drainBuffer` parses arrow: `[ESC, CSI, 0x41]` | `Buffer([0x1b, 0x5b, 0x41])` | events=`[{kind:"up"}]`, pending=empty | Arrow sequence |
| `drainBuffer` parses number `1` | `Buffer([0x31])` | events=`[{kind:"number", value:1}]` | Number key |
| `drainBuffer` parses number `9` | `Buffer([0x39])` | events=`[{kind:"number", value:9}]` | Max number |
| `drainBuffer` parses `q` as quit | `Buffer([0x71])` | events=`[{kind:"quit"}]` | Quit key |
| `drainBuffer` parses `?` as hint | `Buffer([0x3f])` | events=`[{kind:"hint"}]` | Hint key |
| `drainBuffer` parses enter (0x0d) | `Buffer([0x0d])` | events=`[{kind:"enter"}]` | Enter key |
| `drainBuffer` parses erase (0x7f) | `Buffer([0x7f])` | events=`[{kind:"erase"}]` | Backspace |
| `drainBuffer` parses erase (0x08) | `Buffer([0x08])` | events=`[{kind:"erase"}]` | Delete |
| `drainBuffer` parses zero (0x30) as erase | `Buffer([0x30])` | events=`[{kind:"erase"}]` | 0 = erase |
| `drainBuffer` handles w/a/s/d as arrows | `Buffer([0x77, 0x61, 0x73, 0x64])` | events for up/left/down/right | Vim keys |
| `drainBuffer` handles partial escape sequence | `Buffer([0x1b, 0x5b])` (incomplete arrow) | events=empty, pending has the 2 bytes | Buffer splitting — next chunk completes the sequence |
| `drainBuffer` handles complete then partial | `Buffer([0x1b, 0x5b, 0x41, 0x1b])` (up arrow + start of next) | events=`[{kind:"up"}]`, pending=`Buffer([0x1b])` | Chunk boundary crossing |
| `drainBuffer` does not mutate input | any buf | Original buffer unchanged | Pure function contract |
| `makeReadKey` returns {readKey, restoreStdin} | nothing | object with both fields, `readKey` is Effect | Queue setup |
| `restoreStdin` is idempotent | call twice | No crash | Cleanup safety — called via `Effect.ensuring` |

---

## Layer 5: Schema Validation

### `packages/shared/src/schemas/*.ts`

**Approach**: Use `Schema.decodeUnknown`/`Schema.decodeUnknownEither` directly — no effects needed. These are pure validation functions.

| Test | Schema | Input | Expected | Why |
|------|--------|-------|----------|-----|
| `DifficultySchema` accepts "easy" | Difficulty | `"easy"` | `Either.right("easy")` | Valid literal |
| `DifficultySchema` rejects "impossible" | Difficulty | `"impossible"` | `Either.left(ParseError)` | Unknown literal |
| `CellValueSchema` accepts 0 | CellValue | `0` | `Either.right(0)` | Empty cell |
| `CellValueSchema` accepts 9 | CellValue | `9` | `Either.right(9)` | Max valid value |
| `CellValueSchema` rejects -1 | CellValue | `-1` | `Either.left(ParseError)` | Out of range |
| `CellValueSchema` rejects 10 | CellValue | `10` | `Either.left(ParseError)` | Above max |
| `CoordSchema` accepts {row:0, col:0} | Coord | `{row:0, col:0}` | `Either.right(...)` | Min valid |
| `CoordSchema` rejects {row:-1, col:0} | Coord | `{row:-1, col:0}` | `Either.left(ParseError)` | Negative row |
| `CreateGameRequestSchema` accepts valid | CreateGameRequest | `{difficulty:"easy"}` | `Either.right(...)` | Happy path |
| `CreateGameRequestSchema` rejects empty | CreateGameRequest | `{}` | `Either.left(ParseError)` | Missing field |
| `SubmitMoveRequestSchema` accepts valid | SubmitMoveRequest | `{row:4, col:4, value:5}` | `Either.right(...)` | Happy path |
| `SubmitMoveRequestSchema` rejects value=10 | SubmitMoveRequest | `{row:0, col:0, value:10}` | `Either.left(ParseError)` | CellValue range applies |
| **`HintResponseSchema` accepts value=9** | HintResponse | `{row:0, col:0, value:9, board, solved:false, message:"hint"}` | `Either.right(...)` | **Regression: was broken before between(0,9) fix** |
| `HintResponseSchema` rejects value=-1 | HintResponse | same but value=-1 | `Either.left(ParseError)` | Range enforcement |
| `BoardSchema` accepts 9×9 array | Board | 9 rows × 9 cols of valid values | `Either.right(...)` | Valid board |
| `BoardSchema` rejects 8×9 array | Board | only 8 rows | `Either.left(ParseError)` | minItems failure |
| `GameStateResponseSchema` accepts valid | GameStateResponse | full object with all fields | `Either.right(...)` | Full response shape |
| `ValidateMoveResponseSchema` accepts valid | ValidateMoveResponse | `{valid:true, message:"ok", solved:false, board}` | `Either.right(...)` | Move response |

---

## Layer 6: Integration / E2E

**Approach**: Spin up the full server in-process via `Layer`, use `@effect/platform`'s test HTTP client to send real requests.

| Test | What happens | Assertions | Why |
|------|-------------|------------|-----|
| Create game → verify game state | `POST /api/games` with difficulty, then `GET /api/games/:id` | Response status 201, game has board/givenMask/status/difficulty | Full creation flow |
| Submit move → verify updated board | `POST /api/games/:id/moves` with valid row/col/value | Board cell updated, movesCount incremented | Full move flow |
| Request hint → verify board updated | `POST /api/games/:id/hints` with valid row/col | Cell filled with correct value, hintsUsed incremented | Full hint flow |
| Complete puzzle → status is "completed" | Fill all remaining cells correctly | Status changes to "completed" | End-to-end win flow |
| Invalid game ID → 404 | `GET /api/games/nonexistent` | Response status 404 | Error routing |
| Invalid move body → parse error | `POST /api/games/:id/moves` with `{}` | Response status 400 or error | Schema validation at HTTP boundary |
| Two concurrent moves → no lost writes | 20 parallel moves, each incrementing a counter cell | Final board contains all 20 values | TOCTOU (Time-of-Check Time-of-Use) at HTTP level |
| `createGame` returns correct response shape | POST with "hard" | Response matches `CreateGameResponseSchema` | Server-client contract |
| `submitMove` response matches schema | POST valid move | Response matches `ValidateMoveResponseSchema` | Schema contract |
| `hint` response matches schema | POST hint request | Response matches `HintResponseSchema` | Schema contract |

---

## Test Runner: vitest

**Recommended runner**: **vitest** — ESM-native, TS-native, parallel by default, no config needed for this project.

### Why vitest over jest

| Feature | vitest | jest |
|---------|--------|------|
| ESM support | Native | Requires `transform` hacks |
| TypeScript | Built-in (esbuild) | Requires `ts-jest` |
| Parallel by default | Yes | No |
| effect-ts compatible | Yes (understands `effect/` subpath exports) | Requires module resolution hacks |
| Config file | Optional (can use tsconfig) | Required |

### Setup (one-time)

```bash
# Install in the workspace root (shared dev dependency across packages)
pnpm add -D -w vitest
```

Then for each package that has tests, add a `vitest.config.ts`:

```typescript
// packages/shared/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

And add a `test` script to each `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## Implementation Order

| Phase | Tests | Effort | Value |
|-------|-------|--------|-------|
| **1** | Layer 5 (schemas) — ~20 tests | Low | Catch schema regressions, validate the between(0,9) fix |
| **2** | Layer 1 (pure functions) — ~50 tests | Low | Document and verify all core logic — no mocking needed |
| **3** | Layer 2 (effectful, controllable deps) — ~20 tests | Medium | `TestRandom`/`TestClock` are straightforward once installed |
| **4** | Layer 3 (service) — ~15 tests | Medium | Mock store pattern is reusable across all service tests |
| **5** | Layer 4 (I/O boundaries) — ~20 tests | Medium-High | HTTP/stdin mocking needs test doubles |
| **6** | Layer 6 (E2E) — ~8 tests | High | Full server spin-up — slowest, most brittle |

**Phase 1+2** (70 tests) are the highest ROI — they cover 100% of the pure logic with zero mocking, zero setup, zero dependencies.
