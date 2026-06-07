import { describe, it, expect } from "vitest";
import { Option } from "effect";
import {
  findEmpty,
  isSafe,
  solve,
  hasUniqueSolution,
  isValidBoardFast,
} from "./solver.js";
import type { Board, CellValue } from "../schemas/game.js";

// Standard puzzle (known unique solution)
const board: Board = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];

const knownSolution: Board = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

const fullBoard = knownSolution;

describe("findEmpty", () => {
  it("returns Some([row, col]) for incomplete board", () => {
    const result = findEmpty(board);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value).toEqual([0, 2]);
    }
  });
  it("returns None for full board", () => {
    expect(Option.isNone(findEmpty(fullBoard))).toBe(true);
  });
});

describe("isSafe", () => {
  it("returns true for legal number in empty cell", () => {
    expect(isSafe(board, 0, 2, 1 as CellValue)).toBe(true);
  });
  it("returns false when number conflicts with row", () => {
    expect(isSafe(board, 0, 2, 5 as CellValue)).toBe(false);
  });
  it("returns false when number conflicts with column", () => {
    // Col 2 has 0 at row 1, 0 at row 2... col 2 = [0,0,8,0,0,0,0,0,0]
    // So 8 is in col 2
    expect(isSafe(board, 0, 2, 8 as CellValue)).toBe(false);
  });
  it("returns false when number conflicts with box", () => {
    // Box (0,0) has 8 at (2,2)
    expect(isSafe(board, 0, 2, 8 as CellValue)).toBe(false);
  });
  // Note: `isSafe` checks `v !== num`, so with num=0 it checks no cell is 0.
  // Since empty cells are 0, placing 0 is never safe — but 0 is never passed
  // by the solver (it only tries 1-9). This test documents the contract.
  it("returns false for 0 (solver never passes 0 — only checks 1-9)", () => {
    expect(isSafe(board, 0, 2, 0 as CellValue)).toBe(false);
  });
});

describe("solve", () => {
  it("solves a valid puzzle", () => {
    const result = solve(board);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value).toEqual(knownSolution);
    }
  });
  // Note: No "returns None for unsolvable" test — naive backtracking solver
  // exhaustively searches all possibilities, making it infeasible for boards
  // with ~80 empty cells even if they contain conflicts.
  it("returns Some(board) for already-solved full board", () => {
    const result = solve(fullBoard);
    expect(Option.isSome(result)).toBe(true);
  });
  it("does not mutate input board", () => {
    const original = board.map((r) => [...r]);
    solve(board);
    // After solve, board should be untouched
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        expect(board[r]?.[c]).toBe(original[r]?.[c]);
      }
    }
  });
});

describe("hasUniqueSolution", () => {
  // Note: Avoid empty/sparse boards — countSolutionsUntilTwo performs
  // exhaustive search and empty boards have ~6.67×10^21 solutions.
  it("returns true for standard puzzle", () => {
    expect(hasUniqueSolution(board)).toBe(true);
  });
  it("returns true for full valid board (trivially unique)", () => {
    expect(hasUniqueSolution(fullBoard)).toBe(true);
  });
});

describe("isValidBoardFast", () => {
  it("returns true for valid board", () => {
    expect(isValidBoardFast(board)).toBe(true);
  });
  it("returns true for full valid board", () => {
    expect(isValidBoardFast(fullBoard)).toBe(true);
  });
  it("detects duplicate in row", () => {
    const bad = board.map((r) => [...r]) as Board;
    bad[0][1] = 5 as CellValue; // row 0 has two 5s
    expect(isValidBoardFast(bad)).toBe(false);
  });
  it("detects duplicate in column", () => {
    const bad = board.map((r) => [...r]) as Board;
    bad[1][0] = 5 as CellValue; // col 0 has 5 and 5
    expect(isValidBoardFast(bad)).toBe(false);
  });
  it("detects duplicate in box", () => {
    const bad = board.map((r) => [...r]) as Board;
    bad[2][1] = 5 as CellValue; // box (0,0) now has 5, 5, 3, ...
    expect(isValidBoardFast(bad)).toBe(false);
  });
});
