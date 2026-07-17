#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { patchSafariDist } from "./patch-safari-dist.mjs";
import {
  patchSafariXcodeProject,
  readSafariSigningSettings,
} from "./patch-safari-xcode.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "dist");
const SAFARI_DIR = join(ROOT, "safari");
const RELEASE_DIR = join(ROOT, "release");

const APP_NAME = "Stonegy Helper";
const BUNDLE_ID = "com.stonegy.helper";

function parseArgs(argv) {
  const flags = {
    xcodebuild: false,
    copyResources: true,
    open: false,
    package: true,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--xcodebuild":
        flags.xcodebuild = true;
        break;
      case "--no-copy-resources":
        flags.copyResources = false;
        break;
      case "--open":
        flags.open = true;
        break;
      case "--no-package":
        flags.package = false;
        break;
      default:
        console.warn(`Unknown flag ignored: ${arg}`);
    }
  }

  return flags;
}

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

function ensureXcodeTools() {
  const converter = spawnSync("xcrun", ["--find", "safari-web-extension-converter"], {
    encoding: "utf8",
  });

  if (converter.status !== 0) {
    throw new Error(
      "Xcode command-line tools are required. Install Xcode and run `xcode-select --install`."
    );
  }
}

function buildExtension() {
  console.log("Building extension with Vite...");
  run("npx", ["vite", "build"]);

  if (!existsSync(join(DIST_DIR, "manifest.json"))) {
    throw new Error(`Expected manifest at ${join(DIST_DIR, "manifest.json")}`);
  }

  console.log("Patching dist for Safari compatibility...");
  patchSafariDist(DIST_DIR);
}

function convertExtension(flags) {
  mkdirSync(SAFARI_DIR, { recursive: true });

  const signingSettings = readSafariSigningSettings(SAFARI_DIR, ROOT);
  if (signingSettings?.developmentTeam) {
    console.log(`Retaining Xcode signing team: ${signingSettings.developmentTeam}`);
  } else {
    console.log("No local Apple team configured; Xcode project will be unsigned for self-signing.");
  }

  const converterArgs = [
    "--project-location",
    SAFARI_DIR,
    "--app-name",
    APP_NAME,
    "--bundle-identifier",
    BUNDLE_ID,
    "--no-prompt",
    "--force",
  ];

  if (flags.copyResources) {
    converterArgs.push("--copy-resources");
  }

  if (!flags.open) {
    converterArgs.push("--no-open");
  }

  converterArgs.push(DIST_DIR);

  console.log("Converting extension for Safari (macOS + iOS)...");
  run("xcrun", ["safari-web-extension-converter", ...converterArgs]);

  console.log("Aligning Safari app and extension bundle identifiers...");
  patchSafariXcodeProject(SAFARI_DIR, BUNDLE_ID, signingSettings, ROOT);
}

function findXcodeProject() {
  if (!existsSync(SAFARI_DIR)) {
    return null;
  }

  const entries = spawnSync("find", [SAFARI_DIR, "-name", "*.xcodeproj", "-maxdepth", "2"], {
    encoding: "utf8",
  });

  const projectPath = entries.stdout
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return projectPath ?? null;
}

function findSafariAppDir() {
  if (!existsSync(SAFARI_DIR)) {
    return null;
  }

  const preferred = join(SAFARI_DIR, APP_NAME);
  if (existsSync(preferred)) {
    return preferred;
  }

  const entries = readdirSync(SAFARI_DIR, { withFileTypes: true });
  const dir = entries.find((entry) => entry.isDirectory() && !entry.name.startsWith("."));
  return dir ? join(SAFARI_DIR, dir.name) : null;
}

function packageReleaseZip() {
  const appDir = findSafariAppDir();
  if (!appDir) {
    throw new Error(`No Safari app directory found under ${SAFARI_DIR}`);
  }

  const version = readVersion();
  const zipName = `stonegy-helper-safari-v${version}.zip`;
  const zipPath = join(RELEASE_DIR, zipName);

  mkdirSync(RELEASE_DIR, { recursive: true });
  rmSync(zipPath, { force: true });

  console.log(`Packaging ${zipName}...`);
  run("zip", ["-r", zipPath, "."], { cwd: appDir });
  console.log(`Done: ${zipPath}`);
  return zipPath;
}

function xcodeBuild() {
  const projectPath = findXcodeProject();
  if (!projectPath) {
    throw new Error(`No .xcodeproj found under ${SAFARI_DIR}`);
  }

  const scheme = APP_NAME;

  console.log(`Building ${scheme} for platform=macOS...`);
  run("xcodebuild", [
    "-project",
    projectPath,
    "-scheme",
    scheme,
    "-configuration",
    "Release",
    "-destination",
    "platform=macOS",
    "build",
  ]);
}

const flags = parseArgs(process.argv.slice(2));

try {
  ensureXcodeTools();
  buildExtension();
  convertExtension(flags);

  if (flags.xcodebuild) {
    xcodeBuild();
  }

  if (flags.package) {
    packageReleaseZip();
  }

  console.log(`Safari project ready (macOS + iOS): ${SAFARI_DIR}`);
  console.log(
    "Open the generated .xcodeproj in Xcode, select your Team, then Run or Archive."
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
