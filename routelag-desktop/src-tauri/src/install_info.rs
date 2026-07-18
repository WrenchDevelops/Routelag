use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Current shipped executable (RouteLag-era package identity).
const HUD_EXE_LEGACY: &str = "RouteLagHUD.exe";
/// Proposed Zer0 executable name after package migration (see docs/HUD_IDENTITY_MIGRATION.md).
const HUD_EXE_ZER0: &str = "Zer0HUD.exe";

const HUD_EXE_CANDIDATES: &[&str] = &[HUD_EXE_LEGACY, HUD_EXE_ZER0];

fn hud_exe_in(dir: &Path) -> Option<PathBuf> {
    for name in HUD_EXE_CANDIDATES {
        let path = dir.join(name);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn dir_has_hud_exe(dir: &Path) -> bool {
    hud_exe_in(dir).is_some()
}

/// Everything the frontend needs to know about the current installation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallInfo {
    /// HUD Runtime .exe is present and executable.
    pub hud_installed: bool,
    /// Path to the HUD directory (may be empty if not installed).
    pub hud_path: Option<String>,
    /// HUD binary exists but appears damaged (dir found, exe missing).
    pub hud_corrupt: bool,
    /// RouteLag Engine .exe is present.
    pub engine_installed: bool,
    pub engine_path: Option<String>,
    /// Install path from registry (empty when sideloaded/portable).
    pub install_path: Option<String>,
    /// Version written by installer (may differ from running binary in repair scenarios).
    pub installed_version: Option<String>,
    /// How installation was detected: "registry" | "filesystem" | "dev" | "unknown".
    pub detection_method: String,
}

/// Read installation metadata without panicking on any missing optional data.
pub fn get_install_info(app_data_dir: &std::path::Path) -> InstallInfo {
    let candidates = install_candidates(app_data_dir);

    #[cfg(windows)]
    let (install_path, installed_version, hud_path_reg) = read_registry();

    #[cfg(not(windows))]
    let (install_path, installed_version, hud_path_reg) =
        (None::<String>, None::<String>, None::<String>);

    let manifest_info = install_path
        .as_deref()
        .and_then(|path| read_local_manifest(&PathBuf::from(path)))
        .or_else(|| candidates.iter().find_map(|dir| read_local_manifest(dir)));

    let engine_installed;
    let engine_path;
    {
        let found = candidates
            .iter()
            .find(|dir| {
                dir.join("engine").join("RouteLagEngine.exe").exists()
                    || dir.join("engine").join("wireguard.exe").exists()
            })
            .map(|dir| dir.join("engine"));

        engine_installed = found.is_some();
        engine_path = found.map(|p| p.display().to_string());
    }

    let dev_hud = find_dev_hud_dir();
    let hud_dir = resolve_hud_dir(
        hud_path_reg.as_deref(),
        manifest_info
            .as_ref()
            .and_then(|m| m.hud_runtime_path.as_deref()),
        &candidates,
        dev_hud.as_deref(),
        app_data_dir,
    );

    let hud_exe_exists = hud_dir.as_ref().map(|dir| dir_has_hud_exe(dir)).unwrap_or(false);

    let hud_dir_exists = hud_dir.as_ref().map(|d| d.exists()).unwrap_or(false);

    let hud_corrupt = hud_dir_exists && !hud_exe_exists;
    let hud_installed = hud_exe_exists;
    let hud_path = if hud_dir_exists {
        hud_dir.map(|p| p.display().to_string())
    } else {
        None
    };

    let detection_method = if dev_hud.is_some() && hud_installed {
        "dev".to_string()
    } else if install_path.is_some() {
        "registry".to_string()
    } else if engine_installed || hud_installed {
        "filesystem".to_string()
    } else {
        "unknown".to_string()
    };

    InstallInfo {
        hud_installed,
        hud_path,
        hud_corrupt,
        engine_installed,
        engine_path,
        install_path,
        installed_version: installed_version
            .or_else(|| manifest_info.as_ref().map(|m| m.version.clone())),
        detection_method,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalInstallManifest {
    version: String,
    hud_runtime_path: Option<String>,
}

fn read_local_manifest(install_dir: &std::path::Path) -> Option<LocalInstallManifest> {
    let path = install_dir.join("install-manifest.json");
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn resolve_hud_dir(
    registry_hud: Option<&str>,
    manifest_hud: Option<&str>,
    install_dirs: &[PathBuf],
    dev_hud: Option<&Path>,
    app_data_dir: &Path,
) -> Option<PathBuf> {
    if let Some(path) = registry_hud {
        let dir = PathBuf::from(path);
        if dir_has_hud_exe(&dir) {
            return Some(dir);
        }
        if dir.exists() {
            return Some(dir);
        }
    }

    if let Some(path) = manifest_hud {
        let file = PathBuf::from(path);
        if file.exists() {
            return file.parent().map(Path::to_path_buf);
        }
        // Manifest may point at a directory.
        if dir_has_hud_exe(&file) {
            return Some(file);
        }
    }

    for local_hud in local_hud_install_dirs(app_data_dir) {
        if dir_has_hud_exe(&local_hud) {
            return Some(local_hud);
        }
    }

    for dir in install_dirs {
        let nested = dir.join("hud");
        if dir_has_hud_exe(&nested) {
            return Some(nested);
        }
        if dir_has_hud_exe(dir) {
            return Some(dir.clone());
        }
    }

    if let Some(dir) = dev_hud {
        if dir_has_hud_exe(dir) {
            return Some(dir.to_path_buf());
        }
    }

    None
}

fn local_hud_install_dirs(app_data_dir: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        // Prefer legacy RouteLag path first (installed users), then Zer0.
        dirs.push(PathBuf::from(&local).join("RouteLag").join("hud"));
        dirs.push(PathBuf::from(local).join("Zer0").join("hud"));
    }
    dirs.push(app_data_dir.join("hud"));
    dirs
}

fn local_hud_install_dir(app_data_dir: &Path) -> PathBuf {
    local_hud_install_dirs(app_data_dir)
        .into_iter()
        .find(|dir| dir_has_hud_exe(dir))
        .unwrap_or_else(|| {
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                PathBuf::from(local).join("Zer0").join("hud")
            } else {
                app_data_dir.join("hud")
            }
        })
}

fn find_dev_hud_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(
            cwd.join("..")
                .join("routelag-hud")
                .join("build")
                .join("win-unpacked"),
        );
        candidates.push(
            cwd.join("..")
                .join("routelag-hud")
                .join("dist")
                .join("win-unpacked"),
        );
        candidates.push(
            cwd.join("routelag-hud")
                .join("build")
                .join("win-unpacked"),
        );
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(
        manifest
            .join("..")
            .join("..")
            .join("routelag-hud")
            .join("build")
            .join("win-unpacked"),
    );
    candidates.push(
        manifest
            .join("..")
            .join("..")
            .join("routelag-hud")
            .join("dist")
            .join("win-unpacked"),
    );

    candidates
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .find(|path| dir_has_hud_exe(path))
}

/// Ordered list of directories to search for installed files.
fn install_candidates(app_data_dir: &std::path::Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.to_path_buf());
        }
    }

    if let Some(prog_files) = std::env::var_os("PROGRAMFILES") {
        dirs.push(PathBuf::from(&prog_files).join("Zer0"));
        dirs.push(PathBuf::from(prog_files).join("RouteLag"));
    }
    if let Some(prog_files) = std::env::var_os("PROGRAMFILES(X86)") {
        dirs.push(PathBuf::from(&prog_files).join("Zer0"));
        dirs.push(PathBuf::from(prog_files).join("RouteLag"));
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        dirs.push(PathBuf::from(&local).join("Programs").join("Zer0"));
        dirs.push(PathBuf::from(&local).join("Programs").join("RouteLag"));
        dirs.push(PathBuf::from(&local).join("Zer0"));
        dirs.push(PathBuf::from(local).join("RouteLag"));
    }

    if let Some(parent) = app_data_dir.parent() {
        dirs.push(parent.to_path_buf());
    }

    dirs.dedup();
    dirs
}

