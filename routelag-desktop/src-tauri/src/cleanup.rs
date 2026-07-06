use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config;
use crate::elevation;
use crate::logs::LogManager;
use crate::network;
use crate::route_lag_engine::RouteLagEngine;
use crate::route_session;
use crate::windows_process::hidden_command;

const ROUTELAG_TUNNELS: &[&str] = &["routelag-engine", "routelag-beta", "RouteLag", "routelag"];
const LAST_CLEANUP_FILENAME: &str = "last-cleanup-result.json";

#[derive(Debug, Error)]
pub enum CleanupError {
    #[error("RouteLag needs administrator permission for emergency cleanup.")]
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

pub fn get_recovery_status(app_data_dir: &std::path::Path) -> RecoveryStatus {
    let active = route_session::load_active_route_session(app_data_dir);
    let stored_session_id = active.as_ref().map(|session| session.session_id.clone());
    let stale_services = query_routelag_services();
    let route_service_installed = stale_services.iter().any(|service| service.installed);
    let route_service_running = stale_services.iter().any(|service| service.running);
    RecoveryStatus {
        is_elevated: elevation::is_elevated(),
        active_route_session: stored_session_id.is_some(),
        route_profile_exists: config::has_config(app_data_dir),
        stale_state_detected: stored_session_id.is_some() || route_service_installed,
        stored_session_id,
        route_service_installed,
        route_service_running,
        stale_services,
        last_cleanup_result: load_last_cleanup_result(app_data_dir),
    }
}

#[cfg(windows)]
fn query_routelag_services() -> Vec<TunnelServiceStatus> {
    ROUTELAG_TUNNELS
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
fn query_routelag_services() -> Vec<TunnelServiceStatus> {
    Vec::new()
}

#[cfg(windows)]
fn stop_tunnel_service(profile_name: &str, logs: &LogManager) -> RestoreStepResult {
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
    logs.info(&format!(
        "Restore Internet: uninstalling RouteLag route profile {profile_name}..."
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

fn clear_local_state(app_data_dir: &std::path::Path, logs: &LogManager) -> RestoreStepResult {
    let config_result = config::remove_config(app_data_dir);
    let session_result = route_session::clear_active_route_session(app_data_dir);
    network::remove_route_test(app_data_dir);
    match (config_result, session_result) {
        (Ok(()), Ok(())) => {
            logs.info("Restore Internet: local route session state cleared.");
            step(
                "clear_local_state",
                true,
                "Local RouteLag session state cleared.",
            )
        }
        (config, session) => {
            let message = format!("config={config:?}; session={session:?}");
            logs.warn(&format!(
                "Restore Internet: local state cleanup had warnings: {message}"
            ));
            step("clear_local_state", false, message)
        }
    }
}

pub fn restore_internet(
    app_data_dir: &std::path::Path,
    engine: &RouteLagEngine,
    logs: &LogManager,
) -> RestoreInternetResult {
    let mut steps = Vec::new();

    #[cfg(not(windows))]
    {
        let _ = app_data_dir;
        let _ = logs;
        let _ = engine;
        steps.push(step(
            "platform",
            false,
            "Restore Internet is only available on Windows.",
        ));
        let result = RestoreInternetResult {
            ok: false,
            reboot_required: false,
            steps,
        };
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
            let result = RestoreInternetResult {
                ok: false,
                reboot_required: false,
                steps,
            };
            save_last_cleanup_result(app_data_dir, &result, logs);
            return result;
        }

        for profile in ROUTELAG_TUNNELS {
            steps.push(stop_tunnel_service(profile, logs));
        }
        for profile in ROUTELAG_TUNNELS {
            steps.push(uninstall_tunnel_service(profile, engine, logs));
        }
        steps.push(flush_dns(logs));
        steps.push(clear_local_state(app_data_dir, logs));

        let ok = steps.iter().all(|item| item.ok);
        if ok {
            logs.info("Restore Internet completed.");
        } else {
            logs.warn("Restore Internet completed with warnings.");
        }
        let result = RestoreInternetResult {
            ok,
            reboot_required: false,
            steps,
        };
        save_last_cleanup_result(app_data_dir, &result, logs);
        result
    }
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
        return RestoreInternetResult {
            ok: false,
            reboot_required: false,
            steps,
        };
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
            return RestoreInternetResult {
                ok: false,
                reboot_required: false,
                steps,
            };
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
        let ok = steps.iter().all(|item| item.ok);
        if ok {
            logs.info("Advanced Windows network repair completed. Reboot required.");
        } else {
            logs.warn("Advanced Windows network repair completed with warnings. Reboot may still be required.");
        }
        RestoreInternetResult {
            ok,
            reboot_required: true,
            steps,
        }
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
        for profile in ROUTELAG_TUNNELS {
            ok &= stop_tunnel_service(profile, logs).ok;
        }
        for profile in ROUTELAG_TUNNELS {
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

fn last_cleanup_result_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join(LAST_CLEANUP_FILENAME)
}

fn load_last_cleanup_result(app_data_dir: &Path) -> Option<RestoreInternetResult> {
    let content = fs::read_to_string(last_cleanup_result_path(app_data_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_last_cleanup_result(
    app_data_dir: &Path,
    result: &RestoreInternetResult,
    logs: &LogManager,
) {
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
    use super::{classify_cleanup_command, CleanupCommandStatus};

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
}
