mod elevate;
mod downloader;
mod fs_ops;
mod install_engine;
mod install_manifest;
mod logging;
mod payload;
mod process_kill;
mod registry;
mod shortcuts;
mod spec;
mod uninstall_engine;
mod verifier;

use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use tauri::{AppHandle, Emitter};

use spec::{AddHudJob, ExistingInstall, InstallJob, Job, PayloadManifest, ProgressLine, UninstallJob};

const PROGRESS_EVENT: &str = "install-progress";

// ─────────────────────────── Frontend-facing commands ───────────────────────────

#[tauri::command]
fn get_mode() -> String {
    match std::env::current_exe() {
        Ok(path) => {
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if stem.contains("uninstall") {
                "uninstall".to_string()
            } else {
                "setup".to_string()
            }
        }
        Err(_) => "setup".to_string(),
    }
}

#[tauri::command]
fn get_manifest() -> Result<PayloadManifest, String> {
    match payload::read_manifest() {
        Ok(mut manifest) => {
            manifest.download_required = false;
            Ok(manifest)
        }
        Err(_) => install_manifest::load_release_manifest()
            .map(|(manifest, _)| install_manifest::payload_summary_from_release(&manifest)),
    }
}

#[tauri::command]
fn has_payload() -> bool {
    payload::has_payload()
}

#[tauri::command]
fn get_existing_install() -> Option<ExistingInstall> {
    registry::read_existing_install()
}

#[tauri::command]
fn default_install_dir() -> String {
    let program_files = std::env::var_os("ProgramFiles").unwrap_or_else(|| "C:\\Program Files".into());
    PathBuf::from(program_files).join("RouteLag").display().to_string()
}

#[tauri::command]
fn browse_install_dir(current: String) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    if !current.trim().is_empty() {
        dialog = dialog.set_directory(&current);
    }
    dialog.pick_folder().map(|path| path.display().to_string())
}

#[tauri::command]
fn get_disk_space(path: String) -> Result<u64, String> {
    use sysinfo::Disks;
    let normalized = path.replace('/', "\\");
    let disks = Disks::new_with_refreshed_list();
    let mut best_match: Option<u64> = None;
    let mut best_len = 0usize;

    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_string();
        if normalized.starts_with(&mount) && mount.len() > best_len {
            best_len = mount.len();
            best_match = Some(disk.available_space());
        }
    }

    best_match.ok_or_else(|| "Could not determine available disk space.".to_string())
}

#[tauri::command]
fn start_install(
    app: AppHandle,
    install_dir: String,
    install_type: String,
    include_app: bool,
    include_engine: bool,
    include_hud: bool,
    include_desktop_shortcut: bool,
    include_start_menu_shortcut: bool,
) -> Result<(), String> {
    let progress_file = temp_file_path("install-progress");
    let job = Job::Install(InstallJob {
        install_dir,
        install_type,
        include_app,
        include_engine,
        include_hud,
        include_desktop_shortcut,
        include_start_menu_shortcut,
        progress_file: progress_file.clone(),
    });
    spawn_worker(app, job, progress_file);
    Ok(())
}

#[tauri::command]
fn start_add_hud(app: AppHandle, install_dir: String) -> Result<(), String> {
    let progress_file = temp_file_path("hud-progress");
    let job = Job::AddHud(AddHudJob {
        install_dir,
        progress_file: progress_file.clone(),
    });
    spawn_worker(app, job, progress_file);
    Ok(())
}

#[tauri::command]
fn start_uninstall(app: AppHandle, install_dir: String, remove_user_data: bool) -> Result<(), String> {
    let progress_file = temp_file_path("uninstall-progress");
    let job = Job::Uninstall(UninstallJob {
        install_dir,
        remove_user_data,
        progress_file: progress_file.clone(),
    });
    spawn_worker(app, job, progress_file);
    Ok(())
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn launch_app(install_dir: String) -> Result<(), String> {
    let dir = PathBuf::from(&install_dir);
    let exe = if dir.join("RouteLag.exe").exists() {
        dir.join("RouteLag.exe")
    } else if dir.join("RouteLag Beta.exe").exists() {
        dir.join("RouteLag Beta.exe")
    } else {
        return Err(format!(
            "RouteLag was not found in {}. The install may be incomplete — try running the installer again.",
            dir.display()
        ));
    };
    std::process::Command::new(&exe)
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("Could not start {}: {e}", exe.display()))?;
    Ok(())
}

// ─────────────────────────── Elevated-worker orchestration ───────────────────────────

fn temp_file_path(prefix: &str) -> String {
    let dir = std::env::temp_dir().join("routelag-installer");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(format!("{prefix}-{}.ndjson", std::process::id()))
        .display()
        .to_string()
}

