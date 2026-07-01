import type {
  ClientMeasurement,
  DirectMeasurement,
  MeasurementStatus,
  NodeMetrics,
  RankedRoute,
  RouteCandidate,
  RouteTestRequest,
  RouteTestResult,
  ScoreBreakdown,
} from "./types.js";

const HOP_PENALTY_MS: Record<string, number> = {
  direct: 0,
  single: 3,
  chain: 8,
};

// Thresholds for recommending RouteLag over direct
const LATENCY_IMPROVEMENT_THRESHOLD_MS = 5;
const JITTER_IMPROVEMENT_RATIO = 0.2;

// Fallback values when no measurement is available
const FALLBACK_LATENCY_MS = 100;
const FALLBACK_JITTER_MS = 20;
const FALLBACK_LOSS_PCT = 0;

function computeBreakdown(
  candidate: RouteCandidate,
  latencyMs: number,
  jitterMs: number,
  packetLossPct: number,
): ScoreBreakdown {
  const hopPenaltyMs = HOP_PENALTY_MS[candidate.type] ?? 0;
  const total = latencyMs + jitterMs * 2 + packetLossPct * 20 + hopPenaltyMs;
  return { latencyMs, jitterMs, packetLossPct, hopPenaltyMs, total };
}

function isMeaningfullyBetter(
  directBreakdown: ScoreBreakdown,
  candidateBreakdown: ScoreBreakdown,
): boolean {
  const latencyBetter =
    directBreakdown.latencyMs - candidateBreakdown.latencyMs >= LATENCY_IMPROVEMENT_THRESHOLD_MS;
  const jitterBetter =
    directBreakdown.jitterMs > 0 &&
    candidateBreakdown.jitterMs <
      directBreakdown.jitterMs * (1 - JITTER_IMPROVEMENT_RATIO);
  const lossBetter = candidateBreakdown.packetLossPct < directBreakdown.packetLossPct;
  return latencyBetter || jitterBetter || lossBetter;
}

function buildReason(
  recommended: RankedRoute,
  directBreakdown: ScoreBreakdown,
): string {
  if (recommended.candidate.type === "direct") {
    return "Direct is recommended because RouteLag did not improve this route.";
  }

  const label = recommended.candidate.label;
  const bd = recommended.breakdown;
  const parts: string[] = [];

  if (directBreakdown.latencyMs - bd.latencyMs >= LATENCY_IMPROVEMENT_THRESHOLD_MS) {
    parts.push(
      `lower estimated latency (${bd.latencyMs.toFixed(0)} ms vs ${directBreakdown.latencyMs.toFixed(0)} ms)`,
    );
  }
  if (
    directBreakdown.jitterMs > 0 &&
    bd.jitterMs < directBreakdown.jitterMs * (1 - JITTER_IMPROVEMENT_RATIO)
  ) {
    parts.push(
      `lower estimated jitter (${bd.jitterMs.toFixed(0)} ms vs ${directBreakdown.jitterMs.toFixed(0)} ms)`,
    );
  }
  if (bd.packetLossPct < directBreakdown.packetLossPct) {
    parts.push("lower estimated packet loss");
  }

  if (parts.length > 0) {
    return `${label} is recommended because it had ${parts.join(" and ")}.`;
  }
  return `${label} is recommended based on overall score.`;
}

