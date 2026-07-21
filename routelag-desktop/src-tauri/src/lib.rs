mod beta_report;
mod cleanup;
mod config;
mod diagnostics;
mod elevation;
mod export;
mod external_url;
mod health;
mod hud_bridge;
mod hud_layout;
mod hud_overlay;
mod install_info;
mod logs;
mod network;
mod network_diag;
mod replay_import;
mod route_lag_engine;
mod route_session;
mod startup;
mod sysinfo;
mod tester_profile;
mod tunnel;
mod windows_process;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::window::Color;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::beta_report::{AllowedIpRouteEntry, BetaReportError, BetaReportSnapshot};
use crate::cleanup::{RecoveryStatus, RestoreInternetResult};
use crate::config::{ConfigError, ConfigIdentity};
use crate::diagnostics::{
    copy_report_text, load_report, run_full_diagnostics, DiagnosticsError, DiagnosticsReport,
    RunDiagnosticsOptions,
};
use crate::elevation::ElevationError;
use crate::export::ExportError;
use crate::health::{get_tunnel_health, reset_stability, StabilityTracker, TunnelHealth};
use crate::hud_bridge::{HudBridgeState, HudBridgeStatus, HudTelemetrySnapshot};
use crate::logs::{LogError, LogManager};
use crate::network::{NetworkError, PingResult, RouteTestResult};
use crate::network_diag::{
    get_dns_status, probe_route_nodes, run_mtu_test, run_ping_test, run_traceroute,
    DetailedPingResult, DnsStatus, MtuTestResult, NodeProbeInput, NodeProbeResult, TracerouteResult,
};
use crate::replay_import::LocalReplayFile;
use crate::route_lag_engine::{RouteLagEngine, RouteLagEngineStatus};
use crate::route_session::{
    ActiveRouteSession, GeneratedRouteProfile, RouteKeys, RouteSessionError,
};
use crate::sysinfo::{
    get_network_adapter_info, get_os_info, list_fortnite_replays, FortniteReplay,
    NetworkAdapterInfo, OsInfo,
};
use crate::tester_profile::{ProfileError, TesterProfile};
use crate::tunnel::{
    get_route_lag_engine_runtime_status, reconnect_tunnel, RouteLagEngineRuntimeStatus,
    TunnelError, TunnelStatus,
};

pub struct AppState {
    pub app_data_dir: PathBuf,
    pub engine: RouteLagEngine,
    pub hud_bridge: HudBridgeState,
    pub logs: LogManager,
    pub connect_lock: Mutex<()>,
    pub stability: Mutex<StabilityTracker>,
}

fn app_state(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if state.app_data_dir.as_os_str().is_empty() {
        return Err("App data directory not initialized".to_string());
    }
    Ok(())
}

fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub use startup::write_startup_crash_log;

#[tauri::command]
fn get_app_version() -> String {
    app_version()
}

#[tauri::command]
fn has_config(state: tauri::State<'_, AppState>) -> bool {
    config::has_config(&state.app_data_dir)
}

#[tauri::command]
fn import_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: Option<String>,
) -> Result<(), String> {
    app_state(state.clone())?;

    let source = if let Some(p) = path {
        std::path::PathBuf::from(p)
    } else {
        let picked = app
            .dialog()
            .file()
            .add_filter("RouteLag Profile", &["conf"])
            .blocking_pick_file();
        match picked {
            Some(file) => file.into_path().map_err(|e| e.to_string())?,
            None => return Err("Import cancelled.".to_string()),
        }
    };

    config::import_config(&state.app_data_dir, &source).map_err(|e: ConfigError| e.to_string())?;
    state
        .logs
        .info(&format!("Imported config from {}", source.display()));
    Ok(())
}

#[tauri::command]
fn remove_config(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let status = tunnel::tunnel_status();
    if status.is_connected() || status.is_connecting() {
        tunnel::disconnect_tunnel(&state.engine).map_err(|e: TunnelError| e.to_string())?;
        state
            .logs
            .info("Tunnel disconnected before config removal.");
    }
    config::remove_config(&state.app_data_dir).map_err(|e: ConfigError| e.to_string())?;
    route_session::clear_active_route_session(&state.app_data_dir).ok();
    state.logs.info("Config removed.");
    Ok(())
}

