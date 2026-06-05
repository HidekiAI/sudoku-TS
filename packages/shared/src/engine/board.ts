import { Array } from "effect";
import type { Board, CellValue, Difficulty } from "../schemas/game.js";

export function getRow(board: Board, row: number): Board[number] {
  return board[row] ?? [];
}

export function getCol(board: Board, col: number): CellValue[] {
  return Array.map(board, (row) => row[col] ?? 0);
}

export function getBox(board: Board, row: number, col: number): CellValue[] {
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  return Array.flatMap(
    Array.makeBy(3, (i) => boxRow + i),
    (r) => Array.makeBy(3, (j) => board[r]?.[boxCol + j] ?? 0),
  );
}

function appearsOnce(values: CellValue[], value: CellValue): boolean {
  return values.filter((v) => v === value).length <= 1;
}

export function isValidPlacement(
  board: Board,
  row: number,
  col: number,
  value: CellValue,
): boolean {
  if (value === 0) return true;
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

export function isBoardValid(board: Board): boolean {
  return board.every((row, r) =>
    row.every(
      (val, c) => val === 0 || isValidPlacement(board, r, c, val as CellValue),
    ),
  );
}

export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell !== 0));
}

export function isBoardSolved(board: Board, solution: Board): boolean {
  return board.every((row, r) =>
    row.every((cell, c) => cell === solution[r]?.[c]),
  );
}

export function countEmptyCells(board: Board): number {
  return Array.reduce(
    board,
    0,
    (acc, row) =>
      acc + Array.reduce(row, 0, (acc2, cell) => acc2 + (cell === 0 ? 1 : 0)),
  );
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
  return board.map((r, ri) =>
    ri === row
      ? r.map((c, ci) => (ci === col ? value : c))
      : ([...r] as Board[number]),
  ) as Board;
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
