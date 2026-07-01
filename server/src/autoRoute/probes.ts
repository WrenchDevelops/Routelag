/**
 * Optional background probes between RouteLag node endpoints only.
 *
 * Safety rules enforced here:
 * - Only probes RouteLag-owned node endpoints (public IP:port from server config).
 * - Never probes Fortnite /32 IPs or any game server directly.
 * - Uses TCP connect timing (no raw ICMP required on Node.js).
 */
import * as net from "node:net";

import type { RouteServerConfig } from "../config.js";
import type { NodeMetrics, NodeToNodeMetric } from "./types.js";

const PROBE_TIMEOUT_MS = 4000;
const PROBE_COUNT = 3;

export async function tcpProbeMs(host: string, port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, PROBE_TIMEOUT_MS);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(Date.now() - start);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function probeOnce(host: string, port: number): Promise<number | null> {
  return tcpProbeMs(host, port);
}

export async function probeNodeToNode(
  fromNodeId: string,
  toNode: RouteServerConfig,
): Promise<NodeToNodeMetric> {
  const host = toNode.endpointHost;
  const rawPort = toNode.endpoint.split(":")[1];
  const port = rawPort ? Number(rawPort) : 51820;

  if (!host) {
    return {
      toNodeId: toNode.id,
      latencyMs: undefined,
      jitterMs: undefined,
      measuredAt: new Date().toISOString(),
    };
  }

  const samples: number[] = [];
  for (let i = 0; i < PROBE_COUNT; i += 1) {
    const ms = await probeOnce(host, port);
    if (ms != null) samples.push(ms);
    // Small gap between probes
    await new Promise((r) => setTimeout(r, 200));
  }

  const latencyMs =
    samples.length > 0
      ? samples.reduce((sum, v) => sum + v, 0) / samples.length
      : undefined;

  const jitterMs =
    samples.length >= 2
      ? Math.max(...samples) - Math.min(...samples)
      : undefined;

  return {
    toNodeId: toNode.id,
    latencyMs,
    jitterMs,
    measuredAt: new Date().toISOString(),
  };
}

/**
 * Run node-to-node probes for all servers.
 * Returns updated NodeMetrics for each server (nodeToNodeMetrics populated).
 * Does NOT probe game IPs.
 */
export async function runNodeToNodeProbes(
  servers: RouteServerConfig[],
  existingMetrics: Map<string, NodeMetrics>,
): Promise<Map<string, NodeMetrics>> {
  const updated = new Map<string, NodeMetrics>(existingMetrics);

  for (const fromServer of servers) {
    const toServers = servers.filter((s) => s.id !== fromServer.id);
    const nodeToNodeMetrics: NodeToNodeMetric[] = [];

    for (const toServer of toServers) {
      // Only probe if the target has a valid endpoint host
      if (!toServer.endpointHost) continue;
      const metric = await probeNodeToNode(fromServer.id, toServer);
      nodeToNodeMetrics.push(metric);
    }

    const existing = updated.get(fromServer.id);
    updated.set(fromServer.id, {
      id: fromServer.id,
      city: fromServer.city,
      country: fromServer.country,
      status: fromServer.status,
      publicEndpoint: fromServer.endpointHost,
      wireguardEndpoint: fromServer.endpoint,
      health: fromServer.status === "online",
      gameTargetMetrics: existing?.gameTargetMetrics ?? [],
      nodeToNodeMetrics,
      updatedAt: new Date().toISOString(),
    });
  }

  return updated;
}
