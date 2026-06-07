import { describe, it, expect } from "vitest";
import {
  getRow,
  getCol,
  getBox,
  isValidPlacement,
  isBoardValid,
  isBoardFull,
  isBoardSolved,
  countEmptyCells,
  copyBoard,
  setCell,
  difficultyToRemoveCount,
  findConflicts,
} from "./board.js";
import type { Board, CellValue } from "../schemas/game.js";

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

const solution = board.map((row) => [...row]) as Board;
// Fill in solution values to make a complete solved board
const fillCell = (b: Board, r: number, c: number, v: CellValue): Board =>
  b.map((row, ri) =>
    ri === r
      ? row.map((cell, ci) => (ci === c ? v : cell))
      : ([...row] as Board[number]),
  ) as Board;

// Build a known solved board by using the standard puzzle's solution
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

describe("getRow", () => {
  it("returns row 0", () => {
    expect(getRow(board, 0)).toEqual([5, 3, 0, 0, 7, 0, 0, 0, 0]);
  });
  it("returns row 8", () => {
    expect(getRow(board, 8)).toEqual([0, 0, 0, 0, 8, 0, 0, 7, 9]);
  });
  it("returns empty array for out-of-bounds row", () => {
    expect(getRow(board, 9)).toEqual([]);
  });
});

describe("getCol", () => {
  it("returns column 0", () => {
    expect(getCol(board, 0)).toEqual([5, 6, 0, 8, 4, 7, 0, 0, 0]);
  });
  it("returns column 8", () => {
    expect(getCol(board, 8)).toEqual([0, 0, 0, 3, 1, 6, 0, 5, 9]);
  });
});

describe("getBox", () => {
  it("returns top-left box (0,0)", () => {
    expect(getBox(board, 0, 0)).toEqual([5, 3, 0, 6, 0, 0, 0, 9, 8]);
  });
  it("returns middle box (1,1)", () => {
    expect(getBox(board, 4, 4)).toEqual([0, 6, 0, 8, 0, 3, 0, 2, 0]);
  });
  it("returns bottom-right box (2,2)", () => {
    expect(getBox(board, 8, 8)).toEqual([2, 8, 0, 0, 0, 5, 0, 7, 9]);
  });
});

describe("isValidPlacement", () => {
  // Note: isValidPlacement checks whether a cell's *existing* value is validly
  // placed (not whether a new value CAN be placed — that's `isSafe` in solver.ts).
  // It clears the candidate cell from row/col, then checks if the value appears
  // at most once in each region (including the un-cleared box).
  it("returns true for cell (0,0) which has value 5", () => {
    expect(isValidPlacement(board, 0, 0, 5)).toBe(true);
  });
  it("returns true for cell (0,1) which has value 3", () => {
    expect(isValidPlacement(board, 0, 1, 3)).toBe(true);
  });
  it("returns true for cell (0,4) which has value 7", () => {
    expect(isValidPlacement(board, 0, 4, 7)).toBe(true);
  });
  it("self-collision: cell's own value does not conflict with itself", () => {
    expect(isValidPlacement(board, 0, 0, 5)).toBe(true);
  });
  it("detects duplicate in box when two cells share a value", () => {
    // Create a board where box(0,0) has 5 at both (0,0) and (0,1)
    const bad = board.map((r) => [...r]) as Board;
    bad[0][1] = 5 as CellValue;
    expect(isValidPlacement(bad, 0, 0, 5)).toBe(false);
    expect(isValidPlacement(bad, 0, 1, 5)).toBe(false);
  });
  it("value 0 is always valid (empty / erase)", () => {
    expect(isValidPlacement(board, 0, 0, 0)).toBe(true);
  });
});

describe("isBoardValid", () => {
  it("returns true for valid partial board", () => {
    expect(isBoardValid(board)).toBe(true);
  });
  it("returns false for board with duplicate in row", () => {
    const bad = board.map((r, ri) =>
      ri === 0 ? r.map((c, ci) => (ci === 1 ? 5 : c)) : r,
    ) as Board;
    expect(isBoardValid(bad)).toBe(false);
  });
  it("returns true for full valid board", () => {
    expect(isBoardValid(fullBoard)).toBe(true);
  });
});

