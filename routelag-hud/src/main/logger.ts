import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

type LogLevel = "info" | "warn" | "error";

const TOKEN_PATTERN = /(token=)[^&\s]+|(--token\s+)\S+/gi;

function logDirectory(): string {
  const base = process.env.LOCALAPPDATA ?? app.getPath("userData");
  return join(base, "RouteLag", "hud", "logs");
}

function sanitize(message: string): string {
  return message
    .replace(/(token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(--token\s+)\S+/gi, "$1[redacted]");
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  const dir = logDirectory();
  mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message: sanitize(message),
    meta: meta === undefined ? undefined : sanitize(JSON.stringify(meta))
  });
  appendFileSync(join(dir, "routelag-hud.log"), `${line}\n`, "utf8");
}

export const logger = {
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta)
};
