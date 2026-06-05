import { Effect, Console, Layer } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { GameApi, GameApiLive } from "./api/game-api.js";
import { render } from "./ui/render.js";
import { readKey, restoreStdin, type KeyEvent } from "./ui/input.js";
import {
  initialState,
  setGame,
  updateBoard,
  moveCursor,
  quit,
  showMessage,
  setConnecting,
  type ClientState,
} from "./state.js";

const diffMap: Record<string, "easy" | "medium" | "hard" | "expert"> = {
  e: "easy",
  m: "medium",
  h: "hard",
  x: "expert",
};

function handleKey(
  state: ClientState,
  key: KeyEvent,
): Effect.Effect<ClientState, never, GameApi> {
  if (state.phase === "menu") {
    if (key.kind === "enter") {
      return Effect.gen(function* (_) {
        const api = yield* GameApi;
        const result = yield* Effect.catchAll(
          api.createGame(state.difficulty),
          () => Effect.succeed(null as unknown as never),
        );
        if (result && "board" in result) {
          return setGame(
            state,
            result.id,
            result.difficulty,
            result.board,
            result.givenMask,
          );
        }
        return setConnecting(state);
      });
    }
    if (key.kind === "char" && diffMap[key.value]) {
      return Effect.succeed(
        showMessage(
          state,
          `Difficulty: ${diffMap[key.value]!}. Press Enter to start.`,
        ),
      );
    }
    if (key.kind === "quit") return Effect.succeed(quit(state));
    return Effect.succeed(state);
  }

  if (state.phase === "playing") {
    if (key.kind === "up") return Effect.succeed(moveCursor(state, -1, 0));
    if (key.kind === "down") return Effect.succeed(moveCursor(state, 1, 0));
    if (key.kind === "left") return Effect.succeed(moveCursor(state, 0, -1));
    if (key.kind === "right") return Effect.succeed(moveCursor(state, 0, 1));
    if (key.kind === "quit") return Effect.succeed(quit(state));

    if (key.kind === "number" || key.kind === "erase") {
      return Effect.gen(function* (_) {
        const api = yield* GameApi;
        const { row, col } = state.cursor;
        if (state.givenMask[row]?.[col]) {
          return showMessage(state, "Cannot change a given cell");
        }
        const value = key.kind === "erase" ? 0 : key.value;
        const result = yield* Effect.catchAll(
          api.submitMove(state.gameId, row, col, value),
          () =>
            Effect.succeed({
              valid: false,
              message: "Server error",
              solved: false,
              board: state.board,
            }),
        );
        const conflict =
          !result.valid && value !== 0
            ? { row, col, isConflict: true }
            : result.valid
              ? { row, col, isConflict: false }
              : undefined;
        return updateBoard(
          state,
          result.board,
          result.message,
          result.solved,
          conflict,
        );
      });
    }

    if (key.kind === "hint") {
      return Effect.gen(function* (_) {
        const api = yield* GameApi;
        const { row, col } = state.cursor;
        const result = yield* Effect.catchAll(
          api.getHint(state.gameId, row, col),
          () => Effect.succeed({} as never),
        );
        if (result && "board" in result) {
          return updateBoard(state, result.board, result.message, false, {
            row,
            col,
            isConflict: false,
          });
        }
        return showMessage(state, "Hint failed. Is the server running?");
      });
    }

    return Effect.succeed(state);
  }

  if (state.phase === "completed") {
    if (key.kind === "enter") return Effect.succeed(initialState);
    if (key.kind === "quit") return Effect.succeed(quit(state));
    return Effect.succeed(state);
  }

  return Effect.succeed(state);
}

function tryConnect(
  state: ClientState,
): Effect.Effect<ClientState, never, GameApi> {
  return Effect.gen(function* (_) {
    const api = yield* GameApi;
    const result = yield* Effect.catchAll(
      api.createGame(state.difficulty),
      () => Effect.succeed(null as unknown as never),
    );
    if (result && "board" in result) {
      return setGame(
        state,
        result.id,
        result.difficulty,
        result.board,
        result.givenMask,
      );
    }
    return state;
  });
}

function gameLoop(
  state: ClientState,
): Effect.Effect<ClientState, never, GameApi> {
  if (state.phase === "quit")
    return Effect.succeed(state) as Effect.Effect<ClientState, never, GameApi>;

  if (state.phase === "connecting") {
    return Effect.gen(function* (_) {
      yield* render(state);
      const nextState = yield* Effect.race(
        readKey().pipe(
          Effect.map((key) => (key.kind === "quit" ? initialState : state)),
        ),
        Effect.sleep(2000).pipe(Effect.flatMap(() => tryConnect(state))),
      );
      return yield* gameLoop(nextState);
    });
  }

  return Effect.gen(function* (_) {
    yield* render(state);
    const key = yield* readKey();
    const newState = yield* handleKey(state, key);
    return yield* gameLoop(newState);
  });
}

const ClientLive = Layer.provide(GameApiLive, FetchHttpClient.layer);

Effect.runPromise(
  gameLoop(initialState).pipe(
    Effect.provide(ClientLive),
    Effect.ensuring(restoreStdin()),
    Effect.catchAll((e) => Console.error(`Fatal error: ${e}`)),
  ),
);
