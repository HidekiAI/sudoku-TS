import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "shared",
      root: "./packages/shared",
      include: ["src/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "server",
      root: "./packages/server",
      include: ["src/**/*.test.ts"],
    },
  },
]);
