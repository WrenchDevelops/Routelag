import { invoke } from "@tauri-apps/api/core";

import type {
  ConfigIdentity,
  DetailedPingResult,
  DiagnosticsReport,
  DnsStatus,
  MtuTestResult,
  NetworkAdapterInfo,
  OsInfo,
  PingResult,
  RouteTestResult,
  TesterProfile,
  TracerouteResult,
  TunnelHealth,
  TunnelStatus,
  WireGuardStatus,
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
  isWireguardInstalled: () => invoke<boolean>("is_wireguard_installed"),
  generateRouteKeys: () => invoke<RouteKeys>("generate_route_keys_cmd"),
  saveRouteSessionProfile: (profile: GeneratedRouteProfile) =>
    invoke<void>("save_route_session_profile_cmd", { profile }),
  loadActiveRouteSession: () =>
    invoke<ActiveRouteSession | null>("load_active_route_session_cmd"),
  clearActiveRouteSession: () => invoke<void>("clear_active_route_session_cmd"),
  connectTunnel: () => invoke<void>("connect_tunnel"),
  disconnectTunnel: () => invoke<void>("disconnect_tunnel"),
  reconnectTunnel: () => invoke<void>("reconnect_tunnel_cmd"),
  emergencyCleanup: () => invoke<void>("emergency_cleanup_cmd"),
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

  runPingTest: (host: string) =>
    invoke<DetailedPingResult>("run_ping_test_cmd", { host }),
  runTraceroute: (host: string) =>
    invoke<TracerouteResult>("run_traceroute_cmd", { host }),
  getDnsStatus: () => invoke<DnsStatus>("get_dns_status_cmd"),
  getWireguardStatus: () => invoke<WireGuardStatus>("get_wireguard_status_cmd"),
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
  }) =>
    invoke<DiagnosticsReport>("run_full_diagnostics_cmd", {
      disconnectForNormal: options.disconnectForNormal,
      includePublicIp: options.includePublicIp,
      skipTunnelPhase: options.skipTunnelPhase,
    }),
  copyReportText: () => invoke<string>("copy_report_text_cmd"),
  exportReportZip: () => invoke<string>("export_report_zip_cmd"),
};