export function rankRoutes(
  request: RouteTestRequest,
  candidates: RouteCandidate[],
  nodeMetricsMap: Map<string, NodeMetrics>,
): RouteTestResult {
  const warnings: string[] = [];

  const directMeasurement: DirectMeasurement | undefined = request.directMeasurement;
  const directLatency = directMeasurement?.latencyMs ?? FALLBACK_LATENCY_MS;
  const directJitter = directMeasurement?.jitterMs ?? FALLBACK_JITTER_MS;
  const directLoss = directMeasurement?.packetLossPct ?? FALLBACK_LOSS_PCT;

  if (!directMeasurement?.latencyMs) {
    warnings.push(
      "No direct measurement provided. Scoring uses estimated baseline values.",
    );
  }

  const directCandidate: RouteCandidate = candidates.find((c) => c.type === "direct") ?? {
    id: "direct",
    type: "direct",
    label: "Direct (RouteLag OFF)",
    hopCount: 0,
    status: "available",
    canStart: false,
    estimateOnly: false,
    chainSupported: false,
  };
  const directBreakdown = computeBreakdown(directCandidate, directLatency, directJitter, directLoss);

  const clientMap = new Map<string, ClientMeasurement>(
    (request.clientMeasurements ?? []).map((m) => [m.nodeId, m]),
  );

  const rankedRoutes: RankedRoute[] = [];

  // Direct entry
  rankedRoutes.push({
    candidate: directCandidate,
    score: directBreakdown.total,
    breakdown: directBreakdown,
    measurementStatus: directMeasurement?.latencyMs != null ? "measured" : "estimated",
    warnings: directMeasurement?.latencyMs != null ? [] : ["No direct measurement — using estimated values."],
  });

  for (const candidate of candidates) {
    if (candidate.type === "direct") continue;

    if (candidate.type === "chain") {
      const chainWarnings = [
        "Multi-hop routing is not available in this build.",
        "This is a simulated estimate only.",
      ];

      let estimatedLatency: number;
      let measurementStatus: MeasurementStatus;

      const entryClient = candidate.entryServerId
        ? clientMap.get(candidate.entryServerId)
        : undefined;
      const entryMetrics = candidate.entryServerId
        ? nodeMetricsMap.get(candidate.entryServerId)
        : undefined;
      const exitMetrics = candidate.exitServerId
        ? nodeMetricsMap.get(candidate.exitServerId)
        : undefined;

      const clientToEntry = entryClient?.latencyMs;
      const entryToExit = entryMetrics?.nodeToNodeMetrics.find(
        (n) => n.toNodeId === candidate.exitServerId,
      )?.latencyMs;
      const exitToGame = exitMetrics?.gameTargetMetrics[0]?.latencyMs;

      if (clientToEntry != null && entryToExit != null && exitToGame != null) {
        estimatedLatency = clientToEntry + entryToExit + exitToGame;
        measurementStatus = "estimated";
      } else {
        estimatedLatency = directLatency + 30;
        measurementStatus = "partial";
        chainWarnings.push(
          "Insufficient node metrics for chain estimate. Using rough estimate.",
        );
      }

      const breakdown = computeBreakdown(
        candidate,
        estimatedLatency,
        directJitter,
        directLoss,
      );
      rankedRoutes.push({
        candidate,
        score: breakdown.total,
        breakdown,
        measurementStatus,
        warnings: chainWarnings,
      });
      continue;
    }

    // Single-hop
    const clientMeasurement = candidate.serverId ? clientMap.get(candidate.serverId) : undefined;
    const nodeMetrics = candidate.serverId ? nodeMetricsMap.get(candidate.serverId) : undefined;
    const routeWarnings: string[] = [];

    let latencyMs: number;
    let jitterMs: number;
    let packetLossPct: number;
    let measurementStatus: MeasurementStatus;

    if (clientMeasurement?.latencyMs != null) {
      latencyMs = clientMeasurement.latencyMs;
      jitterMs = clientMeasurement.jitterMs ?? FALLBACK_JITTER_MS;
      packetLossPct = clientMeasurement.packetLossPct ?? FALLBACK_LOSS_PCT;
      if (clientMeasurement.method === "unavailable") {
        measurementStatus = "estimated";
        routeWarnings.push("ICMP and TCP probes both failed. Measurement may be inaccurate.");
      } else if (clientMeasurement.method === "tcp") {
        measurementStatus = "estimated";
        routeWarnings.push("ICMP blocked; measurement taken via TCP connect timing.");
      } else {
        measurementStatus = "measured";
      }
    } else if (nodeMetrics?.gameTargetMetrics[0]?.latencyMs != null) {
      latencyMs = nodeMetrics.gameTargetMetrics[0].latencyMs;
      jitterMs = FALLBACK_JITTER_MS;
      packetLossPct = nodeMetrics.gameTargetMetrics[0].packetLossPct ?? FALLBACK_LOSS_PCT;
      measurementStatus = "estimated";
      routeWarnings.push("No client measurement. Using server-side node metrics.");
    } else {
      latencyMs = FALLBACK_LATENCY_MS;
      jitterMs = FALLBACK_JITTER_MS;
      packetLossPct = FALLBACK_LOSS_PCT;
      measurementStatus = "unavailable";
      routeWarnings.push("No measurement available for this route.");
    }

    const breakdown = computeBreakdown(candidate, latencyMs, jitterMs, packetLossPct);
    rankedRoutes.push({
      candidate,
      score: breakdown.total,
      breakdown,
      measurementStatus,
      warnings: routeWarnings,
    });
  }

  // Sort: unavailable last, then by score ascending
  rankedRoutes.sort((a, b) => {
    const aUnavail = a.measurementStatus === "unavailable";
    const bUnavail = b.measurementStatus === "unavailable";
    if (aUnavail && !bUnavail) return 1;
    if (!aUnavail && bUnavail) return -1;
    // chains after measured singles regardless of score
    const aChain = a.candidate.type === "chain";
    const bChain = b.candidate.type === "chain";
    if (aChain && !bChain) return 1;
    if (!aChain && bChain) return -1;
    return a.score - b.score;
  });

  const directEntry = rankedRoutes.find((r) => r.candidate.type === "direct");
  const bestSingle = rankedRoutes.find(
    (r) =>
      r.candidate.type === "single" &&
      r.candidate.canStart &&
      r.measurementStatus !== "unavailable",
  );

  let recommendedRoute: RankedRoute | null = null;
  let directIsBetter = true;
  const reasons: string[] = [];

  if (bestSingle && directEntry) {
    if (isMeaningfullyBetter(directEntry.breakdown, bestSingle.breakdown)) {
      recommendedRoute = bestSingle;
      directIsBetter = false;
      reasons.push(buildReason(bestSingle, directEntry.breakdown));
    } else {
      recommendedRoute = directEntry;
      directIsBetter = true;
      reasons.push("Direct is recommended because RouteLag did not improve this route.");
    }
  } else if (directEntry) {
    recommendedRoute = directEntry;
    directIsBetter = true;
    if (!bestSingle) {
      warnings.push("No single-hop routes could be measured or are available.");
    }
    reasons.push("Direct route recommended. No RouteLag measurements available for comparison.");
  }

  return {
    rankedRoutes,
    recommendedRoute,
    directIsBetter,
    chainRoutesAvailable: false,
    reasons,
    warnings,
  };
}
