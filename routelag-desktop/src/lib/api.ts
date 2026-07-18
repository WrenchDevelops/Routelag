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
  entitlementExpiresAt?: string | null;
  expiresAtHint?: {
    maxLifetimeHours: number;
    heartbeatGraceMinutes: number;
    recommendedHeartbeatMinutes: number;
  };
}

export interface RouteHeartbeatApiResponse {
  sessionId: string;
  active: boolean;
  lastHeartbeatAt: string;
  heartbeatGraceMinutes?: number;
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
const DEVICE_ID_KEY = "routelag.deviceId";
const ENTITLEMENT_EXPIRES_KEY = "routelag.routingEntitlementExpiresAt";
const PRODUCTION_API_BASE = "http://216.152.154.137:3001";
const DEFAULT_PATHGEN_API_BASE =
  "https://routelag-stationary-server-bot-production.up.railway.app";
const DEFAULT_API_BASE = PRODUCTION_API_BASE;
const API_BASE = (
  import.meta.env.VITE_ZER0_API_URL ||
  import.meta.env.VITE_ROUTELAG_API_URL ||
  DEFAULT_API_BASE
).replace(/\/+$/, "");
const PATHGEN_API_BASE = (
  import.meta.env.VITE_PATHGEN_API_URL || DEFAULT_PATHGEN_API_BASE
).replace(/\/+$/, "");

export const ROUTELAG_API_URL = API_BASE;
export const ZER0_API_URL = API_BASE;
export const PATHGEN_API_URL = PATHGEN_API_BASE;

export type RoutingEntitlementCode =
  | "subscription_required"
  | "subscription_expired"
  | "account_restricted"
  | "entitlement_unavailable"
  | "concurrent_session_limit"
  | "invalid_token"
  | "invite_only_insufficient";

export class RoutingApiError extends Error {
  readonly code?: RoutingEntitlementCode;
  readonly status: number;

  constructor(message: string, status: number, code?: RoutingEntitlementCode) {
    super(message);
    this.name = "RoutingApiError";
    this.status = status;
    this.code = code;
  }
}

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

export function getOrCreateDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY)?.trim();
  if (existing) return existing;
  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `device_${crypto.randomUUID()}`
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function clearRouteAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PATHGEN_TOKEN_KEY);
  window.localStorage.removeItem("routelag.pathgenClerkUserId");
  window.localStorage.removeItem(TESTER_KEY);
  window.localStorage.removeItem(INVITE_KEY);
  window.localStorage.removeItem(ENTITLEMENT_EXPIRES_KEY);
}

