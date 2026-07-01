export type RouteType = "direct" | "single" | "chain";
export type MeasurementStatus = "measured" | "estimated" | "partial" | "unavailable";
export type MeasurementMethod = "icmp" | "tcp" | "unavailable";

export interface RouteCandidate {
  id: string;
  type: RouteType;
  label: string;
  hopCount: number;
  serverId?: string;
  entryServerId?: string;
  exitServerId?: string;
  status: string;
  canStart: boolean;
  estimateOnly: boolean;
  chainSupported: boolean;
}

export interface ClientMeasurement {
  nodeId: string;
  latencyMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
  method: MeasurementMethod;
}

export interface DirectMeasurement {
  latencyMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
  method: MeasurementMethod;
}

export interface ScoreBreakdown {
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  hopPenaltyMs: number;
  total: number;
}

export interface RankedRoute {
  candidate: RouteCandidate;
  score: number;
  breakdown: ScoreBreakdown;
  measurementStatus: MeasurementStatus;
  warnings: string[];
}

export interface RouteTestRequest {
  game: string;
  region: string;
  includeChains?: boolean;
  clientMeasurements?: ClientMeasurement[];
  directMeasurement?: DirectMeasurement;
  candidateGameIps?: string[];
}

export interface RouteTestResult {
  rankedRoutes: RankedRoute[];
  recommendedRoute: RankedRoute | null;
  directIsBetter: boolean;
  chainRoutesAvailable: boolean;
  reasons: string[];
  warnings: string[];
}

export interface NodeGameMetric {
  ip: string;
  latencyMs?: number;
  packetLossPct?: number;
  method: MeasurementMethod;
  measuredAt: string;
}

export interface NodeToNodeMetric {
  toNodeId: string;
  latencyMs?: number;
  jitterMs?: number;
  measuredAt: string;
}

export interface NodeMetrics {
  id: string;
  city: string;
  country: string;
  status: string;
  publicEndpoint: string;
  wireguardEndpoint: string;
  health: boolean;
  gameTargetMetrics: NodeGameMetric[];
  nodeToNodeMetrics: NodeToNodeMetric[];
  updatedAt: string;
}

export interface NodeMetricsFile {
  nodes: NodeMetrics[];
  updatedAt: string;
}
