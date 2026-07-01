mod beta_report;
mod cleanup;
mod config;
mod diagnostics;
mod elevation;
mod export;
mod health;
mod logs;
mod network;
mod network_diag;
mod route_lag_engine;
mod route_session;
mod sysinfo;
mod tester_profile;
mod tunnel;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;
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
use crate::logs::{LogError, LogManager};
use crate::network::{NetworkError, PingResult, RouteTestResult};
use crate::network_diag::{
    get_dns_status, probe_route_nodes, run_mtu_test, run_ping_test, run_traceroute,
    DetailedPingResult, DnsStatus, MtuTestResult, NodeProbeInput, NodeProbeResult, TracerouteResult,
};
use crate::route_lag_engine::{RouteLagEngine, RouteLagEngineStatus};
use crate::route_session::{
    ActiveRouteSession, GeneratedRouteProfile, RouteKeys, RouteSessionError,
};
use crate::sysinfo::{get_network_adapter_info, get_os_info, NetworkAdapterInfo, OsInfo};
use crate::tester_profile::{ProfileError, TesterProfile};
use crate::tunnel::{
    get_route_lag_engine_runtime_status, reconnect_tunnel, RouteLagEngineRuntimeStatus,
    TunnelError, TunnelStatus,
};

pub struct AppState {
    pub app_data_dir: PathBuf,
    pub engine: RouteLagEngine,
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
    match tunnel::connect_tunnel(&state.app_data_dir, &state.engine) {
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
    match tunnel::disconnect_tunnel(&state.engine) {
        Ok(()) => {
            reset_stability(&state.stability);
            state.logs.info("Tunnel disconnected.");
            Ok(())
        }
        Err(e) => {
            state.logs.error(&format!("Disconnect failed: {e}"));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn reconnect_tunnel_cmd(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;
    state.logs.info("Reconnecting tunnel...");
    match reconnect_tunnel(&state.app_data_dir, &state.engine) {
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
    let header = format!("RouteLag Beta v{}\n", app_version());
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
        let _ = tunnel::disconnect_tunnel(&state.engine);
    }

    config::remove_config(&state.app_data_dir).ok();
    route_session::clear_active_route_session(&state.app_data_dir).ok();
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            std::fs::create_dir_all(&app_data_dir)?;

            let logs = LogManager::new(&app_data_dir);
            let engine = RouteLagEngine::new(app.path().resource_dir().ok());
            let version = app_version();
            logs.info(&format!("RouteLag Beta v{version} started."));
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

            app.manage(AppState {
                app_data_dir,
                engine,
                logs,
                connect_lock: Mutex::new(()),
                stability: Mutex::new(StabilityTracker::default()),
            });
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
            ping_host,
            run_ping_test_cmd,
            run_traceroute_cmd,
            get_dns_status_cmd,
            probe_route_nodes_cmd,
            get_wireguard_status_cmd,
            get_route_lag_engine_runtime_status_cmd,
            get_network_adapter_info_cmd,
            get_os_info_cmd,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
