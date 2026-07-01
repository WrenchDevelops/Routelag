import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  authSecret: string;
  adminSecret: string;
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
  routeServers: RouteServerConfig[];
}

export type RouteServerStatus = "online" | "coming soon" | "maintenance";

export interface RouteServerConfig {
  id: string;
  gameId: "fortnite";
  name: string;
  region: string;
  city: string;
  country: string;
  status: RouteServerStatus;
  endpointHost: string;
  endpoint: string;
  serverPublicKey: string;
  allowedIps: string;
  mtu: number;
  notes: string;
  debugLabel: string;
  recommended: boolean;
  pingEstimate?: string;
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const defaultInviteCodes = [
  "BETA-SA-001",
  "BETA-SA-002",
  "BETA-SA-003",
  "BETA-SA-004",
  "BETA-SA-005",
];

const defaultCandidateAllowedIps = "";

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataFile = resolve(env("ROUTELAG_DATA_FILE", "data/routelag-db.json"));
  const reportsDir = resolve(env("ROUTELAG_REPORTS_DIR", "data/reports"));
  mkdirSync(dirname(dataFile), { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  const baseConfig = {
    host: env("ROUTELAG_API_HOST", "127.0.0.1"),
    port: Number(env("ROUTELAG_API_PORT", "8787")),
    authSecret: env("ROUTELAG_AUTH_SECRET", "dev-route-secret"),
    adminSecret: env("ROUTELAG_ADMIN_SECRET", ""),
    inviteCodes: new Set(
      env("ROUTELAG_INVITE_CODES", defaultInviteCodes.join(","))
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
    allowedIps: env("ROUTELAG_ALLOWED_IPS", defaultCandidateAllowedIps),
  } satisfies Omit<ServerConfig, "routeServers">;

  return {
    ...baseConfig,
    routeServers: buildRouteServers(baseConfig),
    ...overrides,
  };
}

function buildRouteServers(config: Omit<ServerConfig, "routeServers">): RouteServerConfig[] {
  return [
    betaServer(config, {
      envPrefix: "JOHANNESBURG",
      id: "johannesburg-beta",
      name: "Johannesburg Beta",
      region: "South Africa",
      city: "Johannesburg",
      country: "ZA",
      endpointFallback: config.endpoint,
      publicKeyFallback: config.serverPublicKey,
      allowedIpsFallback: config.allowedIps,
      notesFallback: "Main local South Africa route for Middle East comparison.",
      debugLabelFallback: "sa-main",
      recommended: true,
      pingEstimateFallback: "Test in Fortnite",
    }),
    betaServer(config, {
      envPrefix: "FRANKFURT",
      id: "frankfurt-beta",
      name: "Frankfurt Beta",
      region: "Europe / Middle East bridge",
      city: "Frankfurt",
      country: "DE",
      notesFallback: "Main Europe/Middle East bridge for South Africa testers.",
      debugLabelFallback: "eu-me-main",
      recommended: true,
      pingEstimateFallback: "Test in Fortnite",
    }),
    betaServer(config, {
      envPrefix: "LONDON",
      id: "london-beta",
      name: "London Beta",
      region: "Europe backup bridge",
      city: "London",
      country: "GB",
      notesFallback: "Backup Europe bridge for comparison.",
      debugLabelFallback: "eu-backup",
      recommended: false,
      pingEstimateFallback: "Test in Fortnite",
    }),
    betaServer(config, {
      envPrefix: "AMSTERDAM",
      id: "amsterdam-beta",
      name: env("ROUTELAG_AMSTERDAM_BETA_NAME", "Amsterdam Beta"),
      region: "Europe comparison route",
      city: env("ROUTELAG_AMSTERDAM_BETA_CITY", "Amsterdam"),
      country: env("ROUTELAG_AMSTERDAM_BETA_COUNTRY", "NL"),
      notesFallback: "Extra comparison route. If Paris was purchased instead, set the Amsterdam beta name/city/country env vars to Paris.",
      debugLabelFallback: "eu-compare",
      recommended: false,
      pingEstimateFallback: "Test in Fortnite",
    }),
  ];
}

function betaServer(
  config: Omit<ServerConfig, "routeServers">,
  input: {
    envPrefix: string;
    id: string;
    name: string;
    region: string;
    city: string;
    country: string;
    endpointFallback?: string;
    publicKeyFallback?: string;
    allowedIpsFallback?: string;
    notesFallback: string;
    debugLabelFallback: string;
    recommended: boolean;
    pingEstimateFallback: string;
  },
): RouteServerConfig {
  const fullPrefix = `ROUTELAG_${input.envPrefix}_BETA`;
  const endpoint = env(`${fullPrefix}_ENDPOINT`, input.endpointFallback ?? "").trim();
  const serverPublicKey = env(
    `${fullPrefix}_SERVER_PUBLIC_KEY`,
    input.publicKeyFallback ?? "",
  ).trim();
  const allowedIps = env(
    `${fullPrefix}_ALLOWED_IPS`,
    input.allowedIpsFallback ?? defaultCandidateAllowedIps,
  ).trim();
  const status = normalizeStatus(
    env(`${fullPrefix}_STATUS`, inferStatus(endpoint, serverPublicKey, allowedIps)),
  );

  return {
    id: input.id,
    gameId: "fortnite",
    name: env(`${fullPrefix}_DISPLAY_NAME`, input.name),
    region: env(`${fullPrefix}_REGION`, input.region),
    city: env(`${fullPrefix}_CITY`, input.city),
    country: env(`${fullPrefix}_COUNTRY`, input.country),
    status,
    endpointHost: endpointHost(endpoint),
    endpoint,
    serverPublicKey,
    allowedIps,
    mtu: Number(env(`${fullPrefix}_MTU`, String(config.defaultMtu))),
    notes: env(`${fullPrefix}_NOTES`, input.notesFallback),
    debugLabel: env(`${fullPrefix}_DEBUG_LABEL`, input.debugLabelFallback),
    recommended: env(`${fullPrefix}_RECOMMENDED`, input.recommended ? "true" : "false") === "true",
    pingEstimate: env(`${fullPrefix}_PING_ESTIMATE`, input.pingEstimateFallback),
  };
}

function inferStatus(
  endpoint: string,
  serverPublicKey: string,
  allowedIps: string,
): RouteServerStatus {
  if (
    endpoint &&
    serverPublicKey &&
    !serverPublicKey.includes("replace-with") &&
    serverPublicKey !== "dev-server-public-key" &&
    allowedIpsAreTargeted(allowedIps)
  ) {
    return "online";
  }
  return "coming soon";
}

function normalizeStatus(value: string): RouteServerStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === "online") return "online";
  if (normalized === "maintenance") return "maintenance";
  return "coming soon";
}

function endpointHost(endpoint: string): string {
  return endpoint.split(":")[0]?.trim() ?? "";
}

export function splitAllowedIps(allowedIps: string): string[] {
  return allowedIps
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function allowedIpsAreTargeted(allowedIps: string): boolean {
  const entries = splitAllowedIps(allowedIps);
  return entries.length > 0 && entries.every(isIpv4HostRoute);
}

function isIpv4HostRoute(entry: string): boolean {
  const match = entry.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/32$/);
  if (!match) return false;
  return match[1].split(".").every((octet) => {
    const value = Number(octet);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}
