import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  DifficultySchema,
  CellValueSchema,
  CoordSchema,
  BoardSchema,
  GameStatusSchema,
} from "./game.js";
import {
  CreateGameRequestSchema,
  SubmitMoveRequestSchema,
  HintRequestSchema,
} from "./request.js";
import {
  CreateGameResponseSchema,
  ValidateMoveResponseSchema,
  HintResponseSchema,
  GameStateResponseSchema,
} from "./response.js";
import type { Board } from "./game.js";

const decode = <A>(schema: Schema.Schema<A>, input: unknown) =>
  Schema.decodeUnknownEither(schema)(input);

const validBoard: Board = Array.from({ length: 9 }, () =>
  Array.from({ length: 9 }, () => 0),
);

describe("DifficultySchema", () => {
  // Effect's Either uses `.right` / `.left` properties (not `.value`)
  it("accepts easy", () => {
    expect(decode(DifficultySchema, "easy")).toMatchObject({
      _tag: "Right",
      right: "easy",
    });
  });
  it("accepts medium", () => {
    expect(decode(DifficultySchema, "medium")).toMatchObject({
      _tag: "Right",
      right: "medium",
    });
  });
  it("accepts hard", () => {
    expect(decode(DifficultySchema, "hard")).toMatchObject({
      _tag: "Right",
      right: "hard",
    });
  });
  it("accepts expert", () => {
    expect(decode(DifficultySchema, "expert")).toMatchObject({
      _tag: "Right",
      right: "expert",
    });
  });
  it("rejects unknown string", () => {
    expect(decode(DifficultySchema, "impossible")).toMatchObject({
      _tag: "Left",
    });
  });
});

describe("CellValueSchema", () => {
  it("accepts 0 (empty)", () => {
    expect(decode(CellValueSchema, 0)).toMatchObject({ _tag: "Right" });
  });
  it("accepts 1 (min placement)", () => {
    expect(decode(CellValueSchema, 1)).toMatchObject({ _tag: "Right" });
  });
  it("accepts 9 (max placement)", () => {
    expect(decode(CellValueSchema, 9)).toMatchObject({ _tag: "Right" });
  });
  it("rejects -1 (negative)", () => {
    expect(decode(CellValueSchema, -1)).toMatchObject({ _tag: "Left" });
  });
  it("rejects 10 (above max)", () => {
    expect(decode(CellValueSchema, 10)).toMatchObject({ _tag: "Left" });
  });
  it("rejects 3.5 (non-integer)", () => {
    expect(decode(CellValueSchema, 3.5)).toMatchObject({ _tag: "Left" });
  });
});

describe("CoordSchema", () => {
  it("accepts valid coordinate", () => {
    expect(decode(CoordSchema, { row: 4, col: 3 })).toMatchObject({
      _tag: "Right",
    });
  });
  it("rejects negative row", () => {
    expect(decode(CoordSchema, { row: -1, col: 0 })).toMatchObject({
      _tag: "Left",
    });
  });
  it("rejects row > 8", () => {
    expect(decode(CoordSchema, { row: 9, col: 0 })).toMatchObject({
      _tag: "Left",
    });
  });
  it("rejects missing field", () => {
    expect(decode(CoordSchema, { row: 0 })).toMatchObject({ _tag: "Left" });
  });
});

describe("BoardSchema", () => {
  it("accepts valid 9x9 board", () => {
    expect(decode(BoardSchema, validBoard)).toMatchObject({ _tag: "Right" });
  });
  it("rejects board with 8 rows", () => {
    const bad = Array.from({ length: 8 }, () =>
      Array.from({ length: 9 }, () => 0),
    );
    expect(decode(BoardSchema, bad)).toMatchObject({ _tag: "Left" });
  });
  it("rejects board with 8 columns", () => {
    const bad = Array.from({ length: 9 }, () =>
      Array.from({ length: 8 }, () => 0),
    );
    expect(decode(BoardSchema, bad)).toMatchObject({ _tag: "Left" });
  });
  it("rejects board with invalid cell value", () => {
    const bad = validBoard.map((r, ri) =>
      ri === 0 ? r.map(() => 99 as never) : r,
    );
    expect(decode(BoardSchema, bad)).toMatchObject({ _tag: "Left" });
  });
});

describe("GameStatusSchema", () => {
  it("accepts active", () => {
    expect(decode(GameStatusSchema, "active")).toMatchObject({ _tag: "Right" });
  });
  it("accepts completed", () => {
    expect(decode(GameStatusSchema, "completed")).toMatchObject({
      _tag: "Right",
    });
  });
  it("accepts abandoned", () => {
    expect(decode(GameStatusSchema, "abandoned")).toMatchObject({
      _tag: "Right",
    });
  });
  it("rejects unknown status", () => {
    expect(decode(GameStatusSchema, "unknown")).toMatchObject({ _tag: "Left" });
  });
});

