//! Runs entirely inside the elevated worker process (see `elevate.rs`). No console output, no
//! subprocesses, no visible window — just file/registry/shortcut operations plus a progress feed
//! written to a temp file that the non-elevated UI process tails.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::downloader;
use crate::fs_ops;
use crate::install_manifest;
use crate::payload;
use crate::process_kill;
use crate::registry::{self, InstallMetadata};
use crate::shortcuts;
use crate::spec::{AddHudJob, InstallJob, ProgressLine};

const APP_PROCESS_NAMES: &[&str] = &["Zer0.exe", "RouteLag.exe", "RouteLag Beta.exe"];

fn emit(progress_file: &str, line: ProgressLine) {
    let Ok(json) = serde_json::to_string(&line) else { return };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(progress_file) {
        let _ = writeln!(file, "{json}");
        let _ = file.flush();
    }
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            total += dir_size(&entry.path());
        } else {
            total += meta.len();
        }
    }
    total
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

pub fn run_install(job: &InstallJob, uninstaller_bytes: &[u8]) -> Result<(), String> {
    let result = run_install_inner(job, uninstaller_bytes);
    match &result {
        Ok(()) => {
            crate::logging::append(&format!("install complete -> {}", job.install_dir));
            emit(&job.progress_file, ProgressLine::finished_ok());
        }
        Err(error) => {
            crate::logging::append(&format!("install FAILED: {error}"));
            emit(&job.progress_file, ProgressLine::finished_err(error.clone()));
        }
    }
    result
}

fn run_install_inner(job: &InstallJob, uninstaller_bytes: &[u8]) -> Result<(), String> {
    if should_use_embedded_payload(job) {
        return run_embedded_install_inner(job, uninstaller_bytes);
    }
    run_online_install_inner(job, uninstaller_bytes)
}

