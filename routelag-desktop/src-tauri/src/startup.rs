use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

const CRASH_LOG_NAME: &str = "startup-crash.log";
const BOOT_LOG_NAME: &str = "startup.log";

/// Write a line to every known startup log location. Never panics.
pub fn write_startup_log(message: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{timestamp}] {}\n", message.trim());

    for path in startup_log_paths(BOOT_LOG_NAME) {
        append_line(&path, &line);
    }

    eprintln!("RouteLag: {}", message.trim());
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

    eprintln!("RouteLag failed to start:\n{}", message.trim());
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

pub fn resolve_app_data_dir(preferred: Option<PathBuf>) -> PathBuf {
    let candidates = [
        preferred,
        std::env::var_os("LOCALAPPDATA").map(|value| PathBuf::from(value).join("RouteLag")),
        std::env::var_os("APPDATA").map(|value| PathBuf::from(value).join("RouteLag")),
        Some(std::env::temp_dir().join("RouteLag")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if std::fs::create_dir_all(&candidate).is_ok() {
            let probe = candidate.join(".write-test");
            if std::fs::write(&probe, b"ok").is_ok() {
                let _ = std::fs::remove_file(&probe);
                return candidate;
            }
        }
    }

    std::env::temp_dir()
}

fn startup_log_paths(filename: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(local).join("RouteLag").join("logs").join(filename));
    }
    if let Some(roaming) = std::env::var_os("APPDATA") {
        paths.push(PathBuf::from(roaming).join("RouteLag").join("logs").join(filename));
    }
    paths.push(std::env::temp_dir().join("RouteLag").join("logs").join(filename));

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
        "{}\n\nCrash logs:\n%LOCALAPPDATA%\\RouteLag\\logs\\startup-crash.log\n%TEMP%\\RouteLag\\logs\\startup-crash.log",
        message.trim()
    );
    let text: Vec<u16> = OsStr::new(&body)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let title: Vec<u16> = OsStr::new("RouteLag failed to start")
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
