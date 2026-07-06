export interface LoginResponse {
  token: string;
  testerId: string;
}

export interface RouteGame {
  id: string;
  name: string;
}

export interface RouteTarget {
  id: string;
  ip: string;
  cidr: string;
  region: string;
  nodeId: string;
  protocol: "udp" | "tcp";
  ports: number[];
  source: string;
  enabled: boolean;
}

export interface RouteServer {
  id: string;
  gameId: string;
  name: string;
  region: string;
  city?: string;
  country?: string;
  status?: "online" | "coming soon" | "maintenance" | string;
  endpointIp?: string;
  endpointHost?: string;
  endpoint?: string;
  allowedIps?: string[];
  gameRouteCidrs?: string[];
  routeTargets?: RouteTarget[];
  mtu?: number;
  available: boolean;
  canStart?: boolean;
  label?: string;
  notes?: string;
  debugLabel?: string;
  recommended?: boolean;
  pingEstimate?: string;
}

export interface RoutingCandidatesResponse {
  nodes: RouteServer[];
  candidates: AutoRouteCandidate[];
  targets: RouteTarget[];
}

export interface AutoRouteCandidate {
  id: string;
  type: "direct" | "single" | "chain";
  label: string;
  hopCount: number;
  serverId?: string;
  entryServerId?: string;
  exitServerId?: string;
  status: string;
  canStart: boolean;
  estimateOnly: boolean;
  chainSupported: boolean;
  gameRouteCidrs?: string[];
  routeTargets?: RouteTarget[];
}

export interface AutoTestRequest {
  game: string;
  region: string;
  includeChains?: boolean;
  directMeasurement?: { latencyMs?: number; jitterMs?: number; packetLossPct?: number; method: string };
  clientMeasurements?: Array<{ nodeId: string; latencyMs?: number; jitterMs?: number; packetLossPct?: number; method: string }>;
}

export interface AutoTestResponse {
  rankedRoutes: Array<{
    candidate: AutoRouteCandidate;
    score: number;
    breakdown: { latencyMs: number; jitterMs: number; packetLossPct: number; hopPenaltyMs: number; total: number };
    measurementStatus: string;
    warnings: string[];
  }>;
  recommendedRoute: { candidate: AutoRouteCandidate; score: number; breakdown: { latencyMs: number; jitterMs: number; packetLossPct: number; hopPenaltyMs: number; total: number }; measurementStatus: string; warnings: string[] } | null;
  directIsBetter: boolean;
  chainRoutesAvailable: boolean;
  reasons: string[];
  warnings: string[];
}

export interface CreateRouteSessionResponse {
  sessionId: string;
  clientAddress: string;
  serverPublicKey: string;
  endpoint: string;
  dns: string;
  mtu: number;
  allowedIps: string;
  allowedIpCount?: number;
  serverName: string;
  serverId?: string;
}

export interface HealthResponse {
  ok: boolean;
  peerMode: "mock" | "wg" | string;
  nodes?: Array<{
    id: string;
    name: string;
    status: string;
    online: boolean;
    endpoint: string | null;
    tunnelCidr: string | null;
  }>;
}

export interface ReplayJob {
  id: string;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  status: string;
  replayId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  parsedAt?: string;
}

export interface PathGenReplaySummary {
  id: string;
  userId: string;
  jobId: string;
  fileName: string;
  fileHash: string;
  status: "parsing" | "parsed" | "failed";
  parseTier?: "basic" | "deep";
  deepParseStatus?: "none" | "available" | "analyzing" | "parsed" | "failed";
  deepParsedAt?: string | null;
  deepParseError?: string | null;
  mode?: string | null;
  playlist?: string | null;
  region?: string | null;
  startedAt?: string | number | null;
  durationSeconds?: number | null;
  placement?: number | null;
  eliminations?: number | null;
  assists?: number | null;
  deaths?: number | null;
  headshots?: number | null;
  damageDealt?: number | null;
  damageTaken?: number | null;
  accuracy?: number | null;
  materialsFarmed?: number | null;
  distanceTraveled?: number | null;
  timeAliveSeconds?: number | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  parsedAt?: string | null;
}

export interface PathGenReplayQuota {
  used: number;
  limit: number;
  remaining: number;
  monthKey: string;
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  dayKey: string;
  cooldownMs: number;
  cooldownRemainingMs: number;
  canTrigger: boolean;
}

export interface PathGenReplayDetail {
  summary: PathGenReplaySummary;
  keyMoments: Array<{
    id: string;
    type: string;
    timestampSeconds: number;
    title: string;
    description?: string;
    importance?: string;
    thumbnailUrl?: string;
  }>;
  stats?: Record<string, unknown>;
  zoneStats?: unknown[];
}


