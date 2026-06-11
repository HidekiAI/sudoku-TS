import { Array, Option } from "effect";
import type { Board, CellValue } from "../schemas/game.js";

// Rust: values.iter().filter(|&&v| v != 0).try_fold(HashSet::new(), |mut set, &v|
//        if set.insert(v) { Some(set) } else { None }).is_some()
//      — HashSet insertion fails on duplicate, short-circuits via try_fold.
// F#:  let nonZero = values |> Array.filter ((<>) 0)
//      nonZero |> Array.length = (nonZero |> Set.ofArray |> Set.count)
//      — convert to Set and compare lengths (simpler but allocates).
function hasNoConflicts(values: CellValue[]): boolean {
  const filtered = values.filter((v) => v !== 0);
  return new Set(filtered).size === filtered.length;
}

// Rust: rows: board.iter().all(|row| has_no_conflicts(row))
//        cols: (0..9).all(|c| has_no_conflicts(board.iter().map(|row| row[c])))
//        boxes: (0..3).flat_map(|br| (0..3).map(move |bc| (br, bc)))
//               .all(|(br, bc)| has_no_conflicts(/* box cells */))
//      — three lazy all() checks; cols transposes by index, boxes by flat_map.
// F#:  rows, cols, boxes each via Array.forall with composed predicates.
export function isValidBoardFast(board: Board): boolean {
  const rowsOk = Array.every(board, (row) => hasNoConflicts(row));
  const colsOk = Array.every(
    // Safety: c is 0-8 from makeBy(9); board is Schema-validated 9×9.
    // 0 is empty-cell sentinel, a no-op in validity checks.
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
          // Safety: r is 0-8 from makeBy(9); bc*3+c = 0-8 (bc is 0-2).
          (r) => Array.makeBy(3, (c) => board[r]?.[bc * 3 + c] ?? 0),
        ),
      ),
  );
  return rowsOk && colsOk && boxesOk;
}

// Rust: (0..9).flat_map(|r| (0..9).map(move |c| (r, c)))
//        .find(|&(r, c)| board[r][c] == 0)
//      — Iterator::find short-circuits at the first match (lazy).
// F#:  seq { for r in 0..8 do for c in 0..8 do yield r, c }
//      |> Seq.tryFind (fun (r, c) -> board[r].[c] = 0)
//      — sequence expression + tryFind (also lazy).
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

// Rust: row: (0..9).all(|c| board[row][c] != num)
//        col: (0..9).all(|r| board[r][col] != num)
//        box: (0..3).flat_map(|r| (0..3).map(move |c| board[br+r][bc+c]))
//             .all(|v| v != num)
//      — three all() calls, each short-circuits on first violation (lazy).
// F#:  row/col/box each via Array.forall with (<>) num — strict like TS, but F#
//      arrays are fixed-size so bounds are known.
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
      // Safety: r is 0-8 from makeBy(9); boxCol 0-6 + c 0-2 = 0-8.
      (r) => Array.makeBy(3, (c) => board[r]?.[boxCol + c] ?? 0),
    ),
    (v) => v !== num,
  );
  return rowSafe && colSafe && boxSafe;
}

// Rust: let mut next = *board; next[row][col] = value; next
//      — Copy gives free clone, local mut reassigns the target cell.
// F#:  board |> Array.mapi (fun ri r -> if ri = row then r |> Array.mapi ... else r)
//      — same index-conditional map as board.ts setCell.
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

// Rust: (1..=9).find_map(|num| { if is_safe(board, row, col, num)
//        { solve_internal(&set_cell_pure(board, row, col, num)) } else { None } })
//      — Iterator::find_map combines filter+map; returns first Some (lazy).
//      The recursive tryNum closure here is the TS equivalent.
// F#:  let rec tryNum n = if n > 9 then None elif isSafe ... then ... else tryNum (n+1)
//      — explicit recursion like TS; F# has no built-in find_map for ranges.
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

// Rust: solve_internal(board) — board is Copy, no explicit clone needed before call.
// F#:  solveInternal (Array.copy board) — F# arrays are mutable by default,
//      so explicit copy before handing to the solver is necessary.
export function solve(board: Board): Option.Option<Board> {
  return solveInternal(board.map((row) => [...row]) as Board);
}

// Rust: same for loop — the early-exit requirement makes fold/find_map unsuitable
//      in both languages. The for loop is the pragmatic choice here.
// F#:  let rec loop num found = if num > 9 then found elif found >= 2 then 2 ...
//      — tail-recursive helper instead of for loop; the F# compiler optimizes
//      tail calls into loops, achieving the same early-exit behavior.
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

// Rust: count_solutions_until_two(board) == 1 — same wrapping, same semantics.
// F#:  countSolutionsUntilTwo board = 1 — F# uses = for equality comparison.
// Fix: Redundant `as Board` — `board` is already typed Board from signature.
// The cast adds zero type safety while suppressing valid compiler checks.
export function hasUniqueSolution(board: Board): boolean {
  return countSolutionsUntilTwo(board) === 1;
}