describe("CreateGameRequestSchema", () => {
  it("accepts valid request", () => {
    expect(
      decode(CreateGameRequestSchema, { difficulty: "easy" }),
    ).toMatchObject({ _tag: "Right" });
  });
  it("rejects empty object", () => {
    expect(decode(CreateGameRequestSchema, {})).toMatchObject({ _tag: "Left" });
  });
});

describe("SubmitMoveRequestSchema", () => {
  it("accepts valid move", () => {
    expect(
      decode(SubmitMoveRequestSchema, { row: 4, col: 4, value: 5 }),
    ).toMatchObject({ _tag: "Right" });
  });
  it("accepts value 0 (erase)", () => {
    expect(
      decode(SubmitMoveRequestSchema, { row: 0, col: 0, value: 0 }),
    ).toMatchObject({ _tag: "Right" });
  });
  it("accepts value 9", () => {
    expect(
      decode(SubmitMoveRequestSchema, { row: 0, col: 0, value: 9 }),
    ).toMatchObject({ _tag: "Right" });
  });
  it("rejects value 10", () => {
    expect(
      decode(SubmitMoveRequestSchema, { row: 0, col: 0, value: 10 }),
    ).toMatchObject({ _tag: "Left" });
  });
  it("rejects missing value field", () => {
    expect(decode(SubmitMoveRequestSchema, { row: 0, col: 0 })).toMatchObject({
      _tag: "Left",
    });
  });
});

describe("HintRequestSchema", () => {
  it("accepts valid hint request", () => {
    expect(decode(HintRequestSchema, { row: 2, col: 7 })).toMatchObject({
      _tag: "Right",
    });
  });
  it("rejects invalid row", () => {
    expect(decode(HintRequestSchema, { row: 15, col: 0 })).toMatchObject({
      _tag: "Left",
    });
  });
});

describe("CreateGameResponseSchema", () => {
  it("accepts valid response", () => {
    const input = {
      id: "abc123",
      board: validBoard,
      givenMask: Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => false),
      ),
      difficulty: "easy",
    };
    expect(decode(CreateGameResponseSchema, input)).toMatchObject({
      _tag: "Right",
    });
  });
  it("rejects missing field", () => {
    expect(decode(CreateGameResponseSchema, { id: "abc" })).toMatchObject({
      _tag: "Left",
    });
  });
});

describe("ValidateMoveResponseSchema", () => {
  it("accepts valid response", () => {
    const input = {
      valid: true,
      message: "Correct",
      solved: false,
      board: validBoard,
    };
    expect(decode(ValidateMoveResponseSchema, input)).toMatchObject({
      _tag: "Right",
    });
  });
});

describe("HintResponseSchema", () => {
  it("accepts value 9 (regression: was broken with between(0,8))", () => {
    const input = {
      row: 0,
      col: 0,
      value: 9,
      board: validBoard,
      solved: false,
      message: "hint",
    };
    expect(decode(HintResponseSchema, input)).toMatchObject({ _tag: "Right" });
  });
  it("accepts value 0", () => {
    const input = {
      row: 0,
      col: 0,
      value: 0,
      board: validBoard,
      solved: false,
      message: "hint",
    };
    expect(decode(HintResponseSchema, input)).toMatchObject({ _tag: "Right" });
  });
  it("rejects value -1", () => {
    const input = {
      row: 0,
      col: 0,
      value: -1,
      board: validBoard,
      solved: false,
      message: "hint",
    };
    expect(decode(HintResponseSchema, input)).toMatchObject({ _tag: "Left" });
  });
  it("rejects negative value", () => {
    const input = {
      row: 0,
      col: 0,
      value: -1,
      board: validBoard,
      solved: false,
      message: "hint",
    };
    expect(decode(HintResponseSchema, input)).toMatchObject({ _tag: "Left" });
  });
});

describe("GameStateResponseSchema", () => {
  it("accepts valid game state", () => {
    const input = {
      id: "abc",
      board: validBoard,
      givenMask: Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => false),
      ),
      difficulty: "medium",
      hintsUsed: 2,
      movesCount: 15,
      status: "active",
      elapsedSeconds: 120,
    };
    expect(decode(GameStateResponseSchema, input)).toMatchObject({
      _tag: "Right",
    });
  });
  it("rejects negative hintsUsed", () => {
    const input = {
      id: "abc",
      board: validBoard,
      givenMask: Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => false),
      ),
      difficulty: "medium",
      hintsUsed: -1,
      movesCount: 15,
      status: "active",
      elapsedSeconds: 120,
    };
    expect(decode(GameStateResponseSchema, input)).toMatchObject({
      _tag: "Left",
    });
  });
  it("rejects non-integer elapsedSeconds", () => {
    const input = {
      id: "abc",
      board: validBoard,
      givenMask: Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => false),
      ),
      difficulty: "medium",
      hintsUsed: 0,
      movesCount: 0,
      status: "active",
      elapsedSeconds: 12.5,
    };
    expect(decode(GameStateResponseSchema, input)).toMatchObject({
      _tag: "Left",
    });
  });
});
