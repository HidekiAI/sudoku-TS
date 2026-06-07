import { Struct } from "effect";
import type {
  Board,
  Difficulty,
  GameStatus,
  CellValue,
} from "@sudoku-ts/shared";

export interface ClientState {
  readonly phase: "menu" | "connecting" | "playing" | "completed" | "quit";
  readonly gameId: string;
  readonly difficulty: Difficulty;
  readonly board: Board;
  readonly givenMask: boolean[][];
  readonly conflicts: boolean[][];
  readonly cursor: { readonly row: number; readonly col: number };
  readonly status: GameStatus;
  readonly message: string;
  readonly hintsUsed: number;
  readonly movesCount: number;
  readonly elapsedSeconds: number;
}

export const initialState: ClientState = {
  phase: "menu",
  gameId: "",
  difficulty: "easy",
  board: Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => 0 as CellValue),
  ),
  givenMask: Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => false),
  ),
  conflicts: Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => false),
  ),
  cursor: { row: 0, col: 0 },
  status: "active",
  message: "Press Enter to start a new game | q to quit",
  hintsUsed: 0,
  movesCount: 0,
  elapsedSeconds: 0,
};

// Fix: Unused export — `setBoard` was never imported by any consumer.
// Removing dead exports keeps the module boundary clean and predictable.

export function setGame(
  state: ClientState,
  gameId: string,
  difficulty: Difficulty,
  board: Board,
  givenMask: boolean[][],
): ClientState {
  return Struct.evolve(state, {
    phase: () => "playing" as const,
    gameId: () => gameId,
    difficulty: () => difficulty,
    board: () => board,
    givenMask: () => givenMask,
    conflicts: () =>
      Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => false)),
    cursor: () => ({ row: 0, col: 0 }),
    status: () => "active" as const,
    message: () =>
      "arrows/wasd/hjkl to move | 1-9 place | 0 erase | ? hint | q quit",
    hintsUsed: () => 0,
    movesCount: () => 0,
    elapsedSeconds: () => 0,
  });
}

// Fix: Mutation + non-null assertion bypasses FP purity and noUncheckedIndexedAccess.
// Replaced with a pure `map` that returns a new array — no `!`, no side effects.
export function updateBoard(
  state: ClientState,
  board: Board,
  message: string,
  solved: boolean,
  conflict?: {
    readonly row: number;
    readonly col: number;
    readonly isConflict: boolean;
  },
): ClientState {
  const newConflicts = conflict
    ? state.conflicts.map((r, ri) =>
        ri === conflict.row
          ? r.map((c, ci) => (ci === conflict.col ? conflict.isConflict : c))
          : r,
      )
    : state.conflicts;
  return Struct.evolve(state, {
    board: () => board,
    movesCount: (n) => n + 1,
    message: () => message,
    conflicts: () => newConflicts,
    phase: (p) => (solved ? "completed" : p),
    status: (s) => (solved ? "completed" : s),
  });
}

export function moveCursor(
  state: ClientState,
  dRow: number,
  dCol: number,
): ClientState {
  const row = Math.max(0, Math.min(8, state.cursor.row + dRow));
  const col = Math.max(0, Math.min(8, state.cursor.col + dCol));
  return Struct.evolve(state, { cursor: () => ({ row, col }) });
}

export function showMessage(state: ClientState, message: string): ClientState {
  return Struct.evolve(state, { message: () => message });
}

export function quit(state: ClientState): ClientState {
  return Struct.evolve(state, { phase: () => "quit" as const });
}

// Fix: Unused export — same as setBoard; no consumer imports this function.
// Removing to maintain a tight, predictable API surface.

export function setConnecting(state: ClientState): ClientState {
  return Struct.evolve(state, {
    phase: () => "connecting" as const,
    message: () => "Connecting...",
  });
}
