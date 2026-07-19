#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(APP_DIR, "../..");
const ESBUILD = join(ROOT, "node_modules", "esbuild", "bin", "esbuild");

export function patchSafariDist(distDir = join(ROOT, "dist")) {
  bundleServiceWorker(distDir);
  patchManifest(distDir);
}

function bundleServiceWorker(distDir) {
  const loaderPath = join(distDir, "service-worker-loader.js");
  const outputPath = join(distDir, "safari-background.js");

  const result = spawnSync(
    ESBUILD,
    [
      loaderPath,
      "--bundle",
      "--format=iife",
      "--platform=browser",
      `--outfile=${outputPath}`,
    ],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    throw new Error("Failed to bundle Safari background script");
  }
}

function patchManifest(distDir) {
  const manifestPath = join(distDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (manifest.background) {
    manifest.background.service_worker = "safari-background.js";
    delete manifest.background.type;
  }

  for (const entry of manifest.content_scripts ?? []) {
    delete entry.world;
  }

  manifest.content_scripts = (manifest.content_scripts ?? []).filter((entry) => {
    const scripts = entry.js ?? [];
    return !scripts.some((file) => file.includes("page-bridge"));
  });

  if (Array.isArray(manifest.web_accessible_resources)) {
    manifest.web_accessible_resources = manifest.web_accessible_resources.map((entry) => {
      const { use_dynamic_url: _removed, ...rest } = entry;
      return rest;
    });
  }

  if (!manifest.permissions?.includes("scripting")) {
    manifest.permissions = [...(manifest.permissions ?? []), "scripting"];
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  patchSafariDist();
  console.log("Safari dist patch complete.");
}
