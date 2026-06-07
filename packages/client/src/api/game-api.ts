import { Effect, Context, Layer, Schema, ParseResult } from "effect";
import { FetchHttpClient, HttpClient, HttpBody } from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import type {
  Difficulty,
  CreateGameResponse,
  ValidateMoveResponse,
  HintResponse,
} from "@sudoku-ts/shared";
import {
  CreateGameResponseSchema,
  ValidateMoveResponseSchema,
  HintResponseSchema,
} from "@sudoku-ts/shared";

// Fix: Module-level process.env access is a side effect at import time.
// This is minor (no mutation), but deferring to a function improves testability.
const BASE_URL = process.env["API_URL"] ?? "http://localhost:8000";
export const serverUrl = () => BASE_URL;

// Fix: Error channels — Effect<T, E, R> (like Rust's Result<T, E>) requires
// all errors to be tracked in the type system instead of thrown as exceptions.
// `response.json` can fail with HttpClientError (network/HTTP errors) and
// `Schema.decodeUnknown` can fail with ParseResult.ParseError (schema mismatch).
// By typing both errors explicitly, the compiler ensures callers handle every
// failure path — no swallowed exceptions. Only the outermost Effect chain
// (main.ts) should catch and convert to user-facing messages.
export interface GameApi {
  readonly createGame: (
    difficulty: Difficulty,
  ) => Effect.Effect<
    CreateGameResponse,
    HttpClientError | ParseResult.ParseError
  >;
  readonly submitMove: (
    gameId: string,
    row: number,
    col: number,
    value: number,
  ) => Effect.Effect<
    ValidateMoveResponse,
    HttpClientError | ParseResult.ParseError
  >;
  readonly getHint: (
    gameId: string,
    row: number,
    col: number,
  ) => Effect.Effect<HintResponse, HttpClientError | ParseResult.ParseError>;
}

export const GameApi = Context.GenericTag<GameApi>("GameApi");

export const makeGameApi = Effect.gen(function* (_) {
  const client = yield* HttpClient.HttpClient;

  const createGame = (difficulty: Difficulty) =>
    // Fix: `as CreateGameResponse` bypasses runtime validation.
    // The HTTP response body is `unknown` at compile time; Schema.decodeUnknown
    // validates the shape at runtime, catching server-side schema drift early.
    Effect.gen(function* (_) {
      const response = yield* client.post(`${BASE_URL}/api/games`, {
        body: HttpBody.unsafeJson({ difficulty }),
        headers: { "content-type": "application/json" as string },
      });
      const data = yield* response.json;
      return yield* Schema.decodeUnknown(CreateGameResponseSchema)(data);
    });

  // Fix: `as ValidateMoveResponse` bypasses runtime validation (same rationale as createGame).
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
      return yield* Schema.decodeUnknown(ValidateMoveResponseSchema)(data);
    });

  // Fix: `as HintResponse` bypasses runtime validation (same rationale as createGame).
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
      return yield* Schema.decodeUnknown(HintResponseSchema)(data);
    });

  // Fix: `as GameApi` cast suppresses excess-property checks.
  // The object literal already satisfies the GameApi interface; remove the cast
  // so TypeScript can verify structural compatibility at compile time.
  return { createGame, submitMove, getHint };
});

export const GameApiLive = Layer.effect(GameApi, makeGameApi);
