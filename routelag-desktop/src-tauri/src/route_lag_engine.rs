use std::path::{Path, PathBuf};
use std::process::Output;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config::TUNNEL_NAME;
use crate::windows_process::{hidden_command, hidden_command_program, hidden_command_program_with_stdin};

pub const ENGINE_MISSING_MESSAGE: &str =
    "Zer0 Engine is missing or damaged. Reinstall Zer0.";
pub const BUNDLED_ENGINE_MISSING_WARNING: &str =
    "Bundled RouteLag Engine binaries are missing from src-tauri/engine/windows.";

#[derive(Debug, Clone)]
pub struct RouteLagEngine {
    search_roots: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteLagEngineStatus {
    pub available: bool,
    pub engine_path: Option<String>,
    pub tools_path: Option<String>,
    pub service_name: String,
    pub service_status: String,
}

#[derive(Debug, Error)]
pub enum RouteLagEngineError {
    #[error("{ENGINE_MISSING_MESSAGE}")]
    Missing,
    #[error("RouteLag Engine operation failed: {0}")]
    OperationFailed(String),
}

impl RouteLagEngine {
    pub fn new(resource_dir: Option<PathBuf>) -> Self {
        let mut search_roots = Vec::new();
        if let Some(resource_dir) = resource_dir {
            search_roots.push(resource_dir.join("engine").join("windows"));
            search_roots.push(resource_dir.join("engine"));
            search_roots.push(resource_dir.join("windows"));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                search_roots.push(parent.join("engine").join("windows"));
                search_roots.push(parent.join("engine"));
                search_roots.push(parent.join("resources").join("engine").join("windows"));
                search_roots.push(parent.join("resources").join("engine"));
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            search_roots.push(cwd.join("engine").join("windows"));
            search_roots.push(cwd.join("engine"));
            search_roots.push(cwd.join("src-tauri").join("engine").join("windows"));
        }
        search_roots.dedup();
        Self { search_roots }
    }

    pub fn is_available(&self) -> bool {
        self.service_binary().is_some() && self.tools_binary().is_some()
    }

    pub fn search_roots(&self) -> &[PathBuf] {
        &self.search_roots
    }

    pub fn service_binary(&self) -> Option<PathBuf> {
        self.find_binary(&[
            "RouteLagEngine.exe",
            "routelag-engine.exe",
            "route-lag-engine.exe",
            "wireguard.exe",
        ])
    }

    pub fn tools_binary(&self) -> Option<PathBuf> {
        self.find_binary(&["routelag-wg.exe", "RouteLagWg.exe", "wg.exe"])
    }

    pub fn generate_private_key(&self) -> Result<String, RouteLagEngineError> {
        let output = self.run_tools(["genkey"])?;
        output_to_string(output)
    }

    pub fn public_key_for_private_key(
        &self,
        private_key: &str,
    ) -> Result<String, RouteLagEngineError> {
        let tools = self.tools_binary().ok_or(RouteLagEngineError::Missing)?;
        let mut child = hidden_command_program_with_stdin(&tools)
            .arg("pubkey")
            .spawn()
            .map_err(|e| RouteLagEngineError::OperationFailed(e.to_string()))?;
        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            stdin
                .write_all(private_key.as_bytes())
                .map_err(|e| RouteLagEngineError::OperationFailed(e.to_string()))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|e| RouteLagEngineError::OperationFailed(e.to_string()))?;
        output_to_string(output)
    }

    pub fn install_route_profile(&self, config_path: &Path) -> Result<(), RouteLagEngineError> {
        let config = config_path.to_string_lossy().to_string();
        let output = self.run_service(["/installtunnelservice", &config])?;
        command_ok_or_already_safe(output, "already installed")
    }

    pub fn uninstall_route_profile(&self, profile_name: &str) -> Result<(), RouteLagEngineError> {
        let output = self.run_service(["/uninstalltunnelservice", profile_name])?;
        command_ok_or_already_safe(output, "does not exist")
    }

    pub fn show_tunnel(&self) -> Option<String> {
        let output = self.run_tools(["show", TUNNEL_NAME]).ok()?;
        if !output.status.success() {
            return None;
        }
        Some(String::from_utf8_lossy(&output.stdout).to_string())
    }

    pub fn service_status_snippet(&self) -> String {
        query_service_state().unwrap_or_else(|| {
            if self.is_available() {
                format!("RouteLag Service {} is not installed.", service_name())
            } else {
                ENGINE_MISSING_MESSAGE.to_string()
            }
        })
    }

    pub fn status(&self) -> RouteLagEngineStatus {
        RouteLagEngineStatus {
            available: self.is_available(),
            engine_path: self.service_binary().map(|path| path.display().to_string()),
            tools_path: self.tools_binary().map(|path| path.display().to_string()),
            service_name: service_name(),
            service_status: self.service_status_snippet(),
        }
    }

    fn run_service<const N: usize>(&self, args: [&str; N]) -> Result<Output, RouteLagEngineError> {
        let service = self.service_binary().ok_or(RouteLagEngineError::Missing)?;
        hidden_command_program(&service)
            .args(args)
            .output()
            .map_err(|e| RouteLagEngineError::OperationFailed(e.to_string()))
    }

    fn run_tools<const N: usize>(&self, args: [&str; N]) -> Result<Output, RouteLagEngineError> {
        let tools = self.tools_binary().ok_or(RouteLagEngineError::Missing)?;
        hidden_command_program(&tools)
            .args(args)
            .output()
            .map_err(|e| RouteLagEngineError::OperationFailed(e.to_string()))
    }

    fn find_binary(&self, names: &[&str]) -> Option<PathBuf> {
        #[cfg(not(windows))]
        {
            let _ = names;
            return None;
        }

        #[cfg(windows)]
        {
            for root in &self.search_roots {
                for name in names {
                    let candidate = root.join(name);
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
            None
        }
    }
}

pub fn service_name() -> String {
    format!("WireGuardTunnel${TUNNEL_NAME}")
}

#[cfg(windows)]
pub fn query_service_state() -> Option<String> {
    let output = hidden_command("sc")
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
pub fn query_service_state() -> Option<String> {
    None
}

fn output_to_string(output: Output) -> Result<String, RouteLagEngineError> {
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if !stderr.trim().is_empty() {
            stderr.to_string()
        } else {
            stdout.to_string()
        };
        return Err(RouteLagEngineError::OperationFailed(msg.trim().to_string()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn command_ok_or_already_safe(
    output: Output,
    already_safe_text: &str,
) -> Result<(), RouteLagEngineError> {
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let msg = if !stderr.trim().is_empty() {
        stderr.to_string()
    } else {
        stdout.to_string()
    };
    let lower = msg.to_lowercase();
    if lower.contains(already_safe_text)
        || lower.contains("1060")
        || lower.contains("not installed")
    {
        return Ok(());
    }
    Err(RouteLagEngineError::OperationFailed(msg.trim().to_string()))
}
