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
  endpointIp?: string;
  available: boolean;
  label?: string;
}

export interface CreateRouteSessionResponse {
  sessionId: string;
  clientAddress: string;
  serverPublicKey: string;
  endpoint: string;
  dns: string;
  mtu: number;
  allowedIps: string;
  serverName: string;
}

const TOKEN_KEY = "routelag.routeToken";
const TESTER_KEY = "routelag.testerId";
const API_BASE =
  import.meta.env.VITE_ROUTELAG_API_URL ?? "http://127.0.0.1:8787";

export function getRouteToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function clearRouteAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TESTER_KEY);
}

export const routeApi = {
  async login(inviteCode: string): Promise<LoginResponse> {
    const result = await request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { inviteCode },
      auth: false,
    });
    window.localStorage.setItem(TOKEN_KEY, result.token);
    window.localStorage.setItem(TESTER_KEY, result.testerId);
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

  endRouteSession(sessionId: string): Promise<void> {
    return request<void>("/api/routes/end", {
      method: "POST",
      body: { sessionId },
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
};

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
  } = {},
): Promise<T> {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.auth !== false) {
    const token = getRouteToken();
    if (!token) throw new Error("Log in with your RouteLag invite code first.");
    headers.set("authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let message = `RouteLag API error (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Keep the status message when the API did not return JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
