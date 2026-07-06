import { api as tauriApi } from "../api";
import type {
  ActiveRouteVerification,
  BetaReportSnapshot,
  DnsStatus,
  OptimizeState,
  RestoreInternetResult,
  RouteMode,
  WireGuardProbeStep,
  WireGuardProbeStepId,
  WireGuardProbeStepStatus,
  WireGuardProbeResult,
} from "../types";
import {
  getRouteInviteCode,
  getRouteTesterId,
  ROUTELAG_API_URL,
  routeApi,
  type CreateRouteSessionResponse,
} from "./api";

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

export interface RouteLifecycleOptions {
  onState?: (state: OptimizeState) => void;
}

export interface StopOptimizationResult {
  status: "ended" | "ended_with_warning" | "failed_cleanup";
  warnings: string[];
  restore?: RestoreInternetResult;
}

export interface PreparedRouteSession extends CreateRouteSessionResponse {
  routeMode: RouteMode;
}

let operationInProgress = false;

export async function generateLocalClientKeys(): Promise<RouteKeys> {
  return tauriApi.generateRouteKeys();
}

export async function prepareRoute(
  gameId: string,
  serverId: string,
): Promise<PreparedRouteSession> {
  return createAndSaveRouteSession(gameId, serverId, setNoopState);
}

export async function startOptimization(
  gameId: string,
  serverId: string,
  options: RouteLifecycleOptions = {},
): Promise<PreparedRouteSession> {
  return withOperation(async () => {
    const setState = stateReporter(options);
    let route: PreparedRouteSession | null = null;

    try {
      setState("preflight");
      await runPreflight(gameId, serverId);

      route = await createAndSaveRouteSession(gameId, serverId, setState);
      await logOptimizationStart(serverId, route);

      setState("starting_engine");
      await tauriApi.connectTunnel();

      setState("verifying_connection");
      await verifyConnection(route);
      const installedRouteEntries = await tauriApi.getAllowedIpRouteEntries(
        splitAllowedIps(route.allowedIps),
      );
      await updateBetaReportSnapshot({
        public_ip_after: await publicIpOrNull(),
        api_reachability_after: await apiReachable(),
        windows_route_entries_after: installedRouteEntries,
        windows_route_entries_for_allowed_ips: installedRouteEntries,
      });

      setState("optimized");
      return route;
    } catch (error) {
      if (route?.sessionId) {
        setState("rollback");
        await rollbackRouteSession(route.sessionId, error);
      }
      setState("error");
      throw error;
    }
  });
}

export async function stopOptimization(
  options: RouteLifecycleOptions = {},
): Promise<StopOptimizationResult> {
  return withOperation(async () => {
    const setState = stateReporter(options);
    setState("stopping");

    const warnings: string[] = [];
    const active = await tauriApi.loadActiveRouteSession();
    const restore = await tauriApi.restoreInternet();
    if (!restore.ok) {
      warnings.push(restoreSummary("Local cleanup completed with warnings", restore));
    }

    if (active?.session_id) {
      try {
        await routeApi.endRouteSession(active.session_id, 5000);
      } catch (error) {
        warnings.push(`API route session cleanup failed: ${errorText(error)}`);
      }
    }

    try {
      const recovery = await tauriApi.forceClearLocalRouteState();
      if (recovery.stale_state_detected) {
        warnings.push("Local session clear finished, but RouteLag still detects stale route state.");
      }
      await updateBetaReportSnapshot({
        optimize_end_time: new Date().toISOString(),
        cleanup_result: warnings.length ? "Cleanup warning" : "Optimization ended cleanly",
        restore_internet_result: restore.ok ? "Restore Internet completed" : "Cleanup warning",
        service_leftover_status: recovery.stale_state_detected ? "Leftovers detected" : "None",
        api_reachability_after: await apiReachable(),
      });
    } catch (error) {
      warnings.push(`Local session clear failed: ${errorText(error)}`);
      await updateBetaReportSnapshot({
        optimize_end_time: new Date().toISOString(),
        cleanup_result: "Cleanup failed",
        restore_internet_result: restore.ok ? "Restore Internet completed" : "Cleanup failed",
      });
    }

    setState("idle");

    if (warnings.some((warning) => warning.includes("API route session cleanup failed"))) {
      return { status: "failed_cleanup", warnings, restore };
    }
    if (warnings.length) {
      return { status: "ended_with_warning", warnings, restore };
    }
    return { status: "ended", warnings, restore };
  });
}

