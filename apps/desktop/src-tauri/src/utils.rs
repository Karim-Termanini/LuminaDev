use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

// ============================================================================
// Store Key Allow-list
// ============================================================================

pub(crate) fn is_allowed_store_key(key: &str) -> bool {
  const ALLOWED_KEYS: &[&str] = &[
    "custom_profiles",
    "wizard_state",
    "ssh_bookmarks",
    "maintenance_state",
    "active_profile",
    "on_login_automation",
    "appearance",
    "cloud_oauth_clients",
    "readiness_wizard_complete",
    "first_run_wizard_complete",
    "general_settings",
    "update_settings",
    "profile_credentials",
    "onboarding_profile",
    "projects_home_dir",
    "app_engine_settings",
    "builder_settings",
    "beta_features_state",
    "notification_settings",
    "shortcuts_settings",
    "datetime_settings",
    "language_settings",
  ];
  const DYNAMIC_PREFIXES: &[&str] = &[
    "project_dir_",
    "python_version_",
    "postgres_version_",
    "node_version_",
  ];
  ALLOWED_KEYS.contains(&key) || DYNAMIC_PREFIXES.iter().any(|prefix| key.starts_with(prefix))
}

// ============================================================================
// Store/File Utilities
// ============================================================================

pub fn app_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("[STORE_PATH_ERROR] {}", e))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("[STORE_DIR_ERROR] {}", e))?;
  Ok(dir.join(name))
}

pub fn read_json(path: &PathBuf) -> Value {
  if !path.exists() {
    return json!({});
  }
  let content = std::fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
  serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
}

pub fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
  let content = serde_json::to_string_pretty(value).map_err(|e| format!("[STORE_ENCODE_ERROR] {}", e))?;
  std::fs::write(path, content).map_err(|e| format!("[STORE_WRITE_ERROR] {}", e))
}

// ============================================================================
// String Utilities
// ============================================================================

/// Bound text returned from maintenance host probes (UTF-8 safe).
pub fn shell_quote_value(v: &str) -> String {
  if v.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '.' | '/' | ':')) {
    v.to_string()
  } else {
    format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\"").replace('$', "\\$").replace('`', "\\`"))
  }
}

pub fn truncate_probe_output(s: &str) -> String {
  const MAX_CHARS: usize = 48_000;
  let count = s.chars().count();
  if count <= MAX_CHARS {
    return s.to_string();
  }
  let head: String = s.chars().take(MAX_CHARS).collect();
  format!("{head}\n… (output truncated)")
}

/// Matches `compose_engine` project name sanitization (`docker compose -p`).
pub fn sanitize_compose_project_name(name: &str) -> String {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return String::new();
  }
  trimmed
    .to_lowercase()
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else {
        '-'
      }
    })
    .collect()
}

pub fn sanitize_docker_name(s: &str) -> String {
  let mut out: String = s
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' {
        c
      } else {
        '-'
      }
    })
    .collect();
  while out.starts_with('-') {
    out.remove(0);
  }
  if out.is_empty() {
    out = "remap".into();
  }
  if out.len() > 220 {
    out.truncate(220);
  }
  out
}

// ============================================================================
// Parsing Utilities
// ============================================================================

pub fn parse_size_mb(raw: &str) -> u64 {
  let s = raw.trim().to_lowercase().replace(" ", "");
  let split_at = s.find(|c: char| !c.is_ascii_digit() && c != '.').unwrap_or(s.len());
  let (num, unit) = s.split_at(split_at);
  let n = num.parse::<f64>().unwrap_or(0.0);
  let mb = if unit.starts_with("gb") || unit == "g" {
    n * 1024.0
  } else if unit.starts_with("kb") || unit == "k" {
    n / 1024.0
  } else if unit.starts_with("b") {
    n / (1024.0 * 1024.0)
  } else {
    n
  };
  mb.round() as u64
}

