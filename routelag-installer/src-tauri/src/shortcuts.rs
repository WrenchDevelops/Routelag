//! Pure-Rust `.lnk` creation (no COM, no PowerShell) so shortcut creation can't cause a
//! terminal/console flash.

use mslnk::ShellLink;
use std::path::Path;

fn write_lnk(target: &Path, lnk_path: &Path) -> Result<(), String> {
    if let Some(parent) = lnk_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let link = ShellLink::new(target).map_err(|e| e.to_string())?;
    link.create_lnk(lnk_path).map_err(|e| e.to_string())
}

pub fn create_desktop_shortcut(app_exe: &Path, desktop_dir: &Path) -> Result<(), String> {
    write_lnk(app_exe, &desktop_dir.join("Zer0.lnk"))
}

pub fn create_start_menu_shortcuts(
    app_exe: &Path,
    uninstall_exe: &Path,
    start_menu_dir: &Path,
) -> Result<(), String> {
    let folder = start_menu_dir.join("Zer0");
    write_lnk(app_exe, &folder.join("Zer0.lnk"))?;
    write_lnk(uninstall_exe, &folder.join("Uninstall Zer0.lnk"))
}

pub fn remove_shortcuts(desktop_dir: &Path, start_menu_dir: &Path) {
    for name in ["Zer0.lnk", "RouteLag.lnk"] {
        let _ = std::fs::remove_file(desktop_dir.join(name));
    }
    for folder_name in ["Zer0", "RouteLag"] {
        let folder = start_menu_dir.join(folder_name);
        for name in [
            "Zer0.lnk",
            "Uninstall Zer0.lnk",
            "RouteLag.lnk",
            "RouteLag Beta.lnk",
            "Uninstall RouteLag.lnk",
        ] {
            let _ = std::fs::remove_file(folder.join(name));
        }
        let _ = std::fs::remove_dir(&folder);
    }
}
