use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use tauri::AppHandle;
use tokio::process::Command;

use crate::host_exec::{cmd_timeout_long, get_global_ipc_timeout};

async fn exec_docker_compose_in_dir(
  compose_dir: &Path,
  compose_subargs: &[&str],
  limit: Duration,
  project_name: Option<&str>,
  extra_env: Option<HashMap<String, String>>,
) -> Result<(String, String), String> {
  // Build args: "compose" [-p <name>] -f docker-compose.yml [overlay] <subcommand>
  // -p flag takes highest precedence in all Docker Compose v2 versions,
  // overriding the name: field in compose YAML (env var alone doesn't always win).
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
  if crate::compose_profiles::compose_full_overlay_enabled(compose_dir) {
    compose_args.push("-f".into());
    compose_args.push("docker-compose.full.yml".into());
  }
  for a in compose_subargs {
    compose_args.push((*a).to_string());
  }
  let fut = async {
    let mut cmd = Command::new("docker");
    cmd.current_dir(compose_dir).args(&compose_args);
    if let Some(ref pname) = sanitized_project {
      cmd.env("COMPOSE_PROJECT_NAME", pname);
    }
    if let Some(env_map) = extra_env {
      for (k, v) in env_map {
        cmd.env(k, v);
      }
    }
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

pub(crate) async fn docker_compose_up(app: &AppHandle, body: &Value) -> Value {
  let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
  let template = crate::profile_engine::resolve_profile_template(app, profile);
  let dir = crate::compose_profiles::compose_profile_workdir(app, &template);
  if !dir.is_dir() {
    json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] missing compose directory: {} (set LUMINA_DEV_COMPOSE_ROOT or run from a checkout with docker/compose)", dir.display()) })
  } else {
    match exec_docker_compose_in_dir(&dir, &["up", "-d"], cmd_timeout_long(), Some(profile), Some(crate::profile_engine::get_profile_extra_env(app, profile))).await {
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
    match exec_docker_compose_in_dir(&dir, &["logs", "--tail", "200"], get_global_ipc_timeout(), Some(profile), Some(crate::profile_engine::get_profile_extra_env(app, profile))).await {
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
    match exec_docker_compose_in_dir(&dir, &["down"], cmd_timeout_long(), Some(profile), Some(crate::profile_engine::get_profile_extra_env(app, profile))).await {
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
) -> Result<(String, String), String> {
  exec_docker_compose_in_dir(compose_dir, compose_subargs, limit, project_name, extra_env).await
}