pub fn is_physical_disk_name(name: &str) -> bool {
  let is_sd = name.starts_with("sd") && name.len() == 3;
  let is_vd = name.starts_with("vd") && name.len() == 3;
  let is_xvd = name.starts_with("xvd") && name.len() == 4;
  let is_nvme = name.starts_with("nvme") && name.contains('n') && !name.contains('p');
  let is_mmc = name.starts_with("mmcblk") && !name.contains('p');
  is_sd || is_vd || is_xvd || is_nvme || is_mmc
}

pub fn ss_process_from_line(line: &str) -> String {
  if let Some(start) = line.find("users:((\"") {
    let sub = &line[start + 9..];
    if let Some(end) = sub.find('"') {
      let process = sub[..end].trim();
      if !process.is_empty() {
        return process.to_string();
      }
    }
  }
  "unknown".to_string()
}

// ============================================================================
// Git Porcelain Parsing
// ============================================================================

fn porcelain_xy_unmerged(x: char, y: char) -> bool {
  x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D')
}

/// Text after the two status characters in `git status --porcelain=v1` / short format, with
/// leading field separators trimmed. Git documents `<xy> <path>`; trimming avoids assuming
/// exactly one ASCII space (and matches real `git` output for `M  file`, ` M file`, etc.).
fn porcelain_rest_after_xy(line: &str) -> &str {
  let mut it = line.chars();
  it.next();
  it.next();
  let tail = it.as_str();
  tail.trim_start_matches([' ', '\t'])
}

pub fn parse_porcelain_v1(output: &str) -> (Vec<Value>, Vec<Value>) {
  let mut staged: Vec<Value> = Vec::new();
  let mut unstaged: Vec<Value> = Vec::new();
  for line in output.lines() {
    let line = line.trim_end();
    if line.chars().nth(1).is_none() {
      continue;
    }
    let x = line.chars().next().unwrap_or(' ');
    let y = line.chars().nth(1).unwrap_or(' ');
    let raw_path = porcelain_rest_after_xy(line);
    if raw_path.is_empty() {
      continue;
    }
    let (path, old_path) = if raw_path.contains(" -> ") {
      let mut parts = raw_path.splitn(2, " -> ");
      let from = parts.next().unwrap_or(raw_path).to_string();
      let to = parts.next().map(|s| s.to_string());
      match to {
        Some(dest) => (dest, Some(from)),
        None => (from, None),
      }
    } else {
      (raw_path.to_string(), None)
    };
    if porcelain_xy_unmerged(x, y) {
      unstaged.push(if let Some(ref old) = old_path {
        json!({ "path": path, "status": "C", "oldPath": old })
      } else {
        json!({ "path": path, "status": "C" })
      });
      continue;
    }
    if x != ' ' && x != '?' && x != 'U' {
      let status = match x {
        'M' => "M",
        'A' => "A",
        'D' => "D",
        'R' => "R",
        _ => "M",
      };
      staged.push(if let Some(ref old) = old_path {
        json!({ "path": path, "status": status, "oldPath": old })
      } else {
        json!({ "path": path, "status": status })
      });
    }
    match (x, y) {
      ('?', '?') => unstaged.push(json!({ "path": path, "status": "?" })),
      (_, 'M') => unstaged.push(json!({ "path": path, "status": "M" })),
      (_, 'D') => unstaged.push(json!({ "path": path, "status": "D" })),
      _ => {}
    }
  }
  (staged, unstaged)
}

/// Parse `git remote -v` stdout: one row per remote name with its **fetch** URL.
pub fn parse_git_remote_fetch_lines(stdout: &str) -> Vec<Value> {
  use std::collections::BTreeMap;
  let mut by_name: BTreeMap<String, String> = BTreeMap::new();
  const FETCH_SUFFIX: &str = " (fetch)";
  for line in stdout.lines() {
    let line = line.trim_end();
    if line.is_empty() {
      continue;
    }
    if !line.ends_with(FETCH_SUFFIX) {
      continue;
    }
    let head = line[..line.len() - FETCH_SUFFIX.len()].trim_end();
    let (name, url) = if let Some((n, u)) = head.split_once('\t') {
      (n.trim(), u.trim())
    } else if let Some(i) = head.find(' ') {
      (head[..i].trim(), head[i + 1..].trim())
    } else {
      continue;
    };
    if name.is_empty() || url.is_empty() {
      continue;
    }
    by_name.insert(name.to_string(), url.to_string());
  }
  by_name
    .into_iter()
    .map(|(name, fetch_url)| json!({ "name": name, "fetchUrl": fetch_url }))
    .collect()
}

