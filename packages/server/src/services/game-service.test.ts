import { describe, it, expect } from "vitest";
import { Effect, Random } from "effect";
import { makeGameService } from "./game-service.js";
import { GameStore, makeGameStore } from "./game-store.js";

const withTestScope = <A>(
  seed: string,
  fn: (svc: GameService) => Effect.Effect<A>,
) => {
  const store = Effect.runSync(makeGameStore);
  return Effect.runSync(
    Effect.gen(function* () {
      const svc = yield* makeGameService;
      return yield* fn(svc);
    }).pipe(
      Effect.provideService(GameStore, store),
      Effect.withRandom(Random.make(seed)),
    ),
  );
};

describe("game-service", () => {
  describe("createGame", () => {
    it("returns CreateGameResponse with valid structure", () => {
      const result = withTestScope("cs-1", (svc) =>
        svc.createGame({ difficulty: "easy" }),
      );
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("board");
      expect(result).toHaveProperty("givenMask");
      expect(result).toHaveProperty("difficulty");
      expect(result.difficulty).toBe("easy");
      expect(result.board.length).toBe(9);
      expect(result.givenMask.length).toBe(9);
      expect(typeof result.id).toBe("string");
    });
    it("creates game with correct difficulty", { timeout: 15000 }, () => {
      const result = withTestScope("cs-2", (svc) =>
        svc.createGame({ difficulty: "hard" }),
      );
      expect(result.difficulty).toBe("hard");
    });
    it("rejects invalid difficulty", () => {
      expect(() =>
        withTestScope("cs-3", (svc) =>
          svc.createGame({ difficulty: "impossible" }),
        ),
      ).toThrow();
    });
  });

  describe("getGame", () => {
    it("returns full game state for existing game", () => {
      const result = withTestScope("gg-1", (svc) =>
        Effect.gen(function* () {
          const created = yield* svc.createGame({ difficulty: "medium" });
          const state = yield* svc.getGame(created.id);
          return state;
        }),
      );
      expect(result.id).toBeDefined();
      expect(result.board.length).toBe(9);
      expect(result.givenMask.length).toBe(9);
      expect(result.difficulty).toBe("medium");
      expect(result.hintsUsed).toBe(0);
      expect(result.movesCount).toBe(0);
      expect(result.status).toBe("active");
      expect(result.elapsedSeconds).toBeGreaterThanOrEqual(0);
    });
    it("fails for nonexistent id", () => {
      expect(() =>
        withTestScope("gg-2", (svc) => svc.getGame("nonexistent")),
      ).toThrow();
    });
  });

  describe("submitMove", () => {
    it("rejects invalid request schema (out-of-range row)", () => {
      expect(() =>
        withTestScope("sm-1", (svc) =>
          Effect.gen(function* () {
            const created = yield* svc.createGame({ difficulty: "easy" });
            return yield* svc.submitMove(created.id, {
              row: 99,
              col: 0,
              value: 5,
            });
          }),
        ),
      ).toThrow();
    });
    // Note: store.modify returns undefined for nonexistent ids (does not fail).
    // The service layer returns undefined in this case.
    it("returns undefined for nonexistent game", () => {
      const result = withTestScope("sm-2", (svc) =>
        svc.submitMove("nonexistent", { row: 0, col: 0, value: 5 }),
      );
      expect(result).toBeUndefined();
    });
  });

  describe("hint", () => {
    it("rejects invalid request schema (missing fields)", () => {
      expect(() =>
        withTestScope("h-1", (svc) =>
          Effect.gen(function* () {
            const created = yield* svc.createGame({ difficulty: "easy" });
            return yield* svc.hint(created.id, {});
          }),
        ),
      ).toThrow();
    });
    // Note: same store.modify behavior as submitMove
    it("returns undefined for nonexistent id", () => {
      const result = withTestScope("h-2", (svc) =>
        svc.hint("nonexistent", { row: 0, col: 0 }),
      );
      expect(result).toBeUndefined();
    });
  });
});
