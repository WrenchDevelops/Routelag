use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config::{self, redact_secrets, TUNNEL_NAME};
use crate::elevation::{self, ElevationError};

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
    #[error("Install WireGuard for Windows from https://www.wireguard.com/install/")]
    WireGuardNotInstalled,
    #[error("RouteLag needs administrator permission to control the WireGuard network tunnel.")]
    NotElevated,
    #[error("No config imported. Import a WireGuard .conf file first.")]
    NoConfig,
    #[error("Tunnel operation failed: {0}")]
    OperationFailed(String),
    #[error("WireGuard tunnel control is only available on Windows.")]
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

pub fn is_wireguard_installed() -> bool {
    wireguard_exe().is_some()
}

pub fn wireguard_exe_path() -> Option<std::path::PathBuf> {
    wireguard_exe()
}

fn wireguard_exe() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        let candidates = [
            std::env::var("ProgramFiles")
                .ok()
                .map(|p| std::path::PathBuf::from(p).join("WireGuard").join("wireguard.exe")),
            std::env::var("ProgramFiles(x86)")
                .ok()
                .map(|p| std::path::PathBuf::from(p).join("WireGuard").join("wireguard.exe")),
        ];
        for candidate in candidates.into_iter().flatten() {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    #[cfg(not(windows))]
    let _ = ();
    None
}

fn service_name() -> String {
    format!("WireGuardTunnel${TUNNEL_NAME}")
}

#[cfg(windows)]
fn query_service_state() -> Option<String> {
    let output = Command::new("sc")
        .args(["query", &service_name()])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout.contains("does not exist") || stdout.contains("1060") {
        return None;
    }
    Some(stdout)
}

#[cfg(not(windows))]
fn query_service_state() -> Option<String> {
    None
}

pub fn wireguard_service_status_snippet() -> String {
    match query_service_state() {
        Some(s) => s,
        None => {
            if is_wireguard_installed() {
                format!("Service {} is not installed.", service_name())
            } else {
                "WireGuard for Windows is not installed.".to_string()
            }
        }
    }
}

pub fn tunnel_status() -> TunnelStatus {
    #[cfg(not(windows))]
    {
        return TunnelStatus::disconnected();
    }

    #[cfg(windows)]
    {
        let Some(state_output) = query_service_state() else {
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
            if let Some(wg) = std::env::var("ProgramFiles")
                .ok()
                .map(|p| std::path::PathBuf::from(p).join("WireGuard").join("wg.exe"))
                .filter(|p| p.is_file())
            {
                let show = Command::new(wg)
                    .args(["show", TUNNEL_NAME])
                    .output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string());

                if let Some(text) = show {
                    if text.contains("latest handshake") {
                        return TunnelStatus::connected();
                    }
                }
            }
            return TunnelStatus::connected();
        }

        TunnelStatus::error("Unknown tunnel service state")
    }
}

pub fn connect_tunnel(app_data_dir: &Path) -> Result<(), TunnelError> {
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
        if !is_wireguard_installed() {
            return Err(TunnelError::WireGuardNotInstalled);
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

        let wg = wireguard_exe().ok_or(TunnelError::WireGuardNotInstalled)?;
        let output = Command::new(&wg)
            .args(["/installtunnelservice", &config_str])
            .output()
            .map_err(|e| TunnelError::OperationFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let msg = if !stderr.trim().is_empty() {
                stderr.to_string()
            } else {
                stdout.to_string()
            };
            if msg.to_lowercase().contains("already installed") {
                return Ok(());
            }
            return Err(TunnelError::OperationFailed(msg.trim().to_string()));
        }

        Ok(())
    }
}

pub fn disconnect_tunnel() -> Result<(), TunnelError> {
    #[cfg(not(windows))]
    {
        return Err(TunnelError::UnsupportedPlatform);
    }

    #[cfg(windows)]
    {
        if !elevation::is_elevated() {
            return Err(TunnelError::NotElevated);
        }
        if !is_wireguard_installed() {
            return Err(TunnelError::WireGuardNotInstalled);
        }

        let status = tunnel_status();
        if status.state == "disconnected" {
            return Ok(());
        }

        let wg = wireguard_exe().ok_or(TunnelError::WireGuardNotInstalled)?;
        let output = Command::new(&wg)
            .args(["/uninstalltunnelservice", TUNNEL_NAME])
            .output()
            .map_err(|e| TunnelError::OperationFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let msg = if !stderr.trim().is_empty() {
                stderr.to_string()
            } else {
                stdout.to_string()
            };
            if msg.contains("does not exist") || msg.contains("1060") {
                return Ok(());
            }
            return Err(TunnelError::OperationFailed(msg.trim().to_string()));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireGuardStatus {
    pub service_status: String,
    pub wg_show: String,
    pub latest_handshake_secs_ago: Option<u64>,
    pub transfer_rx: Option<String>,
    pub transfer_tx: Option<String>,
    pub endpoint: Option<String>,
    pub allowed_ips: Option<String>,
    pub mtu: Option<u32>,
}

pub fn get_wireguard_status() -> WireGuardStatus {
    let service_status = wireguard_service_status_snippet();
    let wg_show_raw = wg_show_output().unwrap_or_else(|| "wg show unavailable".to_string());
    let wg_show = redact_secrets(&wg_show_raw);

    WireGuardStatus {
        service_status: redact_secrets(&service_status),
        latest_handshake_secs_ago: parse_handshake_secs_ago(&wg_show_raw),
        transfer_rx: parse_field(&wg_show_raw, "transfer:").map(|s| s.split_whitespace().next().unwrap_or("").to_string()),
        transfer_tx: parse_field(&wg_show_raw, "transfer:").and_then(|s| s.split_whitespace().nth(1).map(|v| v.to_string())),
        endpoint: parse_field(&wg_show_raw, "endpoint:"),
        allowed_ips: parse_allowed_ips(&wg_show_raw),
        mtu: parse_mtu_from_config_or_show(&wg_show_raw),
        wg_show,
    }
}

fn wg_show_output() -> Option<String> {
    #[cfg(windows)]
    {
        let wg = std::env::var("ProgramFiles")
            .ok()
            .map(|p| std::path::PathBuf::from(p).join("WireGuard").join("wg.exe"))
            .filter(|p| p.is_file())?;
        let output = Command::new(wg)
            .args(["show", TUNNEL_NAME])
            .output()
            .ok()?;
        Some(String::from_utf8_lossy(&output.stdout).to_string())
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

pub fn wait_for_handshake(timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Some(show) = wg_show_output() {
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

pub fn reconnect_tunnel(app_data_dir: &Path) -> Result<(), TunnelError> {
    disconnect_tunnel()?;
    std::thread::sleep(Duration::from_secs(2));
    connect_tunnel(app_data_dir)?;
    wait_for_handshake(Duration::from_secs(30));
    Ok(())
}

// TODO(paid-tier): Replace per-connect elevation with a one-time installed
// RouteLagTunnelService that manages WireGuard tunnel lifecycle via IPC,
// allowing the main UI to stay in normal (non-admin) mode after initial setup.
