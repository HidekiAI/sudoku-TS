# Puzzle Generation Design

> Covers how a completed 9×9 Sudoku is constructed from 3×3 boxes and how difficulty dictates which cells are removed.

## 1. Overview

Generation follows a **Fill → Remove → Verify** pipeline:

```
                 ┌─────────────────────────────────────┐
                 │       generateWithUniqueSolution     │
                 │         (retry if not unique)        │
                 │                                      │
                 │   ┌─────────────────────────────┐   │
                 │   │         generate            │   │
                 │   │                             │   │
                 │   │  fillDiagonalBoxes()        │   │
                 │   │       ↓                     │   │
                 │   │  fillRemainingCells()       │   │
                 │   │       ↓                     │   │
                 │   │  removeCells(difficulty)    │   │
                 │   │       ↓                     │   │
                 │   │  { puzzle, solution }       │   │
                 │   └─────────────────────────────┘   │
                 │              ↓                      │
                 │  hasUniqueSolution(puzzle)          │
                 │  ┌─── No ─── retry ───┐             │
                 │  │                    │             │
                 │  ▼ Yes                │             │
                 │  return               │             │
                 └─────────────────────────────────────┘
```

All randomness uses effect-ts `Random` (seeded, effect-managed) rather than `Math.random()`. All data structures are immutable.

---

## 2. Step 1 — Fill Diagonal 3×3 Boxes (`fillDiagonalBoxes`)

### Why diagonal?

The three diagonal boxes (top-left, center, bottom-right) do not share rows or columns with each other. This means they can be filled independently with no constraint checking — each box is a self-contained permutation of 1-9.

```
  ┌─────┬─────┬─────┐
  │ ███ │     │     │     Box (0,0): rows 0-2, cols 0-2
  │ ███ │     │     │     Box (1,1): rows 3-5, cols 3-5
  │ ███ │     │     │     Box (2,2): rows 6-8, cols 6-8
  ├─────┼─────┼─────┤
  │     │ ███ │     │
  │     │ ███ │     │
  │     │ ███ │     │
  ├─────┼─────┼─────┤
  │     │     │ ███ │
  │     │     │ ███ │
  │     │     │ ███ │
  └─────┴─────┴─────┘
```

### Algorithm

```
for each box in [0, 1, 2]:
  1. Generate Random.shuffle([1..9])
  2. For each cell (r, c) in the 3×3 box (row-major order):
       setCell(board, r, c, shuffled[i])
```

- **Complexity:** O(1) — exactly 81 cells set, 3 shuffles.
- **No constraint checking needed** because diagonal boxes are row/col independent.
- **Why shuffle?** Without it, every generated board would have identical top-left boxes. Shuffling ensures variety while preserving validity.

### Code location

`packages/shared/src/engine/generator.ts:8-28`

---

## 3. Step 2 — Fill Remaining Cells (`fillRemainingCells`)

Fills the off-diagonal cells using a recursive backtracking solver with random ordering.

### Why backtracking?

The remaining 54 cells (boxes (0,1), (0,2), (1,0), (1,2), (2,0), (2,1)) interact across rows and columns. No closed-form fill exists — a search is required.

### Algorithm

```
fillRemainingCells(board):
  1. Find the first empty cell (top-left to bottom-right scan)
  2. If no empty cells → return Some(board)   [base case: board is complete]
  3. Shuffle [1..9] for random trial order
  4. For each number in shuffled order:
       a. If isSafe(board, row, col, number):
            place number, recurse
            if recursive call returns Some → propagate result up
  5. No number worked → return None (backtrack)
```

### Key design choices

| Choice | Reason |
|--------|--------|
| **Find first empty** (not MRV heuristic) | Simplicity. For 9×9, the backtracking tree is small enough that advanced heuristics add no measurable benefit. |
| **Random shuffle per call** | Ensures different solutions across runs. Without shuffle, the solver always picks 1-9 in order, producing the same board every time. |
| **Effect<Option<Board>> return** | Pure representation of the search. `None` signals a dead end; `Some` propagates the completed board. No `null`, no `void`, no mutation. |
| **Shallow recursion** | Max depth = number of empty cells (≤ 81). Node.js default stack handles this comfortably. |

### isSafe constraint check

`isSafe` verifies three constraints in O(27) time:

1. **Row:** Check all 9 cells in the target row for a matching value
2. **Col:** Check all 9 cells in the target column for a matching value
3. **Box:** Check all 9 cells in the 3×3 box containing (row, col) for a matching value

```
isSafe(board, row, col, num):
  if any cell in board[row][0..8] === num    → false
  if any cell in board[0..8][col] === num    → false
  if any cell in box(row, col) === num       → false
  otherwise                                  → true
```

### Code location

- `fillRemainingCells`: `packages/shared/src/engine/generator.ts:30-45`
- `isSafe`: `packages/shared/src/engine/solver.ts:45-65`

---

## 4. Step 3 — Remove Cells by Difficulty

Once a complete valid solution exists, cells are removed to create the puzzle.

### Removal algorithm

```
removeCells(solution, difficulty):
  1. Create list of all 81 coordinates: [(0,0), (0,1), ..., (8,8)]
  2. Shuffle the list (random removal order)
  3. Take first N cells (where N = difficultyToRemoveCount(difficulty))
  4. Set each of those cells to 0 (empty)
  5. Return the resulting puzzle
```

- **Why shuffle?** Without it, the same cells (e.g., always the first N in row-major order) would be removed every time. Shuffling distributes removals across the board.

