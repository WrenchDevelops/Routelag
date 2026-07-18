use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

const CRASH_LOG_NAME: &str = "startup-crash.log";
const BOOT_LOG_NAME: &str = "startup.log";
const MIGRATION_MARKER: &str = ".zer0-appdata-migrated";

/// Canonical product AppData folder name (new installs / writes).
pub const APP_DATA_PRODUCT: &str = "Zer0";
/// Legacy RouteLag AppData folder (read + migrate-once).
pub const APP_DATA_LEGACY: &str = "RouteLag";

/// Write a line to every known startup log location. Never panics.
pub fn write_startup_log(message: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{timestamp}] {}\n", message.trim());

    for path in startup_log_paths(BOOT_LOG_NAME) {
        append_line(&path, &line);
    }

    eprintln!("Zer0: {}", message.trim());
}

/// Persist a crash/panic report and surface it to the user when possible.
pub fn write_startup_crash_log(message: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{timestamp}] {}\n", message.trim());

    for path in startup_log_paths(CRASH_LOG_NAME) {
        append_line(&path, &line);
    }
    // Mirror into the rolling boot log so one folder has the full story.
    for path in startup_log_paths(BOOT_LOG_NAME) {
        append_line(&path, &line);
    }

    eprintln!("Zer0 failed to start:\n{}", message.trim());
    show_startup_error_dialog(message);
}

pub fn startup_context_block(version: &str) -> String {
    format!(
        "version={version}\ncurrent_dir={}\nexe={}\nlocal_app_data={}\ntemp={}",
        env_path_display(std::env::current_dir()),
        env_path_display(std::env::current_exe()),
        std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "unavailable".to_string()),
        std::env::temp_dir().display(),
    )
}

/// Resolve writable app data dir with Zer0-first precedence and legacy migrate-once.
///
/// Precedence:
/// 1. Tauri preferred dir (usually `com.zer0.app`) when writable
/// 2. `%LOCALAPPDATA%\Zer0` (canonical product path)
/// 3. Migrate once from `%LOCALAPPDATA%\RouteLag` into Zer0 when needed
/// 4. Legacy RouteLag / roaming / temp fallbacks (read+write so Restore Internet still works)
pub fn resolve_app_data_dir(preferred: Option<PathBuf>) -> PathBuf {
    let zer0_local = std::env::var_os("LOCALAPPDATA").map(|v| PathBuf::from(v).join(APP_DATA_PRODUCT));
    let legacy_local =
        std::env::var_os("LOCALAPPDATA").map(|v| PathBuf::from(v).join(APP_DATA_LEGACY));

    if let (Some(zer0), Some(legacy)) = (&zer0_local, &legacy_local) {
        migrate_legacy_appdata_once(legacy, zer0);
    }

    let candidates = [
        preferred,
        zer0_local.clone(),
        legacy_local.clone(),
        std::env::var_os("APPDATA").map(|value| PathBuf::from(value).join(APP_DATA_PRODUCT)),
        std::env::var_os("APPDATA").map(|value| PathBuf::from(value).join(APP_DATA_LEGACY)),
        Some(std::env::temp_dir().join(APP_DATA_PRODUCT)),
        Some(std::env::temp_dir().join(APP_DATA_LEGACY)),
    ];

    for candidate in candidates.into_iter().flatten() {
        if dir_is_writable(&candidate) {
            return candidate;
        }
    }

    std::env::temp_dir()
}

/// Copy key RouteLag settings into Zer0 once. Never deletes the legacy folder.
fn migrate_legacy_appdata_once(legacy: &Path, zer0: &Path) {
    if !legacy.is_dir() {
        return;
    }
    if !dir_is_writable(zer0) {
        return;
    }

    let marker = zer0.join(MIGRATION_MARKER);
    if marker.is_file() {
        return;
    }

    // Only migrate when Zer0 looks empty of routing state (avoid clobbering newer installs).
    let zer0_has_config = zer0.join("routelag-engine.conf").is_file()
        || zer0.join("config-meta.json").is_file()
        || zer0.join("active-route-session.json").is_file();
    if zer0_has_config {
        let _ = std::fs::write(&marker, b"skipped-zer0-already-populated\n");
        return;
    }

    let files_to_copy = [
        "routelag-engine.conf",
        "routelag-beta.conf",
        "config-meta.json",
        "active-route-session.json",
        "tester-profile.json",
        "hud-layout.json",
        "connection-state.json",
        "routing-marker.json",
    ];

    let mut copied = 0usize;
    for name in files_to_copy {
        let src = legacy.join(name);
        if !src.is_file() {
            continue;
        }
        let dest = zer0.join(name);
        if dest.exists() {
            continue;
        }
        if std::fs::copy(&src, &dest).is_ok() {
            copied += 1;
        }
    }

    // Best-effort log folder copy (do not fail migration).
    let legacy_logs = legacy.join("logs");
    let zer0_logs = zer0.join("logs");
    if legacy_logs.is_dir() && !zer0_logs.exists() {
        let _ = copy_dir_best_effort(&legacy_logs, &zer0_logs);
    }

    let note = format!("migrated-from-routelag copied={copied}\n");
    let _ = std::fs::write(&marker, note.as_bytes());
}

