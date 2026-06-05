import { Array, Effect, Option, Random } from "effect";
import type { Board, CellValue, Difficulty } from "../schemas/game.js";
import { difficultyToRemoveCount, setCell } from "./board.js";
import { findEmpty, isSafe, hasUniqueSolution } from "./solver.js";

const NUMBERS: CellValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function fillDiagonalBoxes(): Effect.Effect<Board> {
  return Effect.gen(function* (_) {
    const board: Board = Array.makeBy(9, () =>
      Array.makeBy(9, () => 0 as CellValue),
    );
    const shuffled = yield* Effect.all(
      Array.makeBy(3, () =>
        Random.shuffle(NUMBERS).pipe(Effect.map((n) => [...n])),
      ),
    );
    return shuffled.reduce((b, nums, box) => {
      const cells = Array.flatMap(
        Array.makeBy(3, (ri) =>
          Array.makeBy(
            3,
            (ci) => [box * 3 + ri, box * 3 + ci] as [number, number],
          ),
        ),
        (pair) => pair,
      );
      return cells.reduce((acc, [r, c], i) => setCell(acc, r, c, nums[i]!), b);
    }, board);
  });
}

function fillRemainingCells(board: Board): Effect.Effect<Option.Option<Board>> {
  return Effect.gen(function* (_) {
    const empty = findEmpty(board);
    if (Option.isNone(empty)) return Option.some(board) as Option.Option<Board>;
    const [row, col] = empty.value;
    const numbers = [...(yield* Random.shuffle(NUMBERS))];
    for (const num of numbers) {
      if (isSafe(board, row, col, num as CellValue)) {
        const next = setCell(board, row, col, num as CellValue);
        const result = yield* fillRemainingCells(next);
        if (Option.isSome(result)) return result;
      }
    }
    return Option.none() as Option.Option<Board>;
  });
}

export function generate(
  difficulty: Difficulty,
): Effect.Effect<{ puzzle: Board; solution: Board }> {
  return Effect.gen(function* (_) {
    const partial = yield* fillDiagonalBoxes();
    const solutionOpt = yield* fillRemainingCells(partial);
    const solution = Option.getOrThrow(solutionOpt);
    const toRemove = difficultyToRemoveCount(difficulty);
    const allCells = Array.flatMap(
      Array.makeBy(9, (r) =>
        Array.makeBy(9, (c) => [r, c] as [number, number]),
      ),
      (pair) => pair,
    );
    const shuffled = yield* Random.shuffle(allCells);
    const puzzle = Array.reduce(
      shuffled,
      solution as Board,
      (board, [r, c], i) =>
        i < toRemove ? setCell(board, r, c, 0 as CellValue) : board,
    );
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
