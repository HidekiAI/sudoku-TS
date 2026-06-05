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
  return Option.fromNullable(
    board
      .flatMap((row, r) =>
        row.map((cell, c) =>
          cell === 0 ? ([r, c] as [number, number]) : null,
        ),
      )
      .find((x) => x !== null) ?? undefined,
  );
}

export function isSafe(
  board: Board,
  row: number,
  col: number,
  num: CellValue,
): boolean {
  for (let c = 0; c < 9; c++) {
    if (board[row]?.[c] === num) return false;
  }
  for (let r = 0; r < 9; r++) {
    if (board[r]?.[col] === num) return false;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (board[r]?.[c] === num) return false;
    }
  }
  return true;
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
  if (Option.isNone(empty)) {
    return Option.some(board);
  }
  const [row, col] = empty.value;
  for (let num = 1; num <= 9; num++) {
    if (isSafe(board, row, col, num as CellValue)) {
      const next = setCellPure(board, row, col, num as CellValue);
      const result = solveInternal(next);
      if (Option.isSome(result)) return result;
    }
  }
  return Option.none();
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

export function hasUniqueSolution(board: Board): boolean {
  return countSolutionsUntilTwo(board as Board) === 1;
}
