import { Array, Option } from "effect";
import type { Board, CellValue } from "../schemas/game.js";

function hasNoConflicts(values: CellValue[]): boolean {
  const filtered = values.filter((v) => v !== 0);
  return new Set(filtered).size === filtered.length;
}

export function isValidBoardFast(board: Board): boolean {
  const rowsOk = Array.every(board, (row) => hasNoConflicts(row));
  const colsOk = Array.every(
    Array.makeBy(9, (c) => Array.map(board, (row) => row[c] ?? 0)),
    hasNoConflicts,
  );
  const boxesOk = Array.every(
    Array.flatMap(
      Array.makeBy(3, (br) =>
        Array.makeBy(3, (bc) => [br, bc] as [number, number]),
      ),
      (pair) => pair,
    ),
    ([br, bc]) =>
      hasNoConflicts(
        Array.flatMap(
          Array.makeBy(3, (r) => br * 3 + r),
          (r) => Array.makeBy(3, (c) => board[r]?.[bc * 3 + c] ?? 0),
        ),
      ),
  );
  return rowsOk && colsOk && boxesOk;
}

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

export function isSafe(
  board: Board,
  row: number,
  col: number,
  num: CellValue,
): boolean {
  const rowSafe = Array.every(
    Array.makeBy(9, (c) => board[row]?.[c]),
    (v) => v !== num,
  );
  const colSafe = Array.every(
    Array.makeBy(9, (r) => board[r]?.[col]),
    (v) => v !== num,
  );
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const boxSafe = Array.every(
    Array.flatMap(
      Array.makeBy(3, (r) => boxRow + r),
      (r) => Array.makeBy(3, (c) => board[r]?.[boxCol + c] ?? 0),
    ),
    (v) => v !== num,
  );
  return rowSafe && colSafe && boxSafe;
}

function setCellPure(
  board: Board,
  row: number,
  col: number,
  value: CellValue,
): Board {
  return board.map((r, ri) =>
    ri === row ? r.map((c, ci) => (ci === col ? value : c)) : r,
  ) as Board;
}

function solveInternal(board: Board): Option.Option<Board> {
  const empty = findEmpty(board);
  if (Option.isNone(empty)) return Option.some(board);
  const [row, col] = empty.value;
  const tryNum = (num: number): Option.Option<Board> => {
    if (num > 9) return Option.none();
    if (isSafe(board, row, col, num as CellValue)) {
      const next = setCellPure(board, row, col, num as CellValue);
      const result = solveInternal(next);
      if (Option.isSome(result)) return result;
    }
    return tryNum(num + 1);
  };
  return tryNum(1);
}

export function solve(board: Board): Option.Option<Board> {
  return solveInternal(board.map((row) => [...row]) as Board);
}

function countSolutionsUntilTwo(board: Board): 0 | 1 | 2 {
  const empty = findEmpty(board);
  if (Option.isNone(empty)) return 1 as const;
  const [row, col] = empty.value;
  let found = 0 as 0 | 1 | 2;
  for (let num = 1; num <= 9; num++) {
    if (!isSafe(board, row, col, num as CellValue)) continue;
    const next = setCellPure(board, row, col, num as CellValue);
    found = (found + countSolutionsUntilTwo(next)) as 0 | 1 | 2;
    if (found >= 2) return 2 as const;
  }
  return found;
}

// Fix: Redundant `as Board` — `board` is already typed Board from signature.
// The cast adds zero type safety while suppressing valid compiler checks.
export function hasUniqueSolution(board: Board): boolean {
  return countSolutionsUntilTwo(board) === 1;
}
