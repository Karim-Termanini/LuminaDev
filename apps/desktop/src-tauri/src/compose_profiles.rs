//! Resolve bundled / repo `docker/compose/<profile>` directories for preset stacks.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Walk up from `start` until `docker/compose` exists (dev / source checkout).
pub(crate) fn find_repo_root(start: &Path) -> PathBuf {
  let mut cur = start.to_path_buf();
  for _ in 0..12 {
    if cur.join("docker/compose").is_dir() {
      return cur;
    }
    if !cur.pop() {
      break;
    }
  }
  start.to_path_buf()
}

/// Directory that contains `docker-compose.yml` for a `ComposeProfile` id.
///
/// Resolution order:
/// 1. `LUMINA_DEV_COMPOSE_ROOT/<profile>` when set (absolute or relative path to parent of profile dirs).
/// 2. `<repo>/docker/compose/<profile>` from [`find_repo_root`] + current working directory.
/// 3. Tauri bundle `resource_dir()/docker/compose/<profile>` when packaged (see `tauri.conf.json` `bundle.resources`).
/// When `LUMINA_DEV_COMPOSE_FULL` is `1`/`true`/`yes` and `docker-compose.full.yml` exists in the profile dir,
/// `docker compose` runs with both `-f docker-compose.yml` and `-f docker-compose.full.yml` (merged stack).
pub(crate) fn compose_full_overlay_enabled(compose_dir: &Path) -> bool {
  if !compose_dir.join("docker-compose.full.yml").is_file() {
    return false;
  }
  std::env::var("LUMINA_DEV_COMPOSE_FULL")
    .map(|s| {
      let t = s.trim();
      t == "1" || t.eq_ignore_ascii_case("true") || t.eq_ignore_ascii_case("yes")
    })
    .unwrap_or(false)
}

pub(crate) fn compose_profile_workdir(app: &AppHandle, profile: &str) -> PathBuf {
  let profile = profile.trim();
  if let Ok(root) = std::env::var("LUMINA_DEV_COMPOSE_ROOT") {
    let p = PathBuf::from(root.trim()).join(profile);
    if p.is_dir() {
      return p;
    }
  }
  let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
  let from_repo = find_repo_root(&cwd).join("docker").join("compose").join(profile);
  if from_repo.is_dir() {
    return from_repo;
  }
  if let Ok(res) = app.path().resource_dir() {
    let bundled = res.join("docker").join("compose").join(profile);
    if bundled.is_dir() {
      return bundled;
    }
  }
  find_repo_root(&cwd).join("docker").join("compose").join(profile)
}

#[cfg(test)]
mod tests {
  use super::find_repo_root;
  use std::path::PathBuf;
  use uuid::Uuid;

  #[test]
  fn find_repo_root_discovers_compose_directory_up_tree() {
    let base = std::env::temp_dir().join(format!("lumina-compose-test-{}", Uuid::new_v4()));
    let nested = base.join("a/b/c");
    std::fs::create_dir_all(base.join("docker/compose")).expect("create compose dir");
    std::fs::create_dir_all(&nested).expect("create nested dir");

    let root = find_repo_root(&nested);
    assert_eq!(root, base);

    let _ = std::fs::remove_dir_all(&base);
  }

  #[test]
  fn compose_full_overlay_requires_file() {
    let base = std::env::temp_dir().join(format!("lumina-compose-overlay-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&base).expect("dir");
    assert!(!super::compose_full_overlay_enabled(&base));
    std::fs::write(base.join("docker-compose.full.yml"), "services: {}\n").expect("write");
    assert!(!super::compose_full_overlay_enabled(&base));
    let _ = std::fs::remove_dir_all(&base);
  }

  #[test]
  fn find_repo_root_returns_start_when_missing() {
    let p = PathBuf::from("/nonexistent/lumina/xyzzy/nope");
    assert_eq!(find_repo_root(&p), p);
  }
}
