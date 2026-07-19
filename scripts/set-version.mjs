#!/usr/bin/env bun

/**
 * Set root + workspace package.json versions and extension manifest version.
 *
 * Usage:
 *   bun scripts/set-version.mjs 1.2.3
 *   bun scripts/set-version.mjs v1.2.3
 *   VERSION=1.2.3 bun scripts/set-version.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function resolveVersion(argv) {
  const raw = argv[0] ?? process.env.VERSION ?? "";
  return String(raw).trim().replace(/^v/i, "");
}

function assertSemver(version) {
  if (!SEMVER_RE.test(version)) {
    throw new Error(
      `Invalid version "${version}". Expected semver like 1.2.3 (optional pre-release/build).`
    );
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function packageJsonPaths() {
  const paths = [join(ROOT, "package.json")];
  for (const group of ["apps", "packages"]) {
    const dir = join(ROOT, group);
    for (const name of readdirSync(dir)) {
      const pkg = join(dir, name, "package.json");
      try {
        readFileSync(pkg);
        paths.push(pkg);
      } catch {
        // skip
      }
    }
  }
  return paths;
}

const version = resolveVersion(process.argv.slice(2));
if (!version) {
  console.error("Usage: bun scripts/set-version.mjs <version>");
  process.exit(1);
}

assertSemver(version);

for (const packagePath of packageJsonPaths()) {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  pkg.version = version;
  writeJson(packagePath, pkg);
}

const manifestPath = join(ROOT, "apps/extension/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = version;
writeJson(manifestPath, manifest);

console.log(`Set version to ${version} in workspace package.json files and apps/extension/manifest.json`);
