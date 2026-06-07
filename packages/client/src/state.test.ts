import { describe, it, expect } from "vitest";
import {
  initialState,
  setGame,
  updateBoard,
  moveCursor,
  showMessage,
  quit,
  setConnecting,
} from "./state.js";
import type { Board, CellValue } from "@sudoku-ts/shared";

const emptyBoard: Board = Array.from({ length: 9 }, () =>
  Array.from({ length: 9 }, () => 0 as CellValue),
);

const givenMask: boolean[][] = Array.from({ length: 9 }, () =>
  Array.from({ length: 9 }, () => false),
);

describe("initialState", () => {
  it("has phase = menu", () => {
    expect(initialState.phase).toBe("menu");
  });
  it("has cursor at (0,0)", () => {
    expect(initialState.cursor).toEqual({ row: 0, col: 0 });
  });
});

describe("setGame", () => {
  const state = setGame(initialState, "game-1", "hard", emptyBoard, givenMask);

  it("transitions to playing phase", () => {
    expect(state.phase).toBe("playing");
    expect(state.status).toBe("active");
  });
  it("sets gameId and difficulty", () => {
    expect(state.gameId).toBe("game-1");
    expect(state.difficulty).toBe("hard");
  });
  it("resets cursor to (0,0)", () => {
    expect(state.cursor).toEqual({ row: 0, col: 0 });
  });
  it("resets moves and hints to 0", () => {
    expect(state.movesCount).toBe(0);
    expect(state.hintsUsed).toBe(0);
  });
  it("resets conflicts to all false", () => {
    const allFalse = state.conflicts.every((row) =>
      row.every((c) => c === false),
    );
    expect(allFalse).toBe(true);
  });
  it("does not mutate original state", () => {
    expect(initialState.phase).toBe("menu");
  });
});

describe("updateBoard", () => {
  const playing = setGame(initialState, "g1", "easy", emptyBoard, givenMask);

  it("increments movesCount", () => {
    const result = updateBoard(playing, emptyBoard, "Correct", false);
    expect(result.movesCount).toBe(1);
  });
  it("sets conflict at given coordinate", () => {
    const result = updateBoard(playing, emptyBoard, "Wrong", false, {
      row: 2,
      col: 3,
      isConflict: true,
    });
    expect(result.conflicts[2][3]).toBe(true);
  });
  it("clears conflict at given coordinate", () => {
    const result = updateBoard(playing, emptyBoard, "Ok", true, {
      row: 2,
      col: 3,
      isConflict: false,
    });
    expect(result.conflicts[2][3]).toBe(false);
  });
  it("does not modify original state conflicts", () => {
    updateBoard(playing, emptyBoard, "test", false, {
      row: 2,
      col: 3,
      isConflict: true,
    });
    expect(playing.conflicts[2][3]).toBe(false);
  });
  it("sets phase to completed when solved", () => {
    const result = updateBoard(playing, emptyBoard, "Solved!", true);
    expect(result.phase).toBe("completed");
    expect(result.status).toBe("completed");
  });
  it("keeps phase unchanged when not solved", () => {
    const result = updateBoard(playing, emptyBoard, "Correct", false);
    expect(result.phase).toBe("playing");
  });
  it("preserves board on no-conflict update", () => {
    const result = updateBoard(playing, emptyBoard, "Ok", false);
    expect(result.conflicts.every((r) => r.every((c) => c === false))).toBe(
      true,
    );
  });
});

describe("moveCursor", () => {
  const playing = setGame(initialState, "g1", "easy", emptyBoard, givenMask);

  it("moves right", () => {
    expect(moveCursor(playing, 0, 1).cursor).toEqual({ row: 0, col: 1 });
  });
  it("moves down", () => {
    expect(moveCursor(playing, 1, 0).cursor).toEqual({ row: 1, col: 0 });
  });
  it("clamps at row 0", () => {
    expect(moveCursor(playing, -1, 0).cursor).toEqual({ row: 0, col: 0 });
  });
  it("clamps at col 0", () => {
    expect(moveCursor(playing, 0, -1).cursor).toEqual({ row: 0, col: 0 });
  });
  it("clamps at row 8", () => {
    const atBottom = moveCursor(playing, 8, 0);
    expect(moveCursor(atBottom, 1, 0).cursor).toEqual({ row: 8, col: 0 });
  });
  it("clamps at col 8", () => {
    const atRight = moveCursor(playing, 0, 8);
    expect(moveCursor(atRight, 0, 1).cursor).toEqual({ row: 0, col: 8 });
  });
});

describe("showMessage", () => {
  it("sets message", () => {
    const state = showMessage(initialState, "Hello");
    expect(state.message).toBe("Hello");
  });
});

describe("quit", () => {
  it("sets phase to quit", () => {
    expect(quit(initialState).phase).toBe("quit");
  });
});

describe("setConnecting", () => {
  const state = setConnecting(initialState);
  it("sets phase to connecting", () => {
    expect(state.phase).toBe("connecting");
  });
  it("sets message", () => {
    expect(state.message).toBe("Connecting...");
  });
});
