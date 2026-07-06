use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use crate::process_kill;
use crate::registry;
use crate::shortcuts;
use crate::spec::{ProgressLine, UninstallJob};

const APP_PROCESS_NAME: &str = "RouteLag.exe";

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

    emit(progress_file, ProgressLine::step("stop", "Stopping RouteLag", 5));
    process_kill::kill_by_name(APP_PROCESS_NAME);
    process_kill::kill_by_name("RouteLag Beta.exe");
    process_kill::kill_by_name("RouteLagHUD.exe");

    emit(progress_file, ProgressLine::step("hud", "Removing HUD Runtime", 20));
    let _ = std::fs::remove_dir_all(install_dir.join("hud"));

    emit(progress_file, ProgressLine::step("engine", "Removing RouteLag Engine", 35));
    let _ = std::fs::remove_dir_all(install_dir.join("engine"));

    emit(progress_file, ProgressLine::step("app", "Removing application files", 55));
    let _ = std::fs::remove_dir_all(install_dir.join("resources"));
    let _ = std::fs::remove_file(install_dir.join("install-manifest.json"));
    let _ = std::fs::remove_file(install_dir.join("RouteLag.exe"));
    let _ = std::fs::remove_file(install_dir.join("RouteLag Beta.exe"));

    emit(progress_file, ProgressLine::step("shortcuts", "Removing shortcuts", 70));
    shortcuts::remove_shortcuts(&public_desktop_dir(), &common_start_menu_dir());

    if job.remove_user_data {
        emit(progress_file, ProgressLine::step("userdata", "Removing user data", 80));
        if let Some(local_appdata) = std::env::var_os("LOCALAPPDATA") {
            let _ = std::fs::remove_dir_all(PathBuf::from(&local_appdata).join("RouteLag"));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let _ = std::fs::remove_dir_all(PathBuf::from(&appdata).join("com.routelag.beta"));
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
