import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Effect, Random, Schema } from "effect";
import { createServer } from "node:http";
import { GameStore, makeGameStore } from "../services/game-store.js";
import { GameService, makeGameService } from "../services/game-service.js";
import {
  CreateGameRequestSchema,
  SubmitMoveRequestSchema,
  HintRequestSchema,
} from "@sudoku-ts/shared";

let baseUrl: string;
let cleanup: () => Promise<void>;

const store = Effect.runSync(makeGameStore);
const svc = Effect.runSync(
  Effect.provideService(makeGameService, GameStore, store).pipe(
    Effect.withRandom(Random.make("e2e")),
  ),
);

beforeAll(async () => {
  const server = createServer(async (nodeReq, nodeRes) => {
    const chunks: Buffer[] = [];
    for await (const chunk of nodeReq) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    const body = rawBody.length > 0 ? JSON.parse(rawBody.toString()) : {};
    const url = nodeReq.url ?? "/";
    const method = nodeReq.method ?? "GET";
    const send = (status: number, data: unknown) => {
      nodeRes.writeHead(status, { "content-type": "application/json" });
      nodeRes.end(JSON.stringify(data));
    };

    try {
      // Simple manual routing to test the service integration
      let result: unknown;

      if (method === "POST" && url === "/api/games") {
        result = Effect.runSync(
          svc.createGame(body).pipe(Effect.withRandom(Random.make("e2e"))),
        );
        send(201, result);
      } else if (method === "GET" && url.startsWith("/api/games/")) {
        const id = url.replace("/api/games/", "").split("/")[0] ?? "";
        result = Effect.runSync(svc.getGame(id));
        send(200, result);
      } else if (
        method === "POST" &&
        url.match(/^\/api\/games\/[^/]+\/moves$/)
      ) {
        const id = url.replace("/api/games/", "").replace("/moves", "");
        result = Effect.runSync(
          svc.submitMove(id, body).pipe(Effect.withRandom(Random.make("e2e"))),
        );
        send(200, result);
      } else if (
        method === "POST" &&
        url.match(/^\/api\/games\/[^/]+\/hints$/)
      ) {
        const id = url.replace("/api/games/", "").replace("/hints", "");
        const hintResult = Effect.runSync(
          svc.hint(id, body).pipe(Effect.withRandom(Random.make("e2e"))),
        );
        // store.modify returns undefined for nonexistent ids (does not fail)
        if (hintResult === undefined) {
          send(500, { error: "Game not found" });
        } else {
          send(200, hintResult);
        }
      } else {
        send(404, { error: "Not found" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      send(500, { error: message });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${
        addr && typeof addr === "object" ? addr.port : 0
      }`;
      resolve();
    });
  });

  cleanup = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

afterAll(async () => {
  await cleanup?.();
});

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function get(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  const data = await response.json();
  return { status: response.status, data };
}

describe("game API (E2E)", () => {
  it("POST /api/games creates a game (201)", async () => {
    const { status, data } = await post("/api/games", { difficulty: "easy" });
    expect(status).toBe(201);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("board");
    expect(data).toHaveProperty("givenMask");
    expect(data.difficulty).toBe("easy");
  });

  it("POST /api/games propagates Schema.ParseError on invalid body", async () => {
    const { status } = await post("/api/games", { difficulty: "impossible" });
    expect(status).toBe(500);
    // Schema.ParseError surfaces as Effect.fail — caught and returned as 500
  });

  it("GET /api/games/:id returns game state (200)", async () => {
    const created = await post("/api/games", { difficulty: "medium" });
    const { status, data } = await get(`/api/games/${created.data.id}`);
    expect(status).toBe(200);
    expect(data.id).toBe(created.data.id);
    expect(data.difficulty).toBe("medium");
    expect(data.hintsUsed).toBe(0);
    expect(data.movesCount).toBe(0);
    expect(data.status).toBe("active");
  });

  it("GET /api/games/:id returns 500 for nonexistent id", async () => {
    const { status } = await get("/api/games/nonexistent");
    expect(status).toBe(500);
  });

  it("POST /api/games/:id/moves validates schema on request body", async () => {
    const created = await post("/api/games", { difficulty: "easy" });
    const { status } = await post(`/api/games/${created.data.id}/moves`, {
      row: 99,
      col: 0,
      value: 5,
    });
    expect(status).toBe(500);
  });

  it("POST /api/games/:id/hints returns a hint (200)", async () => {
    const created = await post("/api/games", { difficulty: "easy" });
    const { status, data } = await post(`/api/games/${created.data.id}/hints`, {
      row: 0,
      col: 0,
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("row");
    expect(data).toHaveProperty("col");
    expect(data).toHaveProperty("value");
    expect(data).toHaveProperty("board");
    expect(data).toHaveProperty("solved");
    expect(data).toHaveProperty("message");
  });

  it("POST /api/games/:id/hints returns 500 for nonexistent id", async () => {
    const { status } = await post("/api/games/nonexistent/hints", {
      row: 0,
      col: 0,
    });
    expect(status).toBe(500);
  });

  it("full game flow: create → get → move on given cell", async () => {
    const created = await post("/api/games", { difficulty: "easy" });
    const gameId = created.data.id;
    const initialBoard = created.data.board;

    const moveOnGiven = await post(`/api/games/${gameId}/moves`, {
      row: 0,
      col: 0,
      value: 5,
    });
    expect(moveOnGiven.data.valid).toBe(false);
    expect(moveOnGiven.data.message).toBe("Cannot change a given cell");

    const state = await get(`/api/games/${gameId}`);
    expect(state.data.board).toEqual(initialBoard);
  });
});
