use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::host_exec::{cmd_timeout_long, get_global_ipc_timeout};

fn build_compose_args(
  _compose_dir: &Path,
  compose_subargs: &[&str],
  project_name: Option<&str>,
  use_full_overlay: bool,
) -> Vec<String> {
  let mut compose_args: Vec<String> = vec!["compose".into()];
  let sanitized_project = project_name.and_then(|pn| {
    let trimmed = pn.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(
        trimmed
          .to_lowercase()
          .chars()
          .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
          .collect::<String>(),
      )
    }
  });
  if let Some(ref pname) = sanitized_project {
    compose_args.push("-p".into());
    compose_args.push(pname.clone());
  }
  compose_args.push("-f".into());
  compose_args.push("docker-compose.yml".into());
  if use_full_overlay {
    compose_args.push("-f".into());
    compose_args.push("docker-compose.full.yml".into());
  }
  if compose_subargs.contains(&"up") {
    compose_args.push("--progress".into());
    compose_args.push("plain".into());
  }
  for a in compose_subargs {
    compose_args.push((*a).to_string());
  }
  compose_args
}

fn parse_byte_size_from_tail(s: &str) -> Option<f64> {
  let lower = s.to_lowercase();
  for (suffix, mult) in [("gb", 1_000_000_000.0), ("mb", 1_000_000.0), ("kb", 1_000.0)] {
    if let Some(pos) = lower.rfind(suffix) {
      let num_part: String = s[..pos]
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect::<String>()
        .chars()
        .rev()
        .collect();
      if let Ok(n) = num_part.parse::<f64>() {
        return Some(n * mult);
      }
    }
  }
  None
}

/// Parse `69.21MB/279.5MB` style progress from Docker pull output.
pub(crate) fn parse_download_fraction(line: &str) -> Option<f32> {
  let lower = line.to_lowercase();
  if !(lower.contains("download") || lower.contains("pulling") || lower.contains("extracting")) {
    return None;
  }
  let slash = line.rfind('/')?;
  let current = parse_byte_size_from_tail(&line[..slash])?;
  let total = parse_byte_size_from_tail(&line[slash + 1..])?;
  if total <= 0.0 {
    return None;
  }
  Some((current / total).min(1.0) as f32)
}

fn apply_compose_env(cmd: &mut Command, project_name: Option<&str>, extra_env: Option<HashMap<String, String>>) {
  if let Some(pn) = project_name.map(str::trim).filter(|s| !s.is_empty()) {
    let sanitized: String = pn
      .to_lowercase()
      .chars()
      .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
      .collect();
    cmd.env("COMPOSE_PROJECT_NAME", sanitized);
  }
  if let Some(env_map) = extra_env {
    for (k, v) in env_map {
      cmd.env(k, v);
    }
  }
}

/// Map compose CLI output lines to a monotonic 18–70% band during `up`.
pub(crate) fn compose_up_progress_from_line(line: &str, current: u8) -> (u8, Option<String>) {
  let lower = line.to_lowercase();
  let label = line.trim();
  let step = if !label.is_empty() && label.len() < 120 {
    Some(label.to_string())
  } else {
    None
  };
  let mut progress = current.max(18);
  if let Some(frac) = parse_download_fraction(line) {
    let mapped = 18u8.saturating_add((frac * 50.0) as u8);
    progress = progress.max(mapped.min(68));
  } else if lower.contains("pulling")
    || lower.contains("download")
    || lower.contains("extracting")
    || lower.contains("pull complete")
  {
    progress = progress.saturating_add(1).clamp(19, 45);
  } else if lower.contains("creating") || lower.contains("recreate") || lower.contains("building") {
    progress = progress.saturating_add(2).clamp(46, 62);
  } else if lower.contains("started")
    || lower.contains("healthy")
    || lower.contains("running")
    || lower.contains("created")
  {
    progress = progress.saturating_add(2).clamp(63, 70);
  }
  (progress, step)
}

struct ComposeUpStreamState {
  progress: Arc<AtomicU8>,
  log_lines: Arc<Mutex<Vec<String>>>,
  app: AppHandle,
}

impl ComposeUpStreamState {
  fn new(app: AppHandle) -> Self {
    Self {
      progress: Arc::new(AtomicU8::new(18)),
      log_lines: Arc::new(Mutex::new(Vec::new())),
      app,
    }
  }

  fn push_line(&self, line: &str) {
    if !line.trim().is_empty() {
      if let Ok(mut log) = self.log_lines.lock() {
        log.push(line.to_string());
        if log.len() > 80 {
          let drain = log.len() - 80;
          log.drain(0..drain);
        }
      }
    }
    let current = self.progress.load(Ordering::Relaxed);
    let (next, step) = compose_up_progress_from_line(line, current);
    if next > current {
      self.progress.store(next, Ordering::Relaxed);
      let payload = if let Some(s) = step {
        serde_json::json!({ "step": s, "progress": next })
      } else {
        serde_json::json!({ "step": line, "progress": next })
      };
      let _ = self.app.emit("profile-switch-progress", payload);
    } else if let Some(s) = step {
      let _ = self.app.emit(
        "profile-switch-progress",
        serde_json::json!({ "step": s, "progress": current }),
      );
    }
  }

