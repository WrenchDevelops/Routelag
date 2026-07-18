//! Dual-writes Zer0 + legacy RouteLag registry keys so desktop `install_info.rs`
//! dual-read keeps working for upgrades. ARP display name remains Zer0.

use winreg::enums::*;
use winreg::RegKey;

use crate::spec::ExistingInstall;

const REG_APP_ZER0: &str = "Software\\Zer0";
const REG_APP_LEGACY: &str = "Software\\RouteLag";
const REG_UNINST_SUBKEY: &str = "Zer0 Beta";
const REG_UNINST_PARENT: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";

const APP_EXE_CANDIDATES: &[&str] = &["Zer0.exe", "RouteLag.exe", "RouteLag Beta.exe"];

pub struct InstallMetadata {
    pub install_path: String,
    pub version: String,
    pub install_type_label: String,
    pub base_app_installed: bool,
    pub engine_installed: bool,
    pub hud_runtime_installed: bool,
    pub hud_runtime_path: Option<String>,
    pub install_type: u32,
    pub channel: String,
}

fn write_metadata_to_hive(hive: isize, subkey: &str, meta: &InstallMetadata) -> Result<(), String> {
    let root = RegKey::predef(hive);
    let (key, _) = root.create_subkey(subkey).map_err(|e| e.to_string())?;
    key.set_value("InstallPath", &meta.install_path)
        .map_err(|e| e.to_string())?;
    key.set_value("Version", &meta.version)
        .map_err(|e| e.to_string())?;
    key.set_value("InstallType", &meta.install_type_label)
        .map_err(|e| e.to_string())?;
    key.set_value("BaseAppInstalled", &(meta.base_app_installed as u32))
        .map_err(|e| e.to_string())?;
    key.set_value("EngineInstalled", &(meta.engine_installed as u32))
        .map_err(|e| e.to_string())?;
    key.set_value("HudRuntimeInstalled", &(meta.hud_runtime_installed as u32))
        .map_err(|e| e.to_string())?;
    key.set_value(
        "HudRuntimePath",
        &meta.hud_runtime_path.clone().unwrap_or_default(),
    )
    .map_err(|e| e.to_string())?;
    key.set_value("InstallTypeCode", &meta.install_type)
        .map_err(|e| e.to_string())?;
    key.set_value("InstalledAt", &crate::logging::timestamp())
        .map_err(|e| e.to_string())?;
    key.set_value("InstallerVersion", &env!("CARGO_PKG_VERSION"))
        .map_err(|e| e.to_string())?;
    key.set_value("Channel", &meta.channel)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn write_metadata_pair(subkey: &str, meta: &InstallMetadata) -> Result<(), String> {
    write_metadata_to_hive(HKEY_LOCAL_MACHINE, subkey, meta)
        .or_else(|_| write_metadata_to_hive(HKEY_CURRENT_USER, subkey, meta))
}

/// Dual-write: Zer0 first (canonical), then legacy RouteLag for older tools.
pub fn write_install_metadata(meta: &InstallMetadata) -> Result<(), String> {
    write_metadata_pair(REG_APP_ZER0, meta)?;
    // Legacy dual-write — required so pre-Zer0 recovery tools still see InstallPath.
    let _ = write_metadata_pair(REG_APP_LEGACY, meta);
    Ok(())
}

fn read_from_key(subkey: &str) -> Option<ExistingInstall> {
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(subkey)
        .or_else(|_| RegKey::predef(HKEY_CURRENT_USER).open_subkey(subkey))
        .ok()?;
    let install_path: String = key.get_value("InstallPath").ok()?;
    if install_path.trim().is_empty() {
        return None;
    }
    let install_root = std::path::Path::new(&install_path);
    let has_exe = APP_EXE_CANDIDATES
        .iter()
        .any(|name| install_root.join(name).exists());
    if !has_exe {
        return None;
    }
    let version: String = key.get_value("Version").unwrap_or_default();
    let engine_installed: u32 = key.get_value("EngineInstalled").unwrap_or(0);
    let hud_runtime_installed: u32 = key.get_value("HudRuntimeInstalled").unwrap_or(0);
    let hud_runtime_path: String = key.get_value("HudRuntimePath").unwrap_or_default();
    let install_type: u32 = key.get_value("InstallTypeCode").unwrap_or(1);

    Some(ExistingInstall {
        install_path,
        version,
        engine_installed: engine_installed == 1,
        hud_runtime_installed: hud_runtime_installed == 1,
        hud_runtime_path: if hud_runtime_path.trim().is_empty() {
            None
        } else {
            Some(hud_runtime_path)
        },
        install_type,
    })
}

/// Prefer Zer0 registry, fall back to legacy RouteLag.
pub fn read_existing_install() -> Option<ExistingInstall> {
    read_from_key(REG_APP_ZER0).or_else(|| read_from_key(REG_APP_LEGACY))
}

pub fn resolve_app_exe(install_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    for name in APP_EXE_CANDIDATES {
        let path = install_dir.join(name);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

pub fn write_arp_entry(install_path: &str, version: &str, estimated_size_kb: u32) -> Result<(), String> {
    let key = create_arp_subkey(RegKey::predef(HKEY_LOCAL_MACHINE))
        .or_else(|_| create_arp_subkey(RegKey::predef(HKEY_CURRENT_USER)))
        .map_err(|e| e.to_string())?;

    let icon_exe = resolve_app_exe(std::path::Path::new(install_path))
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| format!("{install_path}\\Zer0.exe"));

    key.set_value("DisplayName", &"Zer0 Beta")
        .map_err(|e| e.to_string())?;
    key.set_value("DisplayVersion", &version)
        .map_err(|e| e.to_string())?;
    key.set_value("Publisher", &"Zer0")
        .map_err(|e| e.to_string())?;
    key.set_value("InstallLocation", &install_path)
        .map_err(|e| e.to_string())?;
    key.set_value(
        "UninstallString",
        &format!("\"{install_path}\\uninstall.exe\""),
    )
    .map_err(|e| e.to_string())?;
    key.set_value("DisplayIcon", &icon_exe)
        .map_err(|e| e.to_string())?;
    key.set_value("EstimatedSize", &estimated_size_kb)
        .map_err(|e| e.to_string())?;
    key.set_value("NoModify", &1u32).map_err(|e| e.to_string())?;
    key.set_value("NoRepair", &1u32).map_err(|e| e.to_string())?;
    Ok(())
}

fn create_arp_subkey(root: RegKey) -> Result<RegKey, std::io::Error> {
    let (parent, _) = root.create_subkey(REG_UNINST_PARENT)?;
    let (key, _) = parent.create_subkey(REG_UNINST_SUBKEY)?;
    Ok(key)
}

pub fn remove_arp_entry() -> Result<(), String> {
    for subkey in [REG_UNINST_SUBKEY, "RouteLag Beta"] {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(parent) = hklm.open_subkey_with_flags(REG_UNINST_PARENT, KEY_ALL_ACCESS) {
            let _ = parent.delete_subkey_all(subkey);
        }
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(parent) = hkcu.open_subkey_with_flags(REG_UNINST_PARENT, KEY_ALL_ACCESS) {
            let _ = parent.delete_subkey_all(subkey);
        }
    }
    Ok(())
}

pub fn remove_app_metadata() -> Result<(), String> {
    for subkey in [REG_APP_ZER0, REG_APP_LEGACY] {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let _ = hkcu.delete_subkey_all(subkey);
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let _ = hklm.delete_subkey_all(subkey);
    }
    Ok(())
}
