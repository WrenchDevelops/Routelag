use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

use crate::elevation;
use crate::route_lag_engine::RouteLagEngine;
use crate::tunnel;
use crate::windows_process::{hidden_command, hidden_powershell_command};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsInfo {
    pub os_name: String,
    pub os_version: String,
    pub cpu_name: Option<String>,
    pub ram_total_gb: Option<f64>,
    pub local_datetime: String,
    pub timezone: String,
    pub is_admin: bool,
    pub wireguard_installed: bool,
    pub wireguard_exe_path: Option<String>,
    pub route_lag_engine_available: bool,
    pub route_lag_engine_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkAdapterInfo {
    pub adapter_name: Option<String>,
    pub connection_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FortniteReplay {
    pub name: String,
    pub path: String,
    pub modified_at: String,
    pub size_bytes: u64,
}

pub fn get_os_info(app_version: &str, engine: &RouteLagEngine) -> OsInfo {
    let _ = app_version;
    let engine_available = tunnel::is_route_lag_engine_available(engine);
    let engine_path = tunnel::route_lag_engine_path(engine).map(|p| p.display().to_string());
    OsInfo {
        os_name: detect_os_name(),
        os_version: detect_os_version(),
        cpu_name: detect_cpu_name(),
        ram_total_gb: detect_ram_gb(),
        local_datetime: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        timezone: detect_timezone(),
        is_admin: elevation::is_elevated(),
        wireguard_installed: engine_available,
        wireguard_exe_path: engine_path.clone(),
        route_lag_engine_available: engine_available,
        route_lag_engine_path: engine_path,
    }
}

pub fn get_network_adapter_info() -> NetworkAdapterInfo {
    NetworkAdapterInfo {
        adapter_name: detect_default_adapter(),
        connection_type: detect_connection_type(),
    }
}

pub fn list_fortnite_replays() -> Vec<FortniteReplay> {
    let Some(dir) = fortnite_replay_dir() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    // Keep only the newest 5 while scanning so large demo folders stay cheap.
    let mut top: Vec<(SystemTime, FortniteReplay)> = Vec::with_capacity(5);
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_replay = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("replay"))
            .unwrap_or(false);
        if !is_replay {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let replay = FortniteReplay {
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Fortnite replay")
                .to_string(),
            path: path.display().to_string(),
            modified_at: chrono::DateTime::<Local>::from(modified)
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            size_bytes: metadata.len(),
        };

        if top.len() < 5 {
            top.push((modified, replay));
            top.sort_by(|a, b| b.0.cmp(&a.0));
            continue;
        }
        if modified > top[4].0 {
            top[4] = (modified, replay);
            top.sort_by(|a, b| b.0.cmp(&a.0));
        }
    }

    top.into_iter().map(|(_, replay)| replay).collect()
}

fn fortnite_replay_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|root| root.join("FortniteGame").join("Saved").join("Demos"))
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn detect_os_name() -> String {
    std::env::consts::OS.to_string()
}

fn detect_os_version() -> String {
    #[cfg(windows)]
    {
        if let Ok(output) = hidden_command("cmd").args(["/C", "ver"]).output() {
            return String::from_utf8_lossy(&output.stdout).trim().to_string();
        }
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("sw_vers").arg("-productVersion").output() {
            return format!("macOS {}", String::from_utf8_lossy(&output.stdout).trim());
        }
    }
    "Unknown".to_string()
}

fn detect_cpu_name() -> Option<String> {
    #[cfg(windows)]
    {
        let output = hidden_command("wmic")
            .args(["cpu", "get", "name"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        text.lines()
            .map(str::trim)
            .find(|l| !l.is_empty() && !l.eq_ignore_ascii_case("Name"))
            .map(|s| s.to_string())
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn detect_ram_gb() -> Option<f64> {
    #[cfg(windows)]
    {
        let output = hidden_command("wmic")
            .args(["computersystem", "get", "TotalPhysicalMemory"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let bytes: u64 = text
            .lines()
            .map(str::trim)
            .find(|l| l.chars().all(|c| c.is_ascii_digit()))
            .and_then(|l| l.parse().ok())?;
        Some(bytes as f64 / 1_073_741_824.0)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn detect_timezone() -> String {
    Utc::now().format("%Z").to_string()
}

fn detect_default_adapter() -> Option<String> {
    #[cfg(windows)]
    {
        let output = hidden_powershell_command(
            "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceAlias",
        )
            .output()
            .ok()?;
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn detect_connection_type() -> Option<String> {
    #[cfg(windows)]
    {
        let output = hidden_powershell_command(
            "$if=Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceAlias; Get-NetAdapter -Name $if | Select-Object -ExpandProperty MediaType",
        )
            .output()
            .ok()?;
        let t = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}
