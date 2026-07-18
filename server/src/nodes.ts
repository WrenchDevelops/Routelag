import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A RouteNode is a single RouteLag routing server (e.g. Dallas, Johannesburg,
 * Virginia...). Every node owns its own WireGuard identity, tunnel subnet,
 * and game route targets. Nothing here is shared globally across nodes —
 * AllowedIPs, peer IP allocation, and provisioning are always computed from
 * *one* node at a time.
 */
export interface RouteNodeTarget {
  id: string;
  ip: string;
  cidr: string;
  region: string;
  protocol?: "udp" | "tcp";
  ports?: number[];
  enabled: boolean;
}

export type ProvisionerMode = "local" | "ssh" | "disabled";

export interface RouteNodeProvisioner {
  mode: ProvisionerMode;
  host?: string;
  user?: string;
  privateKeyPath?: string;
}

export type RouteNodeStatus = "online" | "coming soon" | "maintenance";

export interface RouteNode {
  id: string;
  gameId: string;
  name: string;
  label?: string;
  city?: string;
  country?: string;
  region: string;
  available: boolean;

  endpoint: string;
  publicIp: string;
  wireguardPort: number;
  publicKey: string;

  tunnelCidr: string;
  serverTunnelIp: string;
  clientStartIp: string;

  wgInterface: string;

  targets: RouteNodeTarget[];

  provisioner: RouteNodeProvisioner;

  tags?: string[];

  // Optional display/UX metadata kept for backward compatibility with the
  // existing RouteLag desktop client and auto-route candidate scoring.
  status?: RouteNodeStatus;
  notes?: string;
  debugLabel?: string;
  recommended?: boolean;
  pingEstimate?: string;
  mtu?: number;
}

interface NodesFileShape {
  nodes: RouteNode[];
}

/**
 * Dallas Beta — NA-Central test node. Runs on the same VPS as the API, so
 * peer provisioning happens locally against wg0.
 */
const DALLAS_BETA: RouteNode = {
  id: "dallas-beta",
  gameId: "fortnite",
  name: "Dallas Beta",
  label: "United States",
  city: "Dallas",
  country: "United States",
  region: "NA-Central",
  available: true,

  endpoint: "216.152.154.137:51820",
  publicIp: "216.152.154.137",
  wireguardPort: 51820,
  publicKey: "/94WFr4JNsNAkn97XN9eoHK4i/4RDFGcpaZJOQb8pFw=",

  tunnelCidr: "10.67.0.0/24",
  serverTunnelIp: "10.67.0.1",
  clientStartIp: "10.67.0.10",

  wgInterface: "wg0",

  targets: [
    {
      id: "fortnite-na-epic",
      ip: "18.88.0.0",
      cidr: "18.88.0.0/16",
      region: "NA",
      protocol: "udp",
      ports: [],
      enabled: true,
    },
  ],

  provisioner: {
    mode: "local",
  },

  tags: ["na", "nac", "dallas", "beta"],

  status: "online",
  notes: "NA-Central test node for targeted Fortnite routing.",
  debugLabel: "na-central",
  recommended: true,
  pingEstimate: "Test in Fortnite",
};

/**
 * Johannesburg Beta — South Africa test node. Peer provisioning is not wired
 * up from the Dallas API yet, so it stays visible but not startable until a
 * provisioner (local or ssh) is configured for it.
 */
const JOHANNESBURG_BETA: RouteNode = {
  id: "johannesburg-beta",
  gameId: "fortnite",
  name: "Johannesburg Beta",
  label: "South Africa Test Node",
  city: "Johannesburg",
  country: "South Africa",
  region: "ZA",
  available: true,

  endpoint: "102.211.56.103:51820",
  publicIp: "102.211.56.103",
  wireguardPort: 51820,
  publicKey: "cYOCYajsa7t84tZ4okvntjLwq2HGVgQ1n/+7g0rWVSg=",

  tunnelCidr: "10.66.66.0/24",
  serverTunnelIp: "10.66.66.1",
  clientStartIp: "10.66.66.10",

  wgInterface: "wg0",

  targets: [],

  provisioner: {
    mode: "disabled",
  },

  tags: ["za", "south-africa", "johannesburg", "beta"],

  status: "coming soon",
  notes: "Main local South Africa route for Middle East comparison.",
  debugLabel: "sa-main",
  recommended: true,
  pingEstimate: "Test in Fortnite",
};

/**
 * Ashburn Beta — NA-East test node. Peer provisioning runs over SSH from the
 * Dallas API host.
 */
