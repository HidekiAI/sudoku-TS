import { Context, Effect, Layer, Schema, Clock } from "effect";
import {
  CreateGameRequestSchema,
  SubmitMoveRequestSchema,
  HintRequestSchema,
  type CreateGameResponse,
  type GameStateResponse,
  type ValidateMoveResponse,
  type HintResponse,
  generateWithUniqueSolution,
  buildGivenMask,
  setCell,
  isBoardSolved,
} from "@sudoku-ts/shared";
import { GameStore } from "./game-store.js";

// Fix: `object` return type erases all shape information, defeating
// TypeScript's type-checking. Use GameStateResponse for compile-time guarantees.
export interface GameService {
  readonly createGame: (raw: unknown) => Effect.Effect<CreateGameResponse>;
  readonly getGame: (id: string) => Effect.Effect<GameStateResponse>;
  readonly submitMove: (
    id: string,
    raw: unknown,
  ) => Effect.Effect<ValidateMoveResponse>;
  readonly hint: (id: string, raw: unknown) => Effect.Effect<HintResponse>;
}

export const GameService = Context.GenericTag<GameService>("GameService");

export const makeGameService = Effect.gen(function* (_) {
  const store = yield* GameStore;

  const createGame = (raw: unknown) =>
    Effect.gen(function* (_) {
      const req = yield* Schema.decodeUnknown(CreateGameRequestSchema)(raw);
      const { puzzle, solution } = yield* generateWithUniqueSolution(
        req.difficulty,
      );
      const givenMask = buildGivenMask(puzzle);
      const id = yield* store.create(
        req.difficulty,
        puzzle,
        solution,
        givenMask,
      );
      // Fix: `as CreateGameResponse` suppresses excess-property checks.
      // The object literal already satisfies the type; remove the cast so
      // TypeScript verifies structural compatibility at compile time.
      return {
        id,
        board: puzzle,
        givenMask,
        difficulty: req.difficulty,
      };
    });

  const getGame = (id: string) =>
    Effect.gen(function* (_) {
      const session = yield* store.get(id);
      const now = yield* Clock.currentTimeMillis;
      const elapsedSeconds = Math.floor((now - session.startTime) / 1000);
      return {
        id: session.id,
        board: session.board,
        givenMask: session.givenMask,
        difficulty: session.difficulty,
        hintsUsed: session.hintsUsed,
        movesCount: session.movesCount,
        status: session.status,
        elapsedSeconds,
      };
    });

  // Fix: TOCTOU race condition — `get(id)` then `update(id)` was non-atomic.
  // Two concurrent requests could read the same stale session and overwrite
  // each other's changes. `store.modify` uses SynchronizedRef.modify to perform
  // the entire read-modify-write atomically, preserving referential transparency.
  const submitMove = (id: string, raw: unknown) =>
    Effect.gen(function* (_) {
      const req = yield* Schema.decodeUnknown(SubmitMoveRequestSchema)(raw);
      const { row, col, value } = req;
      // `value` is already typed as `number` by SubmitMoveRequestSchema (validated 0-9).
      // No need for `value as CellValue` cast — Schema decode guarantees the range.
      return yield* store.modify(id, (session) => {
        if (session.status !== "active") {
          return [
            {
              valid: false,
              message: "Game is already completed",
              solved: false,
              board: session.board,
            },
            session,
          ];
        }
        if (session.givenMask[row]?.[col]) {
          return [
            {
              valid: false,
              message: "Cannot change a given cell",
              solved: false,
              board: session.board,
            },
            session,
          ];
        }
        const targetValue = session.solution[row]?.[col];
        if (value !== 0 && value !== targetValue) {
          const boardAfter = setCell(session.board, row, col, value);
          return [
            {
              valid: false,
              message: "Incorrect value",
              solved: false,
              board: boardAfter,
            },
            {
              ...session,
              board: boardAfter,
              movesCount: session.movesCount + 1,
            },
          ];
        }
        const boardAfter = setCell(session.board, row, col, value);
        const solved = isBoardSolved(boardAfter, session.solution);
        const updated = {
          ...session,
          board: boardAfter,
          movesCount: session.movesCount + 1,
          // Fix: Spread + ternary widens `status` to `string`, losing the literal
          // union type `"active" | "completed" | "abandoned"`. `as const` preserves
          // the precise literal type so the object matches GameSession.
          status: solved
            ? ("completed" as "active" | "completed")
            : ("active" as "active" | "completed"),
        };
        return solved
          ? [
              {
                valid: true,
                message: "Puzzle solved!",
                solved: true,
                board: boardAfter,
              },
              updated,
            ]
          : [
              {
                valid: true,
                message: "Correct",
                solved: false,
                board: boardAfter,
              },
              updated,
            ];
      });
    });

  // Fix: Same TOCTOU race as submitMove — get+update split is non-atomic.
  // Also fix: Non-null assertions `solution[row]![col]!` bypass type safety.
  // Schema.decodeUnknown(HintRequestSchema) guarantees row/col are 0-8, so
  // optional chaining with ?? 0 is both safe and FP-transparent.
  const hint = (id: string, raw: unknown) =>
    Effect.gen(function* (_) {
      const req = yield* Schema.decodeUnknown(HintRequestSchema)(raw);
      const { row, col } = req;
      return yield* store.modify(id, (session) => {
        const correctValue = session.solution[row]?.[col] ?? 0;
        const boardAfter = setCell(session.board, row, col, correctValue);
        const solved = isBoardSolved(boardAfter, session.solution);
        const updated = {
          ...session,
          board: boardAfter,
          hintsUsed: session.hintsUsed + 1,
          // Fix: Conditional spread widens `status` type (same issue as submitMove).
          status: solved ? ("completed" as const) : session.status,
        };
        return [
          {
            row,
            col,
            value: correctValue,
            board: boardAfter,
            solved,
            message: solved
              ? "Puzzle solved!"
              : `Hint: (${row + 1}, ${col + 1}) = ${correctValue}`,
          },
          updated,
        ];
      });
    });

  // Note: `as GameService` cast remains here because Schema.decodeUnknown on
  // request input introduces ParseResult.ParseError in the error channel.
  // A future refactor should add error types to GameService and have the route
  // layer catch ParseErrors → 400 responses.
  return { createGame, getGame, submitMove, hint } as GameService;
});

export const GameServiceLive = Layer.effect(GameService, makeGameService);
