export interface LoginResponse {
  token: string;
  testerId: string;
}

export interface RouteGame {
  id: string;
  name: string;
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
  mtu?: number;
  available: boolean;
  label?: string;
  notes?: string;
  debugLabel?: string;
  recommended?: boolean;
  pingEstimate?: string;
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
}

const TOKEN_KEY = "routelag.routeToken";
const TESTER_KEY = "routelag.testerId";
const INVITE_KEY = "routelag.inviteCode";
const API_BASE = (
  import.meta.env.VITE_ROUTELAG_API_URL || "http://127.0.0.1:8787"
).replace(/\/+$/, "");

export const ROUTELAG_API_URL = API_BASE;

export function getRouteToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getRouteTesterId(): string | null {
  return window.localStorage.getItem(TESTER_KEY);
}

export function getRouteInviteCode(): string | null {
  return window.localStorage.getItem(INVITE_KEY);
}

export function clearRouteAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TESTER_KEY);
  window.localStorage.removeItem(INVITE_KEY);
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
    return result;
  },

  async getGames(): Promise<RouteGame[]> {
    const result = await request<{ games: RouteGame[] }>("/api/games", {
      auth: false,
    });
    return result.games;
  },

  async getServers(gameId: string): Promise<RouteServer[]> {
    const result = await request<{ servers: RouteServer[] }>(
      `/api/servers?game=${encodeURIComponent(gameId)}`,
      { auth: false },
    );
    return result.servers;
  },

  createRouteSession(
    gameId: string,
    serverId: string,
    clientPublicKey: string,
    appVersion: string,
  ): Promise<CreateRouteSessionResponse> {
    return request<CreateRouteSessionResponse>("/api/routes/create", {
      method: "POST",
      body: { gameId, serverId, clientPublicKey, appVersion },
    });
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
  ): Promise<{ candidates: AutoRouteCandidate[] }> {
    return request<{ candidates: AutoRouteCandidate[] }>(
      `/api/routes/candidates?game=${encodeURIComponent(game)}&region=${encodeURIComponent(region)}`,
    );
  },

  testRoutes(body: AutoTestRequest): Promise<AutoTestResponse> {
    return request<AutoTestResponse>("/api/routes/test", {
      method: "POST",
      body,
    });
  },
};

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
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
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
