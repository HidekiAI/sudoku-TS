# Game Engine

> Pure functions in `packages/shared/src/engine/`.

## Solver (`solver.ts`)

**Algorithm:** Standard backtracking with constraint checking.

```
solve(board):
  1. Find first empty cell (value === 0)
  2. Try numbers 1-9
  3. For each number, check row/col/box constraints
  4. If safe, place and recurse
  5. If recursive call succeeds, return solved board
  6. Otherwise backtrack (reset to 0) and try next number
  7. If no number works, puzzle is unsolvable → return None
```

**Complexity:** O(9^n) worst case, but constraint pruning makes practical cases fast (<10ms for 9×9).

**Functions:**
- `solve(board) → Option<Board>` — find first solution
- `hasUniqueSolution(board) → boolean` — count solutions, stop at 2
- `isValidBoardFast(board) → boolean` — row/col/box set check (no solver needed)

## Generator (`generator.ts`)

**Strategy:** Fill → Remove

### Step 1: Generate complete board

```
1. Fill 3 diagonal 3×3 boxes with shuffled numbers (each box is independent)
2. Solve remaining cells with a deterministic fill
3. Result is a valid, complete Sudoku solution
```

### Step 2: Remove cells by difficulty

| Difficulty | Cells Removed | Given Cells |
|-----------|---------------|-------------|
| Easy      | 35            | 46          |
| Medium    | 45            | 36          |
| Hard      | 52            | 29          |
| Expert    | 58            | 23          |

```
1. Shuffle all 81 cell coordinates
2. Remove cells one by one until target count reached
3. Optionally verify unique solution (expert mode)
```

**Generation uses Effect** because `shuffleArray` requires randomness:
```
Effect.gen(function*(_) {
  const partial = yield* fillDiagonalBoxes()
  const solution = yield* fillRemainingCells(partial)
  const puzzle = yield* removeCells(solution, difficulty)
  return { puzzle, solution }
})
```

## Board Utilities (`board.ts`)

**Functions:**

| Function | Description |
|----------|-------------|
| `getRow(board, row)` | Extract row as array |
| `getCol(board, col)` | Extract column as array |
| `getBox(board, row, col)` | Extract 3×3 box as array |
| `isValidPlacement(board, row, col, value)` | Check row/col/box constraints |
| `isBoardValid(board)` | Full board validity check |
| `isBoardFull(board)` | No empty cells remaining |
| `countEmptyCells(board)` | Count zeros |
| `copyBoard(board)` | Deep clone |
| `setCell(board, row, col, value)` | Immutable cell set (returns new board) |
| `findConflicts(board)` | Return list of conflicting cell coordinates |
