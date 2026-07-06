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

export interface AllowedIpRouteEntry {
  allowed_ip: string;
  installed: boolean;
  output: string;
}

export interface BetaReportSnapshot {
  app_version: string;
  api_url: string;
  tester_id: string | null;
  invite_code: string | null;
  selected_game: string;
  selected_server: string;
  all_tested_servers: string[];
  allowed_ips_returned: string[];
  route_mode: RouteMode | "blocked" | "unknown";
  assigned_tunnel_ip: string | null;
  session_id: string | null;
  optimize_start_time: string | null;
  optimize_end_time: string | null;
  cleanup_result: string | null;
  restore_internet_result: string | null;
  diagnostics_result: string | null;
  windows_route_entries_for_allowed_ips: AllowedIpRouteEntry[];
  windows_route_entries_before: AllowedIpRouteEntry[];
  windows_route_entries_after: AllowedIpRouteEntry[];
  service_leftover_status: string | null;
  public_ip_before: string | null;
  public_ip_after: string | null;
  api_reachability_before: boolean | null;
  api_reachability_after: boolean | null;
  auto_route?: AutoRouteSnapshot | null;
}

export interface RouteVerification {
  allowed_ip: string;
  route_installed: boolean;
}

export interface ActiveRouteVerification {
  routes: RouteVerification[];
  api_reachable: boolean;
  dns_works: boolean;
  public_internet_works: boolean;
  cleanup_ready: boolean;
}

export interface TunnelStatus {
  state: "disconnected" | "connecting" | "connected" | "error" | string;
  message: string | null;
}

export type OptimizeState =
  | "idle"
  | "preflight"
  | "creating_server_session"
  | "writing_profile"
  | "starting_engine"
  | "verifying_connection"
  | "optimized"
  | "stopping"
  | "rollback"
  | "error";

export type RouteMode = "full_tunnel" | "split_route" | "invalid";

export type WireGuardProbeStepId =
  | "api_health"
  | "local_ready"
  | "server_session"
  | "route_policy"
  | "profile"
  | "tunnel"
  | "handshake"
  | "windows_routes"
  | "routed_ping"
  | "cleanup";

export type WireGuardProbeStepStatus = "pending" | "running" | "pass" | "fail" | "skip";

export interface WireGuardProbeStep {
  id: WireGuardProbeStepId;
  label: string;
  status: WireGuardProbeStepStatus;
  detail?: string;
}

export interface WireGuardProbeResult {
  ok: boolean;
  steps: WireGuardProbeStep[];
  sessionId?: string;
  allowedIps?: string;
  routeMode?: RouteMode;
}

export interface LifecycleStressStatus {
  start_stop_cycles: number;
  last_start_time: string | null;
  last_stop_time: string | null;
  cleanup_result: string;
  service_leftover_status: string;
  api_cleanup_result: string;
  route_mode: RouteMode | "unknown";
}

export interface RestoreStepResult {
  step: string;
  ok: boolean;
  message: string;
}

export interface RestoreInternetResult {
  ok: boolean;
  reboot_required: boolean;
  steps: RestoreStepResult[];
}

export interface TunnelServiceStatus {
  profile_name: string;
  service_name: string;
  installed: boolean;
  running: boolean;
  raw_status: string;
}

export interface RecoveryStatus {
  is_elevated: boolean;
  active_route_session: boolean;
  route_profile_exists: boolean;
  stale_services: TunnelServiceStatus[];
  stale_state_detected: boolean;
  stored_session_id: string | null;
  route_service_installed: boolean;
  route_service_running: boolean;
  last_cleanup_result: RestoreInternetResult | null;
}

