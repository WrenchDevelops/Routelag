use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config::{self, ConfigIdentity};

const ROUTE_SESSION_FILENAME: &str = "route-session.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteKeys {
    pub private_key: String,
    pub public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedRouteProfile {
    pub session_id: String,
    pub private_key: String,
    pub client_address: String,
    pub server_public_key: String,
    pub endpoint: String,
    pub dns: String,
    pub mtu: u32,
    pub allowed_ips: String,
    pub server_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveRouteSession {
    pub session_id: String,
    pub client_address: String,
    pub endpoint: String,
    pub server_name: String,
}

#[derive(Debug, Error)]
pub enum RouteSessionError {
    #[error("RouteLag Engine tooling is not installed. Install WireGuard for Windows, then try again.")]
    EngineNotInstalled,
    #[error("RouteLag route sessions are only available on Windows for this beta.")]
    UnsupportedPlatform,
    #[error("Failed to generate RouteLag Engine keys: {0}")]
    KeyGenerationFailed(String),
    #[error("Failed to save route session: {0}")]
    SaveFailed(String),
}

pub fn generate_route_keys() -> Result<RouteKeys, RouteSessionError> {
    #[cfg(not(windows))]
    {
        return Err(RouteSessionError::UnsupportedPlatform);
    }

    #[cfg(windows)]
    {
        let wg = wg_exe().ok_or(RouteSessionError::EngineNotInstalled)?;
        let private_output = Command::new(&wg)
            .arg("genkey")
            .output()
            .map_err(|e| RouteSessionError::KeyGenerationFailed(e.to_string()))?;
        if !private_output.status.success() {
            return Err(RouteSessionError::KeyGenerationFailed(
                String::from_utf8_lossy(&private_output.stderr).trim().to_string(),
            ));
        }
        let private_key = String::from_utf8_lossy(&private_output.stdout).trim().to_string();

        let mut child = Command::new(&wg)
            .arg("pubkey")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| RouteSessionError::KeyGenerationFailed(e.to_string()))?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(private_key.as_bytes())
                .map_err(|e| RouteSessionError::KeyGenerationFailed(e.to_string()))?;
        }
        let public_output = child
            .wait_with_output()
            .map_err(|e| RouteSessionError::KeyGenerationFailed(e.to_string()))?;
        if !public_output.status.success() {
            return Err(RouteSessionError::KeyGenerationFailed(
                String::from_utf8_lossy(&public_output.stderr).trim().to_string(),
            ));
        }
        let public_key = String::from_utf8_lossy(&public_output.stdout).trim().to_string();
        Ok(RouteKeys {
            private_key,
            public_key,
        })
    }
}

pub fn save_route_profile(
    app_data_dir: &Path,
    profile: &GeneratedRouteProfile,
) -> Result<(), RouteSessionError> {
    let config_content = format!(
        "# RouteLag Engine profile for {}\n\n[Interface]\nPrivateKey = {}\nAddress = {}\nDNS = {}\nMTU = {}\n\n[Peer]\nPublicKey = {}\nEndpoint = {}\nAllowedIPs = {}\nPersistentKeepalive = 25\n",
        profile.server_name,
        profile.private_key,
        profile.client_address,
        profile.dns,
        profile.mtu,
        profile.server_public_key,
        profile.endpoint,
        profile.allowed_ips
    );
    let identity = ConfigIdentity {
        original_filename: format!("RouteLag Session - {}", profile.server_name),
        address: Some(profile.client_address.clone()),
        endpoint: Some(profile.endpoint.clone()),
        dns: Some(profile.dns.clone()),
        mtu: Some(profile.mtu),
    };
    config::write_generated_config(app_data_dir, &config_content, &identity)
        .map_err(|e| RouteSessionError::SaveFailed(e.to_string()))?;

    let active = ActiveRouteSession {
        session_id: profile.session_id.clone(),
        client_address: profile.client_address.clone(),
        endpoint: profile.endpoint.clone(),
        server_name: profile.server_name.clone(),
    };
    let json = serde_json::to_string_pretty(&active)
        .map_err(|e| RouteSessionError::SaveFailed(e.to_string()))?;
    fs::write(route_session_path(app_data_dir), json)
        .map_err(|e| RouteSessionError::SaveFailed(e.to_string()))?;
    Ok(())
}

pub fn load_active_route_session(app_data_dir: &Path) -> Option<ActiveRouteSession> {
    let path = route_session_path(app_data_dir);
    if !path.is_file() {
        return None;
    }
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn clear_active_route_session(app_data_dir: &Path) -> Result<(), RouteSessionError> {
    let path = route_session_path(app_data_dir);
    if path.is_file() {
        fs::remove_file(path).map_err(|e| RouteSessionError::SaveFailed(e.to_string()))?;
    }
    Ok(())
}

fn route_session_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(ROUTE_SESSION_FILENAME)
}

#[cfg(windows)]
fn wg_exe() -> Option<PathBuf> {
    let candidates = [
        std::env::var("ProgramFiles")
            .ok()
            .map(|p| PathBuf::from(p).join("WireGuard").join("wg.exe")),
        std::env::var("ProgramFiles(x86)")
            .ok()
            .map(|p| PathBuf::from(p).join("WireGuard").join("wg.exe")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