// ============================================================================
// Time/System Utilities
// ============================================================================

pub fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

// ============================================================================
// Port Utilities
// ============================================================================

pub fn find_free_port(preferred: u16) -> u16 {
    for port in preferred..preferred.saturating_add(200) {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    preferred
}

// ============================================================================
// Data Payload Builders
// ============================================================================

pub fn docker_prune_preview_payload(containers: u64, images: u64, volumes: u64, networks: u64) -> Value {
  json!({
    "ok": true,
    "preview": {
      "containers": containers,
      "images": images,
      "volumes": volumes,
      "networks": networks
    }
  })
}

// ============================================================================
// Resource limit math
// ============================================================================

pub fn calculate_limit_cores(cores: usize, cpu_limit_percent: u64) -> usize {
  let limit_cores = ((cores as f64) * (cpu_limit_percent as f64 / 100.0)).round() as usize;
  std::cmp::max(1, limit_cores)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_calculate_limit_cores() {
    assert_eq!(calculate_limit_cores(4, 50), 2);
    assert_eq!(calculate_limit_cores(4, 80), 3);
    assert_eq!(calculate_limit_cores(8, 80), 6);
    assert_eq!(calculate_limit_cores(1, 0), 1);
    assert_eq!(calculate_limit_cores(4, 0), 1);
    assert_eq!(calculate_limit_cores(64, 100), 64);
    assert_eq!(calculate_limit_cores(64, 200), 128);
  }

  #[test]
  fn parse_size_mb_parses_common_units() {
    assert_eq!(parse_size_mb("1gb"), 1024);
    assert_eq!(parse_size_mb("512 mb"), 512);
    assert_eq!(parse_size_mb("2048kb"), 2);
    assert_eq!(parse_size_mb("1048576b"), 1);
  }

  #[test]
  fn sanitize_docker_name_normalizes_and_limits() {
    assert_eq!(sanitize_docker_name("My App/Name"), "My-App-Name");
    assert_eq!(sanitize_docker_name("---bad"), "bad");
    assert_eq!(sanitize_docker_name("////"), "remap");
    let long = "a".repeat(300);
    assert_eq!(sanitize_docker_name(&long).len(), 220);
  }

  #[test]
  fn truncate_probe_output_caps_large_buffers() {
    let short = "ok";
    assert_eq!(truncate_probe_output(short), "ok");
    let long = "x".repeat(50_100);
    let out = truncate_probe_output(&long);
    assert!(out.contains("(output truncated)"));
    assert!(out.len() < long.len());
  }

  #[test]
  fn disk_and_ss_parsers_extract_expected_values() {
    assert!(is_physical_disk_name("sda"));
    assert!(is_physical_disk_name("nvme0n1"));
    assert!(!is_physical_disk_name("nvme0n1p1"));
    assert_eq!(
      ss_process_from_line("users:((\"docker-proxy\",pid=123,fd=4))"),
      "docker-proxy"
    );
    assert_eq!(ss_process_from_line("no users payload"), "unknown");
  }

  #[test]
  fn porcelain_parses_modified_staged() {
    let input = "M  src/main.rs";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 1);
    assert_eq!(staged[0]["status"], "M");
    assert_eq!(staged[0]["path"], "src/main.rs");
    assert_eq!(unstaged.len(), 0);
  }

  #[test]
  fn porcelain_preserves_apps_prefix_worktree_modified() {
    let input = " M apps/desktop/src/renderer/src/pages/GitVcsPage.tsx";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 0);
    assert_eq!(unstaged.len(), 1);
    assert_eq!(
      unstaged[0]["path"],
      "apps/desktop/src/renderer/src/pages/GitVcsPage.tsx"
    );
  }

  #[test]
  fn porcelain_parses_untracked() {
    let input = "?? new_file.rs";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 0);
    assert_eq!(unstaged.len(), 1);
    assert_eq!(unstaged[0]["status"], "?");
  }

  #[test]
  fn porcelain_parses_conflict() {
    let input = "UU conflict.rs";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 0);
    assert_eq!(unstaged.len(), 1);
    assert_eq!(unstaged[0]["status"], "C");
  }

  #[test]
  fn porcelain_parses_both_added_unmerged() {
    let input = "AA both.rs";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 0);
    assert_eq!(unstaged.len(), 1);
    assert_eq!(unstaged[0]["status"], "C");
    assert_eq!(unstaged[0]["path"], "both.rs");
  }

  #[test]
  fn porcelain_parses_ud_unmerged() {
    let input = "UD deleted-by-us.rs";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 0);
    assert_eq!(unstaged.len(), 1);
    assert_eq!(unstaged[0]["status"], "C");
  }

  #[test]
  fn porcelain_parses_renamed() {
    let input = "R  old_name.rs -> new_name.rs";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 1);
    assert_eq!(staged[0]["status"], "R");
    assert_eq!(staged[0]["path"], "new_name.rs");
    assert_eq!(staged[0]["oldPath"], "old_name.rs");
    assert_eq!(unstaged.len(), 0);
  }

  #[test]
  fn porcelain_parses_staged_and_unstaged() {
    let input = "MM src/lib.rs";
    let (staged, unstaged) = parse_porcelain_v1(input);
    assert_eq!(staged.len(), 1);
    assert_eq!(staged[0]["status"], "M");
    assert_eq!(unstaged.len(), 1);
    assert_eq!(unstaged[0]["status"], "M");
  }

  #[test]
  fn store_keys_allow_cloud_oauth_clients() {
    assert!(is_allowed_store_key("cloud_oauth_clients"));
  }

  #[test]
  fn store_keys_allow_active_profile() {
    assert!(is_allowed_store_key("active_profile"));
  }

  #[test]
  fn store_keys_allow_custom_profiles() {
    assert!(is_allowed_store_key("custom_profiles"));
  }

  #[test]
  fn store_keys_allow_dynamic_prefixes() {
    assert!(is_allowed_store_key("project_dir_web-dev"));
    assert!(is_allowed_store_key("python_version_data-science"));
    assert!(is_allowed_store_key("postgres_version_ai-ml"));
    assert!(is_allowed_store_key("node_version_mobile"));
  }

  #[test]
  fn store_keys_reject_unknown_keys() {
    assert!(!is_allowed_store_key("foo"));
    assert!(!is_allowed_store_key("secret_data"));
    assert!(!is_allowed_store_key(""));
  }

  #[test]
  fn store_keys_reject_unknown_dynamic_prefixes() {
    assert!(!is_allowed_store_key("unknown_prefix_web-dev"));
    assert!(!is_allowed_store_key("secret_project_dir_web-dev"));
  }

  #[test]
  fn store_keys_allow_all_configured_static_keys() {
    for key in &[
      "custom_profiles", "wizard_state", "ssh_bookmarks", "maintenance_state",
      "active_profile", "on_login_automation", "appearance", "cloud_oauth_clients",
      "readiness_wizard_complete", "first_run_wizard_complete", "general_settings", "update_settings",
      "profile_credentials", "onboarding_profile", "projects_home_dir",
      "app_engine_settings", "builder_settings",
      "beta_features_state", "notification_settings", "shortcuts_settings",
      "datetime_settings", "language_settings",
    ] {
      assert!(is_allowed_store_key(key), "expected key '{}' to be allowed", key);
    }
  }
}
