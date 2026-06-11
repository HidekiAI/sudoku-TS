import { Array, Effect, Option, Random } from "effect";
import type { Board, CellValue, Difficulty } from "../schemas/game.js";
import { difficultyToRemoveCount, setCell } from "./board.js";
import { findEmpty, isSafe, hasUniqueSolution } from "./solver.js";

const NUMBERS: CellValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Rust: fn fill_diagonal_boxes<R: Rng>(rng: &mut R) -> Board
//      — takes &mut Rng, returns Board. Pure modulo RNG seed (same seed → same board).
//      Shuffle is in-place on a mutable copy. No effect system needed.
// F#:  let fillDiagonalBoxes () = effect { ... }
//      — computation expression with Random.shuffle (requires async context).
//      F# lacks a built-in effect system; this would typically use async or a custom
//      monad transformer. The TS version uses Effect<Board> to keep shuffling pure and
//      testable (seedable RNG via Random.make(seed) + Effect.withRandom).
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
      // Fix: Non-null assertion bypasses noUncheckedIndexedAccess.
      // Use Option.getOrElse with fallback 0 as CellValue for FP safety.
      // `Array.makeBy(3, ...)` produces indices 0-2 and shuffled nums always has 9
      // elements, so the access is in-bounds; the fallback is a type-level guarantee.
      return cells.reduce(
        (acc, [r, c], i) =>
          setCell(
            acc,
            r,
            c,
            Option.getOrElse(
              Option.fromNullable(nums[i]),
              () => 0 as CellValue,
            ),
          ),
        b,
      );
    }, board);
  });
}

// Rust: fn fill_remaining_cells<R: Rng>(board: Board, rng: &mut R) -> Option<Board>
//      — recursive with &mut Rng, returns Option<Board>. The recursive calls propagate
//      the same rng reference; mutation is scoped to the function tree.
// F#:  let rec fillRemainingCells board = effect {
//        match findEmpty board with
//        | None -> return Some board
//        | Some (r, c) -> ...
//      }
//      — F# computation expression with recursive effect calls. Type system tracks
//      the effect context but requires explicit return/let! for each effectful step.
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

// Rust: fn generate<R: Rng>(difficulty: Difficulty, rng: &mut R) -> (Board, Board)
//      — plain function, no effect system. Rng is threaded explicitly.
//      The caller controls determinism by seeding rng before the call.
// F#:  let generate difficulty = effect {
//        let! partial = fillDiagonalBoxes ()
//        let! solution = fillRemainingCells partial
//        ...
//      }
//      — F# computation expression with let! for each effectful step.
//      The TS/effect-ts version uses Effect.gen which is syntactically identical
//      to F#'s effect { ... } — both are monadic comprehension syntax.
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

// Rust: loop { let cand = generate(difficulty, &mut rng);
//        if has_unique_solution(cand.puzzle) { return cand; } }
//      — loop + conditional break (no recursion overhead).
// F#:  let rec loop () = effect {
//        let! candidate = generate difficulty
//        if hasUniqueSolution candidate.puzzle then return candidate
//        else return! loop ()
//      }
//      — tail-recursive effect (F# optimizes tail calls, so no stack growth).
//      The TS version is also tail-recursive (return yield* generateWithUniqueSolution).
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

// Rust: puzzle.iter().map(|row| row.iter().map(|&c| c != 0).collect()).collect()
//      — nested Iterator::map, collect into Vec<Vec<bool>>.
// F#:  puzzle |> Array.map (Array.map ((<>) 0))
//      — Array.map of partial application ((<>) 0), no intermediate collect needed.
export function buildGivenMask(puzzle: Board): boolean[][] {
  return puzzle.map((row) => row.map((cell) => cell !== 0));
}