  fn failure_message(&self) -> String {
    let log = self.log_lines.lock().ok();
    let lines: Vec<String> = log
      .map(|l| {
        l.iter()
          .rev()
          .take(12)
          .cloned()
          .collect::<Vec<_>>()
          .into_iter()
          .rev()
          .collect()
      })
      .unwrap_or_default();
    if lines.is_empty() {
      "docker compose up failed".to_string()
    } else {
      lines.join("\n")
    }
  }
}

async fn stream_compose_output<R: tokio::io::AsyncRead + Unpin>(
  reader: R,
  state: Arc<ComposeUpStreamState>,
) {
  let mut lines = BufReader::new(reader).lines();
  while let Ok(Some(line)) = lines.next_line().await {
    state.push_line(&line);
  }
}

async fn exec_docker_compose_in_dir(
  compose_dir: &Path,
  compose_subargs: &[&str],
  limit: Duration,
  project_name: Option<&str>,
  extra_env: Option<HashMap<String, String>>,
  use_full_overlay: bool,
) -> Result<(String, String), String> {
  let compose_args = build_compose_args(compose_dir, compose_subargs, project_name, use_full_overlay);
  let fut = async {
    let mut cmd = Command::new("docker");
    cmd.current_dir(compose_dir).args(&compose_args);
    apply_compose_env(&mut cmd, project_name, extra_env);
    let output = cmd
      .output()
      .await
      .map_err(|e| format!("[EXEC_ERROR] {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
      Ok((stdout, stderr))
    } else {
      Err(if stderr.trim().is_empty() { stdout } else { stderr })
    }
  };
  match tokio::time::timeout(limit, fut).await {
    Ok(inner) => inner,
    Err(_) => Err(format!(
      "[HOST_COMMAND_TIMEOUT] docker {}",
      compose_args.join(" ")
    )),
  }
}

/// Stream `docker compose up -d` and emit progress from real compose output lines.
pub(crate) async fn exec_docker_compose_up_streaming(
  app: &AppHandle,
  compose_dir: &Path,
  project_name: &str,
  extra_env: Option<HashMap<String, String>>,
  use_full_overlay: bool,
) -> Result<String, String> {
  let compose_args = build_compose_args(compose_dir, &["up", "-d"], Some(project_name), use_full_overlay);
  let mut cmd = Command::new("docker");
  cmd
    .current_dir(compose_dir)
    .args(&compose_args)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  apply_compose_env(&mut cmd, Some(project_name), extra_env);

  let mut child = cmd
    .spawn()
    .map_err(|e| format!("[EXEC_ERROR] {}", e))?;

  let stream_state = Arc::new(ComposeUpStreamState::new(app.clone()));
  let stderr_handle = if let Some(stderr) = child.stderr.take() {
    let state = stream_state.clone();
    Some(tokio::spawn(async move {
      stream_compose_output(stderr, state).await;
    }))
  } else {
    None
  };
  let stdout_handle = if let Some(stdout) = child.stdout.take() {
    let state = stream_state.clone();
    Some(tokio::spawn(async move {
      stream_compose_output(stdout, state).await;
    }))
  } else {
    None
  };

  let status = tokio::time::timeout(cmd_timeout_long(), child.wait())
    .await
    .map_err(|_| "[HOST_COMMAND_TIMEOUT] docker compose up".to_string())?
    .map_err(|e| format!("[EXEC_ERROR] {}", e))?;

  if let Some(h) = stderr_handle {
    let _ = h.await;
  }
  if let Some(h) = stdout_handle {
    let _ = h.await;
  }

  if status.success() {
    Ok(String::new())
  } else {
    Err(stream_state.failure_message())
  }
}

pub(crate) async fn docker_compose_up(app: &AppHandle, body: &Value) -> Value {
  let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
  let template = crate::profile_engine::resolve_profile_template(app, profile);
  let dir = crate::compose_profiles::compose_profile_workdir(app, &template);
  if !dir.is_dir() {
    json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] missing compose directory: {} (set LUMINA_DEV_COMPOSE_ROOT or run from a checkout with docker/compose)", dir.display()) })
  } else {
    let use_full = crate::compose_profiles::profile_wants_full_stack(app, profile, &dir);
    match exec_docker_compose_in_dir(
      &dir,
      &["up", "-d"],
      cmd_timeout_long(),
      Some(profile),
      Some(crate::profile_engine::get_profile_extra_env(app, profile)),
      use_full,
    )
    .await
    {
      Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
      Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] {}", e.trim()) }),
    }
  }
}

