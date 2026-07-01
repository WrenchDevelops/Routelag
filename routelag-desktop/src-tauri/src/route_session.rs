use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config::{self, ConfigIdentity};
use crate::route_lag_engine::{RouteLagEngine, RouteLagEngineError, ENGINE_MISSING_MESSAGE};

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
    #[error("{ENGINE_MISSING_MESSAGE}")]
    EngineNotInstalled,
    #[error("RouteLag route sessions are only available on Windows for this beta.")]
    UnsupportedPlatform,
    #[error("Failed to generate RouteLag Engine keys: {0}")]
    KeyGenerationFailed(String),
    #[error("Failed to save route session: {0}")]
    SaveFailed(String),
}

impl From<RouteLagEngineError> for RouteSessionError {
    fn from(value: RouteLagEngineError) -> Self {
        match value {
            RouteLagEngineError::Missing => RouteSessionError::EngineNotInstalled,
            RouteLagEngineError::OperationFailed(message) => {
                RouteSessionError::KeyGenerationFailed(message)
            }
        }
    }
}

pub fn generate_route_keys(engine: &RouteLagEngine) -> Result<RouteKeys, RouteSessionError> {
    #[cfg(not(windows))]
    {
        let _ = engine;
        return Err(RouteSessionError::UnsupportedPlatform);
    }

    #[cfg(windows)]
    {
        let private_key = engine.generate_private_key()?;
        let public_key = engine.public_key_for_private_key(&private_key)?;
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
