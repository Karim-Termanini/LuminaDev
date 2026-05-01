use std::path::{Path, PathBuf};

pub(crate) fn lumina_home_dir() -> Result<PathBuf, String> {
  std::env::var_os("HOME")
    .map(PathBuf::from)
    .filter(|p| !p.as_os_str().is_empty())
    .ok_or_else(|| "[RUNTIME_SET_ACTIVE_FAILED] Missing $HOME.".to_string())
}

pub(crate) fn lumina_path_must_be_under_home(home: &Path, path: &Path) -> Result<PathBuf, String> {
  let abs = std::fs::canonicalize(path)
    .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] Invalid path: {}", e))?;
  let home_canon = std::fs::canonicalize(home)
    .unwrap_or_else(|_| home.to_path_buf());
  if !abs.starts_with(&home_canon) {
    return Err("[RUNTIME_SET_ACTIVE_FAILED] Path must be under your home directory.".to_string());
  }
  Ok(abs)
}

#[cfg(unix)]
pub(crate) fn lumina_replace_symlink(link: &Path, target: &Path) -> Result<(), String> {
  if let Err(e) = std::fs::remove_file(link) {
    if link.exists() {
      return Err(format!(
        "[RUNTIME_SET_ACTIVE_FAILED] '{}' exists and is not a symlink; refusing to overwrite.",
        link.display()
      ));
    }
    if e.kind() != std::io::ErrorKind::NotFound {
      return Err(format!("[RUNTIME_SET_ACTIVE_FAILED] Could not prepare symlink {}: {}", link.display(), e));
    }
  }
  std::os::unix::fs::symlink(target, link).map_err(|e| {
    format!(
      "[RUNTIME_SET_ACTIVE_FAILED] Could not symlink {} -> {}: {}",
      link.display(),
      target.display(),
      e
    )
  })
}

#[cfg(not(unix))]
pub(crate) fn lumina_replace_symlink(_link: &Path, _target: &Path) -> Result<(), String> {
  Err("[RUNTIME_SET_ACTIVE_FAILED] Unsupported platform.".to_string())
}
