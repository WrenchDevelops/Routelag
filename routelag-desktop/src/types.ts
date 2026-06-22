export interface ConfigIdentity {
  original_filename: string;
  address: string | null;
  endpoint: string | null;
  dns: string | null;
  mtu: number | null;
}

export interface TesterProfile {
  tester_name: string;
  discord_username: string;
  state_country: string;
  isp: string;
  connection_type: string;
  normal_fortnite_ping_ms: number | null;
  routelag_fortnite_ping_ms: number | null;
  fortnite_region: string;
  notes: string;
}

export interface TunnelStatus {
  state: "disconnected" | "connecting" | "connected" | "error" | string;
  message: string | null;
}

export interface PingResult {
  host: string;
  avg_ping_ms: number | null;
  packet_loss_pct: number;
  jitter_ms: number | null;
  samples_ms: number[];
}

export interface RouteTestResult {
  mode: string;
  avg_ping_ms: number | null;
  packet_loss_pct: number;
  jitter_ms: number | null;
  public_ip: string | null;
  tested_at: string;
}

export interface DetailedPingResult {
  host: string;
  sent: number;
  received: number;
  packet_loss_pct: number;
  min_ms: number | null;
  avg_ms: number | null;
  max_ms: number | null;
  jitter_ms: number | null;
}

export interface DnsHostResult {
  host: string;
  resolved: boolean;
  addresses: string[];
  error: string | null;
}

export interface DnsStatus {
  results: DnsHostResult[];
}

export interface MtuProbe {
  mtu: number;
  success: boolean;
}

export interface MtuTestResult {
  probes: MtuProbe[];
  best_mtu: number | null;
  recommended_mtu: number;
}

export interface WireGuardStatus {
  service_status: string;
  wg_show: string;
  latest_handshake_secs_ago: number | null;
  transfer_rx: string | null;
  transfer_tx: string | null;
  endpoint: string | null;
  allowed_ips: string | null;
  mtu: number | null;
}

export interface TunnelHealth {
  status: string;
  service_running: boolean;
  handshake_recent: boolean;
  handshake_secs_ago: number | null;
  ping_ok: boolean;
  failed_checks: number;
  reconnect_recommended: boolean;
  public_ip_changed: boolean | null;
  stuck_tunnel: boolean;
  message: string;
}

export interface RouteSnapshot {
  label: string;
  public_ip: string | null;
  pings: DetailedPingResult[];
  traceroutes: TracerouteResult[];
  dns: DnsStatus;
}

export interface TracerouteResult {
  host: string;
  output: string;
}

export interface NetworkAdapterInfo {
  adapter_name: string | null;
  connection_type: string | null;
}

export interface RouteComparison {
  ping_delta_ms: number | null;
  normal_avg_ping_ms: number | null;
  tunnel_avg_ping_ms: number | null;
  normal_packet_loss_pct: number | null;
  tunnel_packet_loss_pct: number | null;
  public_ip_changed: boolean;
}

export interface OsInfo {
  os_name: string;
  os_version: string;
  cpu_name: string | null;
  ram_total_gb: number | null;
  local_datetime: string;
  timezone: string;
  is_admin: boolean;
  wireguard_installed: boolean;
  wireguard_exe_path: string | null;
}

export interface DiagnosticsReport {
  generated_at: string;
  app_version: string;
  include_public_ip: boolean;
  normal_route: RouteSnapshot;
  routelag_route: RouteSnapshot | null;
  machine: OsInfo;
  network_adapter: NetworkAdapterInfo;
  wireguard: WireGuardStatus | null;
  mtu: MtuTestResult;
  route_score: string;
  recommendation: string;
  comparison: RouteComparison;
  privacy_warning: string;
  tester_profile?: TesterProfile | null;
  config_identity?: ConfigIdentity | null;
}

export type PageId =
  | "connect"
  | "route-test"
  | "diagnostics"
  | "settings"
  | "logs";

export type RouteScore =
  | "Excellent"
  | "Good"
  | "Okay"
  | "Bad"
  | "Worse Than Normal"
  | "Incomplete"
  | string;

export function normalizeTunnelStatus(status: TunnelStatus): {
  label: string;
  tone: "success" | "warning" | "error" | "muted";
} {
  switch (status.state) {
    case "connected":
      return { label: "Connected", tone: "success" };
    case "connecting":
      return { label: "Connecting", tone: "warning" };
    case "error":
      return { label: "Error", tone: "error" };
    case "disconnected":
    default:
      return { label: "Disconnected", tone: "muted" };
  }
}

export function scoreTone(score: string): "success" | "warning" | "error" | "muted" {
  switch (score) {
    case "Excellent":
    case "Good":
      return "success";
    case "Okay":
      return "warning";
    case "Bad":
    case "Worse Than Normal":
      return "error";
    default:
      return "muted";
  }
}

export function healthTone(status: string): "success" | "warning" | "error" | "muted" {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warning";
    default:
      return "muted";
  }
}

export const defaultTesterProfile = (): TesterProfile => ({
  tester_name: "",
  discord_username: "",
  state_country: "",
  isp: "",
  connection_type: "",
  normal_fortnite_ping_ms: null,
  routelag_fortnite_ping_ms: null,
  fortnite_region: "",
  notes: "",
});

export const defaultTunnelStatus = (): TunnelStatus => ({
  state: "disconnected",
  message: null,
});

export const BETA_DISCLAIMER =
  "RouteLag Beta is a network routing test tool. It does not modify Fortnite, inject into Fortnite, or interact with anti-cheat. RouteLag is not affiliated with Epic Games or Fortnite. VPN/proxy routing can sometimes cause login or connection issues; disconnect RouteLag if that happens.";

export const PRIVACY_WARNING =
  "This report may include your public IP, ISP/network info, ping results, and RouteLag tunnel status. Do not share it publicly.";
