use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use crate::process_kill;
use crate::registry;
use crate::shortcuts;
use crate::spec::{ProgressLine, UninstallJob};

const APP_PROCESS_NAMES: &[&str] = &["Zer0.exe", "RouteLag.exe", "RouteLag Beta.exe"];

fn emit(progress_file: &str, line: ProgressLine) {
    let Ok(json) = serde_json::to_string(&line) else { return };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(progress_file) {
        let _ = writeln!(file, "{json}");
        let _ = file.flush();
    }
}

fn public_desktop_dir() -> PathBuf {
    let public = std::env::var_os("PUBLIC").unwrap_or_else(|| "C:\\Users\\Public".into());
    PathBuf::from(public).join("Desktop")
}

fn common_start_menu_dir() -> PathBuf {
    let program_data = std::env::var_os("ProgramData").unwrap_or_else(|| "C:\\ProgramData".into());
    PathBuf::from(program_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
}

pub fn run_uninstall(job: &UninstallJob) -> Result<(), String> {
    let result = run_uninstall_inner(job);
    match &result {
        Ok(()) => {
            crate::logging::append("uninstall complete");
            emit(&job.progress_file, ProgressLine::finished_ok());
        }
        Err(error) => {
            crate::logging::append(&format!("uninstall FAILED: {error}"));
            emit(&job.progress_file, ProgressLine::finished_err(error.clone()));
        }
    }
    result
}

fn run_uninstall_inner(job: &UninstallJob) -> Result<(), String> {
    let install_dir = PathBuf::from(&job.install_dir);
    let progress_file = job.progress_file.as_str();

    emit(progress_file, ProgressLine::step("stop", "Stopping Zer0", 5));
    for name in APP_PROCESS_NAMES {
        process_kill::kill_by_name(name);
    }
    process_kill::kill_by_name("RouteLagHUD.exe");
    process_kill::kill_by_name("Zer0HUD.exe");

    // Disconnect owned tunnels BEFORE deleting engine binaries so uninstall can use them.
    // Only Zer0/RouteLag profile names are touched — never unrelated WireGuard/VPN software.
    emit(
        progress_file,
        ProgressLine::step("network", "Disconnecting Zer0 networking", 12),
    );
    crate::network_cleanup::disconnect_owned_networking(Some(&install_dir));

    emit(progress_file, ProgressLine::step("hud", "Removing HUD Runtime", 20));
    let _ = std::fs::remove_dir_all(install_dir.join("hud"));

    emit(progress_file, ProgressLine::step("engine", "Removing Zer0 Engine", 35));
    let _ = std::fs::remove_dir_all(install_dir.join("engine"));

    emit(progress_file, ProgressLine::step("app", "Removing application files", 55));
    let _ = std::fs::remove_dir_all(install_dir.join("resources"));
    let _ = std::fs::remove_file(install_dir.join("install-manifest.json"));
    for name in APP_PROCESS_NAMES {
        let _ = std::fs::remove_file(install_dir.join(name));
    }

    emit(progress_file, ProgressLine::step("shortcuts", "Removing shortcuts", 70));
    shortcuts::remove_shortcuts(&public_desktop_dir(), &common_start_menu_dir());

    if job.remove_user_data {
        emit(progress_file, ProgressLine::step("userdata", "Removing user data", 80));
        if let Some(local_appdata) = std::env::var_os("LOCALAPPDATA") {
            let local = PathBuf::from(&local_appdata);
            let _ = std::fs::remove_dir_all(local.join("Zer0"));
            let _ = std::fs::remove_dir_all(local.join("RouteLag"));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let roaming = PathBuf::from(&appdata);
            let _ = std::fs::remove_dir_all(roaming.join("com.zer0.app"));
            let _ = std::fs::remove_dir_all(roaming.join("com.routelag.beta"));
            let _ = std::fs::remove_dir_all(roaming.join("Zer0"));
            let _ = std::fs::remove_dir_all(roaming.join("RouteLag"));
        }
    }

    emit(progress_file, ProgressLine::step("registry", "Removing registry entries", 90));
    let _ = registry::remove_arp_entry();
    let _ = registry::remove_app_metadata();

    emit(progress_file, ProgressLine::step("finalize", "Finalizing", 97));
    // Best-effort self-delete: NTFS allows removing a running exe (the file is unlinked once the
    // last handle closes, i.e. when this process exits), then the leftover empty folder.
    if let Ok(current_exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(current_exe);
    }
    let _ = std::fs::remove_file(install_dir.join("uninstall.exe"));
    let _ = std::fs::remove_dir(&install_dir);

    Ok(())
}
