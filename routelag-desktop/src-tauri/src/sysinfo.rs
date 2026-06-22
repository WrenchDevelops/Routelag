use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};

use crate::elevation;
use crate::tunnel;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkAdapterInfo {
    pub adapter_name: Option<String>,
    pub connection_type: Option<String>,
}

pub fn get_os_info(app_version: &str) -> OsInfo {
    let _ = app_version;
    OsInfo {
        os_name: detect_os_name(),
        os_version: detect_os_version(),
        cpu_name: detect_cpu_name(),
        ram_total_gb: detect_ram_gb(),
        local_datetime: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        timezone: detect_timezone(),
        is_admin: elevation::is_elevated(),
        wireguard_installed: tunnel::is_wireguard_installed(),
        wireguard_exe_path: tunnel::wireguard_exe_path().map(|p| p.display().to_string()),
    }
}

pub fn get_network_adapter_info() -> NetworkAdapterInfo {
    NetworkAdapterInfo {
        adapter_name: detect_default_adapter(),
        connection_type: detect_connection_type(),
    }
}

fn detect_os_name() -> String {
    std::env::consts::OS.to_string()
}

fn detect_os_version() -> String {
    #[cfg(windows)]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("cmd").args(["/C", "ver"]).output() {
            return String::from_utf8_lossy(&output.stdout).trim().to_string();
        }
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("sw_vers").arg("-productVersion").output() {
            return format!(
                "macOS {}",
                String::from_utf8_lossy(&output.stdout).trim()
            );
        }
    }
    "Unknown".to_string()
}

fn detect_cpu_name() -> Option<String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let output = Command::new("wmic")
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
        use std::process::Command;
        let output = Command::new("wmic")
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
        use std::process::Command;
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceAlias",
            ])
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
        use std::process::Command;
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "$if=Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceAlias; Get-NetAdapter -Name $if | Select-Object -ExpandProperty MediaType",
            ])
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
