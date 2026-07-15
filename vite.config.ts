import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx, defineManifest } from "@crxjs/vite-plugin";
import baseManifest from "./manifest.json";
import { patchCrxHmrPort } from "./vite/patch-crx-hmr-port";

const FIREFOX_GECKO = {
  id: "stonegy-helper@stonegy.com",
  strict_min_version: "109.0",
  data_collection_permissions: {
    required: ["none"],
  },
};

export default defineConfig(({ mode }) => {
  const browser = mode === "firefox" ? "firefox" : "chrome";

  // CRX typings lag Firefox MV3 (`background.scripts`) and gecko permission literals.
  const manifest = defineManifest((() => {
    const next: Record<string, unknown> = structuredClone(baseManifest);
    const background = next.background as
      | { service_worker?: string; type?: string; scripts?: string[] }
      | undefined;

    if (browser === "firefox") {
      const worker = background?.service_worker;
      if (worker) {
        next.background = {
          scripts: [worker],
          type: background?.type,
        };
      }

      next.browser_specific_settings = { gecko: { ...FIREFOX_GECKO } };
    }

    return next;
  }) as never);

  return {
    test: {
      include: [
        "lib/**/*.test.ts",
        "cli/**/*.test.ts",
        "adapters/**/*.test.ts",
        "popup/src/**/*.test.ts",
      ],
    },
    plugins: [
      react(),
      tailwindcss(),
      crx({ browser, manifest }),
      patchCrxHmrPort(),
    ],
    resolve: {
      alias: {
        "@": "/popup/src",
        "@lib": "/lib",
      },
    },
    build: {
      // Keep Firefox out of `dist/` so loading that folder in Chrome never
      // hits MV2-only `background.scripts` from a Firefox build.
      outDir: browser === "firefox" ? "dist-firefox" : "dist",
      emptyOutDir: true,
    },
  };
});
