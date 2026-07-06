use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::windows_process::hidden_powershell_command;

const BETA_REPORT_FILENAME: &str = "beta-report-latest.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AllowedIpRouteEntry {
    pub allowed_ip: String,
    pub installed: bool,
    pub output: String,
}

/// Auto Route snapshot stored in the beta report.
/// All fields are optional so the report is backward compatible with builds
/// that did not run Auto Route.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AutoRouteSnapshot {
    pub ran_at: Option<String>,
    pub direct_latency_ms: Option<f64>,
    pub direct_jitter_ms: Option<f64>,
    pub direct_loss_pct: Option<f64>,
    pub direct_score: Option<f64>,
    pub recommended_route_id: Option<String>,
    pub recommended_route_label: Option<String>,
    pub recommended_route_score: Option<f64>,
    pub direct_is_better: bool,
    pub chain_routes_estimate_only: bool,
    /// JSON-encoded client-to-node probe results
    #[serde(default)]
    pub client_to_node_measurements: Vec<serde_json::Value>,
    /// JSON-encoded ranked route list
    #[serde(default)]
    pub ranked_routes: Vec<serde_json::Value>,
    #[serde(default)]
    pub reasons: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BetaReportSnapshot {
    pub app_version: String,
    pub api_url: String,
    #[serde(default)]
    pub tester_id: Option<String>,
    #[serde(default)]
    pub invite_code: Option<String>,
    pub selected_game: String,
    pub selected_server: String,
    #[serde(default)]
    pub all_tested_servers: Vec<String>,
    pub allowed_ips_returned: Vec<String>,
    pub route_mode: String,
    pub assigned_tunnel_ip: Option<String>,
    pub session_id: Option<String>,
    pub optimize_start_time: Option<String>,
    pub optimize_end_time: Option<String>,
    pub cleanup_result: Option<String>,
    pub restore_internet_result: Option<String>,
    pub diagnostics_result: Option<String>,
    #[serde(default)]
    pub windows_route_entries_before: Vec<AllowedIpRouteEntry>,
    #[serde(default)]
    pub windows_route_entries_after: Vec<AllowedIpRouteEntry>,
    pub windows_route_entries_for_allowed_ips: Vec<AllowedIpRouteEntry>,
    pub service_leftover_status: Option<String>,
    pub public_ip_before: Option<String>,
    pub public_ip_after: Option<String>,
    pub api_reachability_before: Option<bool>,
    pub api_reachability_after: Option<bool>,
    /// Auto Route results, if the tester ran Auto Route during this session.
    #[serde(default)]
    pub auto_route: Option<AutoRouteSnapshot>,
}

#[derive(Debug, Error)]
pub enum BetaReportError {
    #[error("Failed to save beta report snapshot: {0}")]
    SaveFailed(String),
}

pub fn save_snapshot(
    app_data_dir: &Path,
    report: &BetaReportSnapshot,
) -> Result<(), BetaReportError> {
    fs::create_dir_all(app_data_dir).map_err(|e| BetaReportError::SaveFailed(e.to_string()))?;
    let json = serde_json::to_string_pretty(report)
        .map_err(|e| BetaReportError::SaveFailed(e.to_string()))?;
    fs::write(report_path(app_data_dir), json)
        .map_err(|e| BetaReportError::SaveFailed(e.to_string()))
}

pub fn load_snapshot(app_data_dir: &Path) -> Option<BetaReportSnapshot> {
    let content = fs::read_to_string(report_path(app_data_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

fn report_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(BETA_REPORT_FILENAME)
}

pub fn get_allowed_ip_route_entries(allowed_ips: &[String]) -> Vec<AllowedIpRouteEntry> {
    allowed_ips
        .iter()
        .map(|allowed_ip| route_entry_for_allowed_ip(allowed_ip))
        .collect()
}

#[cfg(windows)]
fn route_entry_for_allowed_ip(allowed_ip: &str) -> AllowedIpRouteEntry {
    if !is_safe_prefix(allowed_ip) {
        return AllowedIpRouteEntry {
            allowed_ip: allowed_ip.to_string(),
            installed: false,
            output: "Skipped unsafe route prefix text.".to_string(),
        };
    }

    let script = format!(
        "Get-NetRoute -DestinationPrefix '{}' -ErrorAction SilentlyContinue | Select-Object DestinationPrefix,InterfaceAlias,NextHop,RouteMetric,Protocol | ConvertTo-Json -Compress",
        allowed_ip
    );
    match hidden_powershell_command(&script).output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let combined = [stdout.as_str(), stderr.as_str()]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            AllowedIpRouteEntry {
                allowed_ip: allowed_ip.to_string(),
                installed: output.status.success() && !stdout.is_empty(),
                output: if combined.is_empty() {
                    "No matching Windows route entry.".to_string()
                } else {
                    combined
                },
            }
        }
        Err(error) => AllowedIpRouteEntry {
            allowed_ip: allowed_ip.to_string(),
            installed: false,
            output: error.to_string(),
        },
    }
}

#[cfg(not(windows))]
fn route_entry_for_allowed_ip(allowed_ip: &str) -> AllowedIpRouteEntry {
    AllowedIpRouteEntry {
        allowed_ip: allowed_ip.to_string(),
        installed: false,
        output: "Windows route verification is only available on Windows.".to_string(),
    }
}

fn is_safe_prefix(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .chars()
            .all(|ch| ch.is_ascii_hexdigit() || matches!(ch, '.' | ':' | '/'))
}
