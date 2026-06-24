mod cleanup;
mod config;
mod diagnostics;
mod elevation;
mod export;
mod health;
mod logs;
mod network;
mod network_diag;
mod route_session;
mod sysinfo;
mod tester_profile;
mod tunnel;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::cleanup::CleanupError;
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
    get_dns_status, run_mtu_test, run_ping_test, run_traceroute, DetailedPingResult, DnsStatus,
    MtuTestResult, TracerouteResult,
};
use crate::route_session::{
    ActiveRouteSession, GeneratedRouteProfile, RouteKeys, RouteSessionError,
};
use crate::sysinfo::{get_network_adapter_info, get_os_info, NetworkAdapterInfo, OsInfo};
use crate::tester_profile::{ProfileError, TesterProfile};
use crate::tunnel::{get_wireguard_status, reconnect_tunnel, TunnelError, TunnelStatus, WireGuardStatus};

pub struct AppState {
    pub app_data_dir: PathBuf,
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
            .add_filter("WireGuard Config", &["conf"])
            .blocking_pick_file();
        match picked {
            Some(file) => file.into_path().map_err(|e| e.to_string())?,
            None => return Err("Import cancelled.".to_string()),
        }
    };

    config::import_config(&state.app_data_dir, &source).map_err(|e: ConfigError| e.to_string())?;
    state.logs.info(&format!("Imported config from {}", source.display()));
    Ok(())
}

#[tauri::command]
fn remove_config(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let status = tunnel::tunnel_status();
    if status.is_connected() || status.is_connecting() {
        tunnel::disconnect_tunnel().map_err(|e: TunnelError| e.to_string())?;
        state.logs.info("Tunnel disconnected before config removal.");
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
fn is_wireguard_installed() -> bool {
    tunnel::is_wireguard_installed()
}

#[tauri::command]
fn generate_route_keys_cmd() -> Result<RouteKeys, String> {
    route_session::generate_route_keys().map_err(|e: RouteSessionError| e.to_string())
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
fn load_active_route_session_cmd(
    state: tauri::State<'_, AppState>,
) -> Option<ActiveRouteSession> {
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
    match tunnel::connect_tunnel(&state.app_data_dir) {
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
    match tunnel::disconnect_tunnel() {
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
    match reconnect_tunnel(&state.app_data_dir) {
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

#[tauri::command]
fn get_wireguard_status_cmd() -> WireGuardStatus {
    get_wireguard_status()
}

#[tauri::command]
fn get_network_adapter_info_cmd() -> NetworkAdapterInfo {
    get_network_adapter_info()
}

#[tauri::command]
fn get_os_info_cmd() -> OsInfo {
    get_os_info(&app_version())
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
fn emergency_cleanup_cmd(state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    let _guard = state.connect_lock.lock().map_err(|e| e.to_string())?;
    match cleanup::emergency_cleanup(&state.logs) {
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
fn load_diagnostics(state: tauri::State<'_, AppState>) -> Option<DiagnosticsReport> {
    load_report(&state.app_data_dir)
}

#[tauri::command]
fn run_full_diagnostics_cmd(
    state: tauri::State<'_, AppState>,
    disconnect_for_normal: bool,
    include_public_ip: bool,
    skip_tunnel_phase: bool,
) -> Result<DiagnosticsReport, String> {
    app_state(state.clone())?;
    state.logs.info("Starting full diagnostics...");
    let options = RunDiagnosticsOptions {
        disconnect_for_normal,
        include_public_ip,
        skip_tunnel_phase,
    };
    match run_full_diagnostics(&state.app_data_dir, &app_version(), options) {
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
    state.logs.info(&format!("Exported report ZIP to {}", path.display()));
    Ok(path.display().to_string())
}

#[tauri::command]
fn run_route_test(state: tauri::State<'_, AppState>, mode: String) -> Result<RouteTestResult, String> {
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
    let status = tunnel::wireguard_service_status_snippet();
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
        let _ = tunnel::disconnect_tunnel();
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
fn open_logs_folder(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    app_state(state.clone())?;
    app.opener()
        .open_path(state.app_data_dir.to_string_lossy().to_string(), None::<&str>)
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
            let version = app_version();
            logs.info(&format!("RouteLag Beta v{version} started."));

            app.manage(AppState {
                app_data_dir,
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
            get_wireguard_status_cmd,
            get_network_adapter_info_cmd,
            get_os_info_cmd,
            run_mtu_test_cmd,
            get_tunnel_health_cmd,
            get_tester_profile,
            save_tester_profile,
            emergency_cleanup_cmd,
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