fn copy_dir_best_effort(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let dest = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            let _ = copy_dir_best_effort(&entry.path(), &dest);
        } else if !dest.exists() {
            let _ = std::fs::copy(entry.path(), &dest);
        }
    }
    Ok(())
}

fn dir_is_writable(path: &Path) -> bool {
    if std::fs::create_dir_all(path).is_err() {
        return false;
    }
    let probe = path.join(".write-test");
    if std::fs::write(&probe, b"ok").is_err() {
        return false;
    }
    let _ = std::fs::remove_file(&probe);
    true
}

fn startup_log_paths(filename: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        // Write-new Zer0 path first; also mirror to legacy so support tools find crash logs.
        paths.push(
            PathBuf::from(&local)
                .join(APP_DATA_PRODUCT)
                .join("logs")
                .join(filename),
        );
        paths.push(
            PathBuf::from(local)
                .join(APP_DATA_LEGACY)
                .join("logs")
                .join(filename),
        );
    }
    if let Some(roaming) = std::env::var_os("APPDATA") {
        paths.push(
            PathBuf::from(&roaming)
                .join(APP_DATA_PRODUCT)
                .join("logs")
                .join(filename),
        );
        paths.push(
            PathBuf::from(roaming)
                .join(APP_DATA_LEGACY)
                .join("logs")
                .join(filename),
        );
    }
    paths.push(
        std::env::temp_dir()
            .join(APP_DATA_PRODUCT)
            .join("logs")
            .join(filename),
    );

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            paths.push(parent.join("logs").join(filename));
        }
    }

    paths
}

fn append_line(path: &Path, line: &str) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn env_path_display(result: std::io::Result<PathBuf>) -> String {
    result
        .map(|path| path.display().to_string())
        .unwrap_or_else(|error| format!("unavailable ({error})"))
}

#[cfg(windows)]
fn show_startup_error_dialog(message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let body = format!(
        "{}\n\nCrash logs:\n%LOCALAPPDATA%\\Zer0\\logs\\startup-crash.log\n%LOCALAPPDATA%\\RouteLag\\logs\\startup-crash.log (legacy)\n%TEMP%\\Zer0\\logs\\startup-crash.log",
        message.trim()
    );
    let text: Vec<u16> = OsStr::new(&body)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let title: Vec<u16> = OsStr::new("Zer0 failed to start")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(windows))]
fn show_startup_error_dialog(_message: &str) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn migrate_once_copies_legacy_config_into_zer0() {
        let root = std::env::temp_dir().join(format!("zer0-migrate-{}", std::process::id()));
        let legacy = root.join("RouteLag");
        let zer0 = root.join("Zer0");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("routelag-engine.conf"), b"[Interface]\nPrivateKey = abc\n").unwrap();
        fs::write(legacy.join("config-meta.json"), b"{\"original_filename\":\"x\"}").unwrap();

        migrate_legacy_appdata_once(&legacy, &zer0);

        assert!(zer0.join("routelag-engine.conf").is_file());
        assert!(zer0.join("config-meta.json").is_file());
        assert!(zer0.join(MIGRATION_MARKER).is_file());

        // Second call must not overwrite / re-copy destructively.
        fs::write(legacy.join("routelag-engine.conf"), b"CHANGED").unwrap();
        migrate_legacy_appdata_once(&legacy, &zer0);
        let content = fs::read_to_string(zer0.join("routelag-engine.conf")).unwrap();
        assert!(content.contains("PrivateKey"));
        assert!(!content.contains("CHANGED"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn migrate_skips_when_zer0_already_has_config() {
        let root = std::env::temp_dir().join(format!("zer0-migrate-skip-{}", std::process::id()));
        let legacy = root.join("RouteLag");
        let zer0 = root.join("Zer0");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&legacy).unwrap();
        fs::create_dir_all(&zer0).unwrap();
        fs::write(legacy.join("routelag-engine.conf"), b"LEGACY").unwrap();
        fs::write(zer0.join("routelag-engine.conf"), b"ZER0").unwrap();

        migrate_legacy_appdata_once(&legacy, &zer0);
        assert_eq!(fs::read_to_string(zer0.join("routelag-engine.conf")).unwrap(), "ZER0");
        let _ = fs::remove_dir_all(&root);
    }
}
