import { describe, it, expect, beforeEach } from "vitest";
import { Effect } from "effect";
import { makeGameStore } from "./game-store.js";
import type { Board } from "@sudoku-ts/shared";

const testBoard: Board = Array.from({ length: 9 }, () =>
  Array.from({ length: 9 }, () => 0),
);
const testSolution: Board = Array.from({ length: 9 }, () =>
  Array.from({ length: 9 }, () => 0),
);
const testMask: boolean[][] = Array.from({ length: 9 }, () =>
  Array.from({ length: 9 }, () => false),
);

describe("game-store", () => {
  let store: Effect.Effect.Success<ReturnType<typeof makeGameStore>>;

  beforeEach(() => {
    store = Effect.runSync(makeGameStore);
  });

  it("create returns a string id", () => {
    const id = Effect.runSync(
      store.create("easy", testBoard, testSolution, testMask),
    );
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
  it("create generates unique ids", () => {
    const id1 = Effect.runSync(
      store.create("easy", testBoard, testSolution, testMask),
    );
    const id2 = Effect.runSync(
      store.create("medium", testBoard, testSolution, testMask),
    );
    expect(id1).not.toBe(id2);
  });
  it("get returns the created session", () => {
    const id = Effect.runSync(
      store.create("hard", testBoard, testSolution, testMask),
    );
    const session = Effect.runSync(store.get(id));
    expect(session.id).toBe(id);
    expect(session.difficulty).toBe("hard");
    expect(session.hintsUsed).toBe(0);
    expect(session.movesCount).toBe(0);
    expect(session.status).toBe("active");
  });
  it("get fails for nonexistent id", () => {
    expect(() => Effect.runSync(store.get("nonexistent"))).toThrow();
  });
  it("exists returns true for existing game", () => {
    const id = Effect.runSync(
      store.create("easy", testBoard, testSolution, testMask),
    );
    expect(Effect.runSync(store.exists(id))).toBe(true);
  });
  it("exists returns false for nonexistent game", () => {
    expect(Effect.runSync(store.exists("nonexistent"))).toBe(false);
  });
  it("update modifies session fields", () => {
    const id = Effect.runSync(
      store.create("easy", testBoard, testSolution, testMask),
    );
    Effect.runSync(store.update(id, { hintsUsed: 3, movesCount: 10 }));
    const session = Effect.runSync(store.get(id));
    expect(session.hintsUsed).toBe(3);
    expect(session.movesCount).toBe(10);
    // Unchanged fields preserved
    expect(session.difficulty).toBe("easy");
    expect(session.status).toBe("active");
  });
  it("update on nonexistent id is no-op", () => {
    expect(() =>
      Effect.runSync(store.update("nonexistent", { hintsUsed: 1 })),
    ).not.toThrow();
  });
  it("modify returns the result and atomically updates", () => {
    const id = Effect.runSync(
      store.create("easy", testBoard, testSolution, testMask),
    );
    const result = Effect.runSync(
      store.modify(
        id,
        (session) =>
          [
            session.hintsUsed,
            { ...session, hintsUsed: session.hintsUsed + 1 },
          ] as const,
      ),
    );
    expect(result).toBe(0);
    const session = Effect.runSync(store.get(id));
    expect(session.hintsUsed).toBe(1);
  });
  it("modify returns undefined for nonexistent id", () => {
    const result = Effect.runSync(
      store.modify("nonexistent", (session) => [true, session] as const),
    );
    expect(result).toBeUndefined();
  });
  it("stores session with correct initial values", () => {
    const id = Effect.runSync(
      store.create("expert", testBoard, testSolution, testMask),
    );
    const session = Effect.runSync(store.get(id));
    expect(session.difficulty).toBe("expert");
    expect(session.startTime).toBeGreaterThan(0);
    expect(session.hintsUsed).toBe(0);
    expect(session.movesCount).toBe(0);
    expect(session.status).toBe("active");
  });
  it("multiple stores are isolated from each other", () => {
    const storeA = Effect.runSync(makeGameStore);
    const storeB = Effect.runSync(makeGameStore);
    const idA = Effect.runSync(
      storeA.create("easy", testBoard, testSolution, testMask),
    );
    const idB = Effect.runSync(
      storeB.create("hard", testBoard, testSolution, testMask),
    );
    expect(Effect.runSync(storeA.exists(idA))).toBe(true);
    expect(Effect.runSync(storeA.exists(idB))).toBe(false);
  });
});