#[tauri::command]
fn redact_config(state: tauri::State<'_, AppState>) -> Result<String, String> {
    app_state(state.clone())?;
    config::redact_config(&state.app_data_dir).map_err(|e: ConfigError| e.to_string())
}

#[tauri::command]
fn get_server_display_name(state: tauri::State<'_, AppState>) -> Option<String> {
    config::get_server_display_name(&state.app_data_dir)
}

#[tauri::command]
fn get_config_identity(state: tauri::State<'_, AppState>) -> Option<ConfigIdentity> {
    config::get_config_identity(&state.app_data_dir)
}

#[tauri::command]
fn is_elevated() -> bool {
    elevation::is_elevated()
}

#[tauri::command]
fn restart_as_admin(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.logs.info("Requesting administrator restart.");
    elevation::restart_as_admin().map_err(|e: ElevationError| e.to_string())
}

#[tauri::command]
fn is_wireguard_installed(state: tauri::State<'_, AppState>) -> bool {
    tunnel::is_route_lag_engine_available(&state.engine)
}

#[tauri::command]
fn is_route_lag_engine_available(state: tauri::State<'_, AppState>) -> bool {
    tunnel::is_route_lag_engine_available(&state.engine)
}

#[tauri::command]
fn route_lag_engine_status_cmd(state: tauri::State<'_, AppState>) -> RouteLagEngineStatus {
    state.engine.status()
}

#[tauri::command]
fn generate_route_keys_cmd(state: tauri::State<'_, AppState>) -> Result<RouteKeys, String> {
    route_session::generate_route_keys(&state.engine).map_err(|e: RouteSessionError| e.to_string())
}

#[tauri::command]
fn save_route_session_profile_cmd(
    state: tauri::State<'_, AppState>,
    profile: GeneratedRouteProfile,
) -> Result<(), String> {
    app_state(state.clone())?;
    route_session::save_route_profile(&state.app_data_dir, &profile)
        .map_err(|e: RouteSessionError| e.to_string())?;
    state.logs.info(&format!(
        "Prepared RouteLag route session {} for {}.",
        profile.session_id, profile.server_name
    ));
    Ok(())
}

#[tauri::command]
fn load_active_route_session_cmd(state: tauri::State<'_, AppState>) -> Option<ActiveRouteSession> {
    route_session::load_active_route_session(&state.app_data_dir)
}

#[tauri::command]
fn clear_active_route_session_cmd(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    route_session::clear_active_route_session(&state.app_data_dir)
        .map_err(|e: RouteSessionError| e.to_string())
}