fn run_embedded_install_inner(job: &InstallJob, uninstaller_bytes: &[u8]) -> Result<(), String> {
    let install_dir = PathBuf::from(&job.install_dir);
    let progress_file = job.progress_file.as_str();

    emit(progress_file, ProgressLine::step("prepare", "Preparing files", 3));
    for name in APP_PROCESS_NAMES {
        process_kill::kill_by_name(name);
    }
    process_kill::kill_by_name("RouteLagHUD.exe");
    process_kill::kill_by_name("Zer0HUD.exe");
    // Ensure a failed/interrupted prior session cannot leave owned tunnels active while files are replaced.
    crate::network_cleanup::disconnect_owned_networking(Some(&install_dir));
    std::fs::create_dir_all(&install_dir).map_err(|e| format!("could not create {}: {e}", install_dir.display()))?;

    let mut archive = payload::open_archive()?;

    if job.include_app {
        emit(progress_file, ProgressLine::step("app", "Installing Zer0 App", 10));
        payload::extract_prefixed(&mut archive, "app", &install_dir, |done, total| {
            let pct = 10 + scale(done, total, 25);
            emit(progress_file, ProgressLine::step("app", "Installing Zer0 App", pct));
        })?;
    }

    let mut engine_installed = false;
    if job.include_engine {
        emit(progress_file, ProgressLine::step("engine", "Installing Zer0 Engine", 35));
        let engine_dir = install_dir.join("engine");
        payload::extract_prefixed(&mut archive, "engine", &engine_dir, |done, total| {
            let pct = 35 + scale(done, total, 20);
            emit(progress_file, ProgressLine::step("engine", "Installing Zer0 Engine", pct));
        })?;
        engine_installed = true;
    } else if let Some(existing) = registry::read_existing_install() {
        engine_installed = existing.engine_installed;
    }

    let mut hud_installed = false;
    let mut hud_path: Option<String> = None;
    if job.include_hud {
        emit(progress_file, ProgressLine::step("hud", "Installing HUD Runtime", 55));
        let hud_dir = install_dir.join("hud");
        payload::extract_prefixed(&mut archive, "hud", &hud_dir, |done, total| {
            let pct = 55 + scale(done, total, 30);
            emit(progress_file, ProgressLine::step("hud", "Installing HUD Runtime", pct));
        })?;
        if !hud_dir.join("RouteLagHUD.exe").exists() {
            return Err("Zer0 HUD Runtime payload did not contain RouteLagHUD.exe.".to_string());
        }
        hud_installed = true;
        hud_path = Some(hud_dir.join("RouteLagHUD.exe").display().to_string());
    }

    emit(progress_file, ProgressLine::step("uninstaller", "Writing uninstaller", 87));
    let uninstall_path = install_dir.join("uninstall.exe");
    if job.include_app || !uninstall_path.exists() {
        write_uninstaller(&uninstall_path, uninstaller_bytes)?;
    }

    emit(progress_file, ProgressLine::step("registry", "Writing install metadata", 91));
    let install_path_str = install_dir.display().to_string();
    let existing = registry::read_existing_install();
    registry::write_install_metadata(&InstallMetadata {
        install_path: install_path_str.clone(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        install_type_label: job.install_type.clone(),
        base_app_installed: job.include_app || existing.is_some(),
        engine_installed: engine_installed || existing.as_ref().map(|e| e.engine_installed).unwrap_or(false),
        hud_runtime_installed: hud_installed || existing.as_ref().map(|e| e.hud_runtime_installed).unwrap_or(false),
        hud_runtime_path: hud_path.or_else(|| existing.as_ref().and_then(|e| e.hud_runtime_path.clone())),
        install_type: install_type_code(&job.install_type),
        channel: "embedded".to_string(),
    })?;
    write_local_manifest(
        &install_dir,
        &job.install_type,
        job.include_app,
        engine_installed,
        hud_installed || existing.as_ref().map(|e| e.hud_runtime_installed).unwrap_or(false),
        "embedded",
    )?;

    let estimated_kb = (dir_size(&install_dir) / 1024) as u32;
    if job.include_app {
        registry::write_arp_entry(&install_path_str, env!("CARGO_PKG_VERSION"), estimated_kb)?;
    }

    emit(progress_file, ProgressLine::step("verify", "Verifying installed files", 94));
    verify_installed_files(&install_dir, job)?;

    if job.include_desktop_shortcut || job.include_start_menu_shortcut {
        emit(progress_file, ProgressLine::step("shortcuts", "Creating shortcuts", 96));
        if let Some(app_exe) = registry::resolve_app_exe(&install_dir) {
            if job.include_desktop_shortcut {
                let _ = shortcuts::create_desktop_shortcut(&app_exe, &public_desktop_dir());
            }
            if job.include_start_menu_shortcut {
                let _ = shortcuts::create_start_menu_shortcuts(
                    &app_exe,
                    &uninstall_path,
                    &common_start_menu_dir(),
                );
            }
        }
    }

    emit(progress_file, ProgressLine::step("finalize", "Finalizing", 99));
    Ok(())
}

fn run_online_install_inner(job: &InstallJob, uninstaller_bytes: &[u8]) -> Result<(), String> {
    let install_dir = PathBuf::from(&job.install_dir);
    let progress_file = job.progress_file.as_str();
    crate::logging::append(&format!(
        "installer version={} install_type={} install_path={} selected app={} engine={} hud={}",
        env!("CARGO_PKG_VERSION"),
        job.install_type,
        job.install_dir,
        job.include_app,
        job.include_engine,
        job.include_hud
    ));

    emit(progress_file, ProgressLine::step("manifest", "Fetching release manifest", 3));
    let (manifest, manifest_source) = install_manifest::load_release_manifest()?;
    crate::logging::append(&format!("manifest source={manifest_source} channel={}", manifest.channel));

    let temp_root = downloader::temp_root();
    let staging = temp_root.join("staging");
    fs_ops::clean_dir(&staging)?;

    let mut staged_components: Vec<(&str, PathBuf)> = Vec::new();
    let mut component_count = 0u8;
    if job.include_app {
        component_count += 1;
    }
    if job.include_engine {
        component_count += 1;
    }
    if job.include_hud {
        component_count += 1;
    }
    let component_count = component_count.max(1);
    let mut component_index = 0u8;

    if job.include_app {
        component_index += 1;
        stage_remote_component(
            "baseApp",
            &manifest.components.base_app,
            &staging,
            progress_file,
            component_index,
            component_count,
        )?;
        staged_components.push(("app", staging.join("baseApp")));
    }
    if job.include_engine {
        component_index += 1;
        stage_remote_component(
            "engine",
            &manifest.components.engine,
            &staging,
            progress_file,
            component_index,
            component_count,
        )?;
        staged_components.push(("engine", staging.join("engine")));
    }
    if job.include_hud {
        component_index += 1;
        let hud = manifest
            .components
            .hud_runtime
            .as_ref()
            .ok_or_else(|| "HUD Runtime is not available in the release manifest.".to_string())?;
        stage_remote_component("hudRuntime", hud, &staging, progress_file, component_index, component_count)?;
        staged_components.push(("hud", staging.join("hudRuntime")));
    }

    emit(progress_file, ProgressLine::step("stop", "Stopping Zer0", 62));
    for name in APP_PROCESS_NAMES {
        process_kill::kill_by_name(name);
    }
    process_kill::kill_by_name("RouteLagHUD.exe");
    process_kill::kill_by_name("Zer0HUD.exe");
    crate::network_cleanup::disconnect_owned_networking(Some(&install_dir));

    let backup = if job.include_app {
        fs_ops::backup_existing(&install_dir)?
    } else {
        None
    };
    let copy_result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
        for (kind, staged_dir) in &staged_components {
            match *kind {
                "app" => {
                    emit(progress_file, ProgressLine::step("app", "Installing Zer0 App", 68));
                    fs_ops::copy_dir_contents(staged_dir, &install_dir)?;
                }
                "engine" => {
                    emit(progress_file, ProgressLine::step("engine", "Installing Zer0 Engine", 76));
                    fs_ops::copy_dir_contents(staged_dir, &install_dir.join("engine"))?;
                }
                "hud" => {
                    emit(progress_file, ProgressLine::step("hud", "Installing HUD Runtime", 84));
                    fs_ops::copy_dir_contents(staged_dir, &install_dir.join("hud"))?;
                }
                _ => {}
            }
        }
        Ok(())
    })();
    if let Err(error) = copy_result {
        crate::logging::append(&format!("copy failed; rolling back: {error}"));
        fs_ops::restore_backup(&install_dir, backup.as_deref());
        return Err(error);
    }
    if let Some(backup) = backup {
        let _ = std::fs::remove_dir_all(backup);
    }

    emit(progress_file, ProgressLine::step("verify", "Verifying installed files", 88));
    verify_installed_files(&install_dir, job)?;

    emit(progress_file, ProgressLine::step("uninstaller", "Writing uninstaller", 90));
    write_uninstaller(&install_dir.join("uninstall.exe"), uninstaller_bytes)?;

    emit(progress_file, ProgressLine::step("registry", "Writing install metadata", 93));
    let existing = registry::read_existing_install();
    let hud_installed = job.include_hud || existing.as_ref().map(|e| e.hud_runtime_installed).unwrap_or(false);
    registry::write_install_metadata(&InstallMetadata {
        install_path: install_dir.display().to_string(),
        version: manifest.version.clone(),
        install_type_label: job.install_type.clone(),
        base_app_installed: job.include_app || existing.is_some(),
        engine_installed: job.include_engine || existing.as_ref().map(|e| e.engine_installed).unwrap_or(false),
        hud_runtime_installed: hud_installed,
        hud_runtime_path: if hud_installed {
            Some(install_dir.join("hud").join("RouteLagHUD.exe").display().to_string())
        } else {
            None
        },
        install_type: install_type_code(&job.install_type),
        channel: manifest.channel.clone(),
    })?;

    write_local_manifest(
        &install_dir,
        &job.install_type,
        job.include_app || existing.is_some(),
        job.include_engine || existing.as_ref().map(|e| e.engine_installed).unwrap_or(false),
        hud_installed,
        &manifest.channel,
    )?;

    if job.include_app {
        let estimated_kb = (dir_size(&install_dir) / 1024) as u32;
        registry::write_arp_entry(&install_dir.display().to_string(), &manifest.version, estimated_kb)?;
    }

    if job.include_desktop_shortcut || job.include_start_menu_shortcut {
        emit(progress_file, ProgressLine::step("shortcuts", "Creating shortcuts", 96));
        let uninstall_path = install_dir.join("uninstall.exe");
        if let Some(app_exe) = registry::resolve_app_exe(&install_dir) {
            if job.include_desktop_shortcut {
                shortcuts::create_desktop_shortcut(&app_exe, &public_desktop_dir())?;
            }
            if job.include_start_menu_shortcut {
                shortcuts::create_start_menu_shortcuts(
                    &app_exe,
                    &uninstall_path,
                    &common_start_menu_dir(),
                )?;
            }
        }
    }

    emit(progress_file, ProgressLine::step("cleanup", "Cleaning temporary files", 98));
    let _ = std::fs::remove_dir_all(&temp_root);
    Ok(())
}

