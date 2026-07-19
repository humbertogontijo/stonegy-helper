#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(APP_DIR, "../..");
const DIST_DIR = join(ROOT, "dist-firefox");
const RELEASE_DIR = join(ROOT, "release");

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return pkg.version ?? "0.0.0";
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
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
const zipName = `stonegy-helper-firefox-v${version}.zip`;
const zipPath = join(RELEASE_DIR, zipName);

console.log("Typechecking...");
run("bun", ["x", "tsc", "--noEmit", "-p", "tsconfig.json"]);

console.log("Building Firefox extension with Vite...");
run("bun", ["x", "vite", "build", "--mode", "firefox"], { cwd: APP_DIR });

mkdirSync(RELEASE_DIR, { recursive: true });
rmSync(zipPath, { force: true });

console.log(`Packaging ${zipName}...`);
zipDist(zipPath);

console.log(`Done: ${zipPath}`);
console.log(
  "Load in Firefox via about:debugging → This Firefox → Load Temporary Add-on → dist-firefox/manifest.json"
);
