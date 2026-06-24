import { api as tauriApi } from "../api";
import { routeApi, type CreateRouteSessionResponse } from "./api";

export interface RouteKeys {
  private_key: string;
  public_key: string;
}

export interface GeneratedRouteProfile {
  session_id: string;
  private_key: string;
  client_address: string;
  server_public_key: string;
  endpoint: string;
  dns: string;
  mtu: number;
  allowed_ips: string;
  server_name: string;
}

export interface ActiveRouteSession {
  session_id: string;
  client_address: string;
  endpoint: string;
  server_name: string;
}

export async function generateLocalClientKeys(): Promise<RouteKeys> {
  return tauriApi.generateRouteKeys();
}

export async function prepareRoute(
  gameId: string,
  serverId: string,
): Promise<CreateRouteSessionResponse> {
  const [keys, appVersion] = await Promise.all([
    generateLocalClientKeys(),
    tauriApi.getAppVersion(),
  ]);
  const route = await routeApi.createRouteSession(
    gameId,
    serverId,
    keys.public_key,
    appVersion,
  );
  await tauriApi.saveRouteSessionProfile({
    session_id: route.sessionId,
    private_key: keys.private_key,
    client_address: route.clientAddress,
    server_public_key: route.serverPublicKey,
    endpoint: route.endpoint,
    dns: route.dns,
    mtu: route.mtu,
    allowed_ips: route.allowedIps,
    server_name: route.serverName,
  });
  return route;
}

export async function startOptimization(
  gameId: string,
  serverId: string,
): Promise<CreateRouteSessionResponse> {
  const route = await prepareRoute(gameId, serverId);
  try {
    await tauriApi.connectTunnel();
  } catch (error) {
    try {
      await routeApi.endRouteSession(route.sessionId);
      await tauriApi.clearActiveRouteSession();
    } catch {
      // Preserve the original local start error for the UI.
    }
    throw error;
  }
  return route;
}

export async function stopOptimization(): Promise<void> {
  const active = await tauriApi.loadActiveRouteSession();
  await tauriApi.disconnectTunnel();
  if (active?.session_id) {
    try {
      await routeApi.endRouteSession(active.session_id);
    } finally {
      await tauriApi.clearActiveRouteSession();
    }
  }
}

export async function getOptimizationStatus(): Promise<unknown> {
  const active = await tauriApi.loadActiveRouteSession();
  if (!active?.session_id) return null;
  return routeApi.getRouteStatus(active.session_id);
}

export async function runDiagnostics() {
  return tauriApi.runFullDiagnostics({
    disconnectForNormal: false,
    includePublicIp: true,
    skipTunnelPhase: false,
  });
}

export async function exportReport() {
  return tauriApi.exportReportZip();
}
