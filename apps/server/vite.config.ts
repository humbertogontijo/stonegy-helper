import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(__dirname, "client"),
  resolve: {
    alias: {
      "@stonegy/helper": resolve(ROOT, "packages/helper/src"),
      "@stonegy/game-data": resolve(ROOT, "packages/game-data/src"),
      "@stonegy/ui": resolve(ROOT, "packages/ui/src"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
  server: {
    middlewareMode: true,
  },
  appType: "custom",
});
