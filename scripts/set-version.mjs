#!/usr/bin/env node

/**
 * Set package.json + manifest.json version (and keep them in sync).
 *
 * Usage:
 *   node scripts/set-version.mjs 1.2.3
 *   node scripts/set-version.mjs v1.2.3
 *   VERSION=1.2.3 node scripts/set-version.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
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

const version = resolveVersion(process.argv.slice(2));
if (!version) {
  console.error("Usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}

assertSemver(version);

const packagePath = join(ROOT, "package.json");
const manifestPath = join(ROOT, "manifest.json");

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

pkg.version = version;
manifest.version = version;

writeJson(packagePath, pkg);
writeJson(manifestPath, manifest);

console.log(`Set version to ${version} in package.json and manifest.json`);
