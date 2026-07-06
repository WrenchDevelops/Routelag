use std::io::Write;
use std::path::PathBuf;

fn log_path() -> Option<PathBuf> {
    let local_appdata = std::env::var_os("LOCALAPPDATA")?;
    Some(PathBuf::from(local_appdata).join("RouteLag").join("logs").join("installer.log"))
}

pub fn append(line: &str) {
    let Some(path) = log_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let timestamp = timestamp();
        let _ = writeln!(file, "[{timestamp}] {line}");
    }
}

/// Minimal local-time-ish stamp without pulling in a chrono dependency just for a log file.
pub fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", now.as_secs())
}
