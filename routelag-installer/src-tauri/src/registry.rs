//! Mirrors the registry layout the old `installer\includes\registry.nsh` used, so
//! `routelag-desktop/src-tauri/src/install_info.rs` keeps working unchanged. Also adds a
//! machine-wide Add/Remove Programs entry under HKLM, which the HKCU-only NSIS installer never
//! wrote correctly for a machine-wide install.

use winreg::enums::*;
use winreg::RegKey;

use crate::spec::ExistingInstall;

const REG_APP: &str = "Software\\RouteLag";
const REG_UNINST_SUBKEY: &str = "RouteLag Beta";
const REG_UNINST_PARENT: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";

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

/// Written by the elevated worker (HKCU is writable without elevation too, but we keep this in
/// the same privileged step as the HKLM ARP write so a single UAC prompt covers everything).
pub fn write_install_metadata(meta: &InstallMetadata) -> Result<(), String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let (key, _) = hklm
        .create_subkey(REG_APP)
        .or_else(|_| RegKey::predef(HKEY_CURRENT_USER).create_subkey(REG_APP))
        .map_err(|e| e.to_string())?;
    key.set_value("InstallPath", &meta.install_path).map_err(|e| e.to_string())?;
    key.set_value("Version", &meta.version).map_err(|e| e.to_string())?;
    key.set_value("InstallType", &meta.install_type_label).map_err(|e| e.to_string())?;
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
    key.set_value("InstallTypeCode", &meta.install_type).map_err(|e| e.to_string())?;
    key.set_value("InstalledAt", &crate::logging::timestamp()).map_err(|e| e.to_string())?;
    key.set_value("InstallerVersion", &env!("CARGO_PKG_VERSION")).map_err(|e| e.to_string())?;
    key.set_value("Channel", &meta.channel).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_existing_install() -> Option<ExistingInstall> {
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(REG_APP)
        .or_else(|_| RegKey::predef(HKEY_CURRENT_USER).open_subkey(REG_APP))
        .ok()?;
    let install_path: String = key.get_value("InstallPath").ok()?;
    if install_path.trim().is_empty() {
        return None;
    }
    // Only report an install that's actually still on disk (registry can outlive a manual delete).
    let install_root = std::path::Path::new(&install_path);
    if !install_root.join("RouteLag.exe").exists() && !install_root.join("RouteLag Beta.exe").exists() {
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

pub fn write_arp_entry(install_path: &str, version: &str, estimated_size_kb: u32) -> Result<(), String> {
    let key = create_arp_subkey(RegKey::predef(HKEY_LOCAL_MACHINE))
        .or_else(|_| create_arp_subkey(RegKey::predef(HKEY_CURRENT_USER)))
        .map_err(|e| e.to_string())?;

    key.set_value("DisplayName", &"RouteLag Beta").map_err(|e| e.to_string())?;
    key.set_value("DisplayVersion", &version).map_err(|e| e.to_string())?;
    key.set_value("Publisher", &"RouteLag").map_err(|e| e.to_string())?;
    key.set_value("InstallLocation", &install_path).map_err(|e| e.to_string())?;
    key.set_value(
        "UninstallString",
        &format!("\"{install_path}\\uninstall.exe\""),
    )
    .map_err(|e| e.to_string())?;
    key.set_value(
        "DisplayIcon",
        &format!("{install_path}\\RouteLag Beta.exe"),
    )
    .map_err(|e| e.to_string())?;
    key.set_value("EstimatedSize", &estimated_size_kb).map_err(|e| e.to_string())?;
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
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(parent) = hklm.open_subkey_with_flags(REG_UNINST_PARENT, KEY_ALL_ACCESS) {
        let _ = parent.delete_subkey_all(REG_UNINST_SUBKEY);
    }
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(parent) = hkcu.open_subkey_with_flags(REG_UNINST_PARENT, KEY_ALL_ACCESS) {
        let _ = parent.delete_subkey_all(REG_UNINST_SUBKEY);
    }
    Ok(())
}

pub fn remove_app_metadata() -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(REG_APP);
    Ok(())
}