export interface InlineError {
  title: string;
  message: string;
  details?: string;
  canRetry?: boolean;
  canRestore?: boolean;
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

export interface RouteLagEngineStatus {
  available: boolean;
  engine_path: string | null;
  tools_path: string | null;
  service_name: string;
  service_status: string;
}

export interface RouteLagEngineRuntimeStatus {
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

export interface FortniteReplay {
  name: string;
  path: string;
  modified_at: string;
  size_bytes: number;
}

export interface LocalReplayFile extends FortniteReplay {
  file_hash: string | null;
  status: string;
}

export type ReplayJobStatus =
  | "local_found"
  | "queued"
  | "uploading"
  | "uploaded"
  | "osirion_pending"
  | "osirion_complete"
  | "fetching_match_data"
  | "parsed"
  | "failed";

export interface ReplayJob {
  id: string;
  userId: string;
  inviteCode: string;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  status: ReplayJobStatus;
  provider: "osirion";
  providerTrackingId?: string;
  providerMatchId?: string;
  replayId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  parsedAt?: string;
  lastCheckedAt?: string;
}

export interface PathGenKeyMoment {
  id: string;
  type: string;
  timestampSeconds: number;
  title: string;
  description?: string;
  importance?: string;
  thumbnailUrl?: string;
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

export interface PathGenReplayDetail {
  summary: PathGenReplaySummary;
  player?: unknown;
  match?: unknown;
  stats?: Record<string, unknown>;
  timeline?: unknown[];
  keyMoments: PathGenKeyMoment[];
  fights?: unknown[];
  eliminations?: unknown[];
  deaths?: unknown[];
  damageEvents?: unknown[];
  inventoryTimeline?: unknown[];
  rotations?: unknown[];
  zoneStats?: unknown[];
}

export interface HudMaterials {
  wood?: number;
  stone?: number;
  metal?: number;
}

export interface HudInventoryItem {
  slot: number;
  name: string;
  rarity?: number;
  ammo?: number;
  count?: number;
}

export interface HudStorm {
  current?: number;
  max?: number;
  damage?: number;
}

export interface HudTelemetryData {
  connected?: boolean;
  fortniteDetected?: boolean;
  matchActive?: boolean;
  phase?: string;
  ping?: number;
  health?: number;
  shield?: number;
  overShield?: number;
  kills?: number;
  assists?: number;
  deaths?: number;
  placement?: number;
  damageDealt?: number;
  damageTaken?: number;
  totalPlayers?: number;
  totalTeams?: number;
  matchMode?: string;
  isRanked?: boolean;
  buildMode?: string;
  materials?: HudMaterials;
  inventory?: unknown;
  location?: unknown;
  storm?: HudStorm;
  fps?: number;
  lastUpdateAt?: number;
}

export interface HudTelemetryMessage {
  source: "routelag-hud-companion" | "routelag-demo-data" | string;
  game: "fortnite" | string;
  type: "hud_update" | "match_event" | "connection_status";
  timestamp: number;
  data: HudTelemetryData;
}

export interface HudBridgeStatus {
  url: string;
  token: string;
  connected: boolean;
  stale: boolean;
  lastEventAt: number | null;
  eventCount: number;
  rejectedCount: number;
  serverStarted: boolean;
  serverError: string | null;
  fortniteDetected: boolean;
  matchActive: boolean;
}

export interface HudTelemetrySnapshot {
  status: HudBridgeStatus;
  latest: HudTelemetryMessage | null;
}

export interface InstallInfo {
  hudInstalled: boolean;
  hudPath: string | null;
  hudCorrupt: boolean;
  engineInstalled: boolean;
  enginePath: string | null;
  installPath: string | null;
  installedVersion: string | null;
  detectionMethod: string;
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
  route_lag_engine_available: boolean;
  route_lag_engine_path: string | null;
}

export interface DiagnosticsReport {
  generated_at: string;
  app_version: string;
  include_public_ip: boolean;
  normal_route: RouteSnapshot;
  routelag_route: RouteSnapshot | null;
  machine: OsInfo;
  network_adapter: NetworkAdapterInfo;
  wireguard: RouteLagEngineRuntimeStatus | null;
  mtu: MtuTestResult;
  route_score: string;
  recommendation: string;
  comparison: RouteComparison;
  privacy_warning: string;
  tester_profile?: TesterProfile | null;
  config_identity?: ConfigIdentity | null;
  beta_report?: BetaReportSnapshot | null;
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
  country_city: "",
  isp: "",
  connection_type: "",
  normal_fortnite_ping_ms: null,
  normal_fortnite_packet_loss_pct: null,
  routelag_fortnite_ping_ms: null,
  routelag_fortnite_packet_loss_pct: null,
  johannesburg_fortnite_ping_ms: null,
  dallas_fortnite_ping_ms: null,
  fortnite_region: "Middle East",
  packet_loss_notes: "",
  best_route: "",
  any_issues: "",
  felt_smoother: "",
  internet_broke: "",
  end_optimization_worked: "",
  notes: "",
});

export const defaultTunnelStatus = (): TunnelStatus => ({
  state: "disconnected",
  message: null,
});

export const defaultLifecycleStressStatus = (): LifecycleStressStatus => ({
  start_stop_cycles: 0,
  last_start_time: null,
  last_stop_time: null,
  cleanup_result: "Not run",
  service_leftover_status: "Not checked",
  api_cleanup_result: "Not checked",
  route_mode: "unknown",
});

export const BETA_DISCLAIMER =
  "RouteLag Beta is a network routing test tool. It does not modify Fortnite, inject into Fortnite, or interact with anti-cheat. RouteLag is not affiliated with Epic Games or Fortnite. VPN/proxy routing can sometimes cause login or connection issues; disconnect RouteLag if that happens.";

export const PRIVACY_WARNING =
  "This report may include your public IP, ISP/network info, ping results, and RouteLag tunnel status. Do not share it publicly.";

// ---- Auto Route types ----

export type AutoRouteType = "direct" | "single" | "chain";
export type AutoMeasurementStatus = "measured" | "estimated" | "partial" | "unavailable";
export type AutoMeasurementMethod = "icmp" | "tcp" | "unavailable";

export interface AutoRouteCandidate {
  id: string;
  type: AutoRouteType;
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

export interface AutoScoreBreakdown {
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  hopPenaltyMs: number;
  total: number;
}

export interface AutoRankedRoute {
  candidate: AutoRouteCandidate;
  score: number;
  breakdown: AutoScoreBreakdown;
  measurementStatus: AutoMeasurementStatus;
  warnings: string[];
}

export interface AutoRouteTestResult {
  rankedRoutes: AutoRankedRoute[];
  recommendedRoute: AutoRankedRoute | null;
  directIsBetter: boolean;
  chainRoutesAvailable: boolean;
  reasons: string[];
  warnings: string[];
}

export interface NodeProbeInput {
  node_id: string;
  host: string;
  port?: number;
}

export interface NodeProbeResult {
  node_id: string;
  host: string;
  latency_ms: number | null;
  jitter_ms: number | null;
  packet_loss_pct: number;
  method: AutoMeasurementMethod;
  error: string | null;
}

export interface AutoRouteSnapshot {
  ran_at: string;
  direct_latency_ms: number | null;
  direct_jitter_ms: number | null;
  direct_loss_pct: number | null;
  direct_score: number | null;
  recommended_route_id: string | null;
  recommended_route_label: string | null;
  recommended_route_score: number | null;
  direct_is_better: boolean;
  chain_routes_estimate_only: boolean;
  client_to_node_measurements: NodeProbeResult[];
  ranked_routes: unknown[];
  reasons: string[];
  warnings: string[];
}

export type AutoRouteState = "idle" | "probing" | "ranking" | "done" | "error";
