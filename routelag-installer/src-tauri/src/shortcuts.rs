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
    write_lnk(app_exe, &desktop_dir.join("RouteLag.lnk"))
}

pub fn create_start_menu_shortcuts(
    app_exe: &Path,
    uninstall_exe: &Path,
    start_menu_dir: &Path,
) -> Result<(), String> {
    let folder = start_menu_dir.join("RouteLag");
    write_lnk(app_exe, &folder.join("RouteLag.lnk"))?;
    write_lnk(uninstall_exe, &folder.join("Uninstall RouteLag.lnk"))
}

pub fn remove_shortcuts(desktop_dir: &Path, start_menu_dir: &Path) {
    let _ = std::fs::remove_file(desktop_dir.join("RouteLag.lnk"));
    let folder = start_menu_dir.join("RouteLag");
    let _ = std::fs::remove_file(folder.join("RouteLag Beta.lnk"));
    let _ = std::fs::remove_file(folder.join("RouteLag.lnk"));
    let _ = std::fs::remove_file(folder.join("Uninstall RouteLag.lnk"));
    let _ = std::fs::remove_dir(&folder);
}
