import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { filterNodesForBetaMode, loadNodes, type RouteNode } from "./nodes.js";

export type BetaMode = "off" | "dallas";

export interface ServerConfig {
  host: string;
  port: number;
  authSecret: string;
  adminSecret: string;
  inviteCodes: Set<string>;
  betaMode: BetaMode;
  /**
   * Global dev/test switch: "mock" never shells out to `wg` (used by unit
   * tests and local dev without WireGuard installed). "wg" allows nodes
   * whose `provisioner.mode` is "local" to run real `wg` commands.
   * This does NOT override a node's own provisioner.mode — a node with
   * provisioner.mode "disabled" always refuses to provision peers.
   */
  peerMode: "mock" | "wg";
  peersFile: string;
  /** Local wg0.conf path used only to mirror peers for provisioner.mode "local" nodes. */
  wgConfigFile: string;
  dataFile: string;
  reportsDir: string;
  defaultDns: string;
  defaultMtu: number;
  devExtraRoutes: string[];
  nodes: RouteNode[];
  osirionApiBaseUrl: string;
  osirionApiKey: string;
  osirionWebhookSecret: string;
  replayUploadMaxMb: number;
  replayStorageDir: string;
  replayPollIntervalMs: number;
}

const defaultInviteCodes = [
  "ROUTELAG-BETA",
  "SIGMA-DALLAS",
  "WRENCH-TEST",
  "BETA-SA-001",
  "BETA-SA-002",
  "BETA-SA-003",
  "BETA-SA-004",
  "BETA-SA-005",
];

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataFile = resolve(env("ROUTELAG_DATA_FILE", "data/routelag-db.json"));
  const reportsDir = resolve(env("ROUTELAG_REPORTS_DIR", "data/reports"));
  const replayStorageDir = resolve(env("REPLAY_STORAGE_DIR", "data/replays/uploads"));
  mkdirSync(dirname(dataFile), { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(replayStorageDir, { recursive: true });

  const betaMode = normalizeBetaMode(env("ROUTELAG_BETA_MODE", "off"));
  const inviteCodeList = env("BETA_CODES", "").trim()
    || env("ROUTELAG_INVITE_CODES", defaultInviteCodes.join(","));

  const nodes = overrides.nodes ?? filterNodesForBetaMode(loadNodes(), betaMode);
  // Defaults to "mock" so a fresh local dev checkout never shells out to a
  // real `wg` binary by accident. Production deploys opt in explicitly via
  // ROUTELAG_PEER_MODE=wg once a node's provisioner.mode is "local".
  const peerMode = normalizePeerMode(env("ROUTELAG_PEER_MODE", "mock"));

  const peersFile = resolve(env("ROUTELAG_PEERS_FILE", "data/peers.json"));
  mkdirSync(dirname(peersFile), { recursive: true });

  const baseConfig: ServerConfig = {
    host: env("ROUTELAG_API_HOST", "127.0.0.1"),
    port: Number(env("ROUTELAG_API_PORT", betaMode === "dallas" ? "3001" : "8787")),
    authSecret: env("ROUTELAG_AUTH_SECRET", "dev-route-secret"),
    adminSecret: env("ROUTELAG_ADMIN_SECRET", ""),
    inviteCodes: new Set(
      inviteCodeList
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean),
    ),
    betaMode,
    peerMode,
    peersFile,
    wgConfigFile: env("ROUTELAG_WG_CONFIG_FILE", "/etc/wireguard/wg0.conf"),
    dataFile,
    reportsDir,
    defaultDns: env("ROUTELAG_DEFAULT_DNS", "1.1.1.1"),
    defaultMtu: Number(env("ROUTELAG_DEFAULT_MTU", "1280")),
    devExtraRoutes: parseDevExtraRoutes(env("ROUTELAG_DEV_EXTRA_ROUTES", "")),
    nodes,
    osirionApiBaseUrl: env("OSIRION_API_BASE_URL", ""),
    osirionApiKey: env("OSIRION_API_KEY", ""),
    osirionWebhookSecret: env("OSIRION_WEBHOOK_SECRET", ""),
    replayUploadMaxMb: Number(env("REPLAY_UPLOAD_MAX_MB", "250")),
    replayStorageDir,
    replayPollIntervalMs: Number(env("REPLAY_POLL_INTERVAL_MS", "30000")),
  };

  return {
    ...baseConfig,
    ...overrides,
  };
}

function normalizeBetaMode(value: string): BetaMode {
  return value.trim().toLowerCase() === "dallas" ? "dallas" : "off";
}

function normalizePeerMode(value: string): "mock" | "wg" {
  return value.trim().toLowerCase() === "wg" ? "wg" : "mock";
}

function parseDevExtraRoutes(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry === "1.1.1.1/32");
}
