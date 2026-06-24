import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  authSecret: string;
  inviteCodes: Set<string>;
  peerMode: "mock" | "wg";
  dataFile: string;
  reportsDir: string;
  serverPublicKey: string;
  endpoint: string;
  wgInterface: string;
  tunnelCidr: string;
  defaultDns: string;
  defaultMtu: number;
  allowedIps: string;
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataFile = resolve(env("ROUTELAG_DATA_FILE", "data/routelag-db.json"));
  const reportsDir = resolve(env("ROUTELAG_REPORTS_DIR", "data/reports"));
  mkdirSync(dirname(dataFile), { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  return {
    host: env("ROUTELAG_API_HOST", "127.0.0.1"),
    port: Number(env("ROUTELAG_API_PORT", "8787")),
    authSecret: env("ROUTELAG_AUTH_SECRET", "dev-route-secret"),
    inviteCodes: new Set(
      env("ROUTELAG_INVITE_CODES", "BETA-WRENCH-001")
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean),
    ),
    peerMode: env("ROUTELAG_PEER_MODE", "mock") === "wg" ? "wg" : "mock",
    dataFile,
    reportsDir,
    serverPublicKey: env("ROUTELAG_SERVER_PUBLIC_KEY", "dev-server-public-key"),
    endpoint: env("ROUTELAG_ENDPOINT", "102.211.56.103:51820"),
    wgInterface: env("ROUTELAG_WG_INTERFACE", "wg0"),
    tunnelCidr: env("ROUTELAG_TUNNEL_CIDR", "10.66.66.0/24"),
    defaultDns: env("ROUTELAG_DEFAULT_DNS", "1.1.1.1"),
    defaultMtu: Number(env("ROUTELAG_DEFAULT_MTU", "1280")),
    allowedIps: env("ROUTELAG_ALLOWED_IPS", "0.0.0.0/0"),
    ...overrides,
  };
}
