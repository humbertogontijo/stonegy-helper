#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "dist");
const RELEASE_DIR = join(ROOT, "release");

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return pkg.version ?? "0.0.0";
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function zipDist(outputPath) {
  run("zip", ["-r", outputPath, "."], { cwd: DIST_DIR });
}

const version = readVersion();
const zipName = `stonegy-helper-chrome-v${version}.zip`;
const zipPath = join(RELEASE_DIR, zipName);

console.log("Typechecking...");
run("npx", ["tsc", "--noEmit"]);

console.log("Building Chrome extension with Vite...");
run("npx", ["vite", "build"]);

mkdirSync(RELEASE_DIR, { recursive: true });
rmSync(zipPath, { force: true });

console.log(`Packaging ${zipName}...`);
zipDist(zipPath);

console.log(`Done: ${zipPath}`);
