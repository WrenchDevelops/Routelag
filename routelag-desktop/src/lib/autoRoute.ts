/**
 * Auto Route orchestration.
 *
 * Safety rules:
 * - Never auto-starts a RouteLag session; only returns a recommendation.
 * - Only probes RouteLag node endpoints (endpointHost from API) — not Fortnite IPs.
 * - Chain routes are always estimate-only and cannot be started.
 * - Uses the same preflight checks as manual optimization.
 */
import { api as tauriApi } from "../api";
import type { AutoRouteSnapshot, NodeProbeResult } from "../types";
import { routeApi, type AutoRouteCandidate, type AutoTestResponse } from "./api";

const DIRECT_PROBE_HOST = "1.1.1.1";
const AUTO_ROUTE_SNAPSHOT_KEY = "routelag.autoRouteSnapshot";

export interface AutoRouteResult {
  candidates: AutoRouteCandidate[];
  nodeProbes: NodeProbeResult[];
  directProbe: NodeProbeResult | null;
  testResult: AutoTestResponse;
  snapshot: AutoRouteSnapshot;
}

export async function runAutoRoute(
  game: string,
  _region: string,
): Promise<AutoRouteResult> {
  // 1. Fetch route candidates from API
  const { candidates } = await routeApi.getRouteCandidates(game, "middle-east");

  // 2. Build probe targets from available single-hop candidates (RouteLag-owned nodes only)
  const probeTargets = candidates
    .filter((c) => c.type === "single" && c.serverId)
    .map((c) => ({
      node_id: c.serverId ?? c.id,
      host: "", // filled below from server list
    }));

  // Get server endpointHost values
  const servers = await routeApi.getServers(game).catch(() => []);
  const serverEndpointMap = new Map(servers.map((s) => [s.id, s.endpointHost ?? ""]));

  const nodeProbeInputs = probeTargets
    .map((t) => ({ ...t, host: serverEndpointMap.get(t.node_id) ?? "" }))
    .filter((t) => t.host.length > 0);

  // 3. Probe direct internet (1.1.1.1) as baseline — not in-game Fortnite ping
  const directProbeInput = [{ node_id: "direct", host: DIRECT_PROBE_HOST }];

  // Run probes in parallel batches (direct + all nodes simultaneously)
  const [allProbeResults] = await Promise.all([
    tauriApi.probeRouteNodes([...directProbeInput, ...nodeProbeInputs]),
  ]);

  const directProbe = allProbeResults.find((r) => r.node_id === "direct") ?? null;
  const nodeProbes = allProbeResults.filter((r) => r.node_id !== "direct");

  // 4. Build /api/routes/test request from probe results
  const clientMeasurements = nodeProbes.map((probe) => ({
    nodeId: probe.node_id,
    latencyMs: probe.latency_ms ?? undefined,
    jitterMs: probe.jitter_ms ?? undefined,
    packetLossPct: probe.packet_loss_pct,
    method: probe.method,
  }));

  const directMeasurement = directProbe
    ? {
        latencyMs: directProbe.latency_ms ?? undefined,
        jitterMs: directProbe.jitter_ms ?? undefined,
        packetLossPct: directProbe.packet_loss_pct,
        method: directProbe.method,
      }
    : undefined;

  // 5. POST /api/routes/test to get ranked + recommended result
  const testResult = await routeApi.testRoutes({
    game,
    region: "middle-east",
    includeChains: true,
    directMeasurement,
    clientMeasurements,
  });

  // 6. Build snapshot for beta report
  const snapshot: AutoRouteSnapshot = {
    ran_at: new Date().toISOString(),
    direct_latency_ms: directProbe?.latency_ms ?? null,
    direct_jitter_ms: directProbe?.jitter_ms ?? null,
    direct_loss_pct: directProbe?.packet_loss_pct ?? null,
    direct_score: testResult.rankedRoutes.find((r) => r.candidate.type === "direct")?.score ?? null,
    recommended_route_id: testResult.recommendedRoute?.candidate.id ?? null,
    recommended_route_label: testResult.recommendedRoute?.candidate.label ?? null,
    recommended_route_score: testResult.recommendedRoute?.score ?? null,
    direct_is_better: testResult.directIsBetter,
    chain_routes_estimate_only: true,
    client_to_node_measurements: nodeProbes,
    ranked_routes: testResult.rankedRoutes,
    reasons: testResult.reasons,
    warnings: testResult.warnings,
  };

  // Persist snapshot locally
  try {
    window.localStorage.setItem(AUTO_ROUTE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage may be unavailable in some contexts
  }

  // Merge into beta report snapshot so it appears in the exported ZIP
  try {
    const existing = await tauriApi.loadBetaReportSnapshot().catch(() => null);
    if (existing) {
      await tauriApi.saveBetaReportSnapshot({
        ...existing,
        auto_route: snapshot as unknown as typeof existing.auto_route,
      });
    }
  } catch {
    // Non-fatal; report export will still include the localStorage snapshot
  }

  return { candidates, nodeProbes, directProbe, testResult, snapshot };
}

export function loadAutoRouteSnapshot(): AutoRouteSnapshot | null {
  try {
    const stored = window.localStorage.getItem(AUTO_ROUTE_SNAPSHOT_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as AutoRouteSnapshot;
  } catch {
    return null;
  }
}

export function clearAutoRouteSnapshot(): void {
  try {
    window.localStorage.removeItem(AUTO_ROUTE_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}
