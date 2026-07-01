import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const engineDir = path.resolve("src-tauri", "engine", "windows");
const preferred = ["RouteLagEngine.exe", "routelag-wg.exe"];
const fallback = ["wireguard.exe", "wg.exe"];

function hasAll(files) {
  return files.every((file) => fs.existsSync(path.join(engineDir, file)));
}

export function checkWindowsEngine({ required = false } = {}) {
  const hasPreferred = hasAll(preferred);
  const hasFallback = hasAll(fallback);

  if (hasPreferred || hasFallback) {
    const selected = hasPreferred ? preferred : fallback;
    console.log(`Bundled RouteLag Engine files found: ${selected.join(", ")}`);
    return true;
  }

  const message =
    "Bundled RouteLag Engine binaries are missing. Place RouteLagEngine.exe and routelag-wg.exe in src-tauri/engine/windows before building the installer.";

  if (required) {
    console.error(message);
    console.error(`Checked: ${engineDir}`);
    console.error("Allowed dev fallback: wireguard.exe and wg.exe");
    return false;
  }

  console.warn(message);
  console.warn(`Checked: ${engineDir}`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = checkWindowsEngine({ required: process.argv.includes("--required") });
  process.exit(ok ? 0 : 1);
}