pub(crate) async fn docker_compose_logs(app: &AppHandle, body: &Value) -> Value {
  let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
  let template = crate::profile_engine::resolve_profile_template(app, profile);
  let dir = crate::compose_profiles::compose_profile_workdir(app, &template);
  if !dir.is_dir() {
    json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] missing compose directory: {} (set LUMINA_DEV_COMPOSE_ROOT or run from a checkout with docker/compose)", dir.display()) })
  } else {
    let use_full = crate::compose_profiles::profile_wants_full_stack(app, profile, &dir);
    match exec_docker_compose_in_dir(
      &dir,
      &["logs", "--tail", "200"],
      get_global_ipc_timeout(),
      Some(profile),
      Some(crate::profile_engine::get_profile_extra_env(app, profile)),
      use_full,
    )
    .await
    {
      Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
      Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] {}", e.trim()) }),
    }
  }
}

pub(crate) async fn docker_compose_down(app: &AppHandle, body: &Value) -> Value {
  let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
  let template = crate::profile_engine::resolve_profile_template(app, profile);
  let dir = crate::compose_profiles::compose_profile_workdir(app, &template);
  if !dir.is_dir() {
    json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] missing compose directory: {} (set LUMINA_DEV_COMPOSE_ROOT or run from a checkout with docker/compose)", dir.display()) })
  } else {
    let use_full = crate::compose_profiles::profile_wants_full_stack(app, profile, &dir);
    match exec_docker_compose_in_dir(
      &dir,
      &["down"],
      cmd_timeout_long(),
      Some(profile),
      Some(crate::profile_engine::get_profile_extra_env(app, profile)),
      use_full,
    )
    .await
    {
      Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
      Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] {}", e.trim()) }),
    }
  }
}

/// Stop containers without removing them (docker compose stop).
/// Use this for the UI "Stop" button so containers can be restarted without re-pulling images.
pub(crate) async fn docker_compose_stop(app: &AppHandle, body: &Value) -> Value {
  let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
  let template = crate::profile_engine::resolve_profile_template(app, profile);
  let dir = crate::compose_profiles::compose_profile_workdir(app, &template);
  if !dir.is_dir() {
    json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] missing compose directory: {} (set LUMINA_DEV_COMPOSE_ROOT or run from a checkout with docker/compose)", dir.display()) })
  } else {
    let use_full = crate::compose_profiles::profile_wants_full_stack(app, profile, &dir);
    match exec_docker_compose_in_dir(
      &dir,
      &["stop"],
      cmd_timeout_long(),
      Some(profile),
      Some(crate::profile_engine::get_profile_extra_env(app, profile)),
      use_full,
    )
    .await
    {
      Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
      Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] {}", e.trim()) }),
    }
  }
}

pub(crate) async fn expose_exec_docker_compose_in_dir(
  compose_dir: &Path,
  compose_subargs: &[&str],
  limit: Duration,
  project_name: Option<&str>,
  extra_env: Option<HashMap<String, String>>,
  use_full_overlay: bool,
) -> Result<(String, String), String> {
  exec_docker_compose_in_dir(
    compose_dir,
    compose_subargs,
    limit,
    project_name,
    extra_env,
    use_full_overlay,
  )
  .await
}

#[cfg(test)]
mod tests {
  use super::{compose_up_progress_from_line, parse_download_fraction};

  #[test]
  fn parse_download_fraction_from_docker_line() {
    let frac = parse_download_fraction(
      " 9a165b6e9dc7 Downloading [============> ] 69.21MB/279.5MB",
    )
    .unwrap();
    assert!(frac > 0.2 && frac < 0.3);
  }

  #[test]
  fn compose_up_progress_maps_download_bytes() {
    let line = "9a165b6e9dc7 Downloading [============> ] 69.21MB/279.5MB";
    let (p1, _) = compose_up_progress_from_line(line, 18);
    assert!((30..=48).contains(&p1));
    let (p2, _) = compose_up_progress_from_line(
      "9a165b6e9dc7 Downloading [=========================> ] 200MB/279.5MB",
      p1,
    );
    assert!(p2 > p1);
    assert!(p2 <= 70);
  }

  #[test]
  fn compose_up_progress_increases_on_pull_and_caps() {
    let (p1, _) = compose_up_progress_from_line("Pulling postgres:16", 18);
    assert!(p1 >= 18);
    let (p2, _) = compose_up_progress_from_line("Container app Started", p1);
    assert!(p2 > p1);
    assert!(p2 <= 70);
  }

  #[test]
  fn compose_up_progress_never_below_compose_floor() {
    let (p, _) = compose_up_progress_from_line("unknown line", 10);
    assert_eq!(p, 18);
  }
}
