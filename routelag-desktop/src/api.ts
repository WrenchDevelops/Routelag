import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  ConfigIdentity,
  AllowedIpRouteEntry,
  BetaReportSnapshot,
  DetailedPingResult,
  DiagnosticsReport,
  DnsStatus,
  InstallInfo,
  MtuTestResult,
  NetworkAdapterInfo,
  FortniteReplay,
  LocalReplayFile,
  HudBridgeStatus,
  HudTelemetrySnapshot,
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
  listFortniteReplays: () => invoke<FortniteReplay[]>("list_fortnite_replays_cmd"),
  scanReplayFolder: (path?: string) =>
    invoke<LocalReplayFile[]>("scan_replay_folder", { path: path ?? null }),
  importReplayFile: async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Fortnite Replay", extensions: ["replay"] }],
    });
    if (selected == null) {
      throw new Error("Replay import cancelled.");
    }
    const path = Array.isArray(selected) ? selected[0] : selected;
    return invoke<LocalReplayFile>("load_replay_file", { path });
  },
  hashReplayFile: (path: string) => invoke<string>("hash_replay_file", { path }),
  uploadReplayFile: (path: string, apiBaseUrl: string, token: string) =>
    invoke<string>("upload_replay_file", { path, apiBaseUrl, token }),
  renameParsedReplay: (path: string, newName: string) =>
    invoke<string>("rename_parsed_replay", { path, newName }),
  selectReplayFolder: async () => {
    const defaultPath = await invoke<string | null>("get_default_replay_folder_cmd");
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultPath ?? undefined,
    });
    if (selected == null) {
      throw new Error("Folder selection cancelled.");
    }
    return Array.isArray(selected) ? selected[0]! : selected;
  },
  getHudBridgeStatus: () => invoke<HudBridgeStatus>("get_hud_bridge_status_cmd"),
  getHudTelemetrySnapshot: () =>
    invoke<HudTelemetrySnapshot>("get_hud_telemetry_snapshot_cmd"),
  useHudDemoData: () => invoke<void>("use_hud_demo_data_cmd"),
  getInstallInfo: () => invoke<InstallInfo>("get_install_info_cmd"),
  launchHudInstaller: () => invoke<void>("launch_hud_installer_cmd"),
  saveHudLayout: (layout: string) => invoke<void>("save_hud_layout_cmd", { layout }),
  loadHudLayout: () => invoke<string>("load_hud_layout_cmd"),
  openHudOverlayWindow: () => invoke<void>("open_hud_overlay_window_cmd"),
  requestHudOverlayShow: () => invoke<void>("request_hud_overlay_show_cmd"),
  requestHudOverlayHide: () => invoke<void>("request_hud_overlay_hide_cmd"),
  closeHudOverlayWindow: () => invoke<void>("close_hud_overlay_window_cmd"),
  setHudOverlayEditMode: (editMode: boolean) =>
    invoke<void>("set_hud_overlay_edit_mode_cmd", { editMode }),
  toggleHudOverlayEditMode: () => invoke<boolean>("toggle_hud_overlay_edit_mode_cmd"),
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
  exitApp: () => invoke<void>("exit_app"),
};