### Difficulty → cell removal counts

Defined in `board.ts:81-92`:

| Difficulty | Cells Removed | Given (Clues) | Fill Ratio |
|-----------|---------------|---------------|------------|
| Easy | 35 | 46 | 56.8% |
| Medium | 45 | 36 | 44.4% |
| Hard | 52 | 29 | 35.8% |
| Expert | 58 | 23 | 28.4% |

These values follow standard Sudoku conventions:

- **Easy (46 clues):** Comfortable for beginners. Minimal backtracking needed.
- **Medium (36 clues):** Moderate challenge. Some logical deduction required.
- **Hard (29 clues):** Requires advanced techniques (pairs, triples, X-wing).
- **Expert (23 clues):** Near the minimum for a unique solution (17 is the theoretical lower bound).

### Code location

- `difficultyToRemoveCount`: `packages/shared/src/engine/board.ts:81-92`
- Cell removal: `packages/shared/src/engine/generator.ts:55-67`

---

## 5. Step 4 — Unique Solution Verification (`hasUniqueSolution`)

### Why verify?

Removing cells can create ambiguity — multiple valid completions of the same puzzle. A proper Sudoku must have exactly one solution.

### Algorithm

```
countSolutionsUntilTwo(board):
  1. Find first empty cell
  2. If none → return 1 (one solution found)
  3. For each number 1-9:
       a. If isSafe, place number and recurse
       b. Accumulate count: found += recurse
       c. If found ≥ 2 → bail early (return 2)
  4. Return found (0, 1, or 2)

hasUniqueSolution(board):
  return countSolutionsUntilTwo(board) === 1
```

### Early exit optimization

The counter stops at **2**. Once a second solution is discovered, the function returns immediately without exploring the rest of the tree. This prevents worst-case O(9^n) exploration when the answer is "no".

### Retry loop

`generateWithUniqueSolution` wraps `generate`:

```
generateWithUniqueSolution(difficulty):
  loop:
    candidate = generate(difficulty)       // fill + remove
    if hasUniqueSolution(candidate.puzzle):
      return candidate                     // success
    // else retry with fresh randomness
```

This is a **randfix** approach: generate a new board if the previous one lacks a unique solution. For the removal counts above (≥23 given), the failure rate is low, so retries are rare.

### Code location

- `hasUniqueSolution` / `countSolutionsUntilTwo`: `packages/shared/src/engine/solver.ts:98-114`
- `generateWithUniqueSolution`: `packages/shared/src/engine/generator.ts:72-82`

---

## 6. Complete Generation Flow Diagram

```
generate(easy)
  │
  ├─ fillDiagonalBoxes()
  │    ├─ Random.shuffle → box(0,0): [3,7,1,9,4,2,8,6,5]
  │    ├─ Random.shuffle → box(1,1): [9,2,5,1,8,3,7,4,6]
  │    └─ Random.shuffle → box(2,2): [4,6,8,2,7,9,1,5,3]
  │
  ├─ fillRemainingCells(partial)
  │    ├─ findEmpty → (0,3)
  │    ├─ Random.shuffle → try [5,2,9,...]
  │    ├─ isSafe(0,3,5)? ✓ → recurse
  │    │    ├─ findEmpty → (0,4)
  │    │    ├─ Random.shuffle → try [1,8,...]
  │    │    └─ ...
  │    └─ return Option.some(completeSolution)
  │
  ├─ removeCells(solution, 35)
  │    ├─ shuffle all 81 coords
  │    ├─ take first 35 → [(7,2),(0,5),(3,8),...]
  │    ├─ set each to 0
  │    └─ return puzzle
  │
  ├─ hasUniqueSolution(puzzle)
  │    └─ countSolutionsUntilTwo → 1 ✓
  │
  └─ return { puzzle, solution }
        puzzle (with 35 empty cells)
        solution (complete, correct)
```

---

## 7. Effect Integration

Every random operation goes through effect-ts `Random` rather than `Math.random()`:

| Operation | effect-ts API | Why |
|-----------|--------------|-----|
| Shuffle numbers 1-9 | `Random.shuffle(NUMBERS)` | Deterministic under test seed |
| Shuffle cell coordinates | `Random.shuffle(allCells)` | Ensures varied removal patterns |
| Random trial order | `Random.shuffle(NUMBERS)` | Avoids biased solutions |

The entire pipeline is composed as `Effect`:

```
generateWithUniqueSolution(difficulty)
  → Effect<{ puzzle: Board; solution: Board }>
```

This means:
- **Seedable** via `Effect.provideService(Random.RandomService, ...)`
- **Composable** with other Effect workflows
- **No side effects** outside the Effect system

---

## 8. File Reference

| File | Relevant Lines | Purpose |
|------|---------------|---------|
| `packages/shared/src/engine/generator.ts` | 8-28 | `fillDiagonalBoxes` — independent 3×3 fill |
| | 30-45 | `fillRemainingCells` — backtracking solver |
| | 47-70 | `generate` — full pipeline orchestration |
| | 72-82 | `generateWithUniqueSolution` — uniqueness retry |
| | 84-86 | `buildGivenMask` — which cells are clues |
| `packages/shared/src/engine/solver.ts` | 45-65 | `isSafe` — row/col/box constraint check |
| | 98-114 | `countSolutionsUntilTwo` / `hasUniqueSolution` |
| `packages/shared/src/engine/board.ts` | 81-92 | `difficultyToRemoveCount` — per-difficulty counts |
| | 68-79 | `setCell` — immutable cell update |