export async function ensurePathGenSession(
  inviteOrOptions?:
    | string
    | {
        inviteCode?: string;
        clerkUserId?: string;
        clerkEmail?: string;
        /** Must return a Clerk session JWT from `useAuth().getToken()`. */
        getClerkToken?: () => Promise<string | null>;
        clerkSessionToken?: string | null;
      },
): Promise<boolean> {
  const options =
    typeof inviteOrOptions === "string"
      ? { inviteCode: inviteOrOptions }
      : (inviteOrOptions ?? {});
  const clerkUserId = options.clerkUserId?.trim() || "";
  const candidates = uniqueNonEmpty([
    options.inviteCode,
    options.clerkEmail,
    getRouteInviteCode(),
    window.localStorage.getItem("routelag.pathgenLoginHint"),
  ]);

  let clerkSessionToken =
    typeof options.clerkSessionToken === "string" ? options.clerkSessionToken.trim() : "";
  if (!clerkSessionToken && options.getClerkToken) {
    try {
      clerkSessionToken = (await options.getClerkToken())?.trim() || "";
    } catch (error) {
      console.warn("[PathGen] Failed to read Clerk session token", error);
    }
  }

  if (candidates.length === 0 && !clerkSessionToken && !clerkUserId) return false;

  if (getPathGenToken()) {
    const boundClerk = window.localStorage.getItem("routelag.pathgenClerkUserId") || "";
    const clerkMatches = !clerkUserId || boundClerk === clerkUserId;
    if (clerkMatches) {
      try {
        await pathgenRequest<PathGenReplayQuota>("/api/replays/quota");
        return true;
      } catch {
        window.localStorage.removeItem(PATHGEN_TOKEN_KEY);
      }
    } else {
      window.localStorage.removeItem(PATHGEN_TOKEN_KEY);
    }
  }

  // Prefer verified Clerk session JWT — never send client-chosen clerkUserId as identity.
  if (clerkSessionToken) {
    try {
      const loginHint = options.clerkEmail?.trim() || candidates[0] || "";
      const result = await pathgenLogin({
        inviteCode: loginHint || undefined,
        clerkSessionToken,
      });
      window.localStorage.setItem(PATHGEN_TOKEN_KEY, result.token);
      if (loginHint) window.localStorage.setItem("routelag.pathgenLoginHint", loginHint);
      if (clerkUserId) {
        window.localStorage.setItem("routelag.pathgenClerkUserId", clerkUserId);
      }
      return true;
    } catch (error) {
      console.warn("[PathGen] Clerk session bootstrap failed", error);
    }
  }

  // Dev/invite fallback only when the PathGen server allows invite login.
  for (const code of candidates) {
    try {
      const result = await pathgenLogin({ inviteCode: code });
      window.localStorage.setItem(PATHGEN_TOKEN_KEY, result.token);
      window.localStorage.setItem("routelag.pathgenLoginHint", code);
      window.localStorage.removeItem("routelag.pathgenClerkUserId");
      return true;
    } catch (error) {
      console.warn("[PathGen] Session bootstrap failed for candidate", code, error);
    }
  }
  return false;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
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
    // Invite login unlocks the beta client shell. Paid routing requires a
    // separate short-lived entitlement token from ensureRoutingEntitlement().
    window.localStorage.setItem(INVITE_KEY, inviteCode);
    if (!getRouteToken()) {
      window.localStorage.setItem(TOKEN_KEY, result.token);
      window.localStorage.setItem(TESTER_KEY, result.testerId);
    }
    try {
      const pathgen = await pathgenLogin({ inviteCode });
      window.localStorage.setItem(PATHGEN_TOKEN_KEY, pathgen.token);
    } catch (error) {
      console.warn("[PathGen] Companion server login failed", error);
    }
    return result;
  },

  /**
   * Exchange Clerk session (or allowlisted internal invite) for a short-lived
   * routing entitlement token. Server is authoritative — client plan flags are
   * never trusted.
   */
  async exchangeRoutingEntitlement(options?: {
    getClerkToken?: () => Promise<string | null>;
    clerkSessionToken?: string | null;
    inviteCode?: string;
    force?: boolean;
  }): Promise<{
    token: string;
    testerId: string;
    expiresAt: number;
    accountState: string;
    source: string;
  }> {
    const expiresRaw = window.localStorage.getItem(ENTITLEMENT_EXPIRES_KEY);
    const expiresAt = expiresRaw ? Number(expiresRaw) : 0;
    const existing = getRouteToken();
    const skewSec = 60;
    if (
      !options?.force &&
      existing &&
      Number.isFinite(expiresAt) &&
      expiresAt > Math.floor(Date.now() / 1000) + skewSec
    ) {
      return {
        token: existing,
        testerId: getRouteTesterId() ?? "",
        expiresAt,
        accountState: "cached",
        source: "cached",
      };
    }

    let clerkSessionToken =
      typeof options?.clerkSessionToken === "string"
        ? options.clerkSessionToken.trim()
        : "";
    if (!clerkSessionToken && options?.getClerkToken) {
      try {
        clerkSessionToken = (await options.getClerkToken())?.trim() || "";
      } catch (error) {
        console.warn("[Zer0] Failed to read Clerk session for routing entitlement", error);
      }
    }

    const inviteCode = (options?.inviteCode ?? getRouteInviteCode() ?? "").trim();
    const deviceId = getOrCreateDeviceId();

    const result = await request<{
      token: string;
      testerId: string;
      expiresAt: number;
      accountState: string;
      source: string;
    }>("/api/entitlements/routing-token", {
      method: "POST",
      auth: false,
      body: {
        clerkSessionToken: clerkSessionToken || undefined,
        inviteCode: inviteCode || undefined,
        deviceId,
      },
    });

    window.localStorage.setItem(TOKEN_KEY, result.token);
    window.localStorage.setItem(TESTER_KEY, result.testerId);
    window.localStorage.setItem(ENTITLEMENT_EXPIRES_KEY, String(result.expiresAt));
    return result;
  },

  async ensureRoutingEntitlement(options?: {
    getClerkToken?: () => Promise<string | null>;
    clerkSessionToken?: string | null;
    inviteCode?: string;
    force?: boolean;
  }): Promise<void> {
    await this.exchangeRoutingEntitlement(options);
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
    entitlement?: {
      getClerkToken?: () => Promise<string | null>;
      clerkSessionToken?: string | null;
    },
  ): Promise<CreateRouteSessionResponse> {
    if (entitlement?.getClerkToken || entitlement?.clerkSessionToken) {
      await this.ensureRoutingEntitlement(entitlement);
    } else {
      await this.ensureRoutingEntitlement();
    }
    const payload = { nodeId, clientPublicKey, appVersion, gameId };
    const token = getRouteToken();
    console.log("[Zer0] Start Optimization request", {
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
      console.log("[Zer0] Start Optimization response", result);
      return result;
    } catch (error) {
      console.error("[Zer0] Start Optimization failed", error);
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

  /**
   * Refresh abandoned-peer TTL for an active route session.
   * Authenticated via the short-lived routing entitlement token.
   */
  heartbeatRouteSession(
    sessionId: string,
    timeoutMs = 8000,
  ): Promise<RouteHeartbeatApiResponse> {
    return request<RouteHeartbeatApiResponse>("/api/routes/heartbeat", {
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

  async retryReplayJob(jobId: string): Promise<ReplayJob> {
    const result = await pathgenRequest<{ job: ReplayJob }>(
      `/api/replays/jobs/${encodeURIComponent(jobId)}/retry`,
      { method: "POST", timeoutMs: 60000 },
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

  async getCloudUser(): Promise<CloudUserDocument | null> {
    try {
      const result = await pathgenRequest<{ user: CloudUserDocument }>("/api/users/me");
      return result.user;
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async saveCloudProfile(profile: Partial<TesterProfileLike>): Promise<CloudUserDocument | null> {
    try {
      const result = await pathgenRequest<{ user: CloudUserDocument }>("/api/users/me/profile", {
        method: "PUT",
        body: { profile },
      });
      return result.user;
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async getCloudPreferences(): Promise<CloudAppPreferences | null> {
    try {
      const result = await pathgenRequest<{ preferences: CloudAppPreferences }>(
        "/api/users/me/preferences",
      );
      return result.preferences;
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async saveCloudPreferences(
    preferences: Partial<CloudAppPreferences>,
  ): Promise<CloudUserDocument | null> {
    try {
      const result = await pathgenRequest<{ user: CloudUserDocument }>("/api/users/me/preferences", {
        method: "PUT",
        body: { preferences },
      });
      return result.user;
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async syncCloudIdentity(input: {
    clerkUserId?: string;
    clerkEmail?: string;
    connections?: Record<string, unknown>;
    billingSnapshot?: Record<string, unknown>;
  }): Promise<CloudUserDocument | null> {
    try {
      const result = await pathgenRequest<{ user: CloudUserDocument }>("/api/users/me/identity", {
        method: "PUT",
        body: input,
      });
      return result.user;
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async syncRoutingSession(input: {
    sessionId: string;
    clerkUserId?: string;
    nodeId: string;
    gameId?: string;
    serverName?: string;
    endpoint?: string;
    appVersion?: string;
    active: boolean;
    createdAt?: string;
    endedAt?: string | null;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await pathgenRequest("/api/routing/sessions", {
        method: "POST",
        body: input,
      });
    } catch (error) {
      if (isFirebaseOfflineError(error)) return;
      console.warn("[PathGen] Routing session sync failed", error);
    }
  },

  async startEpicConnect(): Promise<{ url: string; state: string }> {
    return pathgenRequest<{ url: string; state: string }>("/api/epic/start");
  },

  async getEpicStatus(): Promise<EpicConnectionStatus | null> {
    try {
      return await pathgenRequest<EpicConnectionStatus>("/api/epic/status");
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async unlinkEpic(): Promise<CloudUserDocument | null> {
    try {
      const result = await pathgenRequest<{ user: CloudUserDocument }>("/api/epic/link", {
        method: "DELETE",
      });
      return result.user;
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async startDiscordConnect(): Promise<{ url: string; state: string }> {
    return pathgenRequest<{ url: string; state: string }>("/api/discord/start");
  },

  async getDiscordStatus(): Promise<DiscordConnectionStatus | null> {
    try {
      return await pathgenRequest<DiscordConnectionStatus>("/api/discord/status");
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },

  async unlinkDiscord(): Promise<CloudUserDocument | null> {
    try {
      const result = await pathgenRequest<{ user: CloudUserDocument }>("/api/discord/link", {
        method: "DELETE",
      });
      return result.user;
    } catch (error) {
      if (isFirebaseOfflineError(error)) return null;
      throw error;
    }
  },
};

export interface CloudTesterProfile {
  tester_name: string;
  discord_username: string;
  state_country: string;
  country_city: string;
  isp: string;
  connection_type: string;
  normal_fortnite_ping_ms: number | null;
  normal_fortnite_packet_loss_pct: number | null;
  routelag_fortnite_ping_ms: number | null;
  routelag_fortnite_packet_loss_pct: number | null;
  johannesburg_fortnite_ping_ms: number | null;
  dallas_fortnite_ping_ms: number | null;
  fortnite_region: string;
  packet_loss_notes: string;
  best_route: string;
  any_issues: string;
  felt_smoother: string;
  internet_broke: string;
  end_optimization_worked: string;
  notes: string;
}

export interface CloudAppPreferences {
  openLastPage: boolean;
  checkEngineOnLaunch: boolean;
  confirmCloseOptimized: boolean;
  reduceAnimations: boolean;
  showBetaRoutes: boolean;
  theme?: "light" | "dark";
  preferencesUpdatedAt?: number;
}

export interface CloudUserDocument {
  testerId: string;
  inviteCode: string;
  clerkUserId?: string;
  clerkEmail?: string;
  profile: CloudTesterProfile;
  preferences: CloudAppPreferences;
  connections?: Record<string, unknown>;
  billingSnapshot?: Record<string, unknown>;
  epicAccountId?: string;
  epicDisplayName?: string;
  epicLinkedAt?: string;
  discordUserId?: string;
  discordUsername?: string;
  discordLinkedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface EpicConnectionStatus {
  connected: boolean;
  epicAccountId: string | null;
  epicDisplayName: string | null;
  epicLinkedAt: string | null;
  configured: boolean;
}

export interface DiscordConnectionStatus {
  connected: boolean;
  discordUserId: string | null;
  discordUsername: string | null;
  discordLinkedAt: string | null;
  configured: boolean;
}

type TesterProfileLike = CloudTesterProfile;

function isFirebaseOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /firebase/i.test(message) ||
    /supabase/i.test(message) ||
    /unreachable/i.test(message) ||
    /session missing/i.test(message) ||
    /session expired/i.test(message)
  );
}

async function pathgenLogin(input: {
  inviteCode?: string;
  clerkSessionToken?: string;
}): Promise<LoginResponse> {
  const inviteCode = input.inviteCode?.trim() || "";
  const clerkSessionToken = input.clerkSessionToken?.trim() || "";
  return pathgenRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: {
      ...(inviteCode ? { inviteCode, emailOrInvite: inviteCode } : {}),
      ...(clerkSessionToken ? { clerkSessionToken } : {}),
    },
    auth: false,
    // Prefer Authorization bearer for Clerk session tokens when present.
    ...(clerkSessionToken
      ? { authorizationOverride: `Bearer ${clerkSessionToken}` }
      : {}),
  });
}

async function pathgenRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    timeoutMs?: number;
    authorizationOverride?: string;
  } = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers();
  // Fastify rejects `Content-Type: application/json` with an empty body (415).
  // Always send `{}` for JSON POSTs/PUTs that have no explicit body.
  const hasBody = options.body !== undefined;
  const needsJsonBody = method !== "GET" && method !== "HEAD";
  if (hasBody || needsJsonBody) {
    headers.set("content-type", "application/json");
  }
  if (options.authorizationOverride) {
    headers.set("authorization", options.authorizationOverride);
  } else if (options.auth !== false) {
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
      method,
      headers,
      body: hasBody
        ? JSON.stringify(options.body)
        : needsJsonBody
          ? "{}"
          : undefined,
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
    if (!token) throw new Error("Log in with your Zer0 invite code first.");
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
      `Zer0 API is unreachable at ${API_BASE}. Check that the beta API is online and that your network is not blocking the connection.`,
    );
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let message = `Zer0 API error (${response.status})`;
    let code: RoutingEntitlementCode | undefined;
    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        code?: RoutingEntitlementCode;
      };
      message = body.error ?? body.message ?? message;
      code = body.code;
    } catch {
      // Keep the status message when the API did not return JSON.
    }
    if (path === "/api/auth/login" && response.status === 401) {
      message =
        "Invalid beta invite code. Check the invite exactly as provided and try again.";
    } else if (code) {
      message = friendlyRoutingEntitlementMessage(code, message);
    } else if (response.status === 401 || response.status === 403) {
      message =
        "This Zer0 account is not authorized for that beta action. Log in again or ask for a fresh invite.";
    }
    throw new RoutingApiError(message, response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function friendlyRoutingEntitlementMessage(
  code: RoutingEntitlementCode,
  fallback: string,
): string {
  switch (code) {
    case "subscription_required":
    case "invite_only_insufficient":
      return "A Zer0 Pro subscription is required to start routing.";
    case "subscription_expired":
      return "Your Zer0 Pro subscription has expired. Renew to start routing.";
    case "account_restricted":
      return "This account is restricted from routing. Contact support if you need help.";
    case "entitlement_unavailable":
      return "Subscription verification is temporarily unavailable. Try again shortly.";
    case "concurrent_session_limit":
      return "Routing is already active on another device. End that session first.";
    case "invalid_token":
      return "Authorization expired. Sign in again and retry.";
    default:
      return fallback;
  }
}
