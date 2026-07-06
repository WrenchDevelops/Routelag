/**
 * Optional background probes between RouteLag node endpoints only.
 *
 * Safety rules enforced here:
 * - Only probes RouteLag-owned node endpoints (public IP:port from server config).
 * - Never probes Fortnite /32 IPs or any game server directly.
 * - Uses TCP connect timing (no raw ICMP required on Node.js).
 */
import * as net from "node:net";

import { endpointHost, type RouteNode } from "../nodes.js";
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
  toNode: RouteNode,
): Promise<NodeToNodeMetric> {
  const host = endpointHost(toNode);
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
  nodes: RouteNode[],
  existingMetrics: Map<string, NodeMetrics>,
): Promise<Map<string, NodeMetrics>> {
  const updated = new Map<string, NodeMetrics>(existingMetrics);

  for (const fromNode of nodes) {
    const toNodes = nodes.filter((n) => n.id !== fromNode.id);
    const nodeToNodeMetrics: NodeToNodeMetric[] = [];

    for (const toNode of toNodes) {
      // Only probe if the target has a valid endpoint host
      if (!endpointHost(toNode)) continue;
      const metric = await probeNodeToNode(fromNode.id, toNode);
      nodeToNodeMetrics.push(metric);
    }

    const existing = updated.get(fromNode.id);
    updated.set(fromNode.id, {
      id: fromNode.id,
      city: fromNode.city ?? "",
      country: fromNode.country ?? "",
      status: fromNode.available ? "online" : fromNode.status ?? "coming soon",
      publicEndpoint: endpointHost(fromNode),
      wireguardEndpoint: fromNode.endpoint,
      health: fromNode.available,
      gameTargetMetrics: existing?.gameTargetMetrics ?? [],
      nodeToNodeMetrics,
      updatedAt: new Date().toISOString(),
    });
  }

  return updated;
}
