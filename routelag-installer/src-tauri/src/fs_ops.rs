use std::fs::File;
use std::path::{Component, Path, PathBuf};

pub fn clean_dir(path: &Path) -> Result<(), String> {
    if path.exists() {
        std::fs::remove_dir_all(path).map_err(|e| format!("could not clean {}: {e}", path.display()))?;
    }
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

pub fn extract_zip_safely(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.name().ends_with('/') {
            continue;
        }
        let safe_rel = sanitize_zip_path(entry.name())?;
        let out_path = dest_dir.join(safe_rel);
        if !out_path.starts_with(dest_dir) {
            return Err(format!("unsafe ZIP entry rejected: {}", entry.name()));
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn copy_dir_contents(src: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if from.is_dir() {
            copy_dir_contents(&from, &to)?;
        } else {
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(&from, &to).map_err(|e| format!("copy {} -> {} failed: {e}", from.display(), to.display()))?;
        }
    }
    Ok(())
}

pub fn backup_existing(install_dir: &Path) -> Result<Option<PathBuf>, String> {
    if !install_dir.exists() {
        return Ok(None);
    }
    let backup = install_dir.with_extension(format!("backup-{}", std::process::id()));
    if backup.exists() {
        std::fs::remove_dir_all(&backup).map_err(|e| e.to_string())?;
    }
    std::fs::rename(install_dir, &backup).map_err(|e| format!("could not backup existing install: {e}"))?;
    Ok(Some(backup))
}

pub fn restore_backup(install_dir: &Path, backup: Option<&Path>) {
    let Some(backup) = backup else { return };
    let _ = std::fs::remove_dir_all(install_dir);
    let _ = std::fs::rename(backup, install_dir);
}

fn sanitize_zip_path(name: &str) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    for component in Path::new(name).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err(format!("unsafe ZIP entry rejected: {name}")),
        }
    }
    if out.as_os_str().is_empty() {
        return Err(format!("empty ZIP entry rejected: {name}"));
    }
    Ok(out)
}
