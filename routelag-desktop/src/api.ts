import { invoke } from "@tauri-apps/api/core";

import type {
  ConfigIdentity,
  AllowedIpRouteEntry,
  BetaReportSnapshot,
  DetailedPingResult,
  DiagnosticsReport,
  DnsStatus,
  MtuTestResult,
  NetworkAdapterInfo,
  NodeProbeInput,
  NodeProbeResult,
  OsInfo,
  PingResult,
  RecoveryStatus,
  RestoreInternetResult,
  RouteTestResult,
  RouteLagEngineStatus,
  RouteLagEngineRuntimeStatus,
  TesterProfile,
  TracerouteResult,
  TunnelHealth,
  TunnelStatus,
} from "./types";
import type {
  ActiveRouteSession,
  GeneratedRouteProfile,
  RouteKeys,
} from "./lib/routeEngine";

export const api = {
  getAppVersion: () => invoke<string>("get_app_version"),
  hasConfig: () => invoke<boolean>("has_config"),
  importConfig: (path?: string) => invoke<void>("import_config", { path }),
  removeConfig: () => invoke<void>("remove_config"),
  redactConfig: () => invoke<string>("redact_config"),
  getServerDisplayName: () => invoke<string | null>("get_server_display_name"),
  getConfigIdentity: () => invoke<ConfigIdentity | null>("get_config_identity"),
  isElevated: () => invoke<boolean>("is_elevated"),
  restartAsAdmin: () => invoke<void>("restart_as_admin"),
  isRouteLagEngineAvailable: () => invoke<boolean>("is_route_lag_engine_available"),
  getRouteLagEngineStatus: () =>
    invoke<RouteLagEngineStatus>("route_lag_engine_status_cmd"),
  generateRouteKeys: () => invoke<RouteKeys>("generate_route_keys_cmd"),
  saveRouteSessionProfile: (profile: GeneratedRouteProfile) =>
    invoke<void>("save_route_session_profile_cmd", { profile }),
  loadActiveRouteSession: () =>
    invoke<ActiveRouteSession | null>("load_active_route_session_cmd"),
  clearActiveRouteSession: () => invoke<void>("clear_active_route_session_cmd"),
  connectTunnel: () => invoke<void>("connect_tunnel"),
  disconnectTunnel: () => invoke<void>("disconnect_tunnel"),
  reconnectTunnel: () => invoke<void>("reconnect_tunnel_cmd"),
  restoreInternet: () => invoke<RestoreInternetResult>("restore_internet_cmd"),
  forceClearLocalRouteState: () =>
    invoke<RecoveryStatus>("force_clear_local_route_state_cmd"),
  repairWindowsNetwork: () =>
    invoke<RestoreInternetResult>("repair_windows_network_cmd"),
  getRecoveryStatus: () => invoke<RecoveryStatus>("get_recovery_status_cmd"),
  logClientEvent: (event: string) => invoke<void>("log_client_event_cmd", { event }),
  tunnelStatus: () => invoke<TunnelStatus>("tunnel_status"),
  getPublicIp: () => invoke<string>("get_public_ip"),
  pingHost: (host?: string) => invoke<PingResult>("ping_host", { host }),
  runRouteTest: (mode: "normal" | "routelag") =>
    invoke<RouteTestResult>("run_route_test", { mode }),
  loadRouteTest: () => invoke<RouteTestResult | null>("load_route_test"),
  readLogs: () => invoke<string>("read_logs"),
  clearLogs: () => invoke<void>("clear_logs"),
  resetApp: () => invoke<void>("reset_app"),
  openLogsFolder: () => invoke<void>("open_logs_folder"),
  getTesterProfile: () => invoke<TesterProfile>("get_tester_profile"),
  saveTesterProfile: (profile: TesterProfile) =>
    invoke<void>("save_tester_profile", { profile }),
  saveBetaReportSnapshot: (report: BetaReportSnapshot) =>
    invoke<void>("save_beta_report_snapshot_cmd", { report }),
  loadBetaReportSnapshot: () =>
    invoke<BetaReportSnapshot | null>("load_beta_report_snapshot_cmd"),
  getAllowedIpRouteEntries: (allowedIps: string[]) =>
    invoke<AllowedIpRouteEntry[]>("get_allowed_ip_route_entries_cmd", {
      allowedIps,
    }),

  runPingTest: (host: string) =>
    invoke<DetailedPingResult>("run_ping_test_cmd", { host }),
  runTraceroute: (host: string) =>
    invoke<TracerouteResult>("run_traceroute_cmd", { host }),
  getDnsStatus: () => invoke<DnsStatus>("get_dns_status_cmd"),
  getRouteLagEngineRuntimeStatus: () =>
    invoke<RouteLagEngineRuntimeStatus>("get_route_lag_engine_runtime_status_cmd"),
  getNetworkAdapterInfo: () =>
    invoke<NetworkAdapterInfo>("get_network_adapter_info_cmd"),
  getOsInfo: () => invoke<OsInfo>("get_os_info_cmd"),
  runMtuTest: () => invoke<MtuTestResult>("run_mtu_test_cmd"),
  getTunnelHealth: (baselinePublicIp?: string | null) =>
    invoke<TunnelHealth>("get_tunnel_health_cmd", {
      baselinePublicIp: baselinePublicIp ?? null,
    }),
  loadDiagnostics: () => invoke<DiagnosticsReport | null>("load_diagnostics"),
  runFullDiagnostics: (options: {
    disconnectForNormal: boolean;
    includePublicIp: boolean;
    skipTunnelPhase: boolean;
    includeTraceroute?: boolean;
  }) =>
    invoke<DiagnosticsReport>("run_full_diagnostics_cmd", {
      disconnectForNormal: options.disconnectForNormal,
      includePublicIp: options.includePublicIp,
      skipTunnelPhase: options.skipTunnelPhase,
      includeTraceroute: Boolean(options.includeTraceroute),
    }),
  copyReportText: () => invoke<string>("copy_report_text_cmd"),
  exportReportZip: () => invoke<string>("export_report_zip_cmd"),
  probeRouteNodes: (nodes: NodeProbeInput[]) =>
    invoke<NodeProbeResult[]>("probe_route_nodes_cmd", { nodes }),
};
