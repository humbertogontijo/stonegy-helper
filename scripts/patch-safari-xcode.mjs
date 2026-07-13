#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SIGNING_LOCAL_FILE = "safari-signing.local.json";

function resolvePbxprojPath(projectDir) {
  return join(projectDir, "Stonegy Helper", "Stonegy Helper.xcodeproj", "project.pbxproj");
}

function resolveSigningLocalPath(repoRoot) {
  return join(repoRoot, SIGNING_LOCAL_FILE);
}

/**
 * Read signing settings from the existing Xcode project (before --force
 * regeneration) or from safari-signing.local.json as a fallback.
 */
export function readSafariSigningSettings(projectDir, repoRoot) {
  const projectPath = resolvePbxprojPath(projectDir);
  let developmentTeam = null;

  if (existsSync(projectPath)) {
    const pbxproj = readFileSync(projectPath, "utf8");
    const match = pbxproj.match(/DEVELOPMENT_TEAM = ([^;\n]+);/);
    if (match) {
      developmentTeam = match[1].trim();
    }
  }

  if (!developmentTeam && repoRoot) {
    const localPath = resolveSigningLocalPath(repoRoot);
    if (existsSync(localPath)) {
      try {
        const local = JSON.parse(readFileSync(localPath, "utf8"));
        if (typeof local.developmentTeam === "string" && local.developmentTeam.length > 0) {
          developmentTeam = local.developmentTeam;
        }
      } catch {
        // Ignore invalid local signing config.
      }
    }
  }

  return developmentTeam ? { developmentTeam } : null;
}

export function persistSafariSigningSettings(repoRoot, signingSettings) {
  if (!repoRoot || !signingSettings?.developmentTeam) {
    return;
  }

  writeFileSync(
    resolveSigningLocalPath(repoRoot),
    `${JSON.stringify({ developmentTeam: signingSettings.developmentTeam }, null, 2)}\n`,
    "utf8"
  );
}

function applyDevelopmentTeam(pbxproj, developmentTeam) {
  if (/DEVELOPMENT_TEAM = /.test(pbxproj)) {
    return pbxproj.replace(
      /DEVELOPMENT_TEAM = [^;\n]+;/g,
      `DEVELOPMENT_TEAM = ${developmentTeam};`
    );
  }

  return pbxproj.replace(
    /^(\t*)CODE_SIGN_STYLE = ([^;\n]+);$/gm,
    (_match, indent, codeSignStyle) =>
      `${indent}CODE_SIGN_STYLE = ${codeSignStyle};\n${indent}DEVELOPMENT_TEAM = ${developmentTeam};`
  );
}

/**
 * safari-web-extension-converter --macos-only assigns the parent app a
 * name-derived bundle id (e.g. com.stonegy.Stonegy-Helper) while the extension
 * uses --bundle-identifier + ".Extension". Apple requires the extension id
 * to be prefixed by the parent app's bundle id.
 */
export function patchSafariXcodeProject(projectDir, bundleId, signingSettings = null, repoRoot = null) {
  const extensionBundleId = `${bundleId}.Extension`;
  const projectPath = resolvePbxprojPath(projectDir);

  let pbxproj = readFileSync(projectPath, "utf8");
  pbxproj = pbxproj.replace(
    /PRODUCT_BUNDLE_IDENTIFIER = ([^;\n]+);/g,
    (_match, value) => {
      const normalized = value.replace(/^"|"$/g, "");
      if (normalized.endsWith(".Extension")) {
        return `PRODUCT_BUNDLE_IDENTIFIER = ${extensionBundleId};`;
      }
      return `PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`;
    }
  );

  if (signingSettings?.developmentTeam) {
    pbxproj = applyDevelopmentTeam(pbxproj, signingSettings.developmentTeam);
    persistSafariSigningSettings(repoRoot, signingSettings);
  }

  writeFileSync(projectPath, pbxproj, "utf8");

  const viewControllerPaths = [
    join(projectDir, "Stonegy Helper", "Stonegy Helper", "ViewController.swift"),
    join(projectDir, "Stonegy Helper", "Shared (App)", "ViewController.swift"),
  ];

  for (const viewControllerPath of viewControllerPaths) {
    try {
      let source = readFileSync(viewControllerPath, "utf8");
      source = source.replace(
        /let extensionBundleIdentifier = "[^"]+"/,
        `let extensionBundleIdentifier = "${extensionBundleId}"`
      );
      writeFileSync(viewControllerPath, source, "utf8");
    } catch {
      // macOS-only and iOS/macOS projects use different folder layouts.
    }
  }
}
