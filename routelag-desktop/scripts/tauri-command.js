import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { checkWindowsEngine } from "./check-engine-windows.js";

const args = process.argv.slice(2);
if (args[0] === "build" && !checkWindowsEngine({ required: true })) {
  process.exit(1);
}

const result = spawnSync("tauri", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

if (args[0] === "build") {
  renameWindowsInstaller();
}

process.exit(0);

function renameWindowsInstaller() {
  const bundleDir = path.resolve("src-tauri", "target", "release", "bundle", "nsis");
  const source = path.join(bundleDir, "RouteLag Beta_0.1.2_x64-setup.exe");
  const destination = path.join(bundleDir, "RouteLag Beta v0.1.2 x64 Setup.exe");

  if (!fs.existsSync(source)) {
    console.warn(`Expected installer was not found: ${source}`);
    return;
  }

  if (fs.existsSync(destination)) {
    fs.rmSync(destination);
  }
  fs.renameSync(source, destination);
  console.log(`Installer renamed to: ${destination}`);
}
