import { Effect, Context, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpBody } from "@effect/platform";
import type {
  Difficulty,
  CreateGameResponse,
  ValidateMoveResponse,
  HintResponse,
} from "@sudoku-ts/shared";

const BASE_URL = process.env["API_URL"] ?? "http://localhost:8000";
export const serverUrl = () => BASE_URL;

export interface GameApi {
  readonly createGame: (
    difficulty: Difficulty,
  ) => Effect.Effect<CreateGameResponse>;
  readonly submitMove: (
    gameId: string,
    row: number,
    col: number,
    value: number,
  ) => Effect.Effect<ValidateMoveResponse>;
  readonly getHint: (
    gameId: string,
    row: number,
    col: number,
  ) => Effect.Effect<HintResponse>;
}

export const GameApi = Context.GenericTag<GameApi>("GameApi");

export const makeGameApi = Effect.gen(function* (_) {
  const client = yield* HttpClient.HttpClient;

  const createGame = (difficulty: Difficulty) =>
    Effect.gen(function* (_) {
      const response = yield* client.post(`${BASE_URL}/api/games`, {
        body: HttpBody.unsafeJson({ difficulty }),
        headers: { "content-type": "application/json" as string },
      });
      const data = yield* response.json;
      return data as CreateGameResponse;
    });

  const submitMove = (
    gameId: string,
    row: number,
    col: number,
    value: number,
  ) =>
    Effect.gen(function* (_) {
      const response = yield* client.post(
        `${BASE_URL}/api/games/${gameId}/moves`,
        {
          body: HttpBody.unsafeJson({ row, col, value }),
          headers: { "content-type": "application/json" as string },
        },
      );
      const data = yield* response.json;
      return data as ValidateMoveResponse;
    });

  const getHint = (gameId: string, row: number, col: number) =>
    Effect.gen(function* (_) {
      const response = yield* client.post(
        `${BASE_URL}/api/games/${gameId}/hints`,
        {
          body: HttpBody.unsafeJson({ row, col }),
          headers: { "content-type": "application/json" as string },
        },
      );
      const data = yield* response.json;
      return data as HintResponse;
    });

  return { createGame, submitMove, getHint } as GameApi;
});

export const GameApiLive = Layer.effect(GameApi, makeGameApi);
