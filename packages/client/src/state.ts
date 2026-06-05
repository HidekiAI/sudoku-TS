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

export function setBoard(
  state: ClientState,
  board: Board,
  givenMask: boolean[][],
): ClientState {
  return { ...state, board, givenMask };
}

export function setGame(
  state: ClientState,
  gameId: string,
  difficulty: Difficulty,
  board: Board,
  givenMask: boolean[][],
): ClientState {
  return {
    ...state,
    phase: "playing",
    gameId,
    difficulty,
    board,
    givenMask,
    conflicts: Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => false),
    ),
    cursor: { row: 0, col: 0 },
    status: "active",
    message: "arrows/wasd/hjkl to move | 1-9 place | 0 erase | ? hint | q quit",
    hintsUsed: 0,
    movesCount: 0,
    elapsedSeconds: 0,
  };
}

export function updateBoard(
  state: ClientState,
  board: Board,
  message: string,
  solved: boolean,
  conflict?: { row: number; col: number; isConflict: boolean },
): ClientState {
  const newConflicts = state.conflicts.map((r) => [...r]);
  if (conflict) {
    newConflicts[conflict.row]![conflict.col] = conflict.isConflict;
  }
  return {
    ...state,
    board,
    movesCount: state.movesCount + 1,
    message,
    conflicts: newConflicts,
    phase: solved ? "completed" : state.phase,
    status: solved ? "completed" : state.status,
  };
}

export function moveCursor(
  state: ClientState,
  dRow: number,
  dCol: number,
): ClientState {
  const row = Math.max(0, Math.min(8, state.cursor.row + dRow));
  const col = Math.max(0, Math.min(8, state.cursor.col + dCol));
  return { ...state, cursor: { row, col } };
}

export function showMessage(state: ClientState, message: string): ClientState {
  return { ...state, message };
}

export function quit(state: ClientState): ClientState {
  return { ...state, phase: "quit" };
}

export function setDifficulty(
  state: ClientState,
  difficulty: Difficulty,
): ClientState {
  return { ...state, difficulty };
}

export function setConnecting(state: ClientState): ClientState {
  return { ...state, phase: "connecting", message: "Connecting..." };
}
