use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::spec::{DownloadProgress, ReleaseComponent};
use crate::verifier;

pub fn temp_root() -> PathBuf {
    std::env::temp_dir().join("RouteLagInstaller")
}

pub fn download_component<F>(
    component_id: &str,
    component: &ReleaseComponent,
    mut on_progress: F,
) -> Result<PathBuf, String>
where
    F: FnMut(DownloadProgress),
{
    let root = temp_root().join("downloads");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let dest = root.join(format!("{component_id}-{}.zip", component.version));

    if dest.exists() && verifier::verify_download(&dest, &component.sha256).is_ok() {
        on_progress(DownloadProgress {
            current_component: component_id.to_string(),
            file_name: dest.file_name().unwrap_or_default().to_string_lossy().to_string(),
            downloaded_bytes: component.size_bytes,
            total_bytes: component.size_bytes,
            bytes_per_second: 0,
        });
        return Ok(dest);
    }

    let url = component.url.trim();
    if url.starts_with("file://") {
        let source = PathBuf::from(url.trim_start_matches("file://"));
        std::fs::copy(&source, &dest)
            .map_err(|e| format!("could not copy local dev payload {}: {e}", source.display()))?;
        verifier::verify_download(&dest, &component.sha256)?;
        let copied = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(component.size_bytes);
        on_progress(DownloadProgress {
            current_component: component_id.to_string(),
            file_name: dest.file_name().unwrap_or_default().to_string_lossy().to_string(),
            downloaded_bytes: copied,
            total_bytes: copied,
            bytes_per_second: 0,
        });
        return Ok(dest);
    }
    if !url.starts_with("https://") {
        return Err(format!("refusing non-HTTPS download URL for {component_id}: {url}"));
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .map_err(|_| "RouteLag could not reach the download server. Check your connection and try again.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("download server returned {} for {component_id}", response.status()));
    }

    let total = response.content_length().unwrap_or(component.size_bytes);
    let mut file = File::create(&dest).map_err(|e| e.to_string())?;
    let mut downloaded = 0u64;
    let started = Instant::now();
    let mut last_emit = Instant::now();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = response.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        if last_emit.elapsed() >= Duration::from_millis(200) {
            let elapsed = started.elapsed().as_secs().max(1);
            on_progress(DownloadProgress {
                current_component: component_id.to_string(),
                file_name: Path::new(url)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                downloaded_bytes: downloaded,
                total_bytes: total,
                bytes_per_second: downloaded / elapsed,
            });
            last_emit = Instant::now();
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    verifier::verify_download(&dest, &component.sha256)?;
    on_progress(DownloadProgress {
        current_component: component_id.to_string(),
        file_name: Path::new(url)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        downloaded_bytes: downloaded,
        total_bytes: total,
        bytes_per_second: downloaded / started.elapsed().as_secs().max(1),
    });
    Ok(dest)
}