#[tauri::command]
fn connect_tunnel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;

    state.logs.info("Connecting tunnel...");
    match tunnel::connect_tunnel(&state.app_data_dir, &state.engine, &state.logs) {
        Ok(()) => {
            reset_stability(&state.stability);
            state.logs.info("Tunnel connect command completed.");
            Ok(())
        }
        Err(e) => {
            state.logs.error(&format!("Connect failed: {e}"));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn disconnect_tunnel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;

    state.logs.info("Disconnecting tunnel...");
    // Full local cleanup is idempotent and verifies Windows state.
    let result = cleanup::safe_shutdown_routing(&state.app_data_dir, &state.engine, &state.logs);
    reset_stability(&state.stability);
    if result.ok {
        state.logs.info("Tunnel disconnected.");
        Ok(())
    } else {
        state.logs.error(&format!(
            "Disconnect completed with gaps: {}",
            result.summary
        ));
        Err(result.summary)
    }
}

#[tauri::command]
fn reconnect_tunnel_cmd(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;
    state.logs.info("Reconnecting tunnel...");
    match reconnect_tunnel(&state.app_data_dir, &state.engine, &state.logs) {
        Ok(()) => {
            reset_stability(&state.stability);
            state.logs.info("Tunnel reconnected.");
            Ok(())
        }
        Err(e) => {
            state.logs.error(&format!("Reconnect failed: {e}"));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn tunnel_status() -> TunnelStatus {
    tunnel::tunnel_status()
}

#[tauri::command]
fn get_public_ip(state: tauri::State<'_, AppState>) -> Result<String, String> {
    app_state(state.clone())?;
    network::get_public_ip().map_err(|e: NetworkError| {
        state.logs.error(&format!("Public IP lookup failed: {e}"));
        e.to_string()
    })
}

#[tauri::command]
fn has_ipv6_default_route_cmd(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    app_state(state)?;
    Ok(network::has_ipv6_default_route())
}

#[tauri::command]
fn ping_host(
    state: tauri::State<'_, AppState>,
    host: Option<String>,
) -> Result<PingResult, String> {
    app_state(state.clone())?;
    let target = host.unwrap_or_else(|| network::DEFAULT_PING_HOST.to_string());
    network::ping_host(&target).map_err(|e: NetworkError| {
        state.logs.warn(&format!("Ping to {target} failed: {e}"));
        e.to_string()
    })
}

#[tauri::command]
fn run_ping_test_cmd(host: String) -> Result<DetailedPingResult, String> {
    run_ping_test(&host).map_err(|e| e.to_string())
}

#[tauri::command]
fn run_traceroute_cmd(host: String) -> Result<TracerouteResult, String> {
    run_traceroute(&host).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_dns_status_cmd() -> DnsStatus {
    get_dns_status()
}

/// Probe a list of RouteLag node endpoints (ICMP with TCP fallback).
/// Only accepts RouteLag-owned node hosts from the API — never game IPs.
#[tauri::command]
fn probe_route_nodes_cmd(nodes: Vec<NodeProbeInput>) -> Vec<NodeProbeResult> {
    probe_route_nodes(nodes)
}

#[tauri::command]
fn get_wireguard_status_cmd(state: tauri::State<'_, AppState>) -> RouteLagEngineRuntimeStatus {
    get_route_lag_engine_runtime_status(&state.engine)
}

#[tauri::command]
fn get_route_lag_engine_runtime_status_cmd(
    state: tauri::State<'_, AppState>,
) -> RouteLagEngineRuntimeStatus {
    get_route_lag_engine_runtime_status(&state.engine)
}

#[tauri::command]
fn get_network_adapter_info_cmd() -> NetworkAdapterInfo {
    get_network_adapter_info()
}

#[tauri::command]
fn get_os_info_cmd(state: tauri::State<'_, AppState>) -> OsInfo {
    get_os_info(&app_version(), &state.engine)
}

#[tauri::command]
fn list_fortnite_replays_cmd() -> Vec<FortniteReplay> {
    list_fortnite_replays()
}

#[tauri::command]
fn get_default_replay_folder_cmd() -> Option<String> {
    replay_import::default_replay_folder().map(|path| path.display().to_string())
}

#[tauri::command]
fn load_replay_file(path: String) -> Result<LocalReplayFile, String> {
    replay_import::replay_file(std::path::PathBuf::from(path))
}

#[tauri::command]
fn select_replay_folder(app: tauri::AppHandle) -> Result<String, String> {
    let mut dialog = app.dialog().file();
    if let Some(default_dir) = replay_import::default_replay_folder() {
        if default_dir.is_dir() {
            dialog = dialog.set_directory(default_dir);
        } else if let Some(parent) = default_dir.parent() {
            if parent.is_dir() {
                dialog = dialog.set_directory(parent);
            }
        }
    }

    let picked = dialog.blocking_pick_folder();
    match picked {
        Some(folder) => folder
            .into_path()
            .map(|path| path.display().to_string())
            .map_err(|e| e.to_string()),
        None => Err("Folder selection cancelled.".to_string()),
    }
}

#[tauri::command]
fn import_replay_file(app: tauri::AppHandle) -> Result<LocalReplayFile, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Fortnite Replay", &["replay"])
        .blocking_pick_file();
    let path = match picked {
        Some(file) => file.into_path().map_err(|e| e.to_string())?,
        None => return Err("Replay import cancelled.".to_string()),
    };
    replay_import::replay_file(path)
}

#[tauri::command]
fn scan_replay_folder(path: Option<String>) -> Result<Vec<LocalReplayFile>, String> {
    replay_import::scan_replay_folder(path)
}

#[tauri::command]
fn hash_replay_file(path: String) -> Result<String, String> {
    replay_import::hash_replay_file(&path)
}

#[tauri::command]
fn upload_replay_file(path: String, api_base_url: String, token: String) -> Result<String, String> {
    replay_import::upload_replay_file(&path, &api_base_url, &token)
}

#[tauri::command]
fn rename_parsed_replay(path: String, new_name: String) -> Result<String, String> {
    replay_import::rename_parsed_replay(&path, &new_name)
}

#[tauri::command]
fn run_mtu_test_cmd() -> MtuTestResult {
    run_mtu_test()
}

#[tauri::command]
fn get_tunnel_health_cmd(
    state: tauri::State<'_, AppState>,
    baseline_public_ip: Option<String>,
) -> TunnelHealth {
    get_tunnel_health(
        &state.stability,
        &state.engine,
        baseline_public_ip.as_deref(),
    )
}

#[tauri::command]
fn get_tester_profile(state: tauri::State<'_, AppState>) -> TesterProfile {
    tester_profile::load_profile(&state.app_data_dir)
}

#[tauri::command]
fn save_tester_profile(
    state: tauri::State<'_, AppState>,
    profile: TesterProfile,
) -> Result<(), String> {
    app_state(state.clone())?;
    tester_profile::save_profile(&state.app_data_dir, &profile)
        .map_err(|e: ProfileError| e.to_string())
}

#[tauri::command]
fn save_beta_report_snapshot_cmd(
    state: tauri::State<'_, AppState>,
    report: BetaReportSnapshot,
) -> Result<(), String> {
    app_state(state.clone())?;
    beta_report::save_snapshot(&state.app_data_dir, &report)
        .map_err(|e: BetaReportError| e.to_string())
}

#[tauri::command]
fn load_beta_report_snapshot_cmd(state: tauri::State<'_, AppState>) -> Option<BetaReportSnapshot> {
    beta_report::load_snapshot(&state.app_data_dir)
}

#[tauri::command]
fn get_allowed_ip_route_entries_cmd(allowed_ips: Vec<String>) -> Vec<AllowedIpRouteEntry> {
    beta_report::get_allowed_ip_route_entries(&allowed_ips)
}

#[tauri::command]
fn emergency_cleanup_cmd(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;
    match cleanup::emergency_cleanup(&state.engine, &state.logs) {
        Ok(()) => {
            reset_stability(&state.stability);
            Ok(())
        }
        Err(e) => {
            state.logs.error(&format!("Emergency cleanup failed: {e}"));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn restore_internet_cmd(
    state: tauri::State<'_, AppState>,
) -> Result<RestoreInternetResult, String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;
    let result = cleanup::restore_internet(&state.app_data_dir, &state.engine, &state.logs);
    reset_stability(&state.stability);
    Ok(result)
}

#[tauri::command]
fn force_clear_local_route_state_cmd(
    state: tauri::State<'_, AppState>,
) -> Result<RecoveryStatus, String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;
    let status = cleanup::force_clear_local_route_state(&state.app_data_dir, &state.logs);
    reset_stability(&state.stability);
    Ok(status)
}

#[tauri::command]
fn repair_windows_network_cmd(
    state: tauri::State<'_, AppState>,
) -> Result<RestoreInternetResult, String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;
    Ok(cleanup::repair_windows_network(&state.logs))
}

#[tauri::command]
fn get_recovery_status_cmd(state: tauri::State<'_, AppState>) -> RecoveryStatus {
    cleanup::get_recovery_status(&state.app_data_dir)
}

#[tauri::command]
fn log_client_event_cmd(state: tauri::State<'_, AppState>, event: String) -> Result<(), String> {
    app_state(state.clone())?;
    let sanitized = sanitize_client_event(&event);
    state.logs.info(&format!("Client event: {sanitized}"));
    Ok(())
}

#[tauri::command]
fn get_hud_bridge_status_cmd(state: tauri::State<'_, AppState>) -> HudBridgeStatus {
    state.hud_bridge.status()
}

#[tauri::command]
fn get_hud_telemetry_snapshot_cmd(state: tauri::State<'_, AppState>) -> HudTelemetrySnapshot {
    state.hud_bridge.snapshot()
}

#[tauri::command]
fn use_hud_demo_data_cmd(state: tauri::State<'_, AppState>) {
    state.hud_bridge.apply_demo_data();
}

#[tauri::command]
fn request_hud_overlay_show_cmd(state: tauri::State<'_, AppState>) {
    state.hud_bridge.request_overlay_show();
}

#[tauri::command]
fn request_hud_overlay_hide_cmd(state: tauri::State<'_, AppState>) {
    state.hud_bridge.request_overlay_hide();
}

fn refocus_main_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
}

#[tauri::command]
fn open_hud_overlay_window_cmd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let window = hud_overlay::ensure_hud_window(&app)?;

    if let Ok(Some(monitor)) = window.current_monitor() {
        let size = monitor.size();
        let position = monitor.position();
        window
            .set_size(tauri::Size::Physical(*size))
            .map_err(|e| e.to_string())?;
        window
            .set_position(tauri::Position::Physical(*position))
            .map_err(|e| e.to_string())?;
    }

    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_always_on_top(true);

    let layout = hud_layout::read_hud_layout(&state.app_data_dir);
    let _ = app.emit("hud-layout-changed", layout);

    state.hud_bridge.request_overlay_show();
    hud_overlay::on_hud_overlay_open(&app)?;

    refocus_main_window(&app);
    Ok(())
}

#[tauri::command]
fn close_hud_overlay_window_cmd(app: tauri::AppHandle) -> Result<(), String> {
    hide_hud_overlay(&app)
}

fn hide_hud_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<AppState>() {
        state.hud_bridge.request_overlay_hide();
    }
    if let Some(window) = app.get_webview_window("hud-overlay") {
        hud_overlay::on_hud_overlay_close(app);
        window.hide().map_err(|e| e.to_string())?;
        let _ = app.emit("hud-overlay-closed", ());
    }
    Ok(())
}

fn shutdown_background_services(app: &tauri::AppHandle) {
    // Stops the localhost HUD bridge + desktop preview only.
    // Does not terminate RouteLagHUD.exe / Zer0HUD.exe (separate free Overwolf app).
    if let Some(state) = app.try_state::<AppState>() {
        state.hud_bridge.stop();
    }
    let _ = hide_hud_overlay(app);
}

/// Best-effort verified local routing disconnect on normal exit/close.
/// Does not claim to cover force-kill or power loss — startup recovery covers those.
fn shutdown_routing_safely(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(_guard) = state.connect_lock.lock() {
            let result =
                cleanup::safe_shutdown_routing(&state.app_data_dir, &state.engine, &state.logs);
            if result.ok {
                state.logs.info("Exit cleanup: local routing restored or already safe.");
            } else {
                state.logs.warn(&format!(
                    "Exit cleanup: incomplete local restore. {}",
                    result.summary
                ));
            }
            reset_stability(&state.stability);
        } else {
            state
                .logs
                .warn("Exit cleanup: connect lock poisoned; skipping routing shutdown.");
        }
    }
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    shutdown_routing_safely(&app);
    shutdown_background_services(&app);
    app.exit(0);
}

