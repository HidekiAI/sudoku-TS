import { Effect, Console, Config, Option } from "effect";
import { HttpMiddleware, HttpServerRequest } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";
import { router } from "./routes/game-routes.js";
import { GameStore, makeGameStore } from "./services/game-store.js";
import { GameService, makeGameService } from "./services/game-service.js";

// Fix: Non-null assertion on array index bypasses noUncheckedIndexedAccess.
// Though bounds-checked, use Option.flatMap for explicit FP unwrapping.
const parseArg = (key: string, args: string[]): Option.Option<string> => {
  const idx = args.indexOf(`--${key}`);
  if (idx === -1) {
    const eq = args.find((a) => a.startsWith(`--${key}=`));
    return eq ? Option.some(eq.slice(`--${key}=`.length)) : Option.none();
  }
  return Option.flatMap(Option.fromNullable(args[idx + 1]), (v) =>
    Option.some(v),
  );
};

// Fix: Module-level side effects (process.env mutation at import time)
// violate FP purity. These are deferred into the Effect system so the runtime
// manages them as managed effects, improving testability and predictability.
const applyCliArgs: Effect.Effect<void> = Effect.gen(function* (_) {
  const cliPort = parseArg("port", process.argv);
  const cliHost = parseArg("host", process.argv);
  if (Option.isSome(cliPort)) process.env["PORT"] = cliPort.value;
  if (Option.isSome(cliHost)) process.env["HOST"] = cliHost.value;
});

const corsWithLogging = HttpMiddleware.make((app) =>
  Effect.gen(function* (_) {
    const req = yield* HttpServerRequest.HttpServerRequest;
    yield* Console.log(`→ ${req.method} ${req.url}`);
    const resp = yield* HttpMiddleware.cors()(app);
    yield* Console.log(`← ${req.method} ${req.url} ${resp.status}`);
    return resp;
  }),
);

const program = Effect.gen(function* (_) {
  yield* applyCliArgs;
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
