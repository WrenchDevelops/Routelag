use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config::{self, redact_secrets};
use crate::elevation::{self, ElevationError};
use crate::route_lag_engine::{self, RouteLagEngine, RouteLagEngineError, ENGINE_MISSING_MESSAGE};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TunnelStatus {
    pub state: String,
    pub message: Option<String>,
}

impl TunnelStatus {
    pub fn disconnected() -> Self {
        Self {
            state: "disconnected".to_string(),
            message: None,
        }
    }

    pub fn connecting() -> Self {
        Self {
            state: "connecting".to_string(),
            message: None,
        }
    }

    pub fn connected() -> Self {
        Self {
            state: "connected".to_string(),
            message: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            state: "error".to_string(),
            message: Some(message.into()),
        }
    }

    pub fn is_connected(&self) -> bool {
        self.state == "connected"
    }

    pub fn is_connecting(&self) -> bool {
        self.state == "connecting"
    }
}

#[derive(Debug, Error)]
pub enum TunnelError {
    #[error("{ENGINE_MISSING_MESSAGE}")]
    EngineMissing,
    #[error(
        "RouteLag needs administrator permission to control the RouteLag Engine route session."
    )]
    NotElevated,
    #[error("No RouteLag route profile is ready. Start Optimization to create a route session.")]
    NoConfig,
    #[error("RouteLag Engine operation failed: {0}")]
    OperationFailed(String),
    #[error("RouteLag Engine route control is only available on Windows.")]
    UnsupportedPlatform,
}

impl From<ElevationError> for TunnelError {
    fn from(value: ElevationError) -> Self {
        match value {
            ElevationError::NotElevated => TunnelError::NotElevated,
            other => TunnelError::OperationFailed(other.to_string()),
        }
    }
}

impl From<RouteLagEngineError> for TunnelError {
    fn from(value: RouteLagEngineError) -> Self {
        match value {
            RouteLagEngineError::Missing => TunnelError::EngineMissing,
            RouteLagEngineError::OperationFailed(message) => TunnelError::OperationFailed(message),
        }
    }
}

pub fn is_route_lag_engine_available(engine: &RouteLagEngine) -> bool {
    engine.is_available()
}

pub fn route_lag_engine_path(engine: &RouteLagEngine) -> Option<PathBuf> {
    engine.service_binary()
}

pub fn route_lag_service_status_snippet(engine: &RouteLagEngine) -> String {
    engine.service_status_snippet()
}

pub fn tunnel_status() -> TunnelStatus {
    #[cfg(not(windows))]
    {
        return TunnelStatus::disconnected();
    }

    #[cfg(windows)]
    {
        let Some(state_output) = route_lag_engine::query_service_state() else {
            return TunnelStatus::disconnected();
        };

        let state_line = state_output
            .lines()
            .find(|l| l.contains("STATE"))
            .unwrap_or("")
            .to_uppercase();

        if state_line.contains("STOPPED") {
            return TunnelStatus::disconnected();
        }

        if state_line.contains("START_PENDING") || state_line.contains("STOP_PENDING") {
            return TunnelStatus::connecting();
        }

        if state_line.contains("RUNNING") {
            return TunnelStatus::connected();
        }

        TunnelStatus::error("Unknown tunnel service state")
    }
}

pub fn connect_tunnel(app_data_dir: &Path, engine: &RouteLagEngine) -> Result<(), TunnelError> {
    #[cfg(not(windows))]
    {
        let _ = app_data_dir;
        return Err(TunnelError::UnsupportedPlatform);
    }

    #[cfg(windows)]
    {
        if !elevation::is_elevated() {
            return Err(TunnelError::NotElevated);
        }
        if !engine.is_available() {
            return Err(TunnelError::EngineMissing);
        }
        if !config::has_config(app_data_dir) {
            return Err(TunnelError::NoConfig);
        }

        let config_path = config::config_path(app_data_dir);
        let config_str = config_path.to_string_lossy().to_string();

        let status = tunnel_status();
        if status.is_connected() || status.is_connecting() {
            return Ok(());
        }

        let _ = config_str;
        engine.install_route_profile(&config_path)?;

        Ok(())
    }
}

