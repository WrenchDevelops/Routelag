import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { filterNodesForBetaMode, loadNodes, type RouteNode } from "./nodes.js";
import {
  AllowlistEntitlementProvider,
  ClerkClaimsEntitlementProvider,
  MapEntitlementProvider,
  createClerkSessionVerifier,
  issuerFromPublishableKey,
  jwksUrlForIssuer,
  type ClerkSessionVerifier,
  type EntitlementProvider,
  type RoutingAccountState,
} from "./entitlement/index.js";

export type BetaMode = "off" | "dallas";
export type DeploymentEnv = "development" | "staging" | "internal" | "production";

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
  /**
   * Absolute max session lifetime (hours). Abandoned or heartbeating sessions
   * are ended and WireGuard peers removed after this bound.
   * Set ROUTELAG_PEER_TTL_HOURS=0 to disable the absolute max (heartbeat grace
   * can still expire sessions when configured).
   */
  peerTtlHours: number;
  /**
   * Minutes without a heartbeat before an active session is treated as
   * abandoned. Clients should refresh roughly every 5 minutes.
   * Set ROUTELAG_PEER_HEARTBEAT_GRACE_MINUTES=0 to disable heartbeat expiry.
   */
  peerHeartbeatGraceMinutes: number;
  /**
   * Soft max active peers per node for trusted beta capacity planning.
   * Assumption: /24 tunnel from .10 → ~245 IPs; beta default stays far below.
   */
  maxPeersPerNode: number;
  /**
   * Slots reserved as headroom. Creates are rejected when
   * activeOnNode >= maxPeersPerNode - nodeCapacityHeadroom.
   */
  nodeCapacityHeadroom: number;
  /** Max concurrent active sessions sharing the same deviceId (0 = disabled). */
  maxConcurrentSessionsPerDevice: number;
  /** Persisted emergency controls file (admin API writable). */
  runtimeControlsFile: string;
  /** Boot-time seed for maintenance / kill switch. */
  maintenanceMode: boolean;
  routingDisabled: boolean;
  disabledNodeIds: string[];
  blockedClerkUserIds: string[];
  blockedTesterIds: string[];
  blockedInviteCodes: string[];
  disabledAppVersions: string[];
  devExtraRoutes: string[];
  nodes: RouteNode[];
  osirionApiBaseUrl: string;
  osirionApiKey: string;
  osirionWebhookSecret: string;
  replayUploadMaxMb: number;
  replayStorageDir: string;
  replayPollIntervalMs: number;

  /** When true, /api/routes/create requires a routing entitlement token. */
  requireRoutingEntitlement: boolean;
  /** Short-lived entitlement token TTL (seconds). Default 15 minutes. */
  entitlementTokenTtlSeconds: number;
  /** Server-side entitlement cache TTL (ms). Default 60 seconds. */
  entitlementCacheTtlMs: number;
  /** Max concurrent active route sessions per authenticated subject. */
  maxConcurrentSessionsPerUser: number;
  deploymentEnv: DeploymentEnv;
  /**
   * When true AND deploymentEnv is not production, internal invite codes /
   * Clerk user IDs may mint routing entitlement without paid billing.
   */
  allowInternalRoutingEntitlement: boolean;
  internalRoutingUserIds: Set<string>;
  internalRoutingInviteCodes: Set<string>;
  clerkIssuer: string;
  clerkJwksUrl: string;
  clerkSecretKey: string;
  clerkAuthorizedParties: string[];

  /** Test / DI overrides — never set from env in production. */
  entitlementProvider?: EntitlementProvider;
  clerkSessionVerifier?: ClerkSessionVerifier | null;
  /** Fixture account states keyed by clerkUserId (used when no custom provider). */
  entitlementFixtures?: Map<string, RoutingAccountState>;
}