fn stage_remote_component(
    component_id: &str,
    component: &crate::spec::ReleaseComponent,
    staging_root: &Path,
    progress_file: &str,
    component_index: u8,
    component_count: u8,
) -> Result<(), String> {
    let base_percent = 5 + ((component_index - 1) * 55 / component_count);
    let span = 55 / component_count;
    let zip_path = downloader::download_component(component_id, component, |progress| {
        let ratio = if progress.total_bytes == 0 {
            0.0
        } else {
            progress.downloaded_bytes as f64 / progress.total_bytes as f64
        };
        let percent = base_percent + (ratio * span as f64).round() as u8;
        emit(
            progress_file,
            ProgressLine::download(
                &format!("Downloading {component_id}"),
                percent,
                progress,
            ),
        );
    })?;
    emit(progress_file, ProgressLine::step("verify", &format!("Verifying {component_id}"), base_percent + span));
    let dest = staging_root.join(component_id);
    fs_ops::clean_dir(&dest)?;
    emit(progress_file, ProgressLine::step("extract", &format!("Extracting {component_id}"), base_percent + span));
    fs_ops::extract_zip_safely(&zip_path, &dest)
}

pub fn run_add_hud(job: &AddHudJob) -> Result<(), String> {
    let result = run_add_hud_inner(job);
    match &result {
        Ok(()) => emit(&job.progress_file, ProgressLine::finished_ok()),
        Err(error) => emit(&job.progress_file, ProgressLine::finished_err(error.clone())),
    }
    result
}

