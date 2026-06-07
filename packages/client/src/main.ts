import { Effect, Console, Layer, Option } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { GameApi, GameApiLive } from "./api/game-api.js";
import { render } from "./ui/render.js";
import { makeReadKey, type KeyEvent } from "./ui/input.js";
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
        const result = yield* api.createGame(state.difficulty).pipe(
          Effect.map(Option.some),
          Effect.catchAll(() => Effect.succeed(Option.none())),
        );
        if (Option.isSome(result)) {
          const r = result.value;
          return setGame(state, r.id, r.difficulty, r.board, r.givenMask);
        }
        return setConnecting(state);
      });
    }
    // Fix: Non-null assertion on dynamic key access bypasses type safety.
    // Use Option.fromNullable for explicit FP unwrapping.
    if (key.kind === "char") {
      const diff = Option.fromNullable(diffMap[key.value]);
      if (Option.isSome(diff)) {
        return Effect.succeed(
          showMessage(
            state,
            `Difficulty: ${diff.value}. Press Enter to start.`,
          ),
        );
      }
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
        const result = yield* api
          .submitMove(state.gameId, row, col, value)
          .pipe(
            Effect.catchAll(() =>
              Effect.succeed({
                valid: false,
                message: "Server error",
                solved: false,
                board: state.board,
              }),
            ),
          );
        const conflict =
          !result.valid && value !== 0
            ? { row, col, isConflict: true as const }
            : result.valid
              ? { row, col, isConflict: false as const }
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
        const result = yield* api.getHint(state.gameId, row, col).pipe(
          Effect.map(Option.some),
          Effect.catchAll(() => Effect.succeed(Option.none())),
        );
        if (Option.isSome(result)) {
          const r = result.value;
          return updateBoard(state, r.board, r.message, r.solved, {
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
  readKey: Effect.Effect<KeyEvent>,
): Effect.Effect<ClientState, never, GameApi> {
  return Effect.gen(function* (_) {
    yield* render(state);
    const nextState = yield* Effect.race(
      readKey.pipe(
        Effect.map((key) => (key.kind === "quit" ? initialState : state)),
      ),
      Effect.sleep(2000).pipe(
        Effect.flatMap(() =>
          Effect.gen(function* (_2) {
            const api = yield* GameApi;
            const result = yield* api.createGame(state.difficulty).pipe(
              Effect.map(Option.some),
              Effect.catchAll(() => Effect.succeed(Option.none())),
            );
            return Option.isSome(result)
              ? setGame(
                  state,
                  result.value.id,
                  result.value.difficulty,
                  result.value.board,
                  result.value.givenMask,
                )
              : state;
          }),
        ),
      ),
    );
    return nextState;
  });
}

function gameLoop(
  state: ClientState,
  readKey: Effect.Effect<KeyEvent>,
): Effect.Effect<ClientState, never, GameApi> {
  if (state.phase === "quit")
    return Effect.succeed(state) as Effect.Effect<ClientState, never, GameApi>;

  if (state.phase === "connecting") {
    return Effect.gen(function* (_) {
      const nextState = yield* tryConnect(state, readKey);
      return yield* gameLoop(nextState, readKey);
    });
  }

  return Effect.gen(function* (_) {
    yield* render(state);
    const key = yield* readKey;
    const newState = yield* handleKey(state, key);
    return yield* gameLoop(newState, readKey);
  });
}

const ClientLive = Layer.provide(GameApiLive, FetchHttpClient.layer);

Effect.runPromise(
  makeReadKey().pipe(
    Effect.flatMap(({ readKey, restoreStdin }) =>
      gameLoop(initialState, readKey).pipe(
        Effect.provide(ClientLive),
        Effect.ensuring(restoreStdin),
        Effect.catchAll((e) => Console.error(`Fatal error: ${e}`)),
      ),
    ),
  ),
);
