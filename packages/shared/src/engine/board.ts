import { Array } from "effect";
import type { Board, Coord, CellValue, Difficulty } from "../schemas/game.js";

const BOX_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 3],
  [3, 6],
  [6, 9],
];

export function getRow(board: Board, row: number): Board[number] {
  return board[row] ?? [];
}

export function getCol(board: Board, col: number): CellValue[] {
  const result: CellValue[] = [];
  for (let r = 0; r < 9; r++) {
    const row = board[r];
    if (row) result.push(row[col] ?? 0);
  }
  return result;
}

export function getBox(board: Board, row: number, col: number): CellValue[] {
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const result: CellValue[] = [];
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      const rowData = board[r];
      if (rowData) result.push(rowData[c] ?? 0);
    }
  }
  return result;
}

export function isValidPlacement(
  board: Board,
  row: number,
  col: number,
  value: CellValue,
): boolean {
  if (value === 0) return true;
  const rowVals = getRow(board, row);
  if (
    rowVals.filter((v) => v === value).length >=
    (rowVals[row] === value ? 2 : 1)
  ) {
    return false;
  }
  const colVals = getCol(board, col);
  if (
    colVals.filter((v) => v === value).length >=
    (board[row]?.[col] === value ? 2 : 1)
  ) {
    return false;
  }
  const boxVals = getBox(board, row, col);
  if (
    boxVals.filter((v) => v === value).length >=
    (board[row]?.[col] === value ? 2 : 1)
  ) {
    return false;
  }
  return true;
}

export function isBoardValid(board: Board): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board[r]?.[c] ?? 0;
      if (val !== 0) {
        const copy = board.map((row) => [...row]) as Board;
        const copyRow = copy[r];
        if (copyRow) copyRow[c] = 0;
        if (!isValidPlacement(copy, r, c, val as CellValue)) {
          return false;
        }
      }
    }
  }
  return true;
}

export function isBoardFull(board: Board): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if ((board[r]?.[c] ?? 0) === 0) return false;
    }
  }
  return true;
}

export function countEmptyCells(board: Board): number {
  let count = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if ((board[r]?.[c] ?? 0) === 0) count++;
    }
  }
  return count;
}

export function copyBoard(board: Board): Board {
  return board.map((row) => [...row]) as Board;
}

export function setCell(
  board: Board,
  row: number,
  col: number,
  value: CellValue,
): Board {
  const copy = copyBoard(board);
  const rowData = copy[row];
  if (rowData) rowData[col] = value;
  return copy;
}

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

export function findConflicts(board: Board): Array<[number, number]> {
  const conflicts: Array<[number, number]> = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board[r]?.[c] ?? 0;
      if (val !== 0) {
        const copy = copyBoard(board);
        const rowData = copy[r];
        if (rowData) rowData[c] = 0;
        if (!isValidPlacement(copy as Board, r, c, val as CellValue)) {
          conflicts.push([r, c]);
        }
      }
    }
  }
  return conflicts;
}