export async function restoreInternet(
  sessionId?: string | null,
): Promise<RestoreInternetResult> {
  return withOperation(async () => {
    const active = sessionId ? null : await tauriApi.loadActiveRouteSession();
    const result = await tauriApi.restoreInternet();
    const cleanupSessionId = sessionId ?? active?.session_id;

    if (cleanupSessionId) {
      try {
        await routeApi.endRouteSession(cleanupSessionId, 5000);
      } catch (error) {
        await tauriApi.logClientEvent(
          `Restore Internet API cleanup failed for ${cleanupSessionId}: ${errorText(error)}`,
        );
      }
    }

    await tauriApi.forceClearLocalRouteState().catch((error) => {
      void tauriApi
        .logClientEvent(`Restore Internet force clear failed: ${errorText(error)}`)
        .catch(() => undefined);
    });
    const recovery = await tauriApi.getRecoveryStatus().catch(() => null);
    await updateBetaReportSnapshot({
      restore_internet_result: result.ok ? "Restore Internet completed" : "Cleanup warning",
      cleanup_result: result.ok ? "Restore Internet completed" : "Cleanup warning",
      service_leftover_status: recovery
        ? recovery.stale_state_detected
          ? "Leftovers detected"
          : "None"
        : "Not checked",
      api_reachability_after: await apiReachable(),
    });
    return result;
  });
}

async function createAndSaveRouteSession(
  gameId: string,
  nodeId: string,
  setState: (state: OptimizeState) => void,
): Promise<PreparedRouteSession> {
  setState("creating_server_session");
  const [keys, appVersion] = await Promise.all([
    generateLocalClientKeys(),
    tauriApi.getAppVersion(),
  ]);
  const route = await routeApi.startRouteSession(
    nodeId,
    keys.public_key,
    appVersion,
    gameId,
  );

  const routeMode = classifyAllowedIps(route.allowedIps);
  const baseSnapshot = await buildInitialBetaReportSnapshot({
    gameId,
    serverId: nodeId,
    route,
    routeMode,
  });
  await tauriApi.saveBetaReportSnapshot(baseSnapshot).catch(() => undefined);

  if (routeMode === "full_tunnel") {
    await routeApi.endRouteSession(route.sessionId, 5000).catch((error) => {
      throw new Error(
        `Full-route optimization is disabled in this safety build, and API cleanup failed for route session ${route.sessionId}. ${errorText(error)}`,
      );
    });
    await tauriApi.forceClearLocalRouteState().catch(() => undefined);
    await updateBetaReportSnapshot({
      route_mode: "blocked",
      cleanup_result: "Full tunnel blocked",
      optimize_end_time: new Date().toISOString(),
    });
    throw new Error(
      "Full-route optimization is disabled in this safety build. RouteLag ended the server session before changing your network.",
    );
  }

  if (routeMode === "invalid") {
    await cleanupCreatedRouteSession(
      route.sessionId,
      new Error(`Server returned an invalid AllowedIPs policy: ${route.allowedIps || "empty"}.`),
      "The server route session was created, but the route policy was unsafe.",
    );
  }

  setState("writing_profile");
  try {
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
  } catch (error) {
    await cleanupCreatedRouteSession(
      route.sessionId,
      error,
      "The server route session was created, but RouteLag could not save the local route profile.",
    );
  }
  return { ...route, routeMode };
}

