import {
  Array,
  Clock,
  Context,
  Effect,
  HashMap,
  Layer,
  SynchronizedRef,
  Random,
  Option,
} from "effect";
import type { Board, Difficulty, GameStatus } from "@sudoku-ts/shared";

export interface GameSession {
  readonly id: string;
  readonly difficulty: Difficulty;
  readonly board: Board;
  readonly solution: Board;
  readonly givenMask: boolean[][];
  readonly startTime: number;
  readonly hintsUsed: number;
  readonly status: GameStatus;
  readonly movesCount: number;
}

export interface GameStore {
  readonly create: (
    difficulty: Difficulty,
    board: Board,
    solution: Board,
    givenMask: boolean[][],
  ) => Effect.Effect<string>;
  readonly get: (id: string) => Effect.Effect<GameSession>;
  readonly update: (
    id: string,
    patch: Partial<GameSession>,
  ) => Effect.Effect<void>;
  readonly exists: (id: string) => Effect.Effect<boolean>;
}

export const GameStore = Context.GenericTag<GameStore>("GameStore");

export const makeGameStore = Effect.gen(function* (_) {
  const store = yield* SynchronizedRef.make(
    HashMap.empty<string, GameSession>(),
  );

  const generateId: Effect.Effect<string> = Effect.gen(function* (_) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const indices = yield* Effect.all(
      Array.makeBy(12, () => Random.nextIntBetween(0, chars.length)),
    );
    return indices.map((i) => chars[i]!).join("");
  });

  const create = (
    difficulty: Difficulty,
    board: Board,
    solution: Board,
    givenMask: boolean[][],
  ) =>
    Effect.gen(function* (_) {
      const id = yield* generateId;
      const now = yield* Clock.currentTimeMillis;
      const session: GameSession = {
        id,
        difficulty,
        board,
        solution,
        givenMask,
        startTime: now,
        hintsUsed: 0,
        status: "active" as GameStatus,
        movesCount: 0,
      };
      yield* SynchronizedRef.update(store, (map) =>
        HashMap.set(map, id, session),
      );
      return id;
    });

  const get = (id: string) =>
    Effect.gen(function* (_) {
      const map = yield* SynchronizedRef.get(store);
      const session = HashMap.get(map, id);
      return yield* Option.match(session, {
        onNone: () => Effect.fail(new Error(`Game not found: ${id}`)),
        onSome: (s) => Effect.succeed(s),
      });
    });

  const update = (id: string, patch: Partial<GameSession>) =>
    Effect.gen(function* (_) {
      yield* SynchronizedRef.update(store, (map) => {
        const current = HashMap.get(map, id);
        if (Option.isNone(current)) return map;
        const updated: GameSession = { ...current.value, ...patch };
        return HashMap.set(map, id, updated);
      });
    });

  const exists = (id: string) =>
    Effect.gen(function* (_) {
      const map = yield* SynchronizedRef.get(store);
      return HashMap.has(map, id);
    });

  return { create, get, update, exists } as GameStore;
});

export const GameStoreLive = Layer.effect(GameStore, makeGameStore);