const ASHBURN_BETA: RouteNode = {
  id: "ashburn-beta",
  gameId: "fortnite",
  name: "Ashburn Beta",
  label: "United States",
  city: "Ashburn",
  country: "United States",
  region: "NA-East",
  available: true,

  endpoint: "66.163.122.222:51820",
  publicIp: "66.163.122.222",
  wireguardPort: 51820,
  publicKey: "NZU7VaQSWaQdzCUtsHPYUIpEJUFqahgAmbZ6UI1bSA8=",

  tunnelCidr: "10.68.0.0/24",
  serverTunnelIp: "10.68.0.1",
  clientStartIp: "10.68.0.10",

  wgInterface: "wg0",

  targets: [
    {
      id: "fortnite-na-epic",
      ip: "18.88.0.0",
      cidr: "18.88.0.0/16",
      region: "NA",
      protocol: "udp",
      ports: [],
      enabled: true,
    },
  ],

  provisioner: {
    mode: "ssh",
    host: "66.163.122.222",
    user: "root",
    privateKeyPath: "/opt/routelag-server/keys/ashburn-provisioner",
  },

  tags: ["na", "nae", "virginia", "ashburn", "beta"],

  status: "online",
  notes: "NA-East test node for targeted Fortnite routing.",
  debugLabel: "na-east",
  recommended: true,
  pingEstimate: "Test in Fortnite",
};

export const DEFAULT_NODES: RouteNode[] = [JOHANNESBURG_BETA, DALLAS_BETA, ASHBURN_BETA];

/**
 * Loads RouteNode config, preferring an external JSON file
 * (ROUTELAG_NODES_FILE, e.g. /opt/routelag-server/data/nodes.json) so ops
 * can add/rotate nodes (Virginia, more NA/EU nodes...) without a redeploy.
 * Falls back to the built-in dev nodes above when no file is configured.
 */
export function loadNodes(env: NodeJS.ProcessEnv = process.env): RouteNode[] {
  const nodesFile = env.ROUTELAG_NODES_FILE?.trim();
  if (nodesFile) {
    const filePath = resolve(nodesFile);
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as RouteNode[] | NodesFileShape;
      const nodes = Array.isArray(raw) ? raw : raw.nodes;
      if (!Array.isArray(nodes) || nodes.length === 0) {
        throw new Error(`ROUTELAG_NODES_FILE at ${filePath} did not contain any nodes.`);
      }
      validateNodes(nodes);
      return nodes;
    }
  }
  const defaults = DEFAULT_NODES.map((node) => ({ ...node }));
  validateNodes(defaults);
  return defaults;
}

export function validateNodes(nodes: RouteNode[]): void {
  const seenIds = new Set<string>();
  const seenTunnelCidrs = new Set<string>();
  for (const node of nodes) {
    if (!node.id) throw new Error("Every route node must have an id.");
    if (seenIds.has(node.id)) {
      throw new Error(`Duplicate route node id: ${node.id}`);
    }
    seenIds.add(node.id);

    if (!node.tunnelCidr) {
      throw new Error(`Route node "${node.id}" is missing a tunnelCidr.`);
    }
    if (seenTunnelCidrs.has(node.tunnelCidr)) {
      throw new Error(
        `Route node "${node.id}" reuses tunnel CIDR ${node.tunnelCidr} from another node. Every node must have its own tunnel subnet.`,
      );
    }
    seenTunnelCidrs.add(node.tunnelCidr);

    // Fail fast on unsafe target policy (never Fortnite-wide, never full tunnel).
    computeAllowedIps(node);
  }
}

export function findNode(nodes: RouteNode[], id: string): RouteNode | undefined {
  return nodes.find((node) => node.id === id);
}

export function enabledTargets(node: RouteNode): RouteNodeTarget[] {
  return node.targets.filter((target) => target.enabled);
}

export function targetCidrs(node: RouteNode): string[] {
  return enabledTargets(node).map((target) => target.cidr);
}

export function targetIps(node: RouteNode): string[] {
  return enabledTargets(node).map((target) => target.ip);
}

export function endpointHost(node: RouteNode): string {
  return node.endpoint.split(":")[0]?.trim() ?? "";
}

/**
 * Client-side WireGuard AllowedIPs for this node only:
 * [node.tunnelCidr, ...enabled target CIDRs].
 * Never includes another node's tunnel CIDR or targets, and never a
 * full-tunnel route (0.0.0.0/0, ::/0).
 */
export function computeAllowedIps(node: RouteNode): string[] {
  const entries = [node.tunnelCidr, ...targetCidrs(node)];
  assertSafeAllowedIps(entries, node.id);
  return entries;
}

export function rejectFullTunnelRoutes(entries: string[]): void {
  if (entries.some((entry) => entry === "0.0.0.0/0" || entry === "::/0")) {
    throw new Error("Full-tunnel routes are blocked.");
  }
}

export function assertSafeAllowedIps(entries: string[], nodeId?: string): void {
  rejectFullTunnelRoutes(entries);
  const [tunnelCidr, ...targetEntries] = entries;
  const label = nodeId ? ` for node "${nodeId}"` : "";
  if (!tunnelCidr) {
    throw new Error(`Missing tunnel CIDR${label}.`);
  }
  if (!targetEntries.every(isIpv4GameRoute)) {
    throw new Error(
      `Game routing targets must be targeted IPv4 routes (/32 hosts or 18.88.0.0/16)${label}.`,
    );
  }
}