#[cfg(windows)]
fn read_registry() -> (Option<String>, Option<String>, Option<String>) {
    let install_path = reg_read_str(
        windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
        "Software\\Zer0\0",
        "InstallPath\0",
    )
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE,
            "Software\\Zer0\0",
            "InstallPath\0",
        )
    })
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
            "Software\\RouteLag\0",
            "InstallPath\0",
        )
    })
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE,
            "Software\\RouteLag\0",
            "InstallPath\0",
        )
    });
    let version = reg_read_str(
        windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
        "Software\\Zer0\0",
        "Version\0",
    )
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE,
            "Software\\Zer0\0",
            "Version\0",
        )
    })
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
            "Software\\RouteLag\0",
            "Version\0",
        )
    })
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE,
            "Software\\RouteLag\0",
            "Version\0",
        )
    });
    let hud_path = reg_read_str(
        windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
        "Software\\Zer0\0",
        "HudRuntimePath\0",
    )
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE,
            "Software\\Zer0\0",
            "HudRuntimePath\0",
        )
    })
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
            "Software\\RouteLag\0",
            "HudRuntimePath\0",
        )
    })
    .or_else(|| {
        reg_read_str(
            windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE,
            "Software\\RouteLag\0",
            "HudRuntimePath\0",
        )
    });
    (install_path, version, hud_path)
}

