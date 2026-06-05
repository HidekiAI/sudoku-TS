import { Schema } from "effect";

export const DifficultySchema = Schema.Literal(
  "easy",
  "medium",
  "hard",
  "expert",
);
export type Difficulty = Schema.Schema.Type<typeof DifficultySchema>;

export const CellValueSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 9),
);
export type CellValue = number;

export const CoordSchema = Schema.Struct({
  row: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
  col: Schema.Number.pipe(Schema.int(), Schema.between(0, 8)),
});
export type Coord = Schema.Schema.Type<typeof CoordSchema>;

export type Board = number[][];

const _BoardSchema = Schema.Array(
  Schema.Array(CellValueSchema).pipe(Schema.minItems(9), Schema.maxItems(9)),
).pipe(Schema.minItems(9), Schema.maxItems(9));
export const BoardSchema = _BoardSchema as unknown as Schema.Schema<Board>;

export type GivenMask = boolean[][];

const _GivenMaskSchema = Schema.Array(
  Schema.Array(Schema.Boolean).pipe(Schema.minItems(9), Schema.maxItems(9)),
).pipe(Schema.minItems(9), Schema.maxItems(9));
export const GivenMaskSchema =
  _GivenMaskSchema as unknown as Schema.Schema<GivenMask>;

export const GameStatusSchema = Schema.Literal(
  "active",
  "completed",
  "abandoned",
);
export type GameStatus = Schema.Schema.Type<typeof GameStatusSchema>;

export const DifficultyValues: Difficulty[] = [
  "easy",
  "medium",
  "hard",
  "expert",
];