fn sanitize_client_event(event: &str) -> String {
    let private_key_re = regex::Regex::new(r"(?i)(private[_ -]?key[=:]\s*)\S+").unwrap();
    let token_re = regex::Regex::new(r"(?i)(token[=:]\s*)\S+").unwrap();
    let text = private_key_re.replace_all(event, "${1}[REDACTED]");
    token_re.replace_all(&text, "${1}[REDACTED]").to_string()
}

#[tauri::command]
fn load_diagnostics(state: tauri::State<'_, AppState>) -> Option<DiagnosticsReport> {
    load_report(&state.app_data_dir)
}

#[tauri::command]
fn run_full_diagnostics_cmd(
    state: tauri::State<'_, AppState>,
    disconnect_for_normal: bool,
    include_public_ip: bool,
    skip_tunnel_phase: bool,
    include_traceroute: bool,
) -> Result<DiagnosticsReport, String> {
    app_state(state.clone())?;
    state.logs.info("Starting full diagnostics...");
    let options = RunDiagnosticsOptions {
        disconnect_for_normal,
        include_public_ip,
        skip_tunnel_phase,
        include_traceroute,
    };
    match run_full_diagnostics(&state.app_data_dir, &state.engine, &app_version(), options) {
        Ok(report) => {
            state.logs.info(&format!(
                "Diagnostics complete. Score: {}",
                report.route_score
            ));
            Ok(report)
        }
        Err(e) => {
            state.logs.warn(&format!("Diagnostics: {e}"));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn copy_report_text_cmd(state: tauri::State<'_, AppState>) -> Result<String, String> {
    app_state(state.clone())?;
    copy_report_text(&state.app_data_dir).map_err(|e: DiagnosticsError| e.to_string())
}

#[tauri::command]
fn export_report_zip_cmd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    app_state(state.clone())?;
    let dest = app
        .dialog()
        .file()
        .set_file_name("routelag-beta-report.zip")
        .add_filter("ZIP archive", &["zip"])
        .blocking_save_file();

    let dest = match dest {
        Some(f) => f.into_path().map_err(|e| e.to_string())?,
        None => return Err("Export cancelled.".to_string()),
    };

    let path = crate::export::export_report_zip(&state.app_data_dir, &dest)
        .map_err(|e: ExportError| e.to_string())?;
    state
        .logs
        .info(&format!("Exported report ZIP to {}", path.display()));
    Ok(path.display().to_string())
}

#[tauri::command]
fn run_route_test(
    state: tauri::State<'_, AppState>,
    mode: String,
) -> Result<RouteTestResult, String> {
    app_state(state.clone())?;
    let result = network::run_route_test(&state.app_data_dir, &mode)
        .map_err(|e: NetworkError| e.to_string())?;
    state.logs.info(&format!(
        "Route test ({}) completed: avg={:?}ms loss={}%",
        result.mode, result.avg_ping_ms, result.packet_loss_pct
    ));
    Ok(result)
}

#[tauri::command]
fn load_route_test(state: tauri::State<'_, AppState>) -> Option<RouteTestResult> {
    network::load_route_test(&state.app_data_dir)
}

#[tauri::command]
fn read_logs(state: tauri::State<'_, AppState>) -> Result<String, String> {
    app_state(state.clone())?;
    let status = tunnel::route_lag_service_status_snippet(&state.engine);
    let header = format!("Zer0 v{}\n", app_version());
    state
        .logs
        .read_logs_with_header(Some(&header), Some(&status))
        .map_err(|e: LogError| e.to_string())
}

#[tauri::command]
fn clear_logs(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    state.logs.clear().map_err(|e: LogError| e.to_string())
}

#[tauri::command]
fn reset_app(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;

    let status = tunnel::tunnel_status();
    if (status.is_connected() || status.is_connecting()) && elevation::is_elevated() {
        let _ = cleanup::safe_shutdown_routing(&state.app_data_dir, &state.engine, &state.logs);
    }

    config::remove_config(&state.app_data_dir).ok();
    route_session::clear_active_route_session(&state.app_data_dir).ok();
    let _ = cleanup::clear_routing_marker(&state.app_data_dir);
    network::remove_route_test(&state.app_data_dir);
    diagnostics::remove_diagnostics(&state.app_data_dir);
    state.logs.clear().ok();
    state.logs.info("App reset completed.");
    Ok(())
}

#[tauri::command]
fn open_logs_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    app_state(state.clone())?;
    app.opener()
        .open_path(
            state.app_data_dir.to_string_lossy().to_string(),
            None::<&str>,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let allowed = external_url::validate_external_url(&url)?;
    app.opener()
        .open_url(allowed, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let version = app_version();
    startup::write_startup_log(&format!(
        "boot begin\n{}",
        startup::startup_context_block(&version)
    ));

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| build_and_run_app()));

    match result {
        Ok(Ok(())) => {
            startup::write_startup_log("boot exit clean");
        }
        Ok(Err(error)) => {
            write_startup_crash_log(&format!(
                "tauri run error\n{}\nerror={error}\n",
                startup::startup_context_block(&version)
            ));
        }
        Err(panic_payload) => {
            // Panic hook already wrote the crash log + dialog; record that run() caught it.
            let panic_message = panic_payload_message(&panic_payload);
            startup::write_startup_log(&format!(
                "startup panic caught in run(): {panic_message}"
            ));
        }
    }
}

fn build_and_run_app() -> Result<(), Box<dyn std::error::Error>> {
    startup::write_startup_log("building tauri app");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    let toggle_edit = Shortcut::new(
                        Some(Modifiers::CONTROL | Modifiers::SHIFT),
                        Code::KeyH,
                    );
                    if shortcut == &toggle_edit {
                        let _ = hud_overlay::toggle_hud_edit_mode(app);
                        return;
                    }

                    let close_overlay = Shortcut::new(
                        Some(Modifiers::CONTROL | Modifiers::SHIFT),
                        Code::Backquote,
                    );
                    if shortcut == &close_overlay && hud_overlay::is_hud_visible(app) {
                        let app = app.clone();
                        let _ = app.clone().run_on_main_thread(move || {
                            let _ = hide_hud_overlay(&app);
                        });
                    }
                })
                .build(),
        )
        .setup(|app| {
            startup::write_startup_log("setup begin");

            let preferred = app.path().app_data_dir().ok();
            let app_data_dir = startup::resolve_app_data_dir(preferred);
            startup::write_startup_log(&format!(
                "app_data_dir={}",
                app_data_dir.display()
            ));

            let logs = LogManager::new(&app_data_dir);
            let resource_dir = app.path().resource_dir().ok();
            let engine = RouteLagEngine::new(resource_dir.clone());
            let hud_bridge = HudBridgeState::new(&app_data_dir);

            #[cfg(not(feature = "disable-hud"))]
            {
                // Optional local bridge — never block app open if the port is busy.
                match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    hud_bridge.start();
                })) {
                    Ok(()) => startup::write_startup_log("hud bridge start requested"),
                    Err(_) => {
                        startup::write_startup_log("hud bridge start panicked; continuing without it");
                        logs.warn("HUD bridge failed to start; continuing without live HUD ingest.");
                    }
                }
            }
            #[cfg(feature = "disable-hud")]
            {
                startup::write_startup_log("hud bridge disabled at build time");
            }

            let version = app_version();
            logs.info(&format!("Zer0 v{version} started."));
            logs.info(&format!(
                "Startup health: current_dir={}, exe={}, resources_dir={}, app_data_dir={}, api_url={}, frontend_url={}",
                std::env::current_dir()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|e| format!("unavailable ({e})")),
                std::env::current_exe()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|e| format!("unavailable ({e})")),
                resource_dir
                    .as_ref()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|| "unavailable".to_string()),
                app_data_dir.display(),
                option_env!("VITE_API_URL").unwrap_or("default"),
                option_env!("TAURI_DEV_HOST").unwrap_or("http://127.0.0.1:1420")
            ));

            let bridge_status = hud_bridge.status();
            logs.info(&format!(
                "Startup health: engine_detected={}, hud_bridge_started={}, hud_bridge_error={:?}",
                engine.is_available(),
                bridge_status.server_started,
                bridge_status.server_error
            ));
            startup::write_startup_log(&format!(
                "engine_detected={} hud_bridge_started={} hud_bridge_error={:?}",
                engine.is_available(),
                bridge_status.server_started,
                bridge_status.server_error
            ));

            if !engine.is_available() {
                let search_roots = engine
                    .search_roots()
                    .iter()
                    .map(|path| path.display().to_string())
                    .collect::<Vec<_>>()
                    .join("; ");
                logs.warn(crate::route_lag_engine::BUNDLED_ENGINE_MISSING_WARNING);
                logs.warn(&format!("RouteLag Engine search paths: {search_roots}"));
                logs.warn(crate::route_lag_engine::ENGINE_MISSING_MESSAGE);
            }

            app.manage(hud_overlay::HudOverlayState::new());
            // HUD overlay window is created lazily on first open — do not spawn a
            // second transparent WebView2 at process start.
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_background_color(Some(Color(0, 0, 0, 0)));
            }

            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
            let toggle_edit =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH);
            let close_overlay =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Backquote);
            if let Err(e) = app.global_shortcut().register(toggle_edit) {
                let message = format!("HUD edit shortcut unavailable; continuing without it: {e}");
                logs.warn(&message);
                startup::write_startup_log(&message);
            }
            if let Err(e) = app.global_shortcut().register(close_overlay) {
                let message = format!("HUD close shortcut unavailable; continuing without it: {e}");
                logs.warn(&message);
                startup::write_startup_log(&message);
            }

            app.manage(AppState {
                app_data_dir: app_data_dir.clone(),
                engine,
                hud_bridge,
                logs,
                connect_lock: Mutex::new(()),
                stability: Mutex::new(StabilityTracker::default()),
            });

            if let Some(state) = app.try_state::<AppState>() {
                let recovery = cleanup::startup_recover_stale_routing(
                    &state.app_data_dir,
                    &state.engine,
                    &state.logs,
                );
                startup::write_startup_log(&format!(
                    "startup_recovery stale={} elevated={} service_running={} marker={}",
                    recovery.stale_state_detected,
                    recovery.is_elevated,
                    recovery.route_service_running,
                    recovery.routing_marker_present
                ));
            }

            // Close can be cancelled by the frontend confirmation dialog.
            // Routing/HUD teardown runs in exit_app and ExitRequested only.

            startup::write_startup_log("setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            has_config,
            import_config,
            remove_config,
            redact_config,
            get_server_display_name,
            get_config_identity,
            is_elevated,
            restart_as_admin,
            is_wireguard_installed,
            is_route_lag_engine_available,
            route_lag_engine_status_cmd,
            generate_route_keys_cmd,
            save_route_session_profile_cmd,
            load_active_route_session_cmd,
            clear_active_route_session_cmd,
            connect_tunnel,
            disconnect_tunnel,
            reconnect_tunnel_cmd,
            tunnel_status,
            get_public_ip,
            has_ipv6_default_route_cmd,
            ping_host,
            run_ping_test_cmd,
            run_traceroute_cmd,
            get_dns_status_cmd,
            probe_route_nodes_cmd,
            get_wireguard_status_cmd,
            get_route_lag_engine_runtime_status_cmd,
            get_network_adapter_info_cmd,
            get_os_info_cmd,
            list_fortnite_replays_cmd,
            get_default_replay_folder_cmd,
            load_replay_file,
            select_replay_folder,
            import_replay_file,
            scan_replay_folder,
            hash_replay_file,
            upload_replay_file,
            rename_parsed_replay,
            run_mtu_test_cmd,
            get_tunnel_health_cmd,
            get_tester_profile,
            save_tester_profile,
            save_beta_report_snapshot_cmd,
            load_beta_report_snapshot_cmd,
            get_allowed_ip_route_entries_cmd,
            emergency_cleanup_cmd,
            restore_internet_cmd,
            force_clear_local_route_state_cmd,
            repair_windows_network_cmd,
            get_recovery_status_cmd,
            log_client_event_cmd,
            get_hud_bridge_status_cmd,
            get_hud_telemetry_snapshot_cmd,
            use_hud_demo_data_cmd,
            request_hud_overlay_show_cmd,
            request_hud_overlay_hide_cmd,
            hud_layout::save_hud_layout_cmd,
            hud_layout::load_hud_layout_cmd,
            open_hud_overlay_window_cmd,
            close_hud_overlay_window_cmd,
            hud_overlay::set_hud_overlay_edit_mode_cmd,
            hud_overlay::toggle_hud_overlay_edit_mode_cmd,
            load_diagnostics,
            run_full_diagnostics_cmd,
            copy_report_text_cmd,
            export_report_zip_cmd,
            run_route_test,
            load_route_test,
            read_logs,
            clear_logs,
            reset_app,
            open_logs_folder,
            open_external_url,
            install_info::get_install_info_cmd,
            install_info::launch_hud_installer_cmd,
            exit_app,
        ])
        .build(tauri::generate_context!())?
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                shutdown_routing_safely(&app_handle);
                shutdown_background_services(&app_handle);
            }
        });

    Ok(())
}

fn panic_payload_message(payload: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(text) = payload.downcast_ref::<&str>() {
        (*text).to_string()
    } else if let Some(text) = payload.downcast_ref::<String>() {
        text.clone()
    } else {
        "unknown panic payload".to_string()
    }
}
