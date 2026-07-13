#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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

const APP_NAME = "Stonegy Helper";
const BUNDLE_ID = "com.stonegy.helper";

function parseArgs(argv) {
  const flags = {
    xcodebuild: false,
    copyResources: true,
    open: false,
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
      default:
        console.warn(`Unknown flag ignored: ${arg}`);
    }
  }

  return flags;
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

  console.log(`Safari project ready (macOS + iOS): ${SAFARI_DIR}`);
  console.log("Open the generated .xcodeproj in Xcode to run or archive for distribution.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
