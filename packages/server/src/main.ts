import { Effect, Console, Config } from "effect";
import { HttpMiddleware, HttpServerRequest } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";
import { router } from "./routes/game-routes.js";
import { GameStore, makeGameStore } from "./services/game-store.js";
import { GameService, makeGameService } from "./services/game-service.js";

const parseArg = (key: string, args: string[]): string | null => {
  const idx = args.indexOf(`--${key}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]!;
  const eq = args.find((a) => a.startsWith(`--${key}=`));
  return eq ? eq.slice(`--${key}=`.length) : null;
};

const corsWithLogging = HttpMiddleware.make((app) =>
  Effect.gen(function* (_) {
    const req = yield* HttpServerRequest.HttpServerRequest;
    yield* Console.log(`→ ${req.method} ${req.url}`);
    const resp = yield* HttpMiddleware.cors()(app);
    yield* Console.log(`← ${req.method} ${req.url} ${resp.status}`);
    return resp;
  }),
);

const cliPort = parseArg("port", process.argv);
const cliHost = parseArg("host", process.argv);
if (cliPort !== null) process.env["PORT"] = cliPort;
if (cliHost !== null) process.env["HOST"] = cliHost;

const program = Effect.gen(function* (_) {
  const port = yield* Config.number("PORT").pipe(Config.withDefault(8000));
  const host = yield* Config.string("HOST").pipe(Config.withDefault("0.0.0.0"));
  const store = yield* makeGameStore;
  const svc = yield* Effect.provideService(makeGameService, GameStore, store);
  const nodeServer = yield* NodeHttpServer.make(createServer, { port, host });
  yield* nodeServer
    .serve(router, corsWithLogging)
    .pipe(
      Effect.provideService(GameStore, store),
      Effect.provideService(GameService, svc),
      Effect.fork,
    );
  yield* Console.log(`Sudoku server started on http://${host}:${port}`);
  yield* Effect.never;
});

NodeRuntime.runMain(
  Effect.scoped(program).pipe(
    Effect.catchAll((e) => Console.error(`Server error: ${e}`)),
  ),
);
