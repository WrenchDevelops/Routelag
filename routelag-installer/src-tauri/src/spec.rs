use serde::{Deserialize, Serialize};

/// What the elevated worker should do. Kept intentionally small/serializable so it can be
/// written to a temp "job file" and handed to a `--elevated-worker` relaunch of this same exe.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind")]
pub enum Job {
    /// Fresh install or reinstall of the selected components into `install_dir`.
    Install(InstallJob),
    /// Add just the HUD Runtime component to an already-installed Zer0.
    AddHud(AddHudJob),
    /// Remove an existing install.
    Uninstall(UninstallJob),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstallJob {
    pub install_dir: String,
    pub install_type: String, // "standard" | "full" | "custom" | "hud_only"
    pub include_app: bool,
    pub include_engine: bool,
    pub include_hud: bool,
    pub include_desktop_shortcut: bool,
    pub include_start_menu_shortcut: bool,
    pub progress_file: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AddHudJob {
    pub install_dir: String,
    pub progress_file: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UninstallJob {
    pub install_dir: String,
    pub remove_user_data: bool,
    pub progress_file: String,
}

/// One line of NDJSON written to the progress file by the elevated worker and tailed by the
/// non-elevated UI process, then forwarded to the frontend as a Tauri event.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProgressLine {
    pub step: String,
    pub message: String,
    pub percent: u8,
    #[serde(default)]
    pub current_component: Option<String>,
    #[serde(default)]
    pub file_name: Option<String>,
    #[serde(default)]
    pub downloaded_bytes: Option<u64>,
    #[serde(default)]
    pub total_bytes: Option<u64>,
    #[serde(default)]
    pub bytes_per_second: Option<u64>,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub success: bool,
    #[serde(default)]
    pub error: Option<String>,
}

impl ProgressLine {
    pub fn step(step: &str, message: &str, percent: u8) -> Self {
        Self {
            step: step.to_string(),
            message: message.to_string(),
            percent,
            current_component: None,
            file_name: None,
            downloaded_bytes: None,
            total_bytes: None,
            bytes_per_second: None,
            done: false,
            success: false,
            error: None,
        }
    }

    pub fn finished_ok() -> Self {
        Self {
            step: "done".into(),
            message: "Finalizing".into(),
            percent: 100,
            current_component: None,
            file_name: None,
            downloaded_bytes: None,
            total_bytes: None,
            bytes_per_second: None,
            done: true,
            success: true,
            error: None,
        }
    }

    pub fn finished_err(message: impl Into<String>) -> Self {
        Self {
            step: "error".into(),
            message: "Installation failed".into(),
            percent: 0,
            current_component: None,
            file_name: None,
            downloaded_bytes: None,
            total_bytes: None,
            bytes_per_second: None,
            done: true,
            success: false,
            error: Some(message.into()),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub current_component: String,
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
}

impl ProgressLine {
    pub fn download(message: &str, percent: u8, progress: DownloadProgress) -> Self {
        Self {
            step: "download".to_string(),
            message: message.to_string(),
            percent,
            current_component: Some(progress.current_component),
            file_name: Some(progress.file_name),
            downloaded_bytes: Some(progress.downloaded_bytes),
            total_bytes: Some(progress.total_bytes),
            bytes_per_second: Some(progress.bytes_per_second),
            done: false,
            success: false,
            error: None,
        }
    }
}

/// Manifest baked into the payload archive at packaging time (`packaging/build-installer.ps1`),
/// read by the non-elevated UI without needing elevation (it's just reading our own exe file).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PayloadManifest {
    pub version: String,
    pub hud_included: bool,
    pub app_size_bytes: u64,
    pub engine_size_bytes: u64,
    pub hud_size_bytes: u64,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub download_required: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReleaseManifest {
    pub version: String,
    #[serde(default)]
    pub channel: String,
    pub components: ReleaseComponents,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseComponents {
    pub base_app: ReleaseComponent,
    pub engine: ReleaseComponent,
    #[serde(default)]
    pub hud_runtime: Option<ReleaseComponent>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseComponent {
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub size_bytes: u64,
}

/// Snapshot of an existing install, read from the registry (non-elevated: HKCU is always
/// readable/writable by the current user).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExistingInstall {
    pub install_path: String,
    pub version: String,
    pub engine_installed: bool,
    pub hud_runtime_installed: bool,
    pub hud_runtime_path: Option<String>,
    pub install_type: u32,
}
