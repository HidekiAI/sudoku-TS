import { Schema } from "effect";
import { DifficultySchema, CoordSchema, CellValueSchema } from "./game.js";

export const CreateGameRequestSchema = Schema.Struct({
  difficulty: DifficultySchema,
});
export type CreateGameRequest = Schema.Schema.Type<
  typeof CreateGameRequestSchema
>;

export const SubmitMoveRequestSchema = Schema.Struct({
  row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  value: CellValueSchema,
});
export type SubmitMoveRequest = Schema.Schema.Type<
  typeof SubmitMoveRequestSchema
>;

export const HintRequestSchema = Schema.Struct({
  row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
});
export type HintRequest = Schema.Schema.Type<typeof HintRequestSchema>;
