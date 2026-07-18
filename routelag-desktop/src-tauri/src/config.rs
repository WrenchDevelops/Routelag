use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const CONFIG_FILENAME: &str = "routelag-engine.conf";
pub const CONFIG_META_FILENAME: &str = "config-meta.json";
pub const TUNNEL_NAME: &str = "routelag-engine";
const LEGACY_CONFIG_FILENAMES: &[&str] = &["routelag-beta.conf"];

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ConfigIdentity {
    pub original_filename: String,
    pub address: Option<String>,
    pub endpoint: Option<String>,
    pub dns: Option<String>,
    pub mtu: Option<u32>,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Zer0 route profile not found. Start Optimization to create one.")]
    NotFound,
    #[error("Invalid Zer0 route profile: missing [Interface] section")]
    MissingInterface,
    #[error("Invalid Zer0 route profile: missing PrivateKey")]
    MissingPrivateKey,
    #[error("Failed to read config: {0}")]
    ReadFailed(String),
    #[error("Failed to write config: {0}")]
    WriteFailed(String),
    #[error("Failed to import config: {0}")]
    ImportFailed(String),
}

pub fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(CONFIG_FILENAME)
}

fn meta_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(CONFIG_META_FILENAME)
}

pub fn has_config(app_data_dir: &Path) -> bool {
    config_path(app_data_dir).is_file()
}

pub fn validate_config_content(content: &str) -> Result<(), ConfigError> {
    if !content.contains("[Interface]") {
        return Err(ConfigError::MissingInterface);
    }
    let has_private_key = content.lines().any(|line| {
        let trimmed = line.trim();
        trimmed.starts_with("PrivateKey") && trimmed.contains('=')
    });
    if !has_private_key {
        return Err(ConfigError::MissingPrivateKey);
    }
    Ok(())
}

pub fn redact_secrets(text: &str) -> String {
    let re = Regex::new(r"(?i)(PrivateKey\s*=\s*)\S+").unwrap();
    re.replace_all(text, "${1}[REDACTED]").to_string()
}

pub fn redact_config(app_data_dir: &Path) -> Result<String, ConfigError> {
    let path = config_path(app_data_dir);
    if !path.is_file() {
        return Err(ConfigError::NotFound);
    }
    let content = fs::read_to_string(&path).map_err(|e| ConfigError::ReadFailed(e.to_string()))?;
    Ok(redact_secrets(&content))
}

fn parse_key_value(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim();
    if trimmed.starts_with('#') || trimmed.starts_with('[') {
        return None;
    }
    let (key, value) = trimmed.split_once('=')?;
    Some((key.trim(), value.trim()))
}

pub fn parse_config_identity(content: &str, original_filename: &str) -> ConfigIdentity {
    let mut in_interface = false;
    let mut in_peer = false;
    let mut address = None;
    let mut dns = None;
    let mut mtu = None;
    let mut endpoint = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "[Interface]" {
            in_interface = true;
            in_peer = false;
            continue;
        }
        if trimmed == "[Peer]" {
            in_peer = true;
            in_interface = false;
            continue;
        }
        if let Some((key, value)) = parse_key_value(trimmed) {
            let key_lower = key.to_lowercase();
            if in_interface {
                match key_lower.as_str() {
                    "address" if address.is_none() => address = Some(value.to_string()),
                    "dns" if dns.is_none() => dns = Some(value.to_string()),
                    "mtu" if mtu.is_none() => mtu = value.parse().ok(),
                    _ => {}
                }
            } else if in_peer {
                if key_lower == "endpoint" && endpoint.is_none() {
                    endpoint = Some(value.to_string());
                }
            }
        }
    }

    ConfigIdentity {
        original_filename: original_filename.to_string(),
        address,
        endpoint,
        dns,
        mtu,
    }
}