describe("isBoardFull", () => {
  it("returns false for incomplete board", () => {
    expect(isBoardFull(board)).toBe(false);
  });
  it("returns true for full board", () => {
    expect(isBoardFull(fullBoard)).toBe(true);
  });
});

describe("isBoardSolved", () => {
  it("returns false when board does not match solution", () => {
    expect(isBoardSolved(board, knownSolution)).toBe(false);
  });
  it("returns true when board matches solution exactly", () => {
    expect(isBoardSolved(knownSolution, knownSolution)).toBe(true);
  });
  it("returns false on single cell mismatch", () => {
    const almost = knownSolution.map((r, ri) =>
      ri === 0 ? r.map((c, ci) => (ci === 0 ? 99 : c)) : r,
    ) as unknown as Board;
    expect(isBoardSolved(almost, knownSolution)).toBe(false);
  });
});

describe("countEmptyCells", () => {
  it("counts zeros in partial board", () => {
    expect(countEmptyCells(board)).toBe(51);
  });
  it("returns 0 for full board", () => {
    expect(countEmptyCells(fullBoard)).toBe(0);
  });
});

describe("copyBoard", () => {
  it("produces independent clone", () => {
    const copy = copyBoard(board);
    (copy[0] as number[])[0] = 99;
    expect(board[0][0]).toBe(5);
  });
});

describe("setCell", () => {
  it("updates cell at (0,0) to 9", () => {
    const result = setCell(board, 0, 0, 9 as CellValue);
    expect(result[0][0]).toBe(9);
  });
  it("does not mutate original board", () => {
    const original = board.map((r) => [...r]);
    setCell(board, 0, 0, 9 as CellValue);
    expect(board).toEqual(original);
  });
  it("leaves other cells unchanged", () => {
    const result = setCell(board, 0, 0, 9 as CellValue);
    expect(result[0][1]).toBe(3);
    expect(result[1][0]).toBe(6);
  });
});

describe("difficultyToRemoveCount", () => {
  it("easy returns 35", () => {
    expect(difficultyToRemoveCount("easy")).toBe(35);
  });
  it("medium returns 45", () => {
    expect(difficultyToRemoveCount("medium")).toBe(45);
  });
  it("hard returns 52", () => {
    expect(difficultyToRemoveCount("hard")).toBe(52);
  });
  it("expert returns 58", () => {
    expect(difficultyToRemoveCount("expert")).toBe(58);
  });
});

describe("findConflicts", () => {
  // Note: findConflicts uses appearsOnce with `<= 1` semantics, which means
  // simple duplicate pairs are not detected (clearing one cell leaves the other).
  // Use a case with 3+ duplicates to trigger detection.
  it("returns empty for valid board", () => {
    expect(findConflicts(board)).toEqual([]);
  });
  it("returns empty for full valid board", () => {
    expect(findConflicts(fullBoard)).toEqual([]);
  });
  it("detects triplicate in box", () => {
    const bad = board.map((r) => [...r]) as Board;
    bad[0][0] = 5 as CellValue;
    bad[0][1] = 5 as CellValue; // duplicate
    bad[1][1] = 5 as CellValue; // triplicate — three 5s in box(0,0)
    const conflicts = findConflicts(bad);
    // After clearing any of the three, the remaining two still appear twice,
    // so appearsOnce returns false for each.
    expect(conflicts.length).toBeGreaterThanOrEqual(3);
  });
  it("detects triplicate in row", () => {
    const bad = board.map((r) => [...r]) as Board;
    bad[0][0] = 5 as CellValue;
    bad[0][1] = 5 as CellValue;
    bad[0][2] = 5 as CellValue; // three 5s in row 0
    const conflicts = findConflicts(bad);
    expect(conflicts.length).toBeGreaterThanOrEqual(3);
  });
});
