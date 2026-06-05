import { Effect } from "effect";
import {
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
} from "@effect/platform";
import { GameService } from "../services/game-service.js";

const createGameHandler = Effect.gen(function* (_) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json;
  const gameService = yield* GameService;
  const result = yield* gameService.createGame(body);
  return HttpServerResponse.unsafeJson(result, { status: 201 });
});

const getGameHandler = Effect.gen(function* (_) {
  const params = yield* HttpRouter.params;
  const id = params["id"] ?? "";
  const gameService = yield* GameService;
  const result = yield* gameService.getGame(id);
  return HttpServerResponse.unsafeJson(result);
});

const hintHandler = Effect.gen(function* (_) {
  const params = yield* HttpRouter.params;
  const id = params["id"] ?? "";
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json;
  const gameService = yield* GameService;
  const result = yield* gameService.hint(id, body);
  return HttpServerResponse.unsafeJson(result);
});

const submitMoveHandler = Effect.gen(function* (_) {
  const params = yield* HttpRouter.params;
  const id = params["id"] ?? "";
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json;
  const gameService = yield* GameService;
  const result = yield* gameService.submitMove(id, body);
  return HttpServerResponse.unsafeJson(result);
});

export const router = HttpRouter.empty.pipe(
  HttpRouter.post("/api/games", createGameHandler),
  HttpRouter.get("/api/games/:id", getGameHandler),
  HttpRouter.post("/api/games/:id/moves", submitMoveHandler),
  HttpRouter.post("/api/games/:id/hints", hintHandler),
);
