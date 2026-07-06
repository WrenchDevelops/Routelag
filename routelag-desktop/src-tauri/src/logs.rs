use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Local;
use thiserror::Error;

use crate::config::redact_secrets;

pub const LOG_FILENAME: &str = "routelag-beta.log";
const MAX_LOG_BYTES: u64 = 512_000;

#[derive(Debug, Error)]
pub enum LogError {
    #[error("Failed to write log: {0}")]
    WriteFailed(String),
    #[error("Failed to read log: {0}")]
    ReadFailed(String),
}

pub struct LogManager {
    path: PathBuf,
    mutex: Mutex<()>,
}

impl LogManager {
    pub fn new(app_data_dir: &Path) -> Self {
        let _ = fs::create_dir_all(app_data_dir);
        Self {
            path: app_data_dir.join(LOG_FILENAME),
            mutex: Mutex::new(()),
        }
    }

    pub fn log(&self, level: &str, message: &str) {
        let _guard = self.mutex.lock().unwrap_or_else(|error| error.into_inner());
        let redacted = redact_secrets(message);
        let line = format!(
            "[{}] [{}] {}\n",
            Local::now().format("%Y-%m-%d %H:%M:%S"),
            level,
            redacted.trim()
        );

        if let Ok(meta) = fs::metadata(&self.path) {
            if meta.len() > MAX_LOG_BYTES {
                if let Ok(content) = fs::read_to_string(&self.path) {
                    let trimmed: String = content
                        .lines()
                        .skip(content.lines().count().saturating_sub(500))
                        .collect::<Vec<_>>()
                        .join("\n");
                    let _ = fs::write(&self.path, format!("{trimmed}\n"));
                }
            }
        }

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = file.write_all(line.as_bytes());
        }
    }

    pub fn info(&self, message: &str) {
        self.log("INFO", message);
    }

    pub fn warn(&self, message: &str) {
        self.log("WARN", message);
    }

    pub fn error(&self, message: &str) {
        self.log("ERROR", message);
    }

    pub fn read_logs(&self, extra_status: Option<&str>) -> Result<String, LogError> {
        self.read_logs_with_header(None, extra_status)
    }

    pub fn read_logs_with_header(
        &self,
        header: Option<&str>,
        extra_status: Option<&str>,
    ) -> Result<String, LogError> {
        let mut output = String::new();
        if let Some(h) = header {
            output.push_str(h);
            output.push('\n');
        }
        if self.path.is_file() {
            let content =
                fs::read_to_string(&self.path).map_err(|e| LogError::ReadFailed(e.to_string()))?;
            let lines: Vec<&str> = content.lines().collect();
            let tail = if lines.len() > 300 {
                &lines[lines.len() - 300..]
            } else {
                &lines[..]
            };
            output.push_str(&tail.join("\n"));
        } else {
            output.push_str("No logs yet.\n");
        }

        if let Some(status) = extra_status {
            output.push_str("\n\n--- RouteLag Service Status ---\n");
            output.push_str(status);
        }

        Ok(redact_secrets(&output))
    }

    pub fn clear(&self) -> Result<(), LogError> {
        let _guard = self.mutex.lock().unwrap_or_else(|error| error.into_inner());
        if self.path.is_file() {
            fs::write(&self.path, "").map_err(|e| LogError::WriteFailed(e.to_string()))?;
        }
        Ok(())
    }
}