const defaultInviteCodes = [
  "ROUTELAG-BETA",
  "SIGMA-BETA",
  "DECKZEE-BETA",
  "WRENCH-BETA",
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

/** Prefer ZER0_* then legacy ROUTELAG_* then fallback. */
function envPrefer(zer0Name: string, legacyName: string, fallback: string): string {
  const zer0 = process.env[zer0Name];
  if (zer0 != null && zer0.trim() !== "") return zer0;
  const legacy = process.env[legacyName];
  if (legacy != null && legacy.trim() !== "") return legacy;
  return fallback;
}

function envBoolPrefer(zer0Name: string, legacyName: string, fallback: boolean): boolean {
  const raw = process.env[zer0Name] ?? process.env[legacyName];
  if (raw == null || raw.trim() === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function envCsvPrefer(zer0Name: string, legacyName: string): Set<string> {
  const raw = envPrefer(zer0Name, legacyName, "");
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function envCsv(name: string): Set<string> {
  return new Set(
    env(name, "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataFile = resolve(envPrefer("ZER0_DATA_FILE", "ROUTELAG_DATA_FILE", "data/routelag-db.json"));
  const reportsDir = resolve(envPrefer("ZER0_REPORTS_DIR", "ROUTELAG_REPORTS_DIR", "data/reports"));
  const replayStorageDir = resolve(env("REPLAY_STORAGE_DIR", "data/replays/uploads"));
  mkdirSync(dirname(dataFile), { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(replayStorageDir, { recursive: true });

  const betaMode = normalizeBetaMode(envPrefer("ZER0_BETA_MODE", "ROUTELAG_BETA_MODE", "off"));
  const inviteCodeList = env("BETA_CODES", "").trim()
    || envPrefer("ZER0_INVITE_CODES", "ROUTELAG_INVITE_CODES", defaultInviteCodes.join(","));

  const nodes = overrides.nodes ?? filterNodesForBetaMode(loadNodes(), betaMode);
  const peerMode = normalizePeerMode(envPrefer("ZER0_PEER_MODE", "ROUTELAG_PEER_MODE", "mock"));

  const peersFile = resolve(envPrefer("ZER0_PEERS_FILE", "ROUTELAG_PEERS_FILE", "data/peers.json"));
  mkdirSync(dirname(peersFile), { recursive: true });
  const runtimeControlsFile = resolve(
    envPrefer("ZER0_RUNTIME_CONTROLS_FILE", "ROUTELAG_RUNTIME_CONTROLS_FILE", "data/runtime-controls.json"),
  );
  mkdirSync(dirname(runtimeControlsFile), { recursive: true });

  const deploymentEnv = normalizeDeploymentEnv(
    envPrefer("ZER0_DEPLOYMENT_ENV", "ROUTELAG_DEPLOYMENT_ENV", env("NODE_ENV", "development")),
  );

  const publishableKey = env("CLERK_PUBLISHABLE_KEY", "");
  const issuerFromKey = publishableKey ? issuerFromPublishableKey(publishableKey) : null;
  const clerkIssuer = env("CLERK_ISSUER", issuerFromKey ?? "");
  const clerkJwksUrl = env(
    "CLERK_JWKS_URL",
    clerkIssuer ? jwksUrlForIssuer(clerkIssuer) : "",
  );

  const baseConfig: ServerConfig = {
    host: envPrefer("ZER0_API_HOST", "ROUTELAG_API_HOST", "127.0.0.1"),
    port: Number(envPrefer("ZER0_API_PORT", "ROUTELAG_API_PORT", betaMode === "dallas" ? "3001" : "8787")),
    authSecret: envPrefer("ZER0_AUTH_SECRET", "ROUTELAG_AUTH_SECRET", "dev-route-secret"),
    adminSecret: envPrefer("ZER0_ADMIN_SECRET", "ROUTELAG_ADMIN_SECRET", ""),
    inviteCodes: new Set(
      inviteCodeList
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean),
    ),
    betaMode,
    peerMode,
    peersFile,
    wgConfigFile: envPrefer("ZER0_WG_CONFIG_FILE", "ROUTELAG_WG_CONFIG_FILE", "/etc/wireguard/wg0.conf"),
    dataFile,
    reportsDir,
    defaultDns: envPrefer("ZER0_DEFAULT_DNS", "ROUTELAG_DEFAULT_DNS", "1.1.1.1"),
    defaultMtu: Number(envPrefer("ZER0_DEFAULT_MTU", "ROUTELAG_DEFAULT_MTU", "1280")),
    peerTtlHours: Number(envPrefer("ZER0_PEER_TTL_HOURS", "ROUTELAG_PEER_TTL_HOURS", "8")),
    // 20 minutes without heartbeat ≈ client can miss ~3× five-minute refreshes.
    peerHeartbeatGraceMinutes: Number(
      envPrefer("ZER0_PEER_HEARTBEAT_GRACE_MINUTES", "ROUTELAG_PEER_HEARTBEAT_GRACE_MINUTES", "20"),
    ),
    // Trusted-beta assumption: keep well under /24 pool (~245 usable from .10).
    maxPeersPerNode: Number(envPrefer("ZER0_MAX_PEERS_PER_NODE", "ROUTELAG_MAX_PEERS_PER_NODE", "50")),
    nodeCapacityHeadroom: Number(
      envPrefer("ZER0_NODE_CAPACITY_HEADROOM", "ROUTELAG_NODE_CAPACITY_HEADROOM", "5"),
    ),
    maxConcurrentSessionsPerDevice: Number(
      envPrefer("ZER0_MAX_CONCURRENT_SESSIONS_PER_DEVICE", "ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_DEVICE", "1"),
    ),
    runtimeControlsFile,
    maintenanceMode: envBoolPrefer("ZER0_MAINTENANCE_MODE", "ROUTELAG_MAINTENANCE_MODE", false),
    routingDisabled: envBoolPrefer("ZER0_ROUTING_DISABLED", "ROUTELAG_ROUTING_DISABLED", false),
    disabledNodeIds: [...envCsvPrefer("ZER0_DISABLED_NODE_IDS", "ROUTELAG_DISABLED_NODE_IDS")],
    blockedClerkUserIds: [...envCsvPrefer("ZER0_BLOCKED_CLERK_USER_IDS", "ROUTELAG_BLOCKED_CLERK_USER_IDS")],
    blockedTesterIds: [...envCsvPrefer("ZER0_BLOCKED_TESTER_IDS", "ROUTELAG_BLOCKED_TESTER_IDS")],
    blockedInviteCodes: [...envCsvPrefer("ZER0_BLOCKED_INVITE_CODES", "ROUTELAG_BLOCKED_INVITE_CODES")],
    disabledAppVersions: [...envCsvPrefer("ZER0_DISABLED_APP_VERSIONS", "ROUTELAG_DISABLED_APP_VERSIONS")],
    devExtraRoutes: parseDevExtraRoutes(
      envPrefer("ZER0_DEV_EXTRA_ROUTES", "ROUTELAG_DEV_EXTRA_ROUTES", ""),
    ),
    nodes,
    osirionApiBaseUrl: env("OSIRION_API_BASE_URL", ""),
    osirionApiKey: env("OSIRION_API_KEY", ""),
    osirionWebhookSecret: env("OSIRION_WEBHOOK_SECRET", ""),
    replayUploadMaxMb: Number(env("REPLAY_UPLOAD_MAX_MB", "250")),
    replayStorageDir,
    replayPollIntervalMs: Number(env("REPLAY_POLL_INTERVAL_MS", "30000")),
    requireRoutingEntitlement: envBoolPrefer(
      "ZER0_REQUIRE_ROUTING_ENTITLEMENT",
      "ROUTELAG_REQUIRE_ROUTING_ENTITLEMENT",
      true,
    ),
    entitlementTokenTtlSeconds: Number(
      envPrefer("ZER0_ENTITLEMENT_TOKEN_TTL_SECONDS", "ROUTELAG_ENTITLEMENT_TOKEN_TTL_SECONDS", "900"),
    ),
    entitlementCacheTtlMs: Number(
      envPrefer("ZER0_ENTITLEMENT_CACHE_TTL_MS", "ROUTELAG_ENTITLEMENT_CACHE_TTL_MS", "60000"),
    ),
    maxConcurrentSessionsPerUser: Number(
      envPrefer("ZER0_MAX_CONCURRENT_SESSIONS_PER_USER", "ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_USER", "1"),
    ),
    deploymentEnv,
    allowInternalRoutingEntitlement: envBoolPrefer(
      "ZER0_ALLOW_INTERNAL_ROUTING_ENTITLEMENT",
      "ROUTELAG_ALLOW_INTERNAL_ROUTING_ENTITLEMENT",
      deploymentEnv !== "production",
    ),
    internalRoutingUserIds: envCsvPrefer(
      "ZER0_INTERNAL_ROUTING_USER_IDS",
      "ROUTELAG_INTERNAL_ROUTING_USER_IDS",
    ),
    internalRoutingInviteCodes: envCsvPrefer(
      "ZER0_INTERNAL_ROUTING_INVITE_CODES",
      "ROUTELAG_INTERNAL_ROUTING_INVITE_CODES",
    ),
    clerkIssuer,
    clerkJwksUrl,
    clerkSecretKey: env("CLERK_SECRET_KEY", ""),
    clerkAuthorizedParties: [...envCsv("CLERK_AUTHORIZED_PARTIES")],
  };

  return {
    ...baseConfig,
    ...overrides,
  };
}

export function buildEntitlementProvider(config: ServerConfig): EntitlementProvider {
  if (config.entitlementProvider) return config.entitlementProvider;

  const base =
    config.entitlementFixtures != null
      ? new MapEntitlementProvider(config.entitlementFixtures)
      : new ClerkClaimsEntitlementProvider({
          secretKey: config.clerkSecretKey || undefined,
          failClosedOnBackendError: true,
        });

  const allowInternal =
    config.allowInternalRoutingEntitlement && config.deploymentEnv !== "production";

  return new AllowlistEntitlementProvider(base, {
    enabled: allowInternal,
    userIds: config.internalRoutingUserIds,
  });
}

export function buildClerkSessionVerifier(
  config: ServerConfig,
): ClerkSessionVerifier | null {
  if (config.clerkSessionVerifier !== undefined) {
    return config.clerkSessionVerifier;
  }
  if (!config.clerkIssuer || !config.clerkJwksUrl) {
    return null;
  }
  return createClerkSessionVerifier({
    issuer: config.clerkIssuer,
    jwksUrl: config.clerkJwksUrl,
    authorizedParties: config.clerkAuthorizedParties,
  });
}

function normalizeBetaMode(value: string): BetaMode {
  return value.trim().toLowerCase() === "dallas" ? "dallas" : "off";
}

function normalizePeerMode(value: string): "mock" | "wg" {
  return value.trim().toLowerCase() === "wg" ? "wg" : "mock";
}

function normalizeDeploymentEnv(value: string): DeploymentEnv {
  const normalized = value.trim().toLowerCase();
  if (normalized === "production" || normalized === "prod") return "production";
  if (normalized === "staging" || normalized === "stage") return "staging";
  if (normalized === "internal") return "internal";
  return "development";
}

function parseDevExtraRoutes(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry === "1.1.1.1/32");
}
