import { Schema } from "effect";
import {
  BoardSchema,
  GivenMaskSchema,
  DifficultySchema,
  GameStatusSchema,
  type CellValue,
} from "./game.js";

export const CreateGameResponseSchema = Schema.Struct({
  id: Schema.String,
  board: BoardSchema,
  givenMask: GivenMaskSchema,
  difficulty: DifficultySchema,
});
export type CreateGameResponse = Schema.Schema.Type<
  typeof CreateGameResponseSchema
>;

export const GameStateResponseSchema = Schema.Struct({
  id: Schema.String,
  board: BoardSchema,
  givenMask: GivenMaskSchema,
  difficulty: DifficultySchema,
  hintsUsed: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  movesCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  status: GameStatusSchema,
  elapsedSeconds: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
});
export type GameStateResponse = Schema.Schema.Type<
  typeof GameStateResponseSchema
>;

export const ValidateMoveResponseSchema = Schema.Struct({
  valid: Schema.Boolean,
  message: Schema.String,
  solved: Schema.Boolean,
  board: BoardSchema,
});
export type ValidateMoveResponse = Schema.Schema.Type<
  typeof ValidateMoveResponseSchema
>;

export const HintResponseSchema = Schema.Struct({
  row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  value: Schema.Number.pipe(
    Schema.int(),
    Schema.between(0, 8),
  ) as Schema.Schema<CellValue, CellValue>,
  board: BoardSchema,
  solved: Schema.Boolean,
  message: Schema.String,
});
export type HintResponse = Schema.Schema.Type<typeof HintResponseSchema>;

export const ErrorResponseSchema = Schema.Struct({
  error: Schema.String,
});
export type ErrorResponse = Schema.Schema.Type<typeof ErrorResponseSchema>;