fn run_add_hud_inner(job: &AddHudJob) -> Result<(), String> {
    let install_dir = PathBuf::from(&job.install_dir);
    let progress_file = job.progress_file.as_str();

    emit(progress_file, ProgressLine::step("prepare", "Preparing files", 5));
    for name in APP_PROCESS_NAMES {
        process_kill::kill_by_name(name);
    }

    let mut archive = payload::open_archive()?;
    let hud_dir = install_dir.join("hud");

    emit(progress_file, ProgressLine::step("hud", "Installing HUD Runtime", 15));
    payload::extract_prefixed(&mut archive, "hud", &hud_dir, |done, total| {
        let pct = 15 + scale(done, total, 70);
        emit(progress_file, ProgressLine::step("hud", "Installing HUD Runtime", pct));
    })?;

    emit(progress_file, ProgressLine::step("registry", "Updating install metadata", 92));
    let existing = registry::read_existing_install();
    registry::write_install_metadata(&InstallMetadata {
        install_path: install_dir.display().to_string(),
        version: existing.as_ref().map(|e| e.version.clone()).unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string()),
        install_type_label: "hud_only".to_string(),
        base_app_installed: existing.is_some(),
        engine_installed: existing.as_ref().map(|e| e.engine_installed).unwrap_or(true),
        hud_runtime_installed: true,
        hud_runtime_path: Some(hud_dir.join("RouteLagHUD.exe").display().to_string()),
        install_type: existing.as_ref().map(|e| e.install_type).unwrap_or(2),
        channel: "embedded".to_string(),
    })?;

    emit(progress_file, ProgressLine::step("finalize", "Finalizing", 99));
    Ok(())
}

fn should_use_embedded_payload(job: &InstallJob) -> bool {
    let Ok(manifest) = payload::read_manifest() else { return false };
    !job.include_hud || manifest.hud_included
}

fn verify_installed_files(install_dir: &Path, job: &InstallJob) -> Result<(), String> {
    if job.include_app && registry::resolve_app_exe(install_dir).is_none() {
        return Err("Zer0 application file was not installed.".to_string());
    }
    if job.include_engine {
        let engine_dir = install_dir.join("engine");
        let has_engine_binary = engine_dir.join("RouteLagEngine.exe").exists()
            || engine_dir.join("routelag-wg.exe").exists();
        if !has_engine_binary {
            return Err("Zer0 Engine files were not installed.".to_string());
        }
    }
    if job.include_hud && !install_dir.join("hud").join("RouteLagHUD.exe").exists() {
        return Err("Zer0 HUD Runtime file was not installed.".to_string());
    }
    Ok(())
}

fn write_local_manifest(
    install_dir: &Path,
    install_type: &str,
    base_app_installed: bool,
    engine_installed: bool,
    hud_runtime_installed: bool,
    channel: &str,
) -> Result<(), String> {
    let manifest = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "installType": install_type,
        "baseAppInstalled": base_app_installed,
        "engineInstalled": engine_installed,
        "hudRuntimeInstalled": hud_runtime_installed,
        "hudRuntimePath": if hud_runtime_installed {
            Some(install_dir.join("hud").join("RouteLagHUD.exe").display().to_string())
        } else {
            None
        },
        "installedAt": crate::logging::timestamp(),
        "installerVersion": env!("CARGO_PKG_VERSION"),
        "channel": channel,
    });
    std::fs::write(
        install_dir.join("install-manifest.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn write_uninstaller(uninstall_path: &Path, uninstaller_bytes: &[u8]) -> Result<(), String> {
    if !uninstaller_bytes.is_empty() {
        return std::fs::write(uninstall_path, uninstaller_bytes).map_err(|e| e.to_string());
    }
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    std::fs::copy(&current_exe, uninstall_path)
        .map(|_| ())
        .map_err(|e| format!("could not create uninstaller from {}: {e}", current_exe.display()))
}

fn install_type_code(install_type: &str) -> u32 {
    match install_type {
        "full" => 2,
        "custom" => 3,
        "hud_only" => 4,
        _ => 1,
    }
}

fn scale(done: usize, total: usize, span: u8) -> u8 {
    if total == 0 {
        return span;
    }
    ((done as f64 / total as f64) * span as f64).round() as u8
}
