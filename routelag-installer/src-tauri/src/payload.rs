use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use crate::spec::PayloadManifest;

/// 24-byte footer appended after the payload zip by `packaging/build-installer.ps1`:
/// `[8 bytes magic]["RLPAYLD1"][8 bytes offset (u64 LE)][8 bytes length (u64 LE)]`
const FOOTER_MAGIC: &[u8; 8] = b"RLPAYLD1";
const FOOTER_LEN: u64 = 24;

pub struct PayloadInfo {
    pub offset: u64,
    pub length: u64,
}

fn read_footer(exe_path: &Path) -> Result<Option<PayloadInfo>, String> {
    let mut file = File::open(exe_path).map_err(|e| e.to_string())?;
    let file_len = file.metadata().map_err(|e| e.to_string())?.len();
    if file_len < FOOTER_LEN {
        return Ok(None);
    }
    file.seek(SeekFrom::End(-(FOOTER_LEN as i64)))
        .map_err(|e| e.to_string())?;
    let mut buf = [0u8; FOOTER_LEN as usize];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;
    if &buf[0..8] != FOOTER_MAGIC {
        return Ok(None);
    }
    let offset = u64::from_le_bytes(buf[8..16].try_into().unwrap());
    let length = u64::from_le_bytes(buf[16..24].try_into().unwrap());
    Ok(Some(PayloadInfo { offset, length }))
}

/// A `Read + Seek` window into a byte range of a file, so `zip::ZipArchive` can read the
/// payload archive appended directly after this executable's own PE image without ever
/// copying it out to a temp file first.
pub struct BoundedReader {
    file: File,
    start: u64,
    len: u64,
    pos: u64,
}

impl BoundedReader {
    fn new(mut file: File, start: u64, len: u64) -> Result<Self, String> {
        file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
        Ok(Self { file, start, len, pos: 0 })
    }
}

impl Read for BoundedReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let remaining = self.len.saturating_sub(self.pos);
        if remaining == 0 {
            return Ok(0);
        }
        let max = remaining.min(buf.len() as u64) as usize;
        let n = self.file.read(&mut buf[..max])?;
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for BoundedReader {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        let new_pos: i64 = match pos {
            SeekFrom::Start(p) => p as i64,
            SeekFrom::End(p) => self.len as i64 + p,
            SeekFrom::Current(p) => self.pos as i64 + p,
        };
        if new_pos < 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "seek before start of payload",
            ));
        }
        let new_pos = new_pos as u64;
        self.file.seek(SeekFrom::Start(self.start + new_pos))?;
        self.pos = new_pos;
        Ok(self.pos)
    }
}

/// Whether this executable has a payload archive appended (it won't, e.g. in `npm run tauri dev`).
pub fn has_payload() -> bool {
    open_archive().is_ok()
}

pub fn open_archive() -> Result<zip::ZipArchive<BoundedReader>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let info = read_footer(&exe)?
        .ok_or_else(|| "no payload archive is appended to this executable".to_string())?;
    let file = File::open(&exe).map_err(|e| e.to_string())?;
    let reader = BoundedReader::new(file, info.offset, info.length)?;
    zip::ZipArchive::new(reader).map_err(|e| e.to_string())
}

pub fn read_manifest() -> Result<PayloadManifest, String> {
    let mut archive = open_archive()?;
    let mut file = archive
        .by_name("manifest.json")
        .map_err(|e| format!("manifest.json missing from payload: {e}"))?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

/// Extracts every entry whose zip path starts with `prefix/` into `dest_dir`, stripping the
/// prefix. Calls `on_file` after each file is written with (files_done, files_total) so callers
/// can turn that into a progress percentage.
fn entry_matches_prefix(name: &str, prefix: &str) -> bool {
    let forward = format!("{prefix}/");
    let backward = format!("{prefix}\\");
    (name.starts_with(&forward) || name.starts_with(&backward))
        && !name.ends_with('/')
        && !name.ends_with('\\')
}

fn strip_entry_prefix<'a>(name: &'a str, prefix: &str) -> &'a str {
    name.strip_prefix(&format!("{prefix}/"))
        .or_else(|| name.strip_prefix(&format!("{prefix}\\")))
        .unwrap_or(name)
}

pub fn extract_prefixed<F: FnMut(usize, usize)>(
    archive: &mut zip::ZipArchive<BoundedReader>,
    prefix: &str,
    dest_dir: &Path,
    mut on_file: F,
) -> Result<(), String> {
    let matching: Vec<usize> = (0..archive.len())
        .filter(|&i| {
            archive
                .by_index(i)
                .map(|f| entry_matches_prefix(f.name(), prefix))
                .unwrap_or(false)
        })
        .collect();
    let total = matching.len();

    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    for (done, index) in matching.into_iter().enumerate() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let relative = strip_entry_prefix(entry.name(), prefix).to_string();
        let out_path = safe_join(dest_dir, &relative)?;
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out_file = File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        on_file(done + 1, total);
    }

    Ok(())
}

fn safe_join(dest_dir: &Path, zip_name: &str) -> Result<std::path::PathBuf, String> {
    let mut out = std::path::PathBuf::from(dest_dir);
    for component in Path::new(zip_name).components() {
        match component {
            std::path::Component::Normal(part) => out.push(part),
            std::path::Component::CurDir => {}
            _ => return Err(format!("unsafe ZIP entry rejected: {zip_name}")),
        }
    }
    if !out.starts_with(dest_dir) {
        return Err(format!("unsafe ZIP entry rejected: {zip_name}"));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{entry_matches_prefix, strip_entry_prefix};

    #[test]
    fn matches_forward_slash_zip_paths() {
        assert!(entry_matches_prefix("app/RouteLag.exe", "app"));
        assert_eq!(strip_entry_prefix("app/RouteLag.exe", "app"), "RouteLag.exe");
    }

    #[test]
    fn matches_backslash_zip_paths_from_compress_archive() {
        assert!(entry_matches_prefix(r"app\RouteLag.exe", "app"));
        assert_eq!(strip_entry_prefix(r"app\RouteLag.exe", "app"), "RouteLag.exe");
        assert!(entry_matches_prefix(r"engine\RouteLagEngine.exe", "engine"));
    }

    #[test]
    fn rejects_directory_entries() {
        assert!(!entry_matches_prefix("app/", "app"));
        assert!(!entry_matches_prefix(r"app\", "app"));
    }
}