async function logOptimizationStart(serverId: string, route: CreateRouteSessionResponse) {
  const targetIps = splitAllowedIps(route.allowedIps)
    .filter((entry) => !entry.startsWith("10."))
    .join(",");
  await tauriApi
    .logClientEvent(
      `optimization_started node=${serverId} endpoint=${route.endpoint} client_tunnel_ip=${route.clientAddress} target_ips=${targetIps || "none"} allowed_routes=${route.allowedIps}`,
    )
    .catch(() => undefined);
}

async function runPreflight(gameId: string, nodeId: string) {
  if (!gameId || !nodeId) {
    throw new Error("No routing node selected.");
  }

  const health = await routeApi.health(4000).catch((error) => {
    throw new Error(apiUnreachableMessage(error));
  });
  if (!health.ok || health.peerMode !== "wg") {
    throw new Error(
      `RouteLag servers are not ready for safe optimization. Expected peerMode wg, got ${health.peerMode}.`,
    );
  }

  const [elevated, engineAvailable, recovery, ping, dns] = await Promise.all([
    tauriApi.isElevated(),
    tauriApi.isRouteLagEngineAvailable(),
    tauriApi.getRecoveryStatus(),
    tauriApi.pingHost("1.1.1.1").catch(() => null),
    tauriApi.getDnsStatus(),
  ]);

  if (!elevated) {
    throw new Error("Administrator permission is required before RouteLag can optimize.");
  }
  if (!engineAvailable) {
    throw new Error("RouteLag Engine is missing or damaged. Reinstall RouteLag.");
  }
  if (recovery.stale_state_detected) {
    throw new Error(
      "Previous optimization did not close cleanly. Use Restore Internet before starting a new optimization.",
    );
  }
  if (!ping || ping.packet_loss_pct >= 100) {
    throw new Error(
      "Normal internet is not reachable. Restore your internet connection before starting RouteLag.",
    );
  }
  if (!dnsWorks(dns)) {
    throw new Error("DNS is not resolving. Restore DNS before starting RouteLag.");
  }
}

async function verifyConnection(route: PreparedRouteSession) {
  const started = Date.now();
  let lastError = "Tunnel verification did not complete.";

  while (Date.now() - started < 20000) {
    try {
      const [status, wg, dns, health, active] = await Promise.all([
        tauriApi.tunnelStatus(),
        tauriApi.getRouteLagEngineRuntimeStatus(),
        tauriApi.getDnsStatus(),
        routeApi.health(4000),
        tauriApi.loadActiveRouteSession(),
      ]);

      const handshakeOk =
        wg.latest_handshake_secs_ago == null || wg.latest_handshake_secs_ago < 180;
      const sessionExists = active?.session_id === route.sessionId;
      const assignedTunnelIp = Boolean(active?.client_address || route.clientAddress);
      const engineStarted = status.state === "connected";
      const routed = await verifyRoutedReachability(route.allowedIps);
      if (
        engineStarted &&
        handshakeOk &&
        dnsWorks(dns) &&
        health.ok &&
        sessionExists &&
        assignedTunnelIp &&
        routed.ok
      ) {
        await tauriApi
          .logClientEvent(
            `split_route_verified session=${route.sessionId} mode=${route.routeMode} routed=${routed.detail} public_ip_change_required=false`,
          )
          .catch(() => undefined);
        return;
      }

      lastError = `status=${status.state}; handshake=${wg.latest_handshake_secs_ago}; dns=${dnsWorks(dns)}; api=${health.ok}; session=${sessionExists}; assignedIp=${assignedTunnelIp}; routed=${routed.detail}; routeMode=${route.routeMode}`;
    } catch (error) {
      lastError = errorText(error);
    }
    await delay(1500);
  }

  throw new Error(`RouteLag Engine started, but verification failed. ${lastError}`);
}

