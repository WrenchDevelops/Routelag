use std::path::{Path, PathBuf};

use crate::spec::{PayloadManifest, ReleaseManifest};

const REMOTE_MANIFEST_URL: &str = "https://routelag.com/downloads/manifest.json";

pub fn load_release_manifest() -> Result<(ReleaseManifest, String), String> {
    if let Some(path) = find_dev_manifest() {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let manifest = serde_json::from_str::<ReleaseManifest>(&text).map_err(|e| e.to_string())?;
        return Ok((manifest, path.display().to_string()));
    }

    let response = reqwest::blocking::get(REMOTE_MANIFEST_URL)
        .map_err(|_| "RouteLag could not reach the download server. Check your connection and try again.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("download server returned {}", response.status()));
    }
    let text = response.text().map_err(|e| e.to_string())?;
    let manifest = serde_json::from_str::<ReleaseManifest>(&text).map_err(|e| e.to_string())?;
    Ok((manifest, REMOTE_MANIFEST_URL.to_string()))
}

pub fn payload_summary_from_release(manifest: &ReleaseManifest) -> PayloadManifest {
    PayloadManifest {
        version: manifest.version.clone(),
        hud_included: manifest.components.hud_runtime.is_some(),
        app_size_bytes: manifest.components.base_app.size_bytes,
        engine_size_bytes: manifest.components.engine.size_bytes,
        hud_size_bytes: manifest
            .components
            .hud_runtime
            .as_ref()
            .map(|c| c.size_bytes)
            .unwrap_or(0),
        channel: Some(manifest.channel.clone()),
        download_required: true,
    }
}

fn find_dev_manifest() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("installer").join("dev-manifest.json"));
        candidates.push(cwd.join("..").join("installer").join("dev-manifest.json"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("installer").join("dev-manifest.json"));
            candidates.push(dir.join("dev-manifest.json"));
        }
    }
    candidates.into_iter().find(|path| Path::new(path).exists())
}
