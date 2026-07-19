import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/extension/**/*.test.ts",
      "apps/server/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@stonegy/helper": resolve(__dirname, "packages/helper/src"),
      "@stonegy/game-data": resolve(__dirname, "packages/game-data/src"),
      "@stonegy/ui": resolve(__dirname, "packages/ui/src"),
    },
  },
});