const TOKEN_KEY = "routelag.routeToken";
const PATHGEN_TOKEN_KEY = "routelag.pathgenToken";
const TESTER_KEY = "routelag.testerId";
const INVITE_KEY = "routelag.inviteCode";
const PRODUCTION_API_BASE = "http://216.152.154.137:3001";
const DEFAULT_PATHGEN_API_BASE =
  "https://routelag-stationary-server-bot-production.up.railway.app";
const DEFAULT_API_BASE = PRODUCTION_API_BASE;
const API_BASE = (import.meta.env.VITE_ROUTELAG_API_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
const PATHGEN_API_BASE = (
  import.meta.env.VITE_PATHGEN_API_URL || DEFAULT_PATHGEN_API_BASE
).replace(/\/+$/, "");

export const ROUTELAG_API_URL = API_BASE;
export const PATHGEN_API_URL = PATHGEN_API_BASE;

export function getRouteToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getPathGenToken(): string | null {
  return window.localStorage.getItem(PATHGEN_TOKEN_KEY);
}

export function getRouteTesterId(): string | null {
  return window.localStorage.getItem(TESTER_KEY);
}

export function getRouteInviteCode(): string | null {
  return window.localStorage.getItem(INVITE_KEY);
}

export function clearRouteAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PATHGEN_TOKEN_KEY);
  window.localStorage.removeItem(TESTER_KEY);
  window.localStorage.removeItem(INVITE_KEY);
}

export async function ensurePathGenSession(inviteCode?: string): Promise<boolean> {
  const code = (inviteCode ?? getRouteInviteCode() ?? "").trim();
  if (!code) return false;

  if (getPathGenToken()) {
    try {
      await pathgenRequest<PathGenReplayQuota>("/api/replays/quota");
      return true;
    } catch {
      window.localStorage.removeItem(PATHGEN_TOKEN_KEY);
    }
  }

  try {
    const result = await pathgenLogin(code);
    window.localStorage.setItem(PATHGEN_TOKEN_KEY, result.token);
    return true;
  } catch (error) {
    console.warn("[PathGen] Session bootstrap failed", error);
    return false;
  }
}

