use std::process::Command;

use thiserror::Error;

use crate::config::TUNNEL_NAME;
use crate::elevation::{self, ElevationError};
use crate::logs::LogManager;
use crate::tunnel;

#[derive(Debug, Error)]
pub enum CleanupError {
    #[error("RouteLag needs administrator permission for emergency cleanup.")]
    NotElevated,
    #[error("Emergency cleanup is only available on Windows.")]
    UnsupportedPlatform,
    #[error("Emergency cleanup failed: {0}")]
    OperationFailed(String),
}

impl From<ElevationError> for CleanupError {
    fn from(value: ElevationError) -> Self {
        match value {
            ElevationError::NotElevated => CleanupError::NotElevated,
            other => CleanupError::OperationFailed(other.to_string()),
        }
    }
}

fn service_name() -> String {
    format!("WireGuardTunnel${TUNNEL_NAME}")
}

#[cfg(windows)]
fn stop_tunnel_service(logs: &LogManager) -> Result<(), CleanupError> {
    logs.info("Emergency cleanup: stopping tunnel service...");
    let output = Command::new("sc")
        .args(["stop", &service_name()])
        .output()
        .map_err(|e| CleanupError::OperationFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}{stderr}").to_lowercase();

    if output.status.success()
        || combined.contains("not started")
        || combined.contains("not running")
        || combined.contains("1060")
        || combined.contains("does not exist")
    {
        logs.info("Emergency cleanup: stopped tunnel service");
        Ok(())
    } else {
        let msg = if !stderr.trim().is_empty() {
            stderr.to_string()
        } else {
            stdout.to_string()
        };
        Err(CleanupError::OperationFailed(msg.trim().to_string()))
    }
}

#[cfg(not(windows))]
fn stop_tunnel_service(_logs: &LogManager) -> Result<(), CleanupError> {
    Err(CleanupError::UnsupportedPlatform)
}

#[cfg(windows)]
fn uninstall_tunnel_service(logs: &LogManager) -> Result<(), CleanupError> {
    logs.info("Emergency cleanup: uninstalling tunnel service...");
    if !tunnel::is_wireguard_installed() {
        logs.info("Emergency cleanup: WireGuard not installed, skipping uninstall");
        return Ok(());
    }

    tunnel::disconnect_tunnel().map_err(|e| CleanupError::OperationFailed(e.to_string()))?;
    logs.info("Emergency cleanup: uninstalled tunnel service");
    Ok(())
}

#[cfg(not(windows))]
fn uninstall_tunnel_service(_logs: &LogManager) -> Result<(), CleanupError> {
    Err(CleanupError::UnsupportedPlatform)
}

#[cfg(windows)]
fn flush_dns(logs: &LogManager) -> Result<(), CleanupError> {
    logs.info("Emergency cleanup: flushing DNS...");
    let output = Command::new("ipconfig")
        .args(["/flushdns"])
        .output()
        .map_err(|e| CleanupError::OperationFailed(e.to_string()))?;

    if output.status.success() {
        logs.info("Emergency cleanup: flushed DNS");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(CleanupError::OperationFailed(stderr.trim().to_string()))
    }
}

#[cfg(not(windows))]
fn flush_dns(_logs: &LogManager) -> Result<(), CleanupError> {
    Err(CleanupError::UnsupportedPlatform)
}

pub fn emergency_cleanup(logs: &LogManager) -> Result<(), CleanupError> {
    #[cfg(not(windows))]
    {
        let _ = logs;
        return Err(CleanupError::UnsupportedPlatform);
    }

    #[cfg(windows)]
    {
        if !elevation::is_elevated() {
            return Err(CleanupError::NotElevated);
        }

        logs.info("Emergency cleanup started.");
        stop_tunnel_service(logs)?;
        uninstall_tunnel_service(logs)?;
        flush_dns(logs)?;
        logs.info("Emergency cleanup completed. Tunnel status reset to disconnected.");
        Ok(())
    }
}
