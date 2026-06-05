import { Option } from "effect";
import type { Board, CellValue } from "../schemas/game.js";
import { copyBoard } from "./board.js";

function findEmpty(board: Board): Option.Option<[number, number]> {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if ((board[r]?.[c] ?? 0) === 0) {
        return Option.some([r, c]);
      }
    }
  }
  return Option.none();
}

function isSafe(
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

function solveInternal(board: Board): Option.Option<Board> {
  const empty = findEmpty(board);
  if (Option.isNone(empty)) {
    return Option.some(board);
  }
  const [row, col] = empty.value;
  for (let num = 1; num <= 9; num++) {
    if (isSafe(board, row, col, num as CellValue)) {
      const next = copyBoard(board);
      const rowData = next[row];
      if (rowData) rowData[col] = num as CellValue;
      const result = solveInternal(next);
      if (Option.isSome(result)) return result;
    }
  }
  return Option.none();
}

export function solve(board: Board): Option.Option<Board> {
  return solveInternal(copyBoard(board));
}

export function hasUniqueSolution(board: Board): boolean {
  let count = 0;
  function countSolutions(b: Board): void {
    if (count > 1) return;
    const empty = findEmpty(b);
    if (Option.isNone(empty)) {
      count++;
      return;
    }
    const [row, col] = empty.value;
    for (let num = 1; num <= 9; num++) {
      if (isSafe(b, row, col, num as CellValue)) {
        const next = copyBoard(b);
        const rowData = next[row];
        if (rowData) rowData[col] = num as CellValue;
        countSolutions(next);
        if (count > 1) return;
      }
    }
  }
  countSolutions(copyBoard(board));
  return count === 1;
}

export function isValidBoardFast(board: Board): boolean {
  for (let r = 0; r < 9; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < 9; c++) {
      const val = board[r]?.[c] ?? 0;
      if (val !== 0) {
        if (seen.has(val)) return false;
        seen.add(val);
      }
    }
  }
  for (let c = 0; c < 9; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < 9; r++) {
      const val = board[r]?.[c] ?? 0;
      if (val !== 0) {
        if (seen.has(val)) return false;
        seen.add(val);
      }
    }
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const seen = new Set<number>();
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
          const val = board[r]?.[c] ?? 0;
          if (val !== 0) {
            if (seen.has(val)) return false;
            seen.add(val);
          }
        }
      }
    }
  }
  return true;
}
