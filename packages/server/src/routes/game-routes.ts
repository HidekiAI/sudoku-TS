import { Effect } from "effect";
import {
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
} from "@effect/platform";
import { GameService } from "../services/game-service.js";
import { openApiSpec } from "./game-api.js";

const createGameHandler = Effect.gen(function* (_) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json;
  const gameService = yield* GameService;
  const result = yield* gameService.createGame(body);
  return HttpServerResponse.unsafeJson(result, { status: 201 });
});

const getGameHandler = Effect.gen(function* (_) {
  const params = yield* HttpRouter.params;
  // Safety: HttpRouter only dispatches to this handler when :id is present in
  // the path. `?? ""` satisfies noUncheckedIndexedAccess; an empty string id
  // produces a "Game not found" error from store.get — the correct 404 path.
  const id = params["id"] ?? "";
  const gameService = yield* GameService;
  const result = yield* gameService.getGame(id);
  return HttpServerResponse.unsafeJson(result);
});

const hintHandler = Effect.gen(function* (_) {
  const params = yield* HttpRouter.params;
  // Safety: same as getGame — HttpRouter ensures :id is present at match time.
  const id = params["id"] ?? "";
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json;
  const gameService = yield* GameService;
  const result = yield* gameService.hint(id, body);
  return HttpServerResponse.unsafeJson(result);
});

const submitMoveHandler = Effect.gen(function* (_) {
  const params = yield* HttpRouter.params;
  // Safety: same as getGame — HttpRouter ensures :id is present at match time.
  const id = params["id"] ?? "";
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json;
  const gameService = yield* GameService;
  const result = yield* gameService.submitMove(id, body);
  return HttpServerResponse.unsafeJson(result);
});

const docsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sudoku API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>html { background: #1a1a2e; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });
    };
  </script>
</body>
</html>`;

const openApiHandler = Effect.succeed(
  HttpServerResponse.unsafeJson(openApiSpec),
);

const docsHandler = Effect.succeed(HttpServerResponse.html(docsHtml));

export const router = HttpRouter.empty.pipe(
  HttpRouter.post("/api/games", createGameHandler),
  HttpRouter.get("/api/games/:id", getGameHandler),
  HttpRouter.post("/api/games/:id/moves", submitMoveHandler),
  HttpRouter.post("/api/games/:id/hints", hintHandler),
  HttpRouter.get("/openapi.json", openApiHandler),
  HttpRouter.get("/docs", docsHandler),
);
