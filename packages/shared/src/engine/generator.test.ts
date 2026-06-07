import { describe, it, expect } from "vitest";
import { Effect, Random, Option } from "effect";
import {
  generate,
  generateWithUniqueSolution,
  buildGivenMask,
} from "./generator.js";
import { solve, hasUniqueSolution } from "./solver.js";
import type { Board } from "../schemas/game.js";

describe("buildGivenMask", () => {
  it("marks non-zero cells as true, zero cells as false", () => {
    const board: Board = Array.from({ length: 9 }, (_, ri) =>
      Array.from(
        { length: 9 },
        (_, ci) => (ri === 0 && ci < 3 ? 5 : 0) as Board[0][0],
      ),
    );
    const mask = buildGivenMask(board);
    expect(mask[0][0]).toBe(true);
    expect(mask[0][2]).toBe(true);
    expect(mask[0][3]).toBe(false);
    expect(mask[1][0]).toBe(false);
    expect(mask.length).toBe(9);
    expect(mask[0].length).toBe(9);
  });
  it("returns all false for empty board", () => {
    const empty: Board = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => 0),
    );
    const mask = buildGivenMask(empty);
    expect(mask.every((row) => row.every((cell) => cell === false))).toBe(true);
  });
  it("returns all true for full board", () => {
    const full: Board = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => 5),
    );
    const mask = buildGivenMask(full);
    expect(mask.every((row) => row.every((cell) => cell === true))).toBe(true);
  });
});

describe("generate", () => {
  const run = (
    difficulty: "easy" | "medium" | "hard" | "expert",
    seed: string,
  ) =>
    Effect.runSync(
      generate(difficulty).pipe(Effect.withRandom(Random.make(seed))),
    );

  it("produces puzzle and solution with correct structure", () => {
    const result = run("easy", "gen-structure");
    expect(result).toHaveProperty("puzzle");
    expect(result).toHaveProperty("solution");
    expect(result.puzzle.length).toBe(9);
    expect(result.solution.length).toBe(9);
    expect(result.puzzle.every((r) => r.length === 9)).toBe(true);
    expect(result.solution.every((r) => r.length === 9)).toBe(true);
    expect(result.solution.flat().every((c) => c >= 1 && c <= 9)).toBe(true);
  });
  it("generates a solvable puzzle", () => {
    const result = run("easy", "gen-solvable");
    expect(Option.isSome(solve(result.puzzle))).toBe(true);
  });
  it("puzzle does not equal solution (some cells removed)", () => {
    const result = run("easy", "gen-not-full");
    expect(result.puzzle.flat()).not.toEqual(result.solution.flat());
  });
  it("easy removes 35 cells", () => {
    const result = run("easy", "easy-count");
    expect(result.puzzle.flat().filter((v) => v === 0).length).toBe(35);
  });
  it("medium removes 45 cells", () => {
    const result = run("medium", "medium-count");
    expect(result.puzzle.flat().filter((v) => v === 0).length).toBe(45);
  });
  it("hard removes 52 cells", () => {
    const result = run("hard", "hard-count");
    expect(result.puzzle.flat().filter((v) => v === 0).length).toBe(52);
  });
  it("expert removes 58 cells", () => {
    const result = run("expert", "expert-count");
    expect(result.puzzle.flat().filter((v) => v === 0).length).toBe(58);
  });
  it("puzzle cells are subset of solution cells (no wrong givens)", () => {
    const result = run("easy", "gen-subset");
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const pv = result.puzzle[r]?.[c] ?? 0;
        const sv = result.solution[r]?.[c] ?? 0;
        if (pv !== 0) expect(pv).toBe(sv);
      }
    }
  });
  it("is deterministic with same seed", () => {
    const a = run("easy", "deterministic");
    const b = run("easy", "deterministic");
    expect(a).toEqual(b);
  });
  it("puzzle is valid (no row/col/box duplicates)", () => {
    const result = run("easy", "gen-valid");
    const { puzzle } = result;
    // Check rows
    for (const row of puzzle) {
      const vals = row.filter((v) => v !== 0);
      expect(new Set(vals).size).toBe(vals.length);
    }
    // Check columns
    for (let c = 0; c < 9; c++) {
      const vals = Array.from(
        { length: 9 },
        (_, r) => puzzle[r]?.[c] ?? 0,
      ).filter((v) => v !== 0);
      expect(new Set(vals).size).toBe(vals.length);
    }
    // Check boxes
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const vals: number[] = [];
        for (let r = br * 3; r < br * 3 + 3; r++) {
          for (let c = bc * 3; c < bc * 3 + 3; c++) {
            const v = puzzle[r]?.[c] ?? 0;
            if (v !== 0) vals.push(v);
          }
        }
        expect(new Set(vals).size).toBe(vals.length);
      }
    }
  });
});

describe("generateWithUniqueSolution", () => {
  const run = (
    difficulty: "easy" | "medium" | "hard" | "expert",
    seed: string,
  ) =>
    Effect.runSync(
      generateWithUniqueSolution(difficulty).pipe(
        Effect.withRandom(Random.make(seed)),
      ),
    );

  it("returns a puzzle with a unique solution", () => {
    const result = run("easy", "unique-test");
    expect(hasUniqueSolution(result.puzzle)).toBe(true);
  });
  it("returns a puzzle with expected structure", () => {
    const result = run("medium", "unique-structure");
    expect(result.puzzle.length).toBe(9);
    expect(result.solution.length).toBe(9);
    expect(result.puzzle.flat().filter((v) => v === 0).length).toBe(45);
  });
  // Note: hard difficulty (29 givens) + unique solution check + solve()
  // involves backtracking with sparse constraints — can exceed 5s timeout.
  it("generates a solvable puzzle", { timeout: 20000 }, () => {
    const result = run("hard", "unique-solvable");
    expect(Option.isSome(solve(result.puzzle))).toBe(true);
  });
  it("is deterministic with same seed", () => {
    const a = run("easy", "unique-deter");
    const b = run("easy", "unique-deter");
    expect(a).toEqual(b);
  });
});
