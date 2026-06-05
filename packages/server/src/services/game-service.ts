import { Context, Effect, Layer, Schema, Clock } from "effect";
import {
  CreateGameRequestSchema,
  SubmitMoveRequestSchema,
  HintRequestSchema,
  type Board,
  type CellValue,
  type CreateGameResponse,
  type ValidateMoveResponse,
  type HintResponse,
  generateWithUniqueSolution,
  buildGivenMask,
  copyBoard,
  setCell,
  isBoardSolved,
} from "@sudoku-ts/shared";
import { GameStore } from "./game-store.js";

export interface GameService {
  readonly createGame: (raw: unknown) => Effect.Effect<CreateGameResponse>;
  readonly getGame: (id: string) => Effect.Effect<object>;
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
      return {
        id,
        board: puzzle,
        givenMask,
        difficulty: req.difficulty,
      } as CreateGameResponse;
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

  const submitMove = (id: string, raw: unknown) =>
    Effect.gen(function* (_) {
      const session = yield* store.get(id);
      if (session.status !== "active") {
        return {
          valid: false,
          message: "Game is already completed",
          solved: false,
          board: session.board,
        } as ValidateMoveResponse;
      }
      const req = yield* Schema.decodeUnknown(SubmitMoveRequestSchema)(raw);
      const { row, col, value } = req;
      if (session.givenMask[row]?.[col]) {
        return {
          valid: false,
          message: "Cannot change a given cell",
          solved: false,
          board: session.board,
        } as ValidateMoveResponse;
      }
      const targetValue = session.solution[row]?.[col];
      if (value !== 0 && value !== targetValue) {
        const boardAfter = setCell(session.board, row, col, value as CellValue);
        yield* store.update(id, {
          board: boardAfter,
          movesCount: session.movesCount + 1,
        });
        return {
          valid: false,
          message: "Incorrect value",
          solved: false,
          board: boardAfter,
        } as ValidateMoveResponse;
      }
      const boardAfter = setCell(session.board, row, col, value as CellValue);
      const solved = isBoardSolved(boardAfter, session.solution);
      yield* store.update(id, {
        board: boardAfter,
        movesCount: session.movesCount + 1,
        status: solved ? "completed" : "active",
      });
      if (solved) {
        return {
          valid: true,
          message: "Puzzle solved!",
          solved: true,
          board: boardAfter,
        } as ValidateMoveResponse;
      }
      return {
        valid: true,
        message: "Correct",
        solved: false,
        board: boardAfter,
      } as ValidateMoveResponse;
    });

  const hint = (id: string, raw: unknown) =>
    Effect.gen(function* (_) {
      const session = yield* store.get(id);
      const req = yield* Schema.decodeUnknown(HintRequestSchema)(raw);
      const { row, col } = req;
      const correctValue = session.solution[row]![col]!;
      const boardAfter = setCell(session.board, row, col, correctValue);
      const solved = isBoardSolved(boardAfter, session.solution);
      yield* store.update(id, {
        board: boardAfter,
        hintsUsed: session.hintsUsed + 1,
        ...(solved ? { status: "completed" as const } : {}),
      });
      return {
        row,
        col,
        value: correctValue,
        board: boardAfter,
        solved,
        message: solved
          ? "Puzzle solved!"
          : `Hint: (${row + 1}, ${col + 1}) = ${correctValue}`,
      } as HintResponse;
    });

  return { createGame, getGame, submitMove, hint } as GameService;
});

export const GameServiceLive = Layer.effect(GameService, makeGameService);
