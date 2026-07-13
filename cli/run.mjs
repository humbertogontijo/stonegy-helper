#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsxEntry = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const result = spawnSync(
  process.execPath,
  [tsxEntry, join(ROOT, "cli", "main.ts"), ...process.argv.slice(2)],
  {
    cwd: ROOT,
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