export const routeApi = {
  health(timeoutMs = 4000): Promise<HealthResponse> {
    return request<HealthResponse>("/health", {
      auth: false,
      timeoutMs,
    });
  },

  async login(inviteCode: string): Promise<LoginResponse> {
    const result = await request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { inviteCode },
      auth: false,
    });
    window.localStorage.setItem(TOKEN_KEY, result.token);
    window.localStorage.setItem(TESTER_KEY, result.testerId);
    window.localStorage.setItem(INVITE_KEY, inviteCode);
    try {
      const pathgen = await pathgenLogin(inviteCode);
      window.localStorage.setItem(PATHGEN_TOKEN_KEY, pathgen.token);
    } catch (error) {
      console.warn("[PathGen] Companion server login failed", error);
    }
    return result;
  },

  async getGames(): Promise<RouteGame[]> {
    const result = await request<{ games: RouteGame[] }>("/api/games", {
      auth: false,
    });
    return result.games;
  },

  async getRoutingNodes(gameId = "fortnite"): Promise<RouteServer[]> {
    const result = await request<RoutingCandidatesResponse>(
      `/api/routes/candidates?game=${encodeURIComponent(gameId)}`,
    );
    const startableById = new Map(
      result.candidates
        .filter((candidate) => candidate.type === "single")
        .map((candidate) => [candidate.serverId ?? candidate.id, candidate.canStart]),
    );
    return result.nodes.map((node) => ({
      ...node,
      canStart: startableById.get(node.id) ?? node.available,
    }));
  },

  async getServers(gameId: string): Promise<RouteServer[]> {
    try {
      return await this.getRoutingNodes(gameId);
    } catch {
      const result = await request<{ servers: RouteServer[] }>(
        `/api/servers?game=${encodeURIComponent(gameId)}`,
        { auth: false },
      );
      return result.servers;
    }
  },

  async startRouteSession(
    nodeId: string,
    clientPublicKey: string,
    appVersion: string,
    gameId = "fortnite",
  ): Promise<CreateRouteSessionResponse> {
    const payload = { nodeId, clientPublicKey, appVersion, gameId };
    const token = getRouteToken();
    console.log("[RouteLag] Start Optimization request", {
      apiBaseUrl: API_BASE,
      endpoint: "/api/routes/start",
      selectedNodeId: nodeId,
      tokenPresent: Boolean(token),
      payload,
    });
    try {
      const result = await request<CreateRouteSessionResponse>("/api/routes/start", {
        method: "POST",
        body: payload,
      });
      console.log("[RouteLag] Start Optimization response", result);
      return result;
    } catch (error) {
      console.error("[RouteLag] Start Optimization failed", error);
      throw error;
    }
  },

  createRouteSession(
    gameId: string,
    serverId: string,
    clientPublicKey: string,
    appVersion: string,
  ): Promise<CreateRouteSessionResponse> {
    return this.startRouteSession(serverId, clientPublicKey, appVersion, gameId);
  },

  endRouteSession(sessionId: string, timeoutMs = 5000): Promise<void> {
    return request<void>("/api/routes/end", {
      method: "POST",
      body: { sessionId },
      timeoutMs,
    });
  },

  getRouteStatus(sessionId: string): Promise<unknown> {
    return request<unknown>(`/api/routes/status/${encodeURIComponent(sessionId)}`);
  },

  uploadDiagnosticReport(report: unknown): Promise<void> {
    return request<void>("/api/reports/upload", {
      method: "POST",
      body: report,
    });
  },

  getRouteCandidates(
    game = "fortnite",
    region = "middle-east",
  ): Promise<{ candidates: AutoRouteCandidate[]; targets: RouteTarget[] }> {
    return request<{ candidates: AutoRouteCandidate[]; targets: RouteTarget[] }>(
      `/api/routes/candidates?game=${encodeURIComponent(game)}&region=${encodeURIComponent(region)}`,
    );
  },

  testRoutes(body: AutoTestRequest): Promise<AutoTestResponse> {
    return request<AutoTestResponse>("/api/routes/test", {
      method: "POST",
      body,
    });
  },

  async getReplayJobs(): Promise<ReplayJob[]> {
    const result = await pathgenRequest<{ jobs: ReplayJob[] }>("/api/replays/jobs");
    return result.jobs;
  },

  async getReplayJob(jobId: string, options?: { sync?: boolean }): Promise<ReplayJob> {
    const query = options?.sync ? "?sync=1" : "";
    const result = await pathgenRequest<{ job: ReplayJob }>(
      `/api/replays/jobs/${encodeURIComponent(jobId)}${query}`,
    );
    return result.job;
  },

  async getParsedReplays(): Promise<PathGenReplaySummary[]> {
    const result = await pathgenRequest<{ replays: PathGenReplaySummary[] }>("/api/replays");
    return result.replays;
  },

  async getParsedReplay(replayId: string): Promise<PathGenReplayDetail> {
    const result = await pathgenRequest<{ replay: PathGenReplayDetail }>(
      `/api/replays/${encodeURIComponent(replayId)}`,
    );
    return result.replay;
  },

  async reparseReplay(replayId: string): Promise<ReplayJob | null> {
    const result = await pathgenRequest<{ job: ReplayJob | null }>(
      `/api/replays/${encodeURIComponent(replayId)}/reparse`,
      { method: "POST" },
    );
    return result.job;
  },

  async getReplayQuota(): Promise<PathGenReplayQuota> {
    return pathgenRequest<PathGenReplayQuota>("/api/replays/quota");
  },

  async deepAnalyzeReplay(replayId: string): Promise<{ replay: PathGenReplayDetail; quota: PathGenReplayQuota }> {
    return pathgenRequest<{ replay: PathGenReplayDetail; quota: PathGenReplayQuota }>(
      `/api/replays/${encodeURIComponent(replayId)}/deep-analyze`,
      { method: "POST", timeoutMs: 120000 },
    );
  },
};

async function pathgenLogin(inviteCode: string): Promise<LoginResponse> {
  return pathgenRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { inviteCode },
    auth: false,
  });
}

async function pathgenRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.auth !== false) {
    const token = getPathGenToken();
    if (!token) {
      throw new Error("PathGen session missing. Log out and sign in again to enable replay parsing.");
    }
    headers.set("authorization", `Bearer ${token}`);
  }
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    response = await fetch(`${PATHGEN_API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body == null ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      `PathGen server is unreachable at ${PATHGEN_API_BASE}. Check that the Railway service is online.`,
    );
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let message = `PathGen server error (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // Keep the status message when the API did not return JSON.
    }
    if (options.auth !== false && (response.status === 401 || response.status === 403)) {
      window.localStorage.removeItem(PATHGEN_TOKEN_KEY);
    }
    if (path === "/api/auth/login" && response.status === 401) {
      message = "Invalid invite code for PathGen server.";
    } else if (response.status === 401 || response.status === 403) {
      message = "PathGen session expired. Log out and sign in again.";
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.auth !== false) {
    const token = getRouteToken();
    if (!token) throw new Error("Log in with your RouteLag invite code first.");
    headers.set("authorization", `Bearer ${token}`);
  }
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body == null ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      `RouteLag API is unreachable at ${API_BASE}. Check that the beta API is online and that your network is not blocking the connection.`,
    );
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let message = `RouteLag API error (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // Keep the status message when the API did not return JSON.
    }
    if (path === "/api/auth/login" && response.status === 401) {
      message =
        "Invalid beta invite code. Check the invite exactly as provided and try again.";
    } else if (response.status === 401 || response.status === 403) {
      message =
        "This RouteLag account is not authorized for that beta action. Log in again or ask for a fresh invite.";
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