pub fn save_config_meta(app_data_dir: &Path, identity: &ConfigIdentity) -> Result<(), ConfigError> {
    let json = serde_json::to_string_pretty(identity)
        .map_err(|e| ConfigError::WriteFailed(e.to_string()))?;
    fs::write(meta_path(app_data_dir), json).map_err(|e| ConfigError::WriteFailed(e.to_string()))
}

pub fn write_generated_config(
    app_data_dir: &Path,
    content: &str,
    identity: &ConfigIdentity,
) -> Result<(), ConfigError> {
    fs::create_dir_all(app_data_dir).map_err(|e| ConfigError::WriteFailed(e.to_string()))?;
    validate_config_content(content)?;
    let dest = config_path(app_data_dir);
    fs::write(&dest, content).map_err(|e| ConfigError::WriteFailed(e.to_string()))?;
    save_config_meta(app_data_dir, identity)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(mut perms) = fs::metadata(&dest).map(|m| m.permissions()) {
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&dest, perms);
        }
    }

    Ok(())
}

pub fn load_config_identity(app_data_dir: &Path) -> Option<ConfigIdentity> {
    let path = meta_path(app_data_dir);
    if !path.is_file() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn get_config_identity(app_data_dir: &Path) -> Option<ConfigIdentity> {
    if let Some(meta) = load_config_identity(app_data_dir) {
        return Some(meta);
    }
    if !has_config(app_data_dir) {
        return None;
    }
    let content = fs::read_to_string(config_path(app_data_dir)).ok()?;
    Some(parse_config_identity(&content, CONFIG_FILENAME))
}

pub fn import_config(app_data_dir: &Path, source_path: &Path) -> Result<(), ConfigError> {
    fs::create_dir_all(app_data_dir).map_err(|e| ConfigError::ImportFailed(e.to_string()))?;

    let content = fs::read_to_string(source_path)
        .map_err(|e| ConfigError::ImportFailed(format!("Cannot read source file: {e}")))?;
    validate_config_content(&content)?;

    let original_filename = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("imported.conf")
        .to_string();

    let identity = parse_config_identity(&content, &original_filename);

    let dest = config_path(app_data_dir);
    fs::write(&dest, &content).map_err(|e| ConfigError::WriteFailed(e.to_string()))?;
    save_config_meta(app_data_dir, &identity)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(mut perms) = fs::metadata(&dest).map(|m| m.permissions()) {
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&dest, perms);
        }
    }

    Ok(())
}

pub fn remove_config(app_data_dir: &Path) -> Result<(), ConfigError> {
    let path = config_path(app_data_dir);
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| ConfigError::WriteFailed(e.to_string()))?;
    }
    for filename in LEGACY_CONFIG_FILENAMES {
        let legacy_path = app_data_dir.join(filename);
        if legacy_path.is_file() {
            let _ = fs::remove_file(legacy_path);
        }
    }
    let meta = meta_path(app_data_dir);
    if meta.is_file() {
        let _ = fs::remove_file(&meta);
    }
    Ok(())
}

pub fn get_server_display_name(app_data_dir: &Path) -> Option<String> {
    if let Some(identity) = get_config_identity(app_data_dir) {
        if !identity.original_filename.is_empty() {
            return Some(identity.original_filename);
        }
    }

    let path = config_path(app_data_dir);
    let content = fs::read_to_string(path).ok()?;

    for line in content.lines() {
        let trimmed = line.trim();
        if (trimmed.starts_with("# RouteLag") || trimmed.starts_with("# Zer0"))
            && trimmed.contains("client config for")
        {
            if let Some(name) = trimmed.split("client config for").nth(1) {
                return Some(name.trim().to_string());
            }
        }
    }

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Endpoint") && trimmed.contains('=') {
            let endpoint = trimmed.split('=').nth(1)?.trim();
            let host = endpoint.split(':').next()?.trim();
            if !host.is_empty() {
                return Some(host.to_string());
            }
        }
    }

    Some("Beta Server".to_string())
}
