use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

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
