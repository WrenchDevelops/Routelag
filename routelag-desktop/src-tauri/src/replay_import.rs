use chrono::Local;
use reqwest::blocking::{multipart, Client};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalReplayFile {
    pub name: String,
    pub path: String,
    pub modified_at: String,
    pub size_bytes: u64,
    pub file_hash: Option<String>,
    pub status: String,
}

pub fn default_replay_folder() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|root| root.join("FortniteGame").join("Saved").join("Demos"))
    }
    #[cfg(not(windows))]
    {
        None
    }
}

pub fn scan_replay_folder(path: Option<String>) -> Result<Vec<LocalReplayFile>, String> {
    let dir = match path {
        Some(value) => PathBuf::from(value),
        None => match default_replay_folder() {
            Some(value) => value,
            None => return Ok(Vec::new()),
        },
    };
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(&dir).map_err(|e| format!("Could not read replay folder: {e}"))?;
    let mut files = entries
        .filter_map(Result::ok)
        .filter_map(|entry| replay_file(entry.path()).ok())
        .collect::<Vec<_>>();
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(files)
}

pub fn hash_replay_file(path: &str) -> Result<String, String> {
    ensure_replay_extension(Path::new(path))?;
    let mut file = File::open(path).map_err(|e| format!("Could not open replay file: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|e| format!("Could not hash replay file: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn upload_replay_file(path: &str, api_base_url: &str, token: &str) -> Result<String, String> {
    ensure_replay_extension(Path::new(path))?;
    let api_base = api_base_url.trim_end_matches('/');
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Replay file name is invalid.".to_string())?
        .to_string();
    let form = multipart::Form::new()
        .file("file", path)
        .map_err(|e| format!("Could not prepare replay upload: {e}"))?;
    let response = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Could not prepare replay upload client: {e}"))?
        .post(format!("{api_base}/api/replays/upload"))
        .bearer_auth(token)
        .multipart(form)
        .send()
        .map_err(|e| format!("Replay upload failed: {e}"))?;
    let status = response.status();
    let text = response.text().unwrap_or_default();
    if !status.is_success() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(error) = parsed.get("error").and_then(|value| value.as_str()) {
                return Err(error.to_string());
            }
        }
        return Err(if text.is_empty() {
            format!("Replay upload failed with status {status}.")
        } else {
            text
        });
    }
    let _ = file_name;
    Ok(text)
}

pub fn rename_parsed_replay(path: &str, new_name: &str) -> Result<String, String> {
    ensure_replay_extension(Path::new(path))?;
    let source = Path::new(path);
    if !source.is_file() {
        return Err("Replay file was not found.".to_string());
    }
    let parent = source
        .parent()
        .ok_or_else(|| "Replay folder is invalid.".to_string())?;
    let sanitized = sanitize_replay_name(new_name);
    if sanitized.is_empty() {
        return Err("Replay name is invalid.".to_string());
    }
    let mut dest = parent.join(format!("{sanitized}.replay"));
    if source == dest {
        return Ok(dest.display().to_string());
    }
    if dest.exists() {
        let stamp = Local::now().format("%H%M%S");
        dest = parent.join(format!("{sanitized}-{stamp}.replay"));
    }
    fs::rename(source, &dest).map_err(|e| format!("Could not rename replay file: {e}"))?;
    Ok(dest.display().to_string())
}

fn sanitize_replay_name(name: &str) -> String {
    let trimmed = name.trim().trim_end_matches(".replay");
    let mut output = String::new();
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '#' | '.') {
            output.push(ch);
        } else if ch.is_whitespace() {
            output.push('-');
        } else {
            output.push('-');
        }
    }
    output.trim_matches('-').chars().take(120).collect()
}

pub fn replay_file(path: PathBuf) -> Result<LocalReplayFile, String> {
    if !path.is_file() {
        return Err("Not a file.".to_string());
    }
    ensure_replay_extension(&path)?;
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    Ok(LocalReplayFile {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Fortnite replay")
            .to_string(),
        path: path.display().to_string(),
        modified_at: chrono::DateTime::<Local>::from(modified).to_rfc3339(),
        size_bytes: metadata.len(),
        file_hash: None,
        status: "local_found".to_string(),
    })
}

fn ensure_replay_extension(path: &Path) -> Result<(), String> {
    let is_replay = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("replay"))
        .unwrap_or(false);
    if is_replay {
        Ok(())
    } else {
        Err("Only Fortnite .replay files are supported.".to_string())
    }
}
