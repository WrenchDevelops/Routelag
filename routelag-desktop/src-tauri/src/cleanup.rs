use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config;
use crate::elevation;
use crate::logs::LogManager;
use crate::network;
use crate::route_lag_engine::RouteLagEngine;
use crate::route_session;
use crate::windows_process::hidden_command;

/// Tunnel profile names positively identified as Zer0 or legacy RouteLag.
/// Cleanup must never touch services outside this set.
const OWNED_TUNNEL_PROFILES: &[&str] = &[
    "routelag-engine",
    "routelag-beta",
    "RouteLag",
    "routelag",
    "zer0-engine",
    "Zer0",
    "zer0",
];

const LAST_CLEANUP_FILENAME: &str = "last-cleanup-result.json";
const ROUTING_MARKER_FILENAME: &str = "routing-active.marker";
const DNS_BACKUP_FILENAME: &str = "dns-backup.json";

#[derive(Debug, Error)]
pub enum CleanupError {
    #[error("Zer0 needs administrator permission for emergency cleanup.")]
    NotElevated,
    #[cfg_attr(windows, allow(dead_code))]
    #[error("Emergency cleanup is only available on Windows.")]
    UnsupportedPlatform,
    #[error("Emergency cleanup failed: {0}")]
    OperationFailed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreStepResult {
    pub step: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreInternetResult {
    pub ok: bool,
    pub reboot_required: bool,
    pub steps: Vec<RestoreStepResult>,
    /// Human-readable summary of what was and was not restored.
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub restored: Vec<String>,
    #[serde(default)]
    pub not_restored: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelServiceStatus {
    pub profile_name: String,
    pub service_name: String,
    pub installed: bool,
    pub running: bool,
    pub raw_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryStatus {
    pub is_elevated: bool,
    pub active_route_session: bool,
    pub route_profile_exists: bool,
    pub stale_services: Vec<TunnelServiceStatus>,
    pub stale_state_detected: bool,
    pub stored_session_id: Option<String>,
    pub route_service_installed: bool,
    pub route_service_running: bool,
    pub last_cleanup_result: Option<RestoreInternetResult>,
    /// True when a last-known-active marker remains from a previous session.
    #[serde(default)]
    pub routing_marker_present: bool,
    #[serde(default)]
    pub dns_backup_present: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingActiveMarker {
    pub session_id: Option<String>,
    pub profile_name: String,
    pub marked_at: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DnsBackup {
    captured_at: String,
    note: String,
    adapters: Vec<DnsAdapterSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DnsAdapterSnapshot {
    name: String,
    dns_servers: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CleanupCommandStatus {
    Success,
    AlreadySafe(&'static str),
    Failed,
}

impl CleanupCommandStatus {
    fn ok(self) -> bool {
        matches!(
            self,
            CleanupCommandStatus::Success | CleanupCommandStatus::AlreadySafe(_)
        )
    }
}

pub fn is_owned_tunnel_profile(profile_name: &str) -> bool {
    OWNED_TUNNEL_PROFILES
        .iter()
        .any(|owned| owned.eq_ignore_ascii_case(profile_name))
}

fn service_name(profile_name: &str) -> String {
    format!("WireGuardTunnel${profile_name}")
}

fn step(step: &str, ok: bool, message: impl Into<String>) -> RestoreStepResult {
    RestoreStepResult {
        step: step.to_string(),
        ok,
        message: message.into(),
    }
}

/// True only for leftover/broken route state — not for a healthy active session.
fn detect_stale_route_state(
    stored_session_id: Option<&str>,
    route_profile_exists: bool,
    route_service_installed: bool,
    route_service_running: bool,
    routing_marker_present: bool,
) -> bool {
    if routing_marker_present && !route_service_running {
        return true;
    }
    match stored_session_id {
        Some(_) if route_service_running => false,
        Some(_) => route_profile_exists || route_service_installed || routing_marker_present,
        None => {
            route_service_installed
                || route_service_running
                || route_profile_exists
                || routing_marker_present
        }
    }
}

pub fn get_recovery_status(app_data_dir: &Path) -> RecoveryStatus {
    let active = route_session::load_active_route_session(app_data_dir);
    let stored_session_id = active.as_ref().map(|session| session.session_id.clone());
    let stale_services = query_owned_tunnel_services();
    let route_service_installed = stale_services.iter().any(|service| service.installed);
    let route_service_running = stale_services.iter().any(|service| service.running);
    let route_profile_exists = config::has_config(app_data_dir);
    let routing_marker_present = routing_marker_path(app_data_dir).is_file();
    let dns_backup_present = dns_backup_path(app_data_dir).is_file();
    let stale_state_detected = detect_stale_route_state(
        stored_session_id.as_deref(),
        route_profile_exists,
        route_service_installed,
        route_service_running,
        routing_marker_present,
    );
    RecoveryStatus {
        is_elevated: elevation::is_elevated(),
        active_route_session: stored_session_id.is_some(),
        route_profile_exists,
        stale_state_detected,
        stored_session_id,
        route_service_installed,
        route_service_running,
        stale_services,
        last_cleanup_result: load_last_cleanup_result(app_data_dir),
        routing_marker_present,
        dns_backup_present,
    }
}

#[cfg(windows)]
fn query_owned_tunnel_services() -> Vec<TunnelServiceStatus> {
    OWNED_TUNNEL_PROFILES
        .iter()
        .filter_map(|profile| {
            let service = service_name(profile);
            let output = hidden_command("sc").args(["query", &service]).output().ok()?;
            let raw = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            if !output.status.success() && classify_cleanup_command(false, &raw).ok() {
                return None;
            }
            let lower = raw.to_lowercase();
            Some(TunnelServiceStatus {
                profile_name: (*profile).to_string(),
                service_name: service,
                installed: true,
                running: lower.contains("running"),
                raw_status: raw,
            })
        })
        .collect()
}

#[cfg(not(windows))]
fn query_owned_tunnel_services() -> Vec<TunnelServiceStatus> {
    Vec::new()
}

#[cfg(windows)]
fn stop_tunnel_service(profile_name: &str, logs: &LogManager) -> RestoreStepResult {
    if !is_owned_tunnel_profile(profile_name) {
        logs.warn(&format!(
            "Restore Internet: refusing to stop unrelated profile {profile_name}."
        ));
        return step(
            &format!("stop_service:{profile_name}"),
            false,
            format!("Refused: {profile_name} is not a Zer0/RouteLag tunnel."),
        );
    }

    let service = service_name(profile_name);
    logs.info(&format!("Restore Internet: stopping {service}..."));
    match hidden_command("sc").args(["stop", &service]).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{stdout}{stderr}");
            let status = classify_cleanup_command(output.status.success(), &combined);
            if status.ok() {
                match status {
                    CleanupCommandStatus::AlreadySafe("already_stopped") => {
                        logs.info(&format!("Restore Internet: {service} was already stopped."));
                    }
                    CleanupCommandStatus::AlreadySafe("not_installed") => {
                        logs.info(&format!("Restore Internet: {service} is not installed."));
                    }
                    _ => {
                        logs.info(&format!(
                            "Restore Internet: stopped {service} or it was absent."
                        ));
                    }
                }
                step(
                    &format!("stop_service:{profile_name}"),
                    true,
                    format!("{service} stopped or not running."),
                )
            } else {
                logs.warn(&format!(
                    "Restore Internet: failed to stop {service}: {combined}"
                ));
                step(
                    &format!("stop_service:{profile_name}"),
                    false,
                    clean_command_message(&combined),
                )
            }
        }
        Err(error) => step(
            &format!("stop_service:{profile_name}"),
            false,
            error.to_string(),
        ),
    }
}

#[cfg(not(windows))]
fn stop_tunnel_service(profile_name: &str, _logs: &LogManager) -> RestoreStepResult {
    step(
        &format!("stop_service:{profile_name}"),
        false,
        "Restore Internet is only available on Windows.",
    )
}

#[cfg(windows)]
fn uninstall_tunnel_service(
    profile_name: &str,
    engine: &RouteLagEngine,
    logs: &LogManager,
) -> RestoreStepResult {
    if !is_owned_tunnel_profile(profile_name) {
        logs.warn(&format!(
            "Restore Internet: refusing to uninstall unrelated profile {profile_name}."
        ));
        return step(
            &format!("uninstall_tunnel:{profile_name}"),
            false,
            format!("Refused: {profile_name} is not a Zer0/RouteLag tunnel."),
        );
    }

    logs.info(&format!(
        "Restore Internet: uninstalling Zer0/RouteLag route profile {profile_name}..."
    ));

    if engine.is_available() {
        match engine.uninstall_route_profile(profile_name) {
            Ok(()) => {
                logs.info(&format!(
                    "Restore Internet: removed {profile_name} or it was absent."
                ));
                return step(
                    &format!("uninstall_tunnel:{profile_name}"),
                    true,
                    format!("{profile_name} removed or not installed."),
                );
            }
            Err(error) => {
                logs.warn(&format!(
                    "Restore Internet: engine uninstall for {profile_name} reported {error}; trying service cleanup."
                ));
            }
        }
    }

    delete_tunnel_service(profile_name, logs)
}

#[cfg(not(windows))]
fn uninstall_tunnel_service(
    profile_name: &str,
    _engine: &RouteLagEngine,
    _logs: &LogManager,
) -> RestoreStepResult {
    step(
        &format!("uninstall_tunnel:{profile_name}"),
        false,
        "Restore Internet is only available on Windows.",
    )
}

#[cfg(windows)]
fn delete_tunnel_service(profile_name: &str, logs: &LogManager) -> RestoreStepResult {
    let service = service_name(profile_name);
    match hidden_command("sc").args(["delete", &service]).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{stdout}{stderr}");
            let status = classify_cleanup_command(output.status.success(), &combined);
            if status.ok() {
                logs.info(&format!(
                    "Restore Internet: deleted {service} or it was absent."
                ));
                step(
                    &format!("delete_service:{profile_name}"),
                    true,
                    format!("{service} deleted or not installed."),
                )
            } else {
                logs.warn(&format!(
                    "Restore Internet: failed to delete {service}: {combined}"
                ));
                step(
                    &format!("delete_service:{profile_name}"),
                    false,
                    clean_command_message(&combined),
                )
            }
        }
        Err(error) => step(
            &format!("delete_service:{profile_name}"),
            false,
            error.to_string(),
        ),
    }
}

#[cfg(windows)]
fn flush_dns(logs: &LogManager) -> RestoreStepResult {
    logs.info("Restore Internet: flushing DNS...");
    match hidden_command("ipconfig").args(["/flushdns"]).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{stdout}{stderr}");
            if output.status.success() {
                logs.info("Restore Internet: DNS flushed.");
                step("flush_dns", true, "DNS cache flushed.")
            } else {
                logs.warn(&format!("Restore Internet: DNS flush failed: {combined}"));
                step("flush_dns", false, clean_command_message(&combined))
            }
        }
        Err(error) => step("flush_dns", false, error.to_string()),
    }
}

#[cfg(not(windows))]
fn flush_dns(_logs: &LogManager) -> RestoreStepResult {
    step(
        "flush_dns",
        false,
        "Restore Internet is only available on Windows.",
    )
}

fn clear_dns_backup(app_data_dir: &Path, logs: &LogManager) -> RestoreStepResult {
    let path = dns_backup_path(app_data_dir);
    if !path.is_file() {
        logs.info("Restore Internet: no DNS backup present (already safe).");
        return step(
            "dns_backup",
            true,
            "No DNS backup present; WireGuard interface DNS clears with the tunnel.",
        );
    }
    match fs::remove_file(&path) {
        Ok(()) => {
            logs.info("Restore Internet: DNS backup marker cleared.");
            step("dns_backup", true, "DNS backup marker cleared.")
        }
        Err(error) => {
            logs.warn(&format!(
                "Restore Internet: failed to clear DNS backup marker: {error}"
            ));
            step("dns_backup", false, error.to_string())
        }
    }
}

fn clear_local_state(app_data_dir: &Path, logs: &LogManager) -> RestoreStepResult {
    let config_result = config::remove_config(app_data_dir);
    let session_result = route_session::clear_active_route_session(app_data_dir);
    let marker_result = clear_routing_marker(app_data_dir);
    network::remove_route_test(app_data_dir);
    match (config_result, session_result, marker_result) {
        (Ok(()), Ok(()), Ok(())) => {
            logs.info("Restore Internet: local route session state cleared.");
            step(
                "clear_local_state",
                true,
                "Local Zer0/RouteLag session state cleared.",
            )
        }
        (config, session, marker) => {
            let message = format!("config={config:?}; session={session:?}; marker={marker:?}");
            logs.warn(&format!(
                "Restore Internet: local state cleanup had warnings: {message}"
            ));
            step("clear_local_state", false, message)
        }
    }
}

fn verify_owned_services_absent(logs: &LogManager) -> RestoreStepResult {
    let remaining = query_owned_tunnel_services();
    let running = remaining
        .iter()
        .filter(|service| service.running)
        .map(|service| service.service_name.clone())
        .collect::<Vec<_>>();
    let installed = remaining
        .iter()
        .filter(|service| service.installed)
        .map(|service| service.service_name.clone())
        .collect::<Vec<_>>();

    if running.is_empty() && installed.is_empty() {
        logs.info("Restore Internet: verified no owned tunnel services remain.");
        return step(
            "verify_windows_state",
            true,
            "No Zer0/RouteLag tunnel services remain installed or running.",
        );
    }

    let message = format!(
        "Leftover owned services — running: [{}]; installed: [{}]",
        running.join(", "),
        installed.join(", ")
    );
    logs.warn(&format!("Restore Internet: {message}"));
    step("verify_windows_state", false, message)
}

fn finalize_result(steps: Vec<RestoreStepResult>) -> RestoreInternetResult {
    let restored = steps
        .iter()
        .filter(|item| item.ok)
        .map(|item| format!("{}: {}", item.step, item.message))
        .collect::<Vec<_>>();
    let not_restored = steps
        .iter()
        .filter(|item| !item.ok)
        .map(|item| format!("{}: {}", item.step, item.message))
        .collect::<Vec<_>>();
    let ok = not_restored.is_empty();
    let summary = if ok {
        "All critical cleanup steps succeeded. Owned tunnel services, DNS cache, and local session markers were restored or already safe.".to_string()
    } else {
        format!(
            "Cleanup finished with gaps. Restored/safe: {}. Not restored: {}.",
            if restored.is_empty() {
                "none".to_string()
            } else {
                restored
                    .iter()
                    .map(|line| line.split(':').next().unwrap_or(line))
                    .collect::<Vec<_>>()
                    .join(", ")
            },
            not_restored
                .iter()
                .map(|line| line.split(':').next().unwrap_or(line))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    RestoreInternetResult {
        ok,
        reboot_required: false,
        steps,
        summary,
        restored,
        not_restored,
    }
}

pub fn restore_internet(
    app_data_dir: &Path,
    engine: &RouteLagEngine,
    logs: &LogManager,
) -> RestoreInternetResult {
    let mut steps = Vec::new();

    #[cfg(not(windows))]
    {
        let _ = engine;
        steps.push(step(
            "platform",
            false,
            "Restore Internet is only available on Windows.",
        ));
        let result = finalize_result(steps);
        save_last_cleanup_result(app_data_dir, &result, logs);
        return result;
    }

    #[cfg(windows)]
    {
        logs.info("Restore Internet started.");
        if !elevation::is_elevated() {
            steps.push(step(
                "admin",
                false,
                "Administrator permission is required for Restore Internet.",
            ));
            let result = finalize_result(steps);
            save_last_cleanup_result(app_data_dir, &result, logs);
            return result;
        }

        // Critical service teardown first — do not clear local session markers yet.
        for profile in OWNED_TUNNEL_PROFILES {
            steps.push(stop_tunnel_service(profile, logs));
        }
        for profile in OWNED_TUNNEL_PROFILES {
            steps.push(uninstall_tunnel_service(profile, engine, logs));
        }
        steps.push(flush_dns(logs));
        steps.push(clear_dns_backup(app_data_dir, logs));
        steps.push(verify_owned_services_absent(logs));
        // Only after cleanup attempts: clear local session/app state.
        steps.push(clear_local_state(app_data_dir, logs));

        let result = finalize_result(steps);
        if result.ok {
            logs.info(&format!("Restore Internet completed. {}", result.summary));
        } else {
            logs.warn(&format!(
                "Restore Internet completed with warnings. {}",
                result.summary
            ));
        }
        save_last_cleanup_result(app_data_dir, &result, logs);
        result
    }
}

/// Idempotent local routing shutdown used by exit/close paths.
/// Does not require frontend auth; ends only local Windows + app state.
pub fn safe_shutdown_routing(
    app_data_dir: &Path,
    engine: &RouteLagEngine,
    logs: &LogManager,
) -> RestoreInternetResult {
    logs.info("Safe shutdown: attempting verified local routing disconnect.");
    let before = get_recovery_status(app_data_dir);
    if !before.route_service_installed
        && !before.route_service_running
        && !before.route_profile_exists
        && !before.routing_marker_present
        && before.stored_session_id.is_none()
    {
        logs.info("Safe shutdown: no owned routing state detected; already safe.");
        let result = finalize_result(vec![step(
            "already_safe",
            true,
            "No Zer0/RouteLag routing state detected.",
        )]);
        save_last_cleanup_result(app_data_dir, &result, logs);
        return result;
    }
    restore_internet(app_data_dir, engine, logs)
}

/// Startup recovery: detect leftover owned tunnels and attempt cleanup when elevated.
pub fn startup_recover_stale_routing(
    app_data_dir: &Path,
    engine: &RouteLagEngine,
    logs: &LogManager,
) -> RecoveryStatus {
    let status = get_recovery_status(app_data_dir);
    if !status.stale_state_detected {
        logs.info("Startup recovery: no stale Zer0/RouteLag routing state detected.");
        return status;
    }

    logs.warn(
        "Startup recovery: stale Zer0/RouteLag routing state detected from a previous session.",
    );
    for service in &status.stale_services {
        logs.warn(&format!(
            "Startup recovery: found {} installed={} running={}",
            service.service_name, service.installed, service.running
        ));
    }

    if !status.is_elevated {
        logs.warn(
            "Startup recovery: not elevated; leaving leftovers in place. Use Restore Internet.",
        );
        return status;
    }

    let result = restore_internet(app_data_dir, engine, logs);
    if result.ok {
        logs.info("Startup recovery: stale routing state cleared.");
    } else {
        logs.warn(&format!(
            "Startup recovery: cleanup incomplete. {}",
            result.summary
        ));
    }
    get_recovery_status(app_data_dir)
}

pub fn force_clear_local_route_state(app_data_dir: &Path, logs: &LogManager) -> RecoveryStatus {
    match config::remove_config(app_data_dir) {
        Ok(()) => logs.info("Force clear: route profile/config metadata cleared."),
        Err(error) => logs.warn(&format!("Force clear: route profile clear failed: {error}")),
    }

    match route_session::clear_active_route_session(app_data_dir) {
        Ok(()) => logs.info("Force clear: active route session cleared."),
        Err(error) => logs.warn(&format!(
            "Force clear: active route session clear failed: {error}"
        )),
    }

    match clear_routing_marker(app_data_dir) {
        Ok(()) => logs.info("Force clear: routing-active marker cleared."),
        Err(error) => logs.warn(&format!(
            "Force clear: routing-active marker clear failed: {error}"
        )),
    }

    network::remove_route_test(app_data_dir);
    logs.info("Force clear: route test runtime state cleared.");

    get_recovery_status(app_data_dir)
}

#[cfg(windows)]
fn run_repair_command(step_name: &str, program: &str, args: &[&str]) -> RestoreStepResult {
    match hidden_command(program).args(args).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{stdout}{stderr}");
            step(
                step_name,
                output.status.success(),
                clean_command_message(&combined),
            )
        }
        Err(error) => step(step_name, false, error.to_string()),
    }
}

pub fn repair_windows_network(logs: &LogManager) -> RestoreInternetResult {
    let mut steps = Vec::new();

    #[cfg(not(windows))]
    {
        let _ = logs;
        steps.push(step(
            "platform",
            false,
            "Windows network repair is only available on Windows.",
        ));
        return finalize_result(steps);
    }

    #[cfg(windows)]
    {
        logs.info("Advanced Windows network repair started.");
        if !elevation::is_elevated() {
            steps.push(step(
                "admin",
                false,
                "Administrator permission is required for Windows network repair.",
            ));
            return finalize_result(steps);
        }

        steps.push(run_repair_command("flush_dns", "ipconfig", &["/flushdns"]));
        steps.push(run_repair_command(
            "winsock_reset",
            "netsh",
            &["winsock", "reset"],
        ));
        steps.push(run_repair_command(
            "ip_reset",
            "netsh",
            &["int", "ip", "reset"],
        ));
        steps.push(run_repair_command(
            "ipv4_reset",
            "netsh",
            &["int", "ipv4", "reset"],
        ));
        steps.push(run_repair_command(
            "ipv6_reset",
            "netsh",
            &["int", "ipv6", "reset"],
        ));
        let mut result = finalize_result(steps);
        result.reboot_required = true;
        if result.ok {
            logs.info("Advanced Windows network repair completed. Reboot required.");
        } else {
            logs.warn("Advanced Windows network repair completed with warnings. Reboot may still be required.");
        }
        result
    }
}

pub fn emergency_cleanup(engine: &RouteLagEngine, logs: &LogManager) -> Result<(), CleanupError> {
    #[cfg(not(windows))]
    {
        let _ = logs;
        let _ = engine;
        return Err(CleanupError::UnsupportedPlatform);
    }

    #[cfg(windows)]
    {
        if !elevation::is_elevated() {
            return Err(CleanupError::NotElevated);
        }

        let mut ok = true;
        for profile in OWNED_TUNNEL_PROFILES {
            ok &= stop_tunnel_service(profile, logs).ok;
        }
        for profile in OWNED_TUNNEL_PROFILES {
            ok &= uninstall_tunnel_service(profile, engine, logs).ok;
        }
        ok &= flush_dns(logs).ok;

        if ok {
            Ok(())
        } else {
            Err(CleanupError::OperationFailed(
                "One or more cleanup steps failed.".to_string(),
            ))
        }
    }
}

pub fn mark_routing_active(
    app_data_dir: &Path,
    session_id: Option<&str>,
    reason: &str,
    logs: &LogManager,
) {
    let marker = RoutingActiveMarker {
        session_id: session_id.map(str::to_string),
        profile_name: config::TUNNEL_NAME.to_string(),
        marked_at: chrono::Utc::now().to_rfc3339(),
        reason: reason.to_string(),
    };
    if let Err(error) = fs::create_dir_all(app_data_dir).and_then(|_| {
        let json = serde_json::to_string_pretty(&marker)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        fs::write(routing_marker_path(app_data_dir), json)
    }) {
        logs.warn(&format!(
            "Failed to persist routing-active marker (no secrets logged): {error}"
        ));
    } else {
        logs.info(&format!(
            "Routing-active marker written (reason={reason}, session={}).",
            session_id.unwrap_or("none")
        ));
    }

    capture_dns_backup(app_data_dir, logs);
}

pub fn clear_routing_marker(app_data_dir: &Path) -> Result<(), String> {
    let path = routing_marker_path(app_data_dir);
    if path.is_file() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[allow(dead_code)]
pub fn load_routing_marker(app_data_dir: &Path) -> Option<RoutingActiveMarker> {
    let content = fs::read_to_string(routing_marker_path(app_data_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

fn capture_dns_backup(app_data_dir: &Path, logs: &LogManager) {
    if dns_backup_path(app_data_dir).is_file() {
        return;
    }

    let adapters = read_dns_adapter_snapshot();
    let backup = DnsBackup {
        captured_at: chrono::Utc::now().to_rfc3339(),
        note: "Diagnostic snapshot only. Zer0 uses WireGuard interface DNS; removing the owned tunnel restores system DNS. Flushdns clears cache.".to_string(),
        adapters,
    };
    if let Err(error) = fs::create_dir_all(app_data_dir).and_then(|_| {
        let json = serde_json::to_string_pretty(&backup)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        fs::write(dns_backup_path(app_data_dir), json)
    }) {
        logs.warn(&format!("DNS backup snapshot failed: {error}"));
    } else {
        logs.info("DNS backup snapshot captured for recovery diagnostics.");
    }
}

#[cfg(windows)]
fn read_dns_adapter_snapshot() -> Vec<DnsAdapterSnapshot> {
    let output = match hidden_command("netsh")
        .args(["interface", "ip", "show", "dnsservers"])
        .output()
    {
        Ok(output) => output,
        Err(_) => return Vec::new(),
    };
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_dnsservers_snapshot(&text)
}

#[cfg(not(windows))]
fn read_dns_adapter_snapshot() -> Vec<DnsAdapterSnapshot> {
    Vec::new()
}

fn parse_dnsservers_snapshot(text: &str) -> Vec<DnsAdapterSnapshot> {
    let mut adapters = Vec::new();
    let mut current: Option<DnsAdapterSnapshot> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("Configuration for interface \"") {
            if let Some(prev) = current.take() {
                adapters.push(prev);
            }
            current = Some(DnsAdapterSnapshot {
                name: rest.trim_end_matches('"').to_string(),
                dns_servers: Vec::new(),
            });
            continue;
        }
        if let Some(adapter) = current.as_mut() {
            for token in trimmed.split_whitespace() {
                let candidate = token.trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
                if !candidate.is_empty()
                    && candidate.chars().all(|c| c.is_ascii_digit() || c == '.')
                    && candidate.contains('.')
                {
                    adapter.dns_servers.push(candidate.to_string());
                }
            }
        }
    }
    if let Some(prev) = current {
        adapters.push(prev);
    }
    adapters
}

fn clean_command_message(message: &str) -> String {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        "Command completed with no output.".to_string()
    } else {
        trimmed.lines().take(8).collect::<Vec<_>>().join("\n")
    }
}

fn classify_cleanup_command(success: bool, output: &str) -> CleanupCommandStatus {
    if success {
        return CleanupCommandStatus::Success;
    }

    let lower = output.to_lowercase();
    if lower.contains("1062")
        || lower.contains("service has not been started")
        || lower.contains("not started")
        || lower.contains("not running")
    {
        return CleanupCommandStatus::AlreadySafe("already_stopped");
    }

    if lower.contains("1060")
        || lower.contains("does not exist")
        || lower.contains("not installed")
        || lower.contains("service is not installed")
    {
        return CleanupCommandStatus::AlreadySafe("not_installed");
    }

    CleanupCommandStatus::Failed
}

fn routing_marker_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(ROUTING_MARKER_FILENAME)
}

fn dns_backup_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DNS_BACKUP_FILENAME)
}

fn last_cleanup_result_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(LAST_CLEANUP_FILENAME)
}

fn load_last_cleanup_result(app_data_dir: &Path) -> Option<RestoreInternetResult> {
    let content = fs::read_to_string(last_cleanup_result_path(app_data_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_last_cleanup_result(app_data_dir: &Path, result: &RestoreInternetResult, logs: &LogManager) {
    if let Err(error) = fs::create_dir_all(app_data_dir).and_then(|_| {
        let json = serde_json::to_string_pretty(result)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        fs::write(last_cleanup_result_path(app_data_dir), json)
    }) {
        logs.warn(&format!(
            "Restore Internet: failed to persist cleanup summary: {error}"
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("zer0-cleanup-test-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn service_not_started_1062_is_safe() {
        let output = "[SC] ControlService FAILED 1062: The service has not been started.";
        assert_eq!(
            classify_cleanup_command(false, output),
            CleanupCommandStatus::AlreadySafe("already_stopped")
        );
    }

    #[test]
    fn missing_or_not_installed_service_is_safe() {
        for output in [
            "[SC] OpenService FAILED 1060: The specified service does not exist as an installed service.",
            "The service is not installed.",
            "WireGuard tunnel profile is not installed.",
            "The service does not exist.",
        ] {
            assert_eq!(
                classify_cleanup_command(false, output),
                CleanupCommandStatus::AlreadySafe("not_installed")
            );
        }
    }

    #[test]
    fn unrelated_sc_failure_is_not_safe() {
        let output = "[SC] ControlService FAILED 5: Access is denied.";
        assert_eq!(
            classify_cleanup_command(false, output),
            CleanupCommandStatus::Failed
        );
    }

    #[test]
    fn owned_profiles_include_legacy_and_zer0() {
        assert!(is_owned_tunnel_profile("routelag-engine"));
        assert!(is_owned_tunnel_profile("RouteLag"));
        assert!(is_owned_tunnel_profile("zer0-engine"));
        assert!(is_owned_tunnel_profile("Zer0"));
        assert!(!is_owned_tunnel_profile("WireGuardTunnel$NordVPN"));
        assert!(!is_owned_tunnel_profile("ProtonVPN"));
        assert!(!is_owned_tunnel_profile("wg-company"));
    }

    #[test]
    fn stale_detection_with_marker_and_no_service() {
        assert!(detect_stale_route_state(None, false, false, false, true));
        assert!(!detect_stale_route_state(
            Some("route_1"),
            true,
            true,
            true,
            true
        ));
        assert!(detect_stale_route_state(
            Some("route_1"),
            true,
            true,
            false,
            false
        ));
        assert!(detect_stale_route_state(None, true, false, false, false));
        assert!(!detect_stale_route_state(None, false, false, false, false));
    }

    #[test]
    fn missing_dns_backup_is_already_safe() {
        let dir = temp_dir();
        let logs = LogManager::new(&dir);
        let result = clear_dns_backup(&dir, &logs);
        assert!(result.ok);
        assert!(result.message.contains("No DNS backup"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupted_session_state_does_not_panic_recovery_status() {
        let dir = temp_dir();
        fs::write(dir.join("route-session.json"), "{not-json").unwrap();
        fs::write(routing_marker_path(&dir), "not-json-either").unwrap();
        let status = get_recovery_status(&dir);
        assert!(status.routing_marker_present);
        assert!(status.stored_session_id.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn routing_marker_round_trip() {
        let dir = temp_dir();
        let logs = LogManager::new(&dir);
        mark_routing_active(&dir, Some("route_abc"), "connect", &logs);
        let loaded = load_routing_marker(&dir).expect("marker");
        assert_eq!(loaded.session_id.as_deref(), Some("route_abc"));
        assert_eq!(loaded.reason, "connect");
        clear_routing_marker(&dir).unwrap();
        assert!(load_routing_marker(&dir).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn finalize_result_reports_restored_and_not_restored() {
        let result = finalize_result(vec![
            step("stop_service:routelag-engine", true, "stopped"),
            step("flush_dns", false, "access denied"),
        ]);
        assert!(!result.ok);
        assert_eq!(result.restored.len(), 1);
        assert_eq!(result.not_restored.len(), 1);
        assert!(result.summary.contains("Not restored"));
    }

    #[test]
    fn parse_dnsservers_snapshot_extracts_adapters() {
        let text = r#"
Configuration for interface "Ethernet"
    DNS servers configured through DHCP: 1.1.1.1
                                         1.0.0.1
Configuration for interface "Wi-Fi"
    Statically Configured DNS Servers: 8.8.8.8
"#;
        let adapters = parse_dnsservers_snapshot(text);
        assert_eq!(adapters.len(), 2);
        assert_eq!(adapters[0].name, "Ethernet");
        assert!(adapters[0].dns_servers.contains(&"1.1.1.1".to_string()));
        assert_eq!(adapters[1].name, "Wi-Fi");
    }
}