export function allowedGameBlocks(): readonly string[] {
  return ["18.88.0.0/16"];
}

export function isIpv4GameRoute(entry: string): boolean {
  if (allowedGameBlocks().includes(entry)) return true;
  return isIpv4HostRoute(entry);
}

export function allowedIpsAreSafe(entries: string[]): boolean {
  try {
    assertSafeAllowedIps(entries);
    return true;
  } catch {
    return false;
  }
}

export function isIpv4HostRoute(entry: string): boolean {
  const match = entry.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/32$/);
  if (!match) return false;
  return match[1].split(".").every((octet) => {
    const value = Number(octet);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

export function splitAllowedIps(allowedIps: string): string[] {
  return allowedIps
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function tunnelNetworkPrefix(tunnelCidr: string): string {
  const host = tunnelCidr.split("/")[0]?.trim() ?? "";
  const parts = host.split(".");
  if (parts.length !== 4) {
    throw new Error(`Invalid tunnel CIDR: ${tunnelCidr}`);
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function clientStartOctet(clientStartIp: string): number {
  const parts = clientStartIp.split(".");
  const octet = Number(parts[3]);
  if (!Number.isInteger(octet) || octet < 2 || octet > 254) {
    throw new Error(`Invalid clientStartIp: ${clientStartIp}`);
  }
  return octet;
}

export function nodeStatus(node: RouteNode): RouteNodeStatus {
  return node.status ?? (node.available ? "online" : "coming soon");
}

export function canStartNode(node: RouteNode): boolean {
  return (
    node.available &&
    node.provisioner.mode !== "disabled" &&
    nodeStatus(node) !== "maintenance"
  );
}

/** Old `/api/servers` server shape, derived from a RouteNode, for app compatibility. */
export function publicNode(node: RouteNode) {
  return {
    id: node.id,
    gameId: node.gameId,
    name: node.name,
    region: node.region,
    city: node.city,
    country: node.country,
    status: nodeStatus(node),
    available: node.available,
    endpointIp: endpointHost(node) || undefined,
    endpointHost: endpointHost(node) || undefined,
    endpoint: node.endpoint || undefined,
    publicIp: node.publicIp || undefined,
    wireguardPort: node.wireguardPort,
    publicKey: node.publicKey || undefined,
    tunnelCidr: node.tunnelCidr || undefined,
    serverTunnelIp: node.serverTunnelIp || undefined,
    allowedIps: targetCidrs(node),
    routeTargets: enabledTargets(node).map((target) => ({ ...target, nodeId: node.id })),
    gameRouteCidrs: targetCidrs(node),
    mtu: node.mtu,
    label: node.label ?? node.debugLabel,
    notes: node.notes,
    debugLabel: node.debugLabel,
    recommended: node.recommended,
    pingEstimate: node.pingEstimate,
    tags: node.tags,
  };
}

/**
 * Public /health node summary — enough for uptime/capacity monitoring without
 * leaking endpoint, tunnel CIDR, public IP, or provisioner details.
 */
export function publicHealthNode(
  node: RouteNode,
  opts: {
    acceptingRoutes: boolean;
    capacityState: "ok" | "full" | "disabled";
    usedPercent: number | null;
  },
) {
  return {
    id: node.id,
    status: nodeStatus(node),
    acceptingRoutes: opts.acceptingRoutes,
    capacity: {
      state: opts.capacityState,
      usedPercent: opts.usedPercent,
    },
  };
}

/** Authenticated admin diagnostics — still avoids secrets / private keys. */
export function nodeHealthCheck(node: RouteNode) {
  return {
    id: node.id,
    name: node.name,
    status: nodeStatus(node),
    online: node.available,
    provisionerMode: node.provisioner.mode,
    canStart: canStartNode(node),
    endpointConfigured: Boolean(node.endpoint),
    publicKeyConfigured: Boolean(node.publicKey),
    tunnelCidrConfigured: Boolean(node.tunnelCidr),
    wireguardPort: node.wireguardPort,
    tags: node.tags,
  };
}

export function effectiveNodeCapacity(maxPeersPerNode: number, headroom: number): number {
  const max = Math.max(0, Math.floor(maxPeersPerNode));
  const reserve = Math.max(0, Math.floor(headroom));
  return Math.max(0, max - reserve);
}

export function capacityUsedPercent(used: number, effectiveMax: number): number | null {
  if (!Number.isFinite(effectiveMax) || effectiveMax <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / effectiveMax) * 100)));
}

export function filterNodesForBetaMode(nodes: RouteNode[], betaMode: "off" | "dallas"): RouteNode[] {
  if (betaMode !== "dallas") return nodes;
  const naNodeIds = new Set(["dallas-beta", "ashburn-beta", "virginia-beta"]);
  return nodes
    .filter((node) => naNodeIds.has(node.id))
    .map((node) => ({ ...node, recommended: true, available: true, status: "online" as const }));
}
