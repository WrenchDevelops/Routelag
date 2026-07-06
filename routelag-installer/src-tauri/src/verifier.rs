use std::fs::File;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("could not open {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn verify_download(path: &Path, expected_sha256: &str) -> Result<(), String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("download missing: {e}"))?;
    if meta.len() == 0 {
        return Err("downloaded file is empty".to_string());
    }
    let actual = sha256_file(path)?;
    if !expected_sha256.trim().is_empty() && !actual.eq_ignore_ascii_case(expected_sha256.trim()) {
        return Err(format!(
            "checksum mismatch for {}: expected {}, got {}",
            path.display(),
            expected_sha256,
            actual
        ));
    }
    Ok(())
}
