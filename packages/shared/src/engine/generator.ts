import { Effect, Random, Array } from "effect";
import type { Board, CellValue, Difficulty } from "../schemas/game.js";
import { copyBoard, difficultyToRemoveCount } from "./board.js";
import { solve, hasUniqueSolution } from "./solver.js";

const NUMBERS: CellValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function shuffleArray<T>(arr: T[]): Effect.Effect<T[]> {
  return Effect.gen(function* (_) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = yield* Random.nextIntBetween(0, i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  });
}

function fillDiagonalBoxes(): Effect.Effect<Board> {
  return Effect.gen(function* (_) {
    const board: Board = Array.makeBy(9, () =>
      Array.makeBy(9, () => 0 as CellValue),
    );
    for (let box = 0; box < 3; box++) {
      const nums = yield* shuffleArray([...NUMBERS]);
      let idx = 0;
      for (let r = box * 3; r < box * 3 + 3; r++) {
        for (let c = box * 3; c < box * 3 + 3; c++) {
          const rowData = board[r];
          if (rowData) rowData[c] = nums[idx]!;
          idx++;
        }
      }
    }
    return board;
  });
}

function fillRemainingCells(board: Board): Effect.Effect<Board> {
  return Effect.gen(function* (_) {
    const result = copyBoard(board);

    function findNextEmpty(): [number, number] | null {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if ((result[r]?.[c] ?? 0) === 0) return [r, c];
        }
      }
      return null;
    }

    function isValidPlacement(row: number, col: number, num: number): boolean {
      for (let c = 0; c < 9; c++) {
        if (result[row]?.[c] === num) return false;
      }
      for (let r = 0; r < 9; r++) {
        if (result[r]?.[col] === num) return false;
      }
      const boxRow = Math.floor(row / 3) * 3;
      const boxCol = Math.floor(col / 3) * 3;
      for (let r = boxRow; r < boxRow + 3; r++) {
        for (let c = boxCol; c < boxCol + 3; c++) {
          if (result[r]?.[c] === num) return false;
        }
      }
      return true;
    }

    function fill(): boolean {
      const empty = findNextEmpty();
      if (!empty) return true;
      const [row, col] = empty;
      const shuffled = [...NUMBERS].sort(() => Math.random() - 0.5);
      for (const num of shuffled) {
        if (isValidPlacement(row, col, num)) {
          const rowData = result[row];
          if (rowData) rowData[col] = num;
          if (fill()) return true;
          if (rowData) rowData[col] = 0;
        }
      }
      return false;
    }

    fill();
    return result;
  });
}

export function generate(
  difficulty: Difficulty,
): Effect.Effect<{ puzzle: Board; solution: Board }> {
  return Effect.gen(function* (_) {
    const partial = yield* fillDiagonalBoxes();
    const solution = yield* fillRemainingCells(partial);
    const toRemove = difficultyToRemoveCount(difficulty);
    const puzzle = copyBoard(solution);
    const allCells: [number, number][] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        allCells.push([r, c]);
      }
    }
    const shuffled = yield* shuffleArray(allCells);
    let removed = 0;
    for (const [r, c] of shuffled) {
      if (removed >= toRemove) break;
      const rowData = puzzle[r];
      if (rowData) rowData[c] = 0;
      removed++;
    }
    return { puzzle, solution };
  });
}

export function generateWithUniqueSolution(
  difficulty: Difficulty,
): Effect.Effect<{ puzzle: Board; solution: Board }> {
  return Effect.gen(function* (_) {
    const candidate = yield* generate(difficulty);
    if (hasUniqueSolution(candidate.puzzle)) {
      return candidate;
    }
    return yield* generateWithUniqueSolution(difficulty);
  });
}

export function buildGivenMask(puzzle: Board): boolean[][] {
  return puzzle.map((row) => row.map((cell) => cell !== 0));
}