fn write_job_file(job: &Job) -> Result<String, String> {
    let dir = std::env::temp_dir().join("routelag-installer");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("job-{}.json", std::process::id()));
    let json = serde_json::to_string(job).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn emit_line(app: &AppHandle, line: ProgressLine) {
    let _ = app.emit(PROGRESS_EVENT, line);
}

fn tail_and_emit(app: &AppHandle, progress_file: &str, last_pos: &mut u64) {
    let Ok(mut file) = std::fs::File::open(progress_file) else { return };
    let Ok(len) = file.metadata().map(|m| m.len()) else { return };
    if len <= *last_pos {
        return;
    }
    if file.seek(SeekFrom::Start(*last_pos)).is_err() {
        return;
    }
    let mut buf = String::new();
    if file.read_to_string(&mut buf).is_err() {
        return;
    }
    *last_pos = len;
    for line in buf.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(progress) = serde_json::from_str::<ProgressLine>(line) {
            emit_line(app, progress);
        }
    }
}

/// Spawns a background thread that relaunches this exe elevated (triggering the one UAC prompt),
/// tails the worker's progress file, and forwards each line to the frontend as an
/// `install-progress` event until the worker exits.
fn spawn_worker(app: AppHandle, job: Job, progress_file: String) {
    std::thread::spawn(move || {
        let job_file = match write_job_file(&job) {
            Ok(path) => path,
            Err(error) => {
                emit_line(&app, ProgressLine::finished_err(error));
                return;
            }
        };
        let mut last_pos: u64 = 0;

        if job_needs_elevation(&job) {
            let exe = match std::env::current_exe() {
                Ok(path) => path.display().to_string(),
                Err(error) => {
                    emit_line(&app, ProgressLine::finished_err(error.to_string()));
                    return;
                }
            };
            let args = format!("--elevated-worker \"{job_file}\"");

            match elevate::launch_elevated(&exe, &args) {
                Ok(mut process) => loop {
                    tail_and_emit(&app, &progress_file, &mut last_pos);
                    if process.try_wait(200).is_some() {
                        // Let the worker flush its final line before the last read.
                        std::thread::sleep(std::time::Duration::from_millis(150));
                        tail_and_emit(&app, &progress_file, &mut last_pos);
                        break;
                    }
                },
                Err(elevate::ElevateError::UserDeclined) => {
                    emit_line(
                        &app,
                        ProgressLine::finished_err(
                            "Administrator permission is required to install RouteLag to this location.",
                        ),
                    );
                }
                Err(elevate::ElevateError::Failed(message)) => {
                    emit_line(&app, ProgressLine::finished_err(message));
                }
            }
        } else {
            let _ = run_elevated_worker(&job_file, &[]);
            tail_and_emit(&app, &progress_file, &mut last_pos);
        }

        let _ = std::fs::remove_file(&job_file);
        let _ = std::fs::remove_file(&progress_file);
    });
}

fn job_needs_elevation(job: &Job) -> bool {
    let install_dir = match job {
        Job::Install(install_job) => &install_job.install_dir,
        Job::AddHud(hud_job) => &hud_job.install_dir,
        Job::Uninstall(uninstall_job) => &uninstall_job.install_dir,
    };
    path_requires_admin(install_dir)
}

fn path_requires_admin(path: &str) -> bool {
    let normalized = path.replace('/', "\\").to_lowercase();
    for env_name in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Some(root) = std::env::var_os(env_name) {
            let root = PathBuf::from(root).display().to_string().to_lowercase();
            if normalized.starts_with(&root) {
                return true;
            }
        }
    }
    false
}

/// Entry point used by the `--elevated-worker <job-file>` relaunch (see `elevate.rs`). Runs
/// headlessly — no Tauri window is ever created here.
pub fn run_elevated_worker(job_file: &str, uninstaller_bytes: &[u8]) -> i32 {
    let contents = match std::fs::read_to_string(job_file) {
        Ok(c) => c,
        Err(_) => return 1,
    };
    let job: Job = match serde_json::from_str(&contents) {
        Ok(j) => j,
        Err(_) => return 1,
    };

    let result = match job {
        Job::Install(install_job) => install_engine::run_install(&install_job, uninstaller_bytes),
        Job::AddHud(hud_job) => install_engine::run_add_hud(&hud_job),
        Job::Uninstall(uninstall_job) => uninstall_engine::run_uninstall(&uninstall_job),
    };

    match result {
        Ok(()) => 0,
        Err(_) => 1,
    }
}

/// Entry point for the normal (non-elevated, visible-window) UI process.
pub fn run_ui() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_mode,
            get_manifest,
            has_payload,
            get_existing_install,
            default_install_dir,
            browse_install_dir,
            get_disk_space,
            start_install,
            start_add_hud,
            start_uninstall,
            launch_app,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the RouteLag installer");
}
