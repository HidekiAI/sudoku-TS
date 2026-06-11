import { Array } from "effect";
import type { Board, CellValue, Difficulty } from "../schemas/game.js";

// Rust: board[row] — direct index on [CellValue; 9] (always in-bounds at compile time).
// F#:  board.[row] — same direct index on CellValue array.
export function getRow(board: Board, row: number): Board[number] {
  // Safety: Callers always pass row 0-8; BoardSchema validates 9×9 shape.
  // `?? []` satisfies noUncheckedIndexedAccess — the fallback is never reached
  // in practice but avoids a non-null assertion.
  return board[row] ?? [];
}

// Rust: (0..9).map(|r| board[r][col]).collect::<Vec<_>>() — iterator adaptor.
// F#:  board |> Array.map (fun row -> row.[col]) — pipeline, same semantics.
export function getCol(board: Board, col: number): CellValue[] {
  // Safety: col is 0-8 (caller guarantee); 0 is "empty cell" sentinel — a no-op
  // in every validity check downstream (isValidPlacement returns true for 0).
  return Array.map(board, (row) => row[col] ?? 0);
}

// Rust: flat_map over (0..3) with nested map — iterator combinator chain.
// F#:  [ for i in 0..2 do for j in 0..2 do yield board[boxRow+i][boxCol+j] ]
//      — list comprehension (the most direct F# equivalent of flatMap+makeBy).
export function getBox(board: Board, row: number, col: number): CellValue[] {
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  // Safety: boxRow/boxCol derived from row/col (0-8), adding 0-2 stays in 0-8 range.
  // `?? 0` fallback is the empty-cell sentinel, a no-op in validity checks.
  return Array.flatMap(
    Array.makeBy(3, (i) => boxRow + i),
    (r) => Array.makeBy(3, (j) => board[r]?.[boxCol + j] ?? 0),
  );
}

// Rust: values.iter().filter(|&&v| v == value).count() <= 1 — Iterator::count.
// F#:  values |> Array.filter ((=) value) |> Array.length <= 1 — partial application
//      with (=) operator for predicate.
function appearsOnce(values: CellValue[], value: CellValue): boolean {
  return values.filter((v) => v === value).length <= 1;
}

// Rust: clear cell → check row/col/box each .all(|&v| v != value) — iterator combinators.
// F#:  zero out candidate cell, then Array.forall on row/col/box — pipeline with
//      partial application and function composition via |>.
export function isValidPlacement(
  board: Board,
  row: number,
  col: number,
  value: CellValue,
): boolean {
  if (value === 0) return true;
  // Safety: row/col are caller-guaranteed 0-8; `?? 0` satisfies the type
  // checker. value === 0 is already handled above, so the fallback 0 would
  // still produce correct validation via appearsOnce.
  const cellValue = board[row]?.[col] ?? 0;
  const rowVals = getRow(board, row).map((v, c) => (c === col ? 0 : v));
  const colVals = getCol(board, col).map((v, r) => (r === row ? 0 : v));
  const boxVals = getBox(board, row, col);
  return (
    appearsOnce(rowVals, value) &&
    appearsOnce(colVals, value) &&
    appearsOnce(boxVals, value)
  );
}

// Rust: board.iter().enumerate().all(|(r, row)| ...) — Iterator::all short-circuits.
// F#:  board |> Array.forall (fun row -> ...) — same short-circuit behavior.
export function isBoardValid(board: Board): boolean {
  return board.every((row, r) =>
    row.every(
      (val, c) => val === 0 || isValidPlacement(board, r, c, val as CellValue),
    ),
  );
}

// Rust: board.iter().all(|row| row.iter().all(|&c| c != 0)) — nested all().
// F#:  board |> Array.forall (Array.forall ((<>) 0)) — partial application with (<>).
export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell !== 0));
}

// Rust: board.iter().flatten().zip(solution.iter().flatten()).all(|(a, b)| a == b)
//      — iterator zip for pairwise comparison.
// F#:  (board, solution) ||> Array.forall2 (fun row s -> Array.forall2 (=) row s)
//      — Array.forall2 for parallel iteration over two arrays.
export function isBoardSolved(board: Board, solution: Board): boolean {
  return board.every((row, r) =>
    row.every((cell, c) => cell === solution[r]?.[c]),
  );
}

// Rust: board.iter().flat_map(|row| row.iter()).filter(|&&c| c == 0).count()
//      — flat_map + filter + count, all lazy.
// F#:  board |> Array.collect id |> Array.filter ((=) 0) |> Array.length
//      — collect + pipeline (strict, Array bounds known).
export function countEmptyCells(board: Board): number {
  return Array.reduce(
    board,
    0,
    (acc, row) =>
      acc + Array.reduce(row, 0, (acc2, cell) => acc2 + (cell === 0 ? 1 : 0)),
  );
}

// Rust: *board — [CellValue; 9] is Copy, so dereference produces an independent clone.
// F#:  Array.copy board — explicit, no implicit copy semantics.
export function copyBoard(board: Board): Board {
  return board.map((row) => [...row]) as Board;
}

// Rust: let mut next = *board; next[row][col] = value; next — copy then mutate local.
//      The mut is local-only; callers see an independent clone.
// F#:  board |> Array.mapi (fun ri r -> if ri = row then r |> Array.mapi ... else r)
//      — mapi with index conditional, same semantics as TS map.
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

// Rust: match expression — match difficulty { Difficulty::Easy => 35, ... }
// F#:  match difficulty with | Easy -> 35 | ... — same pattern, the origin of match.
export function difficultyToRemoveCount(difficulty: Difficulty): number {
  switch (difficulty) {
    case "easy":
      return 35;
    case "medium":
      return 45;
    case "hard":
      return 52;
    case "expert":
      return 58;
  }
}

// Rust: flat_map over board with enumerate, filter_map to collect conflicting coords.
//      Iterator::filter_map as a combined filter+map in one pass.
// F#:  board |> Array.mapi (fun r row -> row |> Array.mapi ...) |> Array.collect id
//      — nested mapi with index, then flatten.
export function findConflicts(board: Board): Array<[number, number]> {
  return Array.flatMap(board, (row, r) =>
    Array.flatMap(row, (val, c) => {
      if (val === 0) return [];
      const cleared = board.map((r2, ri) =>
        ri === r ? r2.map((c2, ci) => (ci === c ? 0 : c2)) : r2,
      ) as Board;
      return isValidPlacement(cleared, r, c, val as CellValue)
        ? []
        : [[r, c] as [number, number]];
    }),
  );
}
