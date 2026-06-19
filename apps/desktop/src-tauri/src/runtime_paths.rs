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

/// Segment immediately after a fixed marker, e.g. `v25.2.0` in `…/.nvm/versions/node/v25.2.0/bin/node`.
pub(crate) fn path_segment_after_marker(path: &str, marker: &str) -> Option<String> {
  let idx = path.find(marker)?;
  let rest = &path[idx + marker.len()..];
  let seg = rest.split('/').next()?.trim();
  if seg.is_empty() {
    None
  } else {
    Some(seg.to_string())
  }
}

pub(crate) fn path_home_before_marker(path: &str, marker: &str) -> Option<PathBuf> {
  let idx = path.find(marker)?;
  if idx == 0 {
    None
  } else {
    Some(PathBuf::from(&path[..idx]))
  }
}

pub(crate) fn nvm_version_dir_from_path(path: &str) -> Option<PathBuf> {
  const MARKER: &str = "/.nvm/versions/node/";
  let tag = path_segment_after_marker(path, MARKER)?;
  let home = path_home_before_marker(path, MARKER)?;
  Some(
    home.join(".nvm")
      .join("versions")
      .join("node")
      .join(tag),
  )
}

pub(crate) fn lumina_version_dir_from_path(path: &str, runtime_id: &str) -> Option<PathBuf> {
  let marker = format!("/.local/share/lumina/{}/", runtime_id);
  let tag = path_segment_after_marker(path, &marker)?;
  let home = path_home_before_marker(path, &marker)?;
  Some(
    home.join(".local")
      .join("share")
      .join("lumina")
      .join(runtime_id)
      .join(tag),
  )
}

/// Resolve a Java `bin/java` path for set-active (Lumina, SDKMAN, JetBrains `.jdks`, or system JVM).
pub(crate) fn validate_java_binary_path(path_raw: &str, home: &Path) -> Result<PathBuf, String> {
  use std::ffi::OsStr;
  let path = PathBuf::from(path_raw);
  if !path.is_absolute() {
    return Err("[RUNTIME_SET_ACTIVE_FAILED] Java path must be absolute.".to_string());
  }
  if path.file_name() != Some(OsStr::new("java")) {
    return Err("[RUNTIME_SET_ACTIVE_FAILED] Expected path ending in bin/java.".to_string());
  }
  if path.parent().and_then(|p| p.file_name()) != Some(OsStr::new("bin")) {
    return Err("[RUNTIME_SET_ACTIVE_FAILED] Expected path ending in bin/java.".to_string());
  }
  let abs = std::fs::canonicalize(&path)
    .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] Invalid path: {}", e))?;
  let allowed = [
    home.join(".local/share/lumina/java"),
    home.join(".local/share/mise/installs/java"),
    home.join(".sdkman/candidates/java"),
    home.join(".jdks"),
    PathBuf::from("/usr/lib/jvm"),
    PathBuf::from("/usr/java"),
  ];
  if !allowed.iter().any(|prefix| abs.starts_with(prefix)) {
    return Err(
      "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Java path (expected Lumina, mise, SDKMAN, .jdks, or /usr/lib/jvm)."
        .to_string(),
    );
  }
  Ok(abs)
}

pub(crate) fn java_home_from_binary(path: &Path) -> Option<PathBuf> {
  path.parent().and_then(|bin| bin.parent()).map(Path::to_path_buf)
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn nvm_version_dir_from_node_binary_path() {
    let p = "/home/karimodora/.nvm/versions/node/v25.2.0/bin/node";
    let dir = nvm_version_dir_from_path(p).unwrap();
    assert_eq!(
      dir,
      PathBuf::from("/home/karimodora/.nvm/versions/node/v25.2.0")
    );
    assert_eq!(
      path_segment_after_marker(p, "/.nvm/versions/node/").as_deref(),
      Some("v25.2.0")
    );
  }
}
