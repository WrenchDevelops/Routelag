use std::io::Write;
use std::path::PathBuf;

fn log_path() -> Option<PathBuf> {
    let local_appdata = std::env::var_os("LOCALAPPDATA")?;
    // Prefer Zer0; also ensure parent exists for dual support tooling.
    Some(
        PathBuf::from(local_appdata)
            .join("Zer0")
            .join("logs")
            .join("installer.log"),
    )
}

fn legacy_log_path() -> Option<PathBuf> {
    let local_appdata = std::env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(local_appdata)
            .join("RouteLag")
            .join("logs")
            .join("installer.log"),
    )
}

fn append_to(path: &std::path::Path, line: &str) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let stamp = timestamp();
        let _ = writeln!(file, "[{stamp}] {line}");
    }
}

pub fn append(line: &str) {
    if let Some(path) = log_path() {
        append_to(&path, line);
    }
    // Mirror to legacy RouteLag log path for support continuity during rebrand.
    if let Some(path) = legacy_log_path() {
        append_to(&path, line);
    }
}

/// Minimal local-time-ish stamp without pulling in a chrono dependency just for a log file.
pub fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", now.as_secs())
}