#[cfg(windows)]
fn reg_read_str(
    hive: windows_sys::Win32::System::Registry::HKEY,
    subkey: &str,
    value: &str,
) -> Option<String> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, KEY_READ, REG_SZ,
    };

    let subkey_wide: Vec<u16> = subkey.encode_utf16().collect();
    let value_wide: Vec<u16> = value.encode_utf16().collect();

    unsafe {
        let mut hkey = std::ptr::null_mut();
        let status = RegOpenKeyExW(hive, subkey_wide.as_ptr(), 0, KEY_READ, &mut hkey);
        if status != 0 {
            return None;
        }

        let mut data_type: u32 = 0;
        let mut buf_size: u32 = 0;
        let status = RegQueryValueExW(
            hkey,
            value_wide.as_ptr(),
            std::ptr::null(),
            &mut data_type,
            std::ptr::null_mut(),
            &mut buf_size,
        );
        if status != 0 || data_type != REG_SZ {
            RegCloseKey(hkey);
            return None;
        }

        let mut buf: Vec<u16> = vec![0u16; (buf_size / 2) as usize + 1];
        let status = RegQueryValueExW(
            hkey,
            value_wide.as_ptr(),
            std::ptr::null(),
            &mut data_type,
            buf.as_mut_ptr() as *mut u8,
            &mut buf_size,
        );
        RegCloseKey(hkey);
        if status != 0 {
            return None;
        }

        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    }
}

/// Tauri command: returns installation info to the frontend.
#[tauri::command]
pub fn get_install_info_cmd(state: tauri::State<'_, crate::AppState>) -> InstallInfo {
    get_install_info(&state.app_data_dir)
}

