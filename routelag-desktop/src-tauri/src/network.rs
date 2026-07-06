use std::fs;
use std::path::Path;
use std::time::Duration;

use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::tunnel;
use crate::windows_process::hidden_command;

pub const DEFAULT_PING_HOST: &str = "1.1.1.1";
const ROUTE_TEST_FILENAME: &str = "route-test-latest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingResult {
    pub host: String,
    pub avg_ping_ms: Option<f64>,
    pub packet_loss_pct: f64,
    pub jitter_ms: Option<f64>,
    pub samples_ms: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteTestResult {
    pub mode: String,
    pub avg_ping_ms: Option<f64>,
    pub packet_loss_pct: f64,
    pub jitter_ms: Option<f64>,
    pub public_ip: Option<String>,
    pub tested_at: String,
}

#[derive(Debug, Error)]
pub enum NetworkError {
    #[error("Failed to fetch public IP: {0}")]
    PublicIpFailed(String),
    #[error("Ping failed: {0}")]
    PingFailed(String),
    #[error("Route test failed: {0}")]
    RouteTestFailed(String),
    #[error("Invalid route test mode: {0}")]
    InvalidMode(String),
}

pub fn get_public_ip() -> Result<String, NetworkError> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| NetworkError::PublicIpFailed(e.to_string()))?;

    let primary = client
        .get("https://api.ipify.org")
        .send()
        .and_then(|r| r.text());

    if let Ok(ip) = primary {
        let trimmed = ip.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    client
        .get("https://ifconfig.me/ip")
        .send()
        .and_then(|r| r.text())
        .map(|ip| ip.trim().to_string())
        .map_err(|e| NetworkError::PublicIpFailed(e.to_string()))
}

pub fn ping_host(host: &str) -> Result<PingResult, NetworkError> {
    let output = if cfg!(windows) {
        hidden_command("ping")
            .args(["-n", "4", "-w", "1000", host])
            .output()
    } else {
        hidden_command("ping").args(["-c", "4", host]).output()
    }
    .map_err(|e| NetworkError::PingFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ping_output(host, &stdout)
}

fn parse_ping_output(host: &str, output: &str) -> Result<PingResult, NetworkError> {
    let mut samples_ms = Vec::new();

    let win_re = Regex::new(r"(?i)time[=<](\d+)ms").unwrap();
    let unix_re = Regex::new(r"time[=<]([\d.]+)\s*ms").unwrap();

    for cap in win_re.captures_iter(output) {
        if let Some(m) = cap.get(1) {
            if let Ok(v) = m.as_str().parse::<f64>() {
                samples_ms.push(v);
            }
        }
    }
    if samples_ms.is_empty() {
        for cap in unix_re.captures_iter(output) {
            if let Some(m) = cap.get(1) {
                if let Ok(v) = m.as_str().parse::<f64>() {
                    samples_ms.push(v);
                }
            }
        }
    }

    let packet_loss_pct = parse_packet_loss(output);

    let avg_ping_ms = if samples_ms.is_empty() {
        parse_average_ms(output)
    } else {
        Some(samples_ms.iter().sum::<f64>() / samples_ms.len() as f64)
    };

    let jitter_ms = compute_jitter(&samples_ms);

    if avg_ping_ms.is_none() && packet_loss_pct >= 100.0 {
        return Err(NetworkError::PingFailed(
            "No ping replies received".to_string(),
        ));
    }

    Ok(PingResult {
        host: host.to_string(),
        avg_ping_ms,
        packet_loss_pct,
        jitter_ms,
        samples_ms,
    })
}

fn parse_packet_loss(output: &str) -> f64 {
    let re = Regex::new(r"(\d+(?:\.\d+)?)\s*%\s*(?:packet loss|loss)").unwrap();
    re.captures(output)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0.0)
}

fn parse_average_ms(output: &str) -> Option<f64> {
    let win = Regex::new(r"(?i)Average\s*=\s*(\d+)ms").unwrap();
    if let Some(c) = win.captures(output) {
        return c.get(1).and_then(|m| m.as_str().parse().ok());
    }
    let unix = Regex::new(r"(?i)round-trip.*=\s*[\d.]+/([\d.]+)/").unwrap();
    unix.captures(output)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

fn compute_jitter(samples: &[f64]) -> Option<f64> {
    if samples.len() < 2 {
        return None;
    }
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    let variance = samples.iter().map(|s| (s - mean).powi(2)).sum::<f64>() / samples.len() as f64;
    Some(variance.sqrt())
}

pub fn run_route_test(app_data_dir: &Path, mode: &str) -> Result<RouteTestResult, NetworkError> {
    let status = tunnel::tunnel_status();
    match mode {
        "normal" => {
            if status.is_connected() || status.is_connecting() {
                return Err(NetworkError::RouteTestFailed(
                    "Disconnect RouteLag before testing the normal route.".to_string(),
                ));
            }
        }
        "routelag" => {
            if !status.is_connected() {
                return Err(NetworkError::RouteTestFailed(
                    "Connect RouteLag before testing the RouteLag route.".to_string(),
                ));
            }
        }
        other => return Err(NetworkError::InvalidMode(other.to_string())),
    }

    let ping = ping_host(DEFAULT_PING_HOST)?;
    let public_ip = get_public_ip().ok();

    let result = RouteTestResult {
        mode: mode.to_string(),
        avg_ping_ms: ping.avg_ping_ms,
        packet_loss_pct: ping.packet_loss_pct,
        jitter_ms: ping.jitter_ms,
        public_ip,
        tested_at: Utc::now().to_rfc3339(),
    };

    let path = app_data_dir.join(ROUTE_TEST_FILENAME);
    let json = serde_json::to_string_pretty(&result)
        .map_err(|e| NetworkError::RouteTestFailed(e.to_string()))?;
    fs::write(path, json).map_err(|e| NetworkError::RouteTestFailed(e.to_string()))?;

    Ok(result)
}

pub fn load_route_test(app_data_dir: &Path) -> Option<RouteTestResult> {
    let path = app_data_dir.join(ROUTE_TEST_FILENAME);
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn remove_route_test(app_data_dir: &Path) {
    let path = app_data_dir.join(ROUTE_TEST_FILENAME);
    let _ = fs::remove_file(path);
}