export function gameRoutePolicyLabels(allowedIps: string): string[] {
  return splitAllowedIps(allowedIps)
    .filter((entry) => !entry.startsWith("10."))
    .map((entry) => (entry === "18.88.0.0/16" ? "18.88.x.x" : entry.replace(/\/32$/, "")));
}

export function gameRouteHosts(allowedIps: string): string[] {
  return splitAllowedIps(allowedIps)
    .filter((entry) => entry.endsWith("/32") && !entry.startsWith("10."))
    .map((entry) => entry.replace(/\/32$/, ""));
}

export function tunnelGatewayHost(allowedIps: string): string | null {
  const tunnelCidr = splitAllowedIps(allowedIps).find(
    (entry) => entry.endsWith("/24") && entry.startsWith("10."),
  );
  if (!tunnelCidr) return null;
  const octets = tunnelCidr.split("/")[0]?.split(".") ?? [];
  if (octets.length !== 4) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.1`;
}

export function routableTestHosts(allowedIps: string): string[] {
  const gameHosts = gameRouteHosts(allowedIps);
  const gateway = tunnelGatewayHost(allowedIps);
  return [...new Set([...gameHosts, ...(gateway ? [gateway] : [])])];
}

export function pickLivePingHost(
  allowedIps?: string | null,
  fallbackAllowedIps?: string | null,
): string {
  const policy = allowedIps || fallbackAllowedIps || "";
  const gameHosts = gameRouteHosts(policy);
  if (gameHosts.length > 0) return gameHosts[0];
  return tunnelGatewayHost(policy) ?? "1.1.1.1";
}

export function pickLivePingLabel(allowedIps?: string | null): string {
  const policy = allowedIps || "";
  const gameHosts = gameRouteHosts(policy);
  if (gameHosts.length > 0) return `Game route ${gameHosts[0]}`;
  const gateway = tunnelGatewayHost(policy);
  if (gateway) return `Tunnel ${gateway}`;
  return "Ping";
}

function windowsRoutePrefixesToVerify(allowedIps: string): string[] {
  return splitAllowedIps(allowedIps).filter(
    (entry) => entry.endsWith("/24") || entry.endsWith("/32"),
  );
}

async function verifyRoutedReachability(allowedIps: string) {
  const hosts = routableTestHosts(allowedIps);
  if (!hosts.length) {
    return {
      ok: false,
      detail: "No routable test targets in AllowedIPs.",
    };
  }

  const routePrefixes = windowsRoutePrefixesToVerify(allowedIps);
  if (routePrefixes.length) {
    const routeEntries = await tauriApi.getAllowedIpRouteEntries(routePrefixes);
    const missingRoutes = routeEntries.filter((entry) => !entry.installed);
    if (missingRoutes.length) {
      return {
        ok: false,
        detail: `Missing Windows routes: ${missingRoutes.map((entry) => entry.allowed_ip).join(", ")}`,
      };
    }
  }

  const attempts: string[] = [];
  for (const host of hosts) {
    try {
      const ping = await tauriApi.pingHost(host);
      attempts.push(
        `${host} loss=${ping.packet_loss_pct}% avg=${ping.avg_ping_ms ?? "n/a"}ms`,
      );
      if (ping.packet_loss_pct < 100 && ping.avg_ping_ms != null) {
        return {
          ok: true,
          detail: `Routed ping to ${host}: ${Math.round(ping.avg_ping_ms)} ms`,
        };
      }
    } catch (error) {
      attempts.push(`${host} error=${errorText(error)}`);
    }
  }

  return {
    ok: false,
    detail: `No routed target responded (${attempts.join("; ")})`,
  };
}

const PROBE_STEP_DEFS: Array<{ id: WireGuardProbeStepId; label: string }> = [
  { id: "api_health", label: "RouteLag API health" },
  { id: "local_ready", label: "Local engine and permissions" },
  { id: "server_session", label: "WireGuard session on server" },
  { id: "route_policy", label: "Split-route policy" },
  { id: "profile", label: "Local WireGuard profile" },
  { id: "tunnel", label: "RouteLag Engine tunnel" },
  { id: "handshake", label: "WireGuard handshake" },
  { id: "windows_routes", label: "Windows route entries" },
  { id: "routed_ping", label: "Routed target reachability" },
  { id: "cleanup", label: "Cleanup test session" },
];

function initialProbeSteps(): WireGuardProbeStep[] {
  return PROBE_STEP_DEFS.map((step) => ({
    ...step,
    status: "pending" as const,
  }));
}

function patchProbeStep(
  steps: WireGuardProbeStep[],
  id: WireGuardProbeStepId,
  status: WireGuardProbeStepStatus,
  detail?: string,
) {
  const index = steps.findIndex((step) => step.id === id);
  if (index === -1) return steps;
  steps[index] = { ...steps[index], status, detail };
  return [...steps];
}

export async function testWireGuardServer(
  gameId: string,
  serverId: string,
  options: {
    cleanup?: boolean;
    onStep?: (steps: WireGuardProbeStep[]) => void;
  } = {},
): Promise<WireGuardProbeResult> {
  return withOperation(async () => {
    const cleanup = options.cleanup !== false;
    let steps = initialProbeSteps();
    const publish = (id: WireGuardProbeStepId, status: WireGuardProbeStepStatus, detail?: string) => {
      steps = patchProbeStep(steps, id, status, detail) ?? steps;
      options.onStep?.(steps);
    };

    let route: PreparedRouteSession | null = null;

    const fail = async (id: WireGuardProbeStepId, detail: string): Promise<WireGuardProbeResult> => {
      publish(id, "fail", detail);
      if (route?.sessionId) {
        publish("cleanup", cleanup ? "running" : "skip", cleanup ? undefined : "Left connected for inspection");
        if (cleanup) {
          try {
            await rollbackRouteSession(route.sessionId, new Error(detail));
            publish("cleanup", "pass", "Test session removed");
          } catch (error) {
            publish("cleanup", "fail", errorText(error));
          }
        }
      }
      return {
        ok: false,
        steps,
        sessionId: route?.sessionId,
        allowedIps: route?.allowedIps,
        routeMode: route?.routeMode,
      };
    };

    try {
      publish("api_health", "running");
      const health = await routeApi.health(4000).catch((error) => {
        throw new Error(apiUnreachableMessage(error));
      });
      if (!health.ok || health.peerMode !== "wg") {
        return fail(
          "api_health",
          `Expected peerMode wg, got ${health.peerMode || "unknown"}.`,
        );
      }
      publish("api_health", "pass", `API online · peerMode=${health.peerMode}`);

      publish("local_ready", "running");
      const [elevated, engineAvailable, recovery] = await Promise.all([
        tauriApi.isElevated(),
        tauriApi.isRouteLagEngineAvailable(),
        tauriApi.getRecoveryStatus(),
      ]);
      if (!elevated) {
        return fail("local_ready", "Administrator permission is required.");
      }
      if (!engineAvailable) {
        return fail("local_ready", "RouteLag Engine is missing or damaged.");
      }
      if (recovery.stale_state_detected) {
        return fail(
          "local_ready",
          "Previous optimization did not close cleanly. Use Restore Internet first.",
        );
      }
      publish("local_ready", "pass", "Engine installed · running as admin");

      publish("server_session", "running");
      route = await createAndSaveRouteSession(gameId, serverId, setNoopState);
      publish(
        "server_session",
        "pass",
        `Session ${route.sessionId.slice(0, 8)}… · endpoint ${route.endpoint}`,
      );

      publish("route_policy", "running");
      const targets = routableTestHosts(route.allowedIps);
      if (route.routeMode !== "split_route") {
        return fail(
          "route_policy",
          `Unsafe route mode ${route.routeMode}. AllowedIPs=${route.allowedIps || "empty"}`,
        );
      }
      publish(
        "route_policy",
        "pass",
        `Split route · ${splitAllowedIps(route.allowedIps).join(", ")} · test targets: ${targets.join(", ") || "none"}`,
      );

      publish("profile", "pass", `Tunnel IP ${route.clientAddress}`);

      publish("tunnel", "running");
      await tauriApi.connectTunnel();
      const tunnel = await tauriApi.tunnelStatus();
      if (tunnel.state !== "connected" && tunnel.state !== "connecting") {
        return fail("tunnel", `Tunnel state=${tunnel.state}`);
      }
      publish("tunnel", "pass", `Tunnel ${tunnel.state}`);

      publish("handshake", "running");
      const handshakeDeadline = Date.now() + 15000;
      let handshakeDetail = "No handshake yet";
      while (Date.now() < handshakeDeadline) {
        const wg = await tauriApi.getRouteLagEngineRuntimeStatus();
        const handshakeOk =
          wg.latest_handshake_secs_ago == null || wg.latest_handshake_secs_ago < 180;
        if (handshakeOk && wg.latest_handshake_secs_ago != null) {
          handshakeDetail = `Handshake ${wg.latest_handshake_secs_ago}s ago · endpoint ${wg.endpoint ?? route.endpoint}`;
          publish("handshake", "pass", handshakeDetail);
          break;
        }
        if (wg.latest_handshake_secs_ago != null) {
          handshakeDetail = `Handshake ${wg.latest_handshake_secs_ago}s ago`;
        }
        await delay(1200);
      }
      if (steps.find((step) => step.id === "handshake")?.status !== "pass") {
        return fail(
          "handshake",
          `${handshakeDetail}. UDP to the server may be blocked or the peer was not provisioned.`,
        );
      }

      publish("windows_routes", "running");
      const routePrefixes = windowsRoutePrefixesToVerify(route.allowedIps);
      const routeEntries = routePrefixes.length
        ? await tauriApi.getAllowedIpRouteEntries(routePrefixes)
        : [];
      const missingRoutes = routeEntries.filter((entry) => !entry.installed);
      if (missingRoutes.length) {
        return fail(
          "windows_routes",
          `Missing routes: ${missingRoutes.map((entry) => entry.allowed_ip).join(", ")}`,
        );
      }
      publish(
        "windows_routes",
        "pass",
        routeEntries.length
          ? `${routeEntries.length} route ${routeEntries.length === 1 ? "entry" : "entries"} installed`
          : "Game block routes use WireGuard policy only (no /24 or /32 prefixes to verify)",
      );

      publish("routed_ping", "running");
      const routed = await verifyRoutedReachability(route.allowedIps);
      if (!routed.ok) {
        return fail("routed_ping", routed.detail);
      }
      publish("routed_ping", "pass", routed.detail);

      if (cleanup) {
        publish("cleanup", "running");
        await rollbackRouteSession(route.sessionId, new Error("WireGuard probe cleanup"));
        publish("cleanup", "pass", "Test session removed");
      } else {
        publish("cleanup", "skip", "Session left active");
      }

      return {
        ok: true,
        steps,
        sessionId: route.sessionId,
        allowedIps: route.allowedIps,
        routeMode: route.routeMode,
      };
    } catch (error) {
      const message = errorText(error);
      const runningStep =
        [...steps].reverse().find((step) => step.status === "running")?.id ?? "server_session";
      return fail(runningStep, message);
    }
  });
}

async function cleanupCreatedRouteSession(
  sessionId: string,
  originalError: unknown,
  context: string,
): Promise<never> {
  await rollbackRouteSession(sessionId, originalError);
  throw new Error(`${context} ${errorText(originalError)}`);
}

async function rollbackRouteSession(sessionId: string, originalError: unknown) {
  const errors: string[] = [];

  await tauriApi.logClientEvent(
    `rollback start session=${sessionId} reason=${errorText(originalError)}`,
  );

  try {
    const restore = await tauriApi.restoreInternet();
    if (!restore.ok) {
      errors.push(restoreSummary("Local rollback had warnings", restore));
    }
  } catch (error) {
    errors.push(`Local rollback failed: ${errorText(error)}`);
  }

  try {
    await routeApi.endRouteSession(sessionId, 5000);
  } catch (error) {
    errors.push(`API rollback failed: ${errorText(error)}`);
  }

  try {
    const recovery = await tauriApi.forceClearLocalRouteState();
    if (recovery.stale_state_detected) {
      errors.push("Local rollback clear finished, but RouteLag still detects stale route state.");
    }
  } catch (error) {
    errors.push(`Local session clear failed: ${errorText(error)}`);
  }

  await tauriApi
    .logClientEvent(
      errors.length
        ? `rollback finished with warnings session=${sessionId}: ${errors.join(" | ")}`
        : `rollback finished session=${sessionId}`,
    )
    .catch(() => undefined);

  if (errors.length) {
    throw new Error(
      `${errorText(originalError)} Rollback attempted with warnings: ${errors.join(" ")}`,
    );
  }
}

export function classifyAllowedIps(allowedIps: string): RouteMode {
  const entries = splitAllowedIps(allowedIps);
  if (!entries.length) return "invalid";
  if (entries.some((entry) => entry === "0.0.0.0/0" || entry === "::/0")) {
    return "full_tunnel";
  }
  if (!entries.every(isValidAllowedIpRange)) {
    return "invalid";
  }
  return "split_route";
}

export function splitAllowedIps(allowedIps: string): string[] {
  return allowedIps
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isValidAllowedIpRange(entry: string): boolean {
  if (entry === "18.88.0.0/16") return true;

  const ipv4Host = entry.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/32$/);
  if (ipv4Host) {
    return ipv4Host[1].split(".").every((octet) => {
      const value = Number(octet);
      return Number.isInteger(value) && value >= 0 && value <= 255;
    });
  }

  const ipv4Tunnel = entry.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/24$/);
  if (ipv4Tunnel) {
    const parts = ipv4Tunnel[1].split(".").map(Number);
    if (parts.length !== 4 || parts.some((octet) => octet < 0 || octet > 255)) {
      return false;
    }
    return parts[0] === 10 && parts[3] === 0;
  }

  return false;
}

function dnsWorks(dns: DnsStatus): boolean {
  return dns.results.some((result) => result.host !== "1.1.1.1" && result.resolved);
}

function stateReporter(options: RouteLifecycleOptions) {
  return (state: OptimizeState) => {
    options.onState?.(state);
    void tauriApi.logClientEvent(`optimize_state:${state}`).catch(() => undefined);
  };
}

function setNoopState(_state: OptimizeState) {
  // Used by legacy prepareRoute callers.
}

async function withOperation<T>(fn: () => Promise<T>): Promise<T> {
  if (operationInProgress) {
    throw new Error("RouteLag is already running a connection operation.");
  }
  operationInProgress = true;
  try {
    return await fn();
  } finally {
    operationInProgress = false;
  }
}

function restoreSummary(prefix: string, result: RestoreInternetResult) {
  const failed = result.steps
    .filter((item) => !item.ok)
    .map((item) => `${item.step}: ${item.message}`)
    .join("; ");
  return failed ? `${prefix}: ${failed}` : prefix;
}

function apiUnreachableMessage(error: unknown) {
  return `RouteLag servers are unreachable. Your internet may be blocking the beta API or the server may be offline. ${errorText(error)}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function getOptimizationStatus(): Promise<unknown> {
  const active = await tauriApi.loadActiveRouteSession();
  if (!active?.session_id) return null;
  return routeApi.getRouteStatus(active.session_id);
}

export async function runDiagnostics(options: { includeTraceroute?: boolean } = {}) {
  const report = await tauriApi.runFullDiagnostics({
    disconnectForNormal: false,
    includePublicIp: true,
    skipTunnelPhase: true,
    includeTraceroute: Boolean(options.includeTraceroute),
  });
  await updateBetaReportSnapshot({
    diagnostics_result: `Diagnostics completed: ${report.route_score}`,
  });
  return report;
}

export async function exportReport() {
  return tauriApi.exportReportZip();
}

export async function getActiveRouteVerification(
  allowedIps: string[],
): Promise<ActiveRouteVerification> {
  const [routeEntries, health, dns, ping, recovery, elevated] = await Promise.all([
    tauriApi.getAllowedIpRouteEntries(allowedIps).catch(() => []),
    routeApi.health(3000).catch(() => ({ ok: false, peerMode: "unknown" })),
    tauriApi.getDnsStatus().catch(() => ({ results: [] })),
    tauriApi.pingHost("1.1.1.1").catch(() => null),
    tauriApi.getRecoveryStatus().catch(() => null),
    tauriApi.isElevated().catch(() => false),
  ]);

  return {
    routes: allowedIps.map((allowedIp) => ({
      allowed_ip: allowedIp,
      route_installed: routeEntries.some(
        (entry) => entry.allowed_ip === allowedIp && entry.installed,
      ),
    })),
    api_reachable: Boolean(health.ok),
    dns_works: dnsWorks(dns),
    public_internet_works: Boolean(ping && ping.packet_loss_pct < 100),
    cleanup_ready: Boolean(elevated && recovery?.active_route_session),
  };
}

async function buildInitialBetaReportSnapshot({
  gameId,
  serverId,
  route,
  routeMode,
}: {
  gameId: string;
  serverId: string;
  route: CreateRouteSessionResponse;
  routeMode: RouteMode;
}): Promise<BetaReportSnapshot> {
  const appVersion = await tauriApi.getAppVersion().catch(() => "unknown");
  const allowedIps = splitAllowedIps(route.allowedIps);
  const selectedServer = route.serverName || serverId;
  return {
    app_version: appVersion,
    api_url: ROUTELAG_API_URL,
    tester_id: getRouteTesterId(),
    invite_code: getRouteInviteCode(),
    selected_game: gameId,
    selected_server: selectedServer,
    all_tested_servers: rememberTestedServer(selectedServer),
    allowed_ips_returned: allowedIps,
    route_mode: routeMode,
    assigned_tunnel_ip: route.clientAddress || null,
    session_id: route.sessionId || null,
    optimize_start_time: new Date().toISOString(),
    optimize_end_time: null,
    cleanup_result: null,
    restore_internet_result: null,
    diagnostics_result: null,
    windows_route_entries_before: await tauriApi.getAllowedIpRouteEntries(allowedIps),
    windows_route_entries_after: [],
    windows_route_entries_for_allowed_ips: [],
    service_leftover_status: null,
    public_ip_before: await publicIpOrNull(),
    public_ip_after: null,
    api_reachability_before: await apiReachable(),
    api_reachability_after: null,
  };
}

const TESTED_SERVERS_KEY = "routelag.testedServers";

function rememberTestedServer(serverName: string): string[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TESTED_SERVERS_KEY) ?? "[]",
    ) as string[];
    const next = Array.from(new Set([...parsed, serverName].filter(Boolean)));
    window.localStorage.setItem(TESTED_SERVERS_KEY, JSON.stringify(next));
    return next;
  } catch {
    window.localStorage.setItem(TESTED_SERVERS_KEY, JSON.stringify([serverName]));
    return [serverName];
  }
}

async function updateBetaReportSnapshot(patch: Partial<BetaReportSnapshot>) {
  const current = await tauriApi.loadBetaReportSnapshot().catch(() => null);
  if (!current) return;
  await tauriApi
    .saveBetaReportSnapshot({
      ...current,
      ...patch,
    })
    .catch(() => undefined);
}

async function publicIpOrNull() {
  return tauriApi.getPublicIp().catch(() => null);
}

async function apiReachable() {
  return routeApi
    .health(3000)
    .then((health) => Boolean(health.ok))
    .catch(() => false);
}