pub fn disconnect_tunnel(engine: &RouteLagEngine) -> Result<(), TunnelError> {
    #[cfg(not(windows))]
    {
        return Err(TunnelError::UnsupportedPlatform);
    }

    #[cfg(windows)]
    {
        if !elevation::is_elevated() {
            return Err(TunnelError::NotElevated);
        }
        if !engine.is_available() {
            return Err(TunnelError::EngineMissing);
        }

        let status = tunnel_status();
        if status.state == "disconnected" {
            return Ok(());
        }

        engine.uninstall_route_profile(&config::TUNNEL_NAME)?;

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteLagEngineRuntimeStatus {
    pub service_status: String,
    pub wg_show: String,
    pub latest_handshake_secs_ago: Option<u64>,
    pub transfer_rx: Option<String>,
    pub transfer_tx: Option<String>,
    pub endpoint: Option<String>,
    pub allowed_ips: Option<String>,
    pub mtu: Option<u32>,
}

pub fn get_route_lag_engine_runtime_status(engine: &RouteLagEngine) -> RouteLagEngineRuntimeStatus {
    let service_status = route_lag_service_status_snippet(engine);
    let wg_show_raw =
        wg_show_output(engine).unwrap_or_else(|| "engine status unavailable".to_string());
    let wg_show = redact_secrets(&wg_show_raw);

    RouteLagEngineRuntimeStatus {
        service_status: redact_secrets(&service_status),
        latest_handshake_secs_ago: parse_handshake_secs_ago(&wg_show_raw),
        transfer_rx: parse_field(&wg_show_raw, "transfer:")
            .map(|s| s.split_whitespace().next().unwrap_or("").to_string()),
        transfer_tx: parse_field(&wg_show_raw, "transfer:")
            .and_then(|s| s.split_whitespace().nth(1).map(|v| v.to_string())),
        endpoint: parse_field(&wg_show_raw, "endpoint:"),
        allowed_ips: parse_allowed_ips(&wg_show_raw),
        mtu: parse_mtu_from_config_or_show(&wg_show_raw),
        wg_show,
    }
}

fn wg_show_output(engine: &RouteLagEngine) -> Option<String> {
    #[cfg(windows)]
    {
        engine.show_tunnel()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn parse_field(text: &str, key: &str) -> Option<String> {
    text.lines()
        .find(|l| l.trim().to_lowercase().starts_with(key))
        .map(|l| l.split(':').nth(1).unwrap_or("").trim().to_string())
        .filter(|s| !s.is_empty())
}

fn parse_allowed_ips(text: &str) -> Option<String> {
    let mut ips = Vec::new();
    for line in text.lines() {
        let t = line.trim();
        if t.to_lowercase().starts_with("allowed ips:") {
            ips.push(t.split(':').nth(1).unwrap_or("").trim().to_string());
        }
    }
    if ips.is_empty() {
        None
    } else {
        Some(ips.join(", "))
    }
}

fn parse_mtu_from_config_or_show(text: &str) -> Option<u32> {
    for line in text.lines() {
        let t = line.trim().to_lowercase();
        if t.starts_with("mtu:") {
            return t.split(':').nth(1).and_then(|v| v.trim().parse().ok());
        }
    }
    None
}

pub fn parse_handshake_secs_ago(wg_show: &str) -> Option<u64> {
    for line in wg_show.lines() {
        let t = line.trim().to_lowercase();
        if t.contains("latest handshake") {
            // e.g. "latest handshake: 1 minute, 23 seconds ago"
            if t.contains("second") {
                let re = regex::Regex::new(r"(\d+)\s+second").unwrap();
                if let Some(c) = re.captures(&t) {
                    return c.get(1).and_then(|m| m.as_str().parse().ok());
                }
            }
            if t.contains("minute") {
                let re = regex::Regex::new(r"(\d+)\s+minute").unwrap();
                if let Some(c) = re.captures(&t) {
                    let mins: u64 = c.get(1).and_then(|m| m.as_str().parse().ok())?;
                    return Some(mins * 60);
                }
            }
            if t.contains("hour") {
                let re = regex::Regex::new(r"(\d+)\s+hour").unwrap();
                if let Some(c) = re.captures(&t) {
                    let hrs: u64 = c.get(1).and_then(|m| m.as_str().parse().ok())?;
                    return Some(hrs * 3600);
                }
            }
        }
    }
    None
}

pub fn wait_for_handshake(engine: &RouteLagEngine, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Some(show) = wg_show_output(engine) {
            if show.contains("latest handshake") {
                if let Some(secs) = parse_handshake_secs_ago(&show) {
                    if secs < 180 {
                        return true;
                    }
                } else if show.contains("latest handshake") {
                    return true;
                }
            }
        }
        if tunnel_status().is_connected() {
            std::thread::sleep(Duration::from_secs(2));
        } else {
            std::thread::sleep(Duration::from_secs(1));
        }
    }
    tunnel_status().is_connected()
}

pub fn reconnect_tunnel(app_data_dir: &Path, engine: &RouteLagEngine) -> Result<(), TunnelError> {
    disconnect_tunnel(engine)?;
    std::thread::sleep(Duration::from_secs(2));
    connect_tunnel(app_data_dir, engine)?;
    wait_for_handshake(engine, Duration::from_secs(30));
    Ok(())
}

// TODO(paid-tier): Replace per-connect elevation with a one-time installed
// RouteLag service that manages tunnel lifecycle via IPC, allowing the main UI
// to stay in normal (non-admin) mode after initial setup.
