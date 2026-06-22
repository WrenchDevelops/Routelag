use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const PROFILE_FILENAME: &str = "tester-profile.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct TesterProfile {
    pub tester_name: String,
    pub discord_username: String,
    pub state_country: String,
    pub isp: String,
    pub connection_type: String,
    pub normal_fortnite_ping_ms: Option<u32>,
    pub routelag_fortnite_ping_ms: Option<u32>,
    pub fortnite_region: String,
    pub notes: String,
}

#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("Failed to read tester profile: {0}")]
    ReadFailed(String),
    #[error("Failed to save tester profile: {0}")]
    SaveFailed(String),
}

fn profile_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join(PROFILE_FILENAME)
}

pub fn load_profile(app_data_dir: &Path) -> TesterProfile {
    let path = profile_path(app_data_dir);
    if !path.is_file() {
        return TesterProfile::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

pub fn save_profile(app_data_dir: &Path, profile: &TesterProfile) -> Result<(), ProfileError> {
    fs::create_dir_all(app_data_dir).map_err(|e| ProfileError::SaveFailed(e.to_string()))?;
    let json = serde_json::to_string_pretty(profile)
        .map_err(|e| ProfileError::SaveFailed(e.to_string()))?;
    fs::write(profile_path(app_data_dir), json)
        .map_err(|e| ProfileError::SaveFailed(e.to_string()))
}

pub fn profile_is_empty(profile: &TesterProfile) -> bool {
    profile.tester_name.is_empty()
        && profile.discord_username.is_empty()
        && profile.state_country.is_empty()
        && profile.isp.is_empty()
        && profile.connection_type.is_empty()
        && profile.normal_fortnite_ping_ms.is_none()
        && profile.routelag_fortnite_ping_ms.is_none()
        && profile.fortnite_region.is_empty()
        && profile.notes.is_empty()
}
