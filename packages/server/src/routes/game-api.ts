import { Effect, Schema } from "effect";
import {
  HttpApi,
  HttpApiGroup,
  HttpApiEndpoint,
  OpenApi,
} from "@effect/platform";
import {
  CreateGameRequestSchema,
  CreateGameResponseSchema,
  GameStateResponseSchema,
  SubmitMoveRequestSchema,
  ValidateMoveResponseSchema,
  HintRequestSchema,
  HintResponseSchema,
} from "@sudoku-ts/shared";

const api = HttpApi.make("sudoku").add(
  HttpApiGroup.make("games")
    .add(
      HttpApiEndpoint.post("createGame", "/api/games")
        .setPayload(CreateGameRequestSchema)
        .addSuccess(CreateGameResponseSchema, { status: 201 }),
    )
    .add(
      HttpApiEndpoint.get("getGame", "/api/games/:id")
        .setPath(Schema.Struct({ id: Schema.String }))
        .addSuccess(GameStateResponseSchema),
    )
    .add(
      HttpApiEndpoint.post("submitMove", "/api/games/:id/moves")
        .setPath(Schema.Struct({ id: Schema.String }))
        .setPayload(SubmitMoveRequestSchema)
        .addSuccess(ValidateMoveResponseSchema),
    )
    .add(
      HttpApiEndpoint.post("hint", "/api/games/:id/hints")
        .setPath(Schema.Struct({ id: Schema.String }))
        .setPayload(HintRequestSchema)
        .addSuccess(HintResponseSchema),
    ),
);

export const openApiSpec = OpenApi.fromApi(api);
