import { Effect, Console, Config, Option, Fiber } from "effect";
import { HttpMiddleware, HttpServerRequest } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";
import { router } from "./routes/game-routes.js";
import { GameStore, makeGameStore } from "./services/game-store.js";
import { GameService, makeGameService } from "./services/game-service.js";

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

type RunResult = {
  readonly kind: "shutdown" | "crashed";
  readonly message: string;
  readonly port: number;
  readonly host: string;
};

const program = Effect.gen(function* (_) {
  yield* applyCliArgs;
  const port = yield* Config.number("PORT").pipe(Config.withDefault(8000));
  const host = yield* Config.string("HOST").pipe(Config.withDefault("0.0.0.0"));
  const store = yield* makeGameStore;
  const svc = yield* Effect.provideService(makeGameService, GameStore, store);
  const nodeServer = yield* NodeHttpServer.make(createServer, { port, host });
  const fiber = yield* nodeServer
    .serve(router, corsWithLogging)
    .pipe(
      Effect.provideService(GameStore, store),
      Effect.provideService(GameService, svc),
      Effect.fork,
    );
  yield* Console.log(`Sudoku server started on http://${host}:${port}`);

  yield* Effect.async<void>((resume) => {
    const onSignal = () => {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      resume(Effect.void);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });

  yield* Fiber.interrupt(fiber);

  const result: RunResult = {
    kind: "shutdown",
    message: "Server shut down gracefully",
    port,
    host,
  };
  yield* Console.log(JSON.stringify(result));
});

NodeRuntime.runMain(
  Effect.scoped(program).pipe(
    Effect.catchAll((e) =>
      Console.error(
        JSON.stringify({
          kind: "crashed",
          message: `Server error: ${e}`,
        } satisfies Omit<RunResult, "port" | "host">),
      ),
    ),
  ),
);