/// Tauri command: install or launch the HUD runtime.
#[tauri::command]
pub fn launch_hud_installer_cmd(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    if let Some(hud_dir) = resolve_hud_dir(
        None,
        None,
        &install_candidates(&state.app_data_dir),
        find_dev_hud_dir().as_deref(),
        &state.app_data_dir,
    ) {
        if dir_has_hud_exe(&hud_dir) {
            return launch_hud_exe(&hud_dir);
        }
    }

    let installer_candidates = [
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
            .map(|p| {
                p.join("..")
                    .join("installers")
                    .join("Zer0-Beta-Full-Setup.exe")
            }),
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("Zer0-Beta-Full-Setup.exe")),
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
            .map(|p| {
                p.join("..")
                    .join("installers")
                    .join("RouteLag-Beta-Full-Setup.exe")
            }),
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("RouteLag-Beta-Full-Setup.exe")),
        std::env::var_os("PROGRAMFILES")
            .map(|pf| PathBuf::from(pf).join("Zer0").join("Zer0-Beta-Full-Setup.exe")),
        std::env::var_os("PROGRAMFILES").map(|pf| {
            PathBuf::from(pf)
                .join("RouteLag")
                .join("RouteLag-Beta-Full-Setup.exe")
        }),
    ];

    for candidate in installer_candidates.into_iter().flatten() {
        if candidate.exists() {
            std::process::Command::new(&candidate)
                .spawn()
                .map_err(|e| format!("Failed to launch installer: {e}"))?;
            return Ok(());
        }
    }

    let dev_source = find_dev_hud_dir().ok_or_else(|| {
        "HUD Runtime not found. Install the free Zer0 HUD (Overwolf) app, or build it with: cd routelag-hud && npm.cmd run package".to_string()
    })?;
    install_hud_from_dir(&dev_source, &local_hud_install_dir(&state.app_data_dir))?;
    launch_hud_exe(&local_hud_install_dir(&state.app_data_dir))
}

fn launch_hud_exe(hud_dir: &Path) -> Result<(), String> {
    let exe = hud_exe_in(hud_dir).ok_or_else(|| {
        format!(
            "HUD Runtime not found at {} (looked for {} / {})",
            hud_dir.display(),
            HUD_EXE_LEGACY,
            HUD_EXE_ZER0
        )
    })?;
    // Detached spawn: HUD must outlive Zer0 desktop. Do not attach to a job object.
    std::process::Command::new(&exe)
        .current_dir(hud_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch HUD Runtime: {e}"))?;
    Ok(())
}

fn install_hud_from_dir(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        std::fs::remove_dir_all(target)
            .map_err(|e| format!("Could not replace existing HUD install: {e}"))?;
    }
    std::fs::create_dir_all(target)
        .map_err(|e| format!("Could not create HUD install folder: {e}"))?;
    copy_dir_recursive(source, target)
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target)
        .map_err(|e| format!("Could not create {}: {e}", target.display()))?;
    for entry in std::fs::read_dir(source)
        .map_err(|e| format!("Could not read {}: {e}", source.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Could not inspect {}: {e}", entry.path().display()))?;
        let dest = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest)
                .map_err(|e| format!("Could not copy {}: {e}", entry.path().display()))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detects_legacy_routelag_hud_exe() {
        let dir = std::env::temp_dir().join(format!("zer0-hud-legacy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(HUD_EXE_LEGACY), b"stub").unwrap();
        assert!(dir_has_hud_exe(&dir));
        assert_eq!(
            hud_exe_in(&dir).unwrap().file_name().unwrap(),
            HUD_EXE_LEGACY
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn detects_zer0_hud_exe() {
        let dir = std::env::temp_dir().join(format!("zer0-hud-new-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(HUD_EXE_ZER0), b"stub").unwrap();
        assert!(dir_has_hud_exe(&dir));
        assert_eq!(
            hud_exe_in(&dir).unwrap().file_name().unwrap(),
            HUD_EXE_ZER0
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn prefers_legacy_exe_when_both_present() {
        let dir = std::env::temp_dir().join(format!("zer0-hud-both-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(HUD_EXE_LEGACY), b"legacy").unwrap();
        fs::write(dir.join(HUD_EXE_ZER0), b"zer0").unwrap();
        assert_eq!(
            hud_exe_in(&dir).unwrap().file_name().unwrap(),
            HUD_EXE_LEGACY
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
