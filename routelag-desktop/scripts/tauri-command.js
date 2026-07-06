import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { checkWindowsEngine } from "./check-engine-windows.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);
const appVersion = packageJson.version;

const args = process.argv.slice(2);
const isDev = args[0] === "dev";
if (args[0] === "build" && !checkWindowsEngine({ required: true })) {
  process.exit(1);
}

const tauriEnv = buildTauriEnv();
ensureCargoTargetDir(tauriEnv.CARGO_TARGET_DIR);

const result = spawnSync("tauri", args, {
  stdio: "inherit",
  windowsHide: !isDev,
  shell: process.platform === "win32",
  env: tauriEnv,
});

if (result.error) {
  // Fall back to npx.cmd on Windows when `tauri` is not on PATH.
  const fallback = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tauri", ...args],
    {
      stdio: "inherit",
      windowsHide: !isDev,
      shell: process.platform === "win32",
      env: tauriEnv,
    },
  );
  if (fallback.error) {
    console.error(fallback.error.message);
    process.exit(1);
  }
  if ((fallback.status ?? 1) !== 0) {
    process.exit(fallback.status ?? 1);
  }
} else if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

if (args[0] === "build") {
  renameWindowsInstaller();
}

process.exit(0);

function renameWindowsInstaller() {
  const bundleDir = path.resolve(rootDir, "src-tauri", "target", "release", "bundle", "nsis");
  const source = path.join(bundleDir, `RouteLag Beta_${appVersion}_x64-setup.exe`);
  const destination = path.join(bundleDir, `RouteLag Beta v${appVersion} x64 Setup.exe`);

  if (!fs.existsSync(source)) {
    // Also check cargo target dir used by some environments.
    const altBundleDir = path.resolve(
      rootDir,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "nsis",
    );
    console.warn(`Expected installer was not found: ${source}`);
    if (fs.existsSync(altBundleDir)) {
      const files = fs.readdirSync(altBundleDir).filter((name) => name.endsWith(".exe"));
      console.warn(`Found installers: ${files.join(", ") || "(none)"}`);
    }
    return;
  }

  if (fs.existsSync(destination)) {
    fs.rmSync(destination);
  }
  fs.renameSync(source, destination);
  console.log(`Installer renamed to: ${destination}`);
}

function buildTauriEnv() {
  const localRoot =
    process.env.LOCALAPPDATA ||
    process.env.APPDATA ||
    os.tmpdir();
  const cargoTargetDir = path.join(localRoot, "routelag-cargo", "routelag-desktop");
  return {
    ...process.env,
    CARGO_TARGET_DIR: cargoTargetDir,
  };
}

function ensureCargoTargetDir(targetDir) {
  if (!targetDir) return;
  fs.mkdirSync(targetDir, { recursive: true });
}
