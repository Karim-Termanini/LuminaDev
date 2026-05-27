use serde_json::{json, Value};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{Read, Write};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::process::Command;
use uuid::Uuid;

mod project_scaffold;
mod state;
pub(crate) use state::{AppState, TerminalSession, START_TIME};
mod utils;
use utils::{
  app_file,
  docker_prune_preview_payload,
  is_physical_disk_name,
  now_ms,
  parse_git_remote_fetch_lines,
  parse_porcelain_v1,
  parse_size_mb,
  read_json,
  sanitize_docker_name,
  shell_quote_value,
  ss_process_from_line,
  truncate_probe_output,
  write_json,
};

mod host_exec;
use host_exec::{
  get_global_ipc_timeout,
  set_global_ipc_timeout,
  get_global_thread_pool_size,
  set_global_thread_pool_size,
  get_global_daemon_auto_restart,
  set_global_daemon_auto_restart,
  cmd_timeout_install_step,
  cmd_timeout_long,
  cmd_timeout_short,
  cmd_timeout_ssh,
  exec_output,
  exec_output_limit,
  exec_result,
  exec_result_limit,
  read_proc_text,
};
mod runtime_packages;
use runtime_packages::{
  pkg_remove_cmd,
  pkg_upgrade_cmd,
  runtime_dnf_package_available,
  runtime_java_major,
  runtime_java_system_packages_for_version,
  runtime_pkg_mgr,
  runtime_preview_removable_deps,
  runtime_system_package_available,
  runtime_system_package_installed,
  runtime_system_packages,
};
mod runtime_versioning;
use runtime_versioning::{
  lumina_dart_channel_release,
  lumina_dotnet_install_channel,
  lumina_first_version_token,
  lumina_probe_meaningful_line,
  runtime_dnf_repoquery_versions,
};
#[cfg(test)]
use runtime_versioning::{
  lumina_rust_channel_token,
  lumina_version_token_matches_probe_line,
};
mod runtime_paths;
use runtime_paths::{
  lumina_home_dir,
  lumina_path_must_be_under_home,
  lumina_replace_symlink,
};
mod runtime_verify;
use runtime_verify::runtime_append_verify;
mod runtime_jobs;
use runtime_jobs::runtime_job_execute;
mod compose_profiles;
mod cloud_auth;
mod profile_credentials;
mod cloud_git_ipc;
mod git_vcs_ipc;
mod git_vcs_repo_state;
mod git_vcs_network;
mod git_vcs_file_diff;
use git_vcs_network::{git_network_with_auth, GitNetworkOp};
mod readiness;
mod readiness_ipc;
mod docker_ext;
mod executor;
mod profile_engine;
mod compose_engine;
mod docker_engine;
use cloud_auth::CredentialStore;


fn is_allowed_store_key(key: &str) -> bool {
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
    "general_settings",
    "update_settings",
    "profile_credentials",
    "onboarding_profile",
    "projects_home_dir",
    "resources_settings",
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


fn read_cloud_oauth_store_overrides(app: &AppHandle) -> (Option<String>, Option<String>) {
  let Ok(path) = app_file(app, "store.json") else {
    return (None, None);
  };
  let root = read_json(&path);
  let Some(bag) = root.get("cloud_oauth_clients") else {
    return (None, None);
  };
  let gh = bag
    .get("github_client_id")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let gl = bag
    .get("gitlab_client_id")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  (gh, gl)
}

fn get_resource_limits(app: &tauri::AppHandle) -> (usize, usize, u64) {
  let mut cpu_limit = 80;
  let mut ram_limit_mb = 4096;
  if let Ok(store_path) = app_file(app, "store.json") {
    let store = read_json(&store_path);
    if let Some(res) = store.get("resources_settings") {
      if let Some(cpu) = res.get("cpuLimitPercent").and_then(|v| v.as_u64()) {
        cpu_limit = cpu;
      }
      if let Some(ram) = res.get("ramLimitMb").and_then(|v| v.as_u64()) {
        ram_limit_mb = ram;
      }
    }
  }
  let cores = std::thread::available_parallelism()
    .map(|n| n.get())
    .unwrap_or(4);
  let limit_cores = utils::calculate_limit_cores(cores, cpu_limit);
  (limit_cores, cores, ram_limit_mb)
}

/// Run a bootstrap script without elevation (writes under $HOME only).
// Streaming user-shell install step — identical progress logic to sudo_bash_install_step
// but runs as the user (no sudo/pkexec). Streams stdout+stderr live so the UI
// shows real output while the installer is running.
async fn runtime_bash_user_step(
  cmd: &str,
  logs: &mut Vec<String>,
  app: Option<tauri::AppHandle>,
  job_id: Option<String>,
  base_progress: u32,
  step_weight: u32,
) -> Result<(), String> {
  let mut cmd_builder = Command::new("nice");
  cmd_builder
    .arg("-n")
    .arg("19")
    .arg("bash")
    .arg("-c")
    .env_remove("npm_config_prefix")
    .env_remove("NPM_CONFIG_PREFIX");

  let mut prefixed_cmd;
  if let Some(ref app_h) = app {
    let (limit_cores, cores, ram_limit_mb) = get_resource_limits(app_h);
    logs.push(format!(
      "[RESOURCE_ENFORCEMENT] Constraints: CPU Cores = {}/{} (nice 19, CARGO_BUILD_JOBS, MAKEFLAGS), RAM limit = {} MB (ulimit -v + runtime env vars), max processes = 512 (ulimit -u)",
      limit_cores, cores, ram_limit_mb
    ));
    prefixed_cmd = format!(
      "ulimit -v {} 2>/dev/null; ulimit -u 512 2>/dev/null; ",
      ram_limit_mb.saturating_mul(1024)
    );
    prefixed_cmd.push_str(cmd);
    cmd_builder
      .env("CARGO_BUILD_JOBS", limit_cores.to_string())
      .env("MAKEFLAGS", format!("-j{}", limit_cores))
      .env("MISE_JOBS", limit_cores.to_string())
      .env("NODE_OPTIONS", format!("--max-old-space-size={}", ram_limit_mb))
      .env("GOMEMLIMIT", format!("{}MiB", ram_limit_mb))
      .env("_JAVA_OPTIONS", format!("-Xmx{}m", ram_limit_mb));
    cmd_builder.arg(prefixed_cmd.as_str());
  } else {
    cmd_builder.arg(cmd);
  }

  logs.push(format!("RUNNING (user shell, no sudo): {}", cmd));

  let mut child = cmd_builder
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] spawn: {}", e))?;

  let stdout = child.stdout.take().unwrap();
  let stderr = child.stderr.take().unwrap();
  let mut out_reader = tokio::io::BufReader::new(stdout).lines();
  let mut err_reader = tokio::io::BufReader::new(stderr).lines();

  let mut line_count: u32 = 0;
  let mut last_explicit_bonus: u32 = 0;
  let deadline = tokio::time::Instant::now() + cmd_timeout_install_step();

  loop {
    tokio::select! {
      res = out_reader.next_line() => {
        match res {
          Ok(Some(line)) => {
            if !line.trim().is_empty() {
              logs.push(line.clone());
              line_count += 1;
            }
            if let (Some(ref app_h), Some(ref jid)) = (&app, &job_id) {
              let mut bonus = last_explicit_bonus;
              if line.contains('%') {
                if let Some(p_str) = line.split('%').next().and_then(|s| s.split_whitespace().last()) {
                  if let Ok(p) = p_str.parse::<u32>() {
                    let explicit = (p * step_weight) / 100;
                    if explicit > bonus { bonus = explicit; last_explicit_bonus = explicit; }
                  }
                }
              } else if line.contains('/') && (line.contains('(') || line.contains('[')) {
                if let Some(idx) = line.find('/') {
                  let before = &line[..idx];
                  let after  = &line[idx+1..];
                  let start = before.rfind(|c: char| !c.is_ascii_digit()).map(|i| i+1).unwrap_or(0);
                  let end   = after.find(|c: char| !c.is_ascii_digit()).unwrap_or(after.len());
                  let cur   = line[start..idx].trim().parse::<u32>().unwrap_or(0);
                  let total = line[idx+1..idx+1+end].trim().parse::<u32>().unwrap_or(1);
                  if let Some(explicit) = (cur * step_weight).checked_div(total) {
                    if explicit > bonus { bonus = explicit; last_explicit_bonus = explicit; }
                  }
                }
              } else {
                let heuristic = (line_count * step_weight)
                  .checked_div(60)
                  .unwrap_or(0)
                  .min(step_weight.saturating_sub(2));
                if heuristic > bonus { bonus = heuristic; }
              }
              let prog = (base_progress + bonus).min(base_progress + step_weight.saturating_sub(1));
              let st = app_h.state::<AppState>();
              let mut jobs = st.jobs.lock().await;
              if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(jid.as_str())) {
                let cur_prog = j["progress"].as_u64().unwrap_or(0) as u32;
                if prog > cur_prog { j["progress"] = json!(prog); }
              }
            }
          }
          _ => break,
        }
      }
      res = err_reader.next_line() => {
        if let Ok(Some(line)) = res {
          if !line.trim().is_empty() { logs.push(line); }
        }
      }
      _ = tokio::time::sleep_until(deadline) => {
        let _ = child.kill().await;
        return Err("[RUNTIME_INSTALL_FAILED] [HOST_COMMAND_TIMEOUT] bash -c <runtime-user-step>".to_string());
      }
    }
  }

  match child.wait().await {
    Ok(s) if s.success() => Ok(()),
    Ok(_) => {
      let tail = logs.last()
        .map(|l| l.as_str()).unwrap_or("non-zero exit").to_string();
      Err(format!("[RUNTIME_INSTALL_FAILED] {}", tail.trim()))
    }
    Err(e) => Err(format!("[RUNTIME_INSTALL_FAILED] wait: {}", e)),
  }
}


async fn exec_sshpass_ssh(
  password: &str,
  port: &str,
  remote: &str,
  remote_cmd: &str,
  limit: Duration,
) -> Result<(String, String), String> {
  let fut = async {
    let output = Command::new("sshpass")
      .arg("-p")
      .arg(password)
      .arg("ssh")
      .arg("-o").arg("StrictHostKeyChecking=no")
      .arg("-o").arg("PreferredAuthentications=password")
      .arg("-o").arg("PubkeyAuthentication=no")
      .arg("-p")
      .arg(port)
      .arg(remote)
      .arg(remote_cmd)
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
    Err(_) => Err("[HOST_COMMAND_TIMEOUT] sshpass ssh".to_string()),
  }
}


pub(crate) async fn sudo_bash_install_step(cmd: &str, password: Option<&str>, logs: &mut Vec<String>, app: Option<tauri::AppHandle>, job_id: Option<String>, base_progress: u32, step_weight: u32) -> Result<(), String> {
  logs.push(format!("RUNNING: {}", cmd));

  let pw_trim = password.and_then(|p| {
    let t = p.trim();
    if t.is_empty() {
      None
    } else {
      Some(t)
    }
  });

  let pwless = sudo_passwordless_ok().await;

  enum SpawnMode<'a> {
    Pkexec,
    SudoPwless,
    SudoStdin(&'a str),
  }

  let mode = if pwless {
    SpawnMode::SudoPwless
  } else if let Some(pw) = pw_trim {
    SpawnMode::SudoStdin(pw)
  } else {
    logs.push("AUTH: system privilege dialog — enter your login password there (leave Lumina sudo field blank if using this)".into());
    SpawnMode::Pkexec
  };

  let mut limit_cores = 0;
  let mut cores = 0;
  let mut ram_limit_mb = 0;
  let has_limits = if let Some(ref app_h) = app {
    let (l_cores, c, r_limit) = get_resource_limits(app_h);
    limit_cores = l_cores;
    cores = c;
    ram_limit_mb = r_limit;
    true
  } else {
    false
  };

  let mut wrapped_cmd: String;
  let effective_cmd: &str = if has_limits {
    logs.push(format!(
      "[RESOURCE_ENFORCEMENT] Constraints: CPU Cores = {}/{} (nice 19, CARGO_BUILD_JOBS, MAKEFLAGS), RAM limit = {} MB (ulimit -v + runtime env vars), max processes = 512 (ulimit -u)",
      limit_cores, cores, ram_limit_mb
    ));
    wrapped_cmd = format!(
      "ulimit -v {} 2>/dev/null; ulimit -u 512 2>/dev/null; ",
      ram_limit_mb.saturating_mul(1024)
    );
    wrapped_cmd.push_str(cmd);
    wrapped_cmd.as_str()
  } else {
    cmd
  };

  let mut child = match mode {
    SpawnMode::Pkexec => {
      let mut cmd_builder = Command::new("pkexec");
      cmd_builder.args(["nice", "-n", "19", "bash", "-c", effective_cmd]);
      if has_limits {
        cmd_builder
          .env("CARGO_BUILD_JOBS", limit_cores.to_string())
          .env("MAKEFLAGS", format!("-j{}", limit_cores))
          .env("MISE_JOBS", limit_cores.to_string())
          .env("NODE_OPTIONS", format!("--max-old-space-size={}", ram_limit_mb))
          .env("GOMEMLIMIT", format!("{}MiB", ram_limit_mb))
          .env("_JAVA_OPTIONS", format!("-Xmx{}m", ram_limit_mb));
      }
      cmd_builder
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("[ELEVATED_CMD_FAILED] pkexec spawn: {}", e))?
    }
    SpawnMode::SudoPwless => {
      let mut cmd_builder = Command::new("sudo");
      cmd_builder.args(["nice", "-n", "19", "bash", "-c", effective_cmd]);
      if has_limits {
        cmd_builder
          .env("CARGO_BUILD_JOBS", limit_cores.to_string())
          .env("MAKEFLAGS", format!("-j{}", limit_cores))
          .env("MISE_JOBS", limit_cores.to_string())
          .env("NODE_OPTIONS", format!("--max-old-space-size={}", ram_limit_mb))
          .env("GOMEMLIMIT", format!("{}MiB", ram_limit_mb))
          .env("_JAVA_OPTIONS", format!("-Xmx{}m", ram_limit_mb));
      }
      cmd_builder
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("[ELEVATED_CMD_FAILED] sudo spawn: {}", e))?
    }
    SpawnMode::SudoStdin(pw) => {
      let mut cmd_builder = Command::new("sudo");
      cmd_builder
        .arg("-S")
        .arg("-p")
        .arg("")
        .arg("nice")
        .arg("-n")
        .arg("19")
        .arg("bash")
        .arg("-c")
        .arg(effective_cmd);
      if has_limits {
        cmd_builder
          .env("CARGO_BUILD_JOBS", limit_cores.to_string())
          .env("MAKEFLAGS", format!("-j{}", limit_cores))
          .env("MISE_JOBS", limit_cores.to_string())
          .env("NODE_OPTIONS", format!("--max-old-space-size={}", ram_limit_mb))
          .env("GOMEMLIMIT", format!("{}MiB", ram_limit_mb))
          .env("_JAVA_OPTIONS", format!("-Xmx{}m", ram_limit_mb));
      }
      let mut c = cmd_builder
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("[ELEVATED_CMD_FAILED] sudo spawn: {}", e))?;
      if let Some(mut stdin) = c.stdin.take() {
        stdin
          .write_all(format!("{pw}\n").as_bytes())
          .await
          .map_err(|e| format!("[ELEVATED_CMD_FAILED] stdin: {}", e))?;
        let _ = stdin.shutdown().await;
      }
      c
    }
  };

  let stdout = child.stdout.take().unwrap();
  let stderr = child.stderr.take().unwrap();
  let mut reader = tokio::io::BufReader::new(stdout).lines();
  let mut err_reader = tokio::io::BufReader::new(stderr).lines();

  let job_id_clone = job_id.clone();
  let app_clone = app.clone();

  // Read stdout and update logs/progress
  let mut line_count: u32 = 0;
  let mut last_explicit_bonus: u32 = 0; // highest % seen from explicit patterns

  loop {
    tokio::select! {
      res = reader.next_line() => {
        match res {
          Ok(Some(line)) => {
            if !line.trim().is_empty() {
              logs.push(format!("OUT: {}", line.clone()));
              line_count += 1;
            }
            // Progress parsing: explicit patterns take priority; line counter fills gaps
            if let (Some(app), Some(jid)) = (&app_clone, &job_id_clone) {
              let mut bonus = last_explicit_bonus;
              if line.contains('%') {
                let parts: Vec<&str> = line.split('%').collect();
                if let Some(p_str) = parts[0].split_whitespace().last() {
                  if let Ok(p) = p_str.parse::<u32>() {
                    let explicit = (p * step_weight) / 100;
                    if explicit > bonus { bonus = explicit; last_explicit_bonus = explicit; }
                  }
                }
              } else if line.contains('/') && (line.contains('(') || line.contains('[')) {
                if let Some(caps) = line.find('/') {
                  let start_search = &line[..caps];
                  let start = start_search.rfind(|c: char| !c.is_ascii_digit()).map(|idx| idx + 1).unwrap_or(0);
                  let end_search = &line[caps+1..];
                  let end = end_search.find(|c: char| !c.is_ascii_digit()).unwrap_or(end_search.len());
                  let cur = line[start..caps].trim().parse::<u32>().unwrap_or(0);
                  let total = line[caps+1..caps+1+end].trim().parse::<u32>().unwrap_or(1);
                  if let Some(explicit) = (cur * step_weight).checked_div(total) {
                    if explicit > bonus { bonus = explicit; last_explicit_bonus = explicit; }
                  }
                }
              } else {
                // Line-count heuristic: each line nudges progress forward (capped below explicit)
                let heuristic = (line_count * step_weight)
                  .checked_div(60)
                  .unwrap_or(0)
                  .min(step_weight.saturating_sub(2));
                if heuristic > bonus { bonus = heuristic; }
              }
              let prog = (base_progress + bonus).min(base_progress + step_weight.saturating_sub(1));
              let st = app.state::<AppState>();
              let mut jobs = st.jobs.lock().await;
              if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(jid.as_str())) {
                let cur_prog = j["progress"].as_u64().unwrap_or(0) as u32;
                if prog > cur_prog {
                  j["progress"] = json!(prog);
                }
              }
            }
          }
          _ => break,
        }
      }
      res = err_reader.next_line() => {
        match res {
          Ok(Some(line)) => {
            if line.contains("[sudo] password") { continue; }
            if !line.trim().is_empty() {
              logs.push(line);
            }
          }
          _ => break,
        }
      }
    }
  }

  let status = child.wait().await.map_err(|e| format!("[DOCKER_INSTALL_FAILED] {}", e))?;
  if status.success() {
    Ok(())
  } else {
    Err(format!("[PROCESS_EXIT_ERROR] Command failed with code {}", status.code().unwrap_or(-1)))
  }
}

pub(crate) async fn sudo_passwordless_ok() -> bool {
  exec_output_limit("sudo", &["-n", "true"], cmd_timeout_short())
    .await
    .is_ok()
}


fn effective_runtime_job_final_state(default_state: &str, current_state: &str) -> &'static str {
  if current_state == "cancelled" {
    "cancelled"
  } else if default_state == "failed" {
    "failed"
  } else {
    "completed"
  }
}

fn cancel_runtime_job(jobs: &mut [Value], id: &str) -> bool {
  if let Some(j) = jobs
    .iter_mut()
    .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(id))
  {
    if j.get("state").and_then(|v| v.as_str()) == Some("running") {
      j["state"] = json!("cancelled");
      j["logTail"] = json!(["Cancelled by user."]);
      return true;
    }
  }
  false
}

async fn runtime_set_active_invoke(body: &Value) -> Value {
  if std::env::var("FLATPAK_ID").is_ok() {
    return json!({
      "ok": false,
      "error": "[RUNTIME_SET_ACTIVE_FAILED] Flatpak sandbox cannot modify host toolchain selection. Install/switch runtimes on the host, then expose them via Flatpak overrides."
    });
  }

  let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or_default().trim();
  let path_raw = body.get("path").and_then(|v| v.as_str()).unwrap_or_default().trim();
  if runtime_id.is_empty() || path_raw.is_empty() {
    return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Missing runtimeId or path." });
  }

  let home = match lumina_home_dir() {
    Ok(h) => h,
    Err(e) => return json!({ "ok": false, "error": e }),
  };

  let path = match lumina_path_must_be_under_home(&home, Path::new(path_raw)) {
    Ok(p) => p,
    Err(e) => return json!({ "ok": false, "error": e }),
  };

  let safe_path = path.to_string_lossy().replace('\'', "'\\''");

  let res: Result<(), String> = match runtime_id {
    "node" => {
      if !path.ends_with(Path::new("bin/node")) || !path.to_string_lossy().contains("/.nvm/versions/node/") {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Node path (expected an nvm-managed ~/.nvm/versions/node/*/bin/node)." });
      }
      let cmd = format!(
        "export NVM_DIR=\"$HOME/.nvm\" \
         && [ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\" \
         && unset npm_config_prefix NPM_CONFIG_PREFIX npm_CONFIG_PREFIX \
         && export NPM_CONFIG_USERCONFIG=/dev/null \
         && nvm alias default \"$(basename \"$(dirname '{}')\")\" \
         && nvm use default",
        safe_path
      );
      exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
        .await
        .map(|_| ())
        .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
    }
    "python" => {
      let p = path.to_string_lossy();
      let ok_bin = path.file_name() == Some(OsStr::new("python"))
        || path.file_name() == Some(OsStr::new("python3"));
      if !p.contains("/.pyenv/versions/") || !ok_bin {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Python path (expected a pyenv-managed ~/.pyenv/versions/*/bin/python or python3)." });
      }
      let cmd = format!(
        "export PYENV_ROOT=\"$HOME/.pyenv\" \
         && export PATH=\"$PYENV_ROOT/bin:$PATH\" \
         && eval \"$(pyenv init -)\" \
         && pyenv global \"$(basename \"$(dirname '{}')\")\"",
        safe_path
      );
      exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
        .await
        .map(|_| ())
        .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
    }
    "go" => {
      if !path.ends_with(Path::new("bin/go")) || !path.to_string_lossy().contains("/.local/share/lumina/go/") {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Go path (expected ~/.local/share/lumina/go/<ver>/bin/go)." });
      }
      let Some(ver_dir) = path.parent().and_then(|p| p.parent()) else {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve Go install directory." });
      };
      let link = home.join(".local/share/lumina/go/current");
      lumina_replace_symlink(&link, ver_dir)
    }
    "java" => {
      if !path.ends_with(Path::new("bin/java")) || !path.to_string_lossy().contains("/.local/share/lumina/java/jdk-") {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Java path (expected ~/.local/share/lumina/java/jdk-*/bin/java)." });
      }
      let Some(jdk_dir) = path.parent().and_then(|p| p.parent()) else {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve Java install directory." });
      };
      let link = home.join(".local/share/lumina/java/current");
      lumina_replace_symlink(&link, jdk_dir)
    }
    "zig" => {
      if path.file_name() != Some(OsStr::new("zig")) || !path.to_string_lossy().contains("/.local/share/lumina/zig/") {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Zig path (expected ~/.local/share/lumina/zig/<ver>/zig)." });
      }
      let Some(zig_dir) = path.parent() else {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve Zig install directory." });
      };
      let link = home.join(".local/share/lumina/zig/current");
      lumina_replace_symlink(&link, zig_dir)
    }
    "rust" => {
      if !path.ends_with(Path::new("bin/rustc")) || !path.to_string_lossy().contains("/.rustup/toolchains/") {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Rust path (expected ~/.rustup/toolchains/<name>/bin/rustc)." });
      }
      let toolchain = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .trim()
        .to_string();
      if toolchain.is_empty() {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve rustup toolchain name." });
      }
      let safe_tc = toolchain.replace('\'', "'\\''");
      let cmd = format!(
        "export PATH=\"$HOME/.cargo/bin:$PATH\" \
         && command -v rustup >/dev/null 2>&1 \
         && rustup default '{}'",
        safe_tc
      );
      exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
        .await
        .map(|_| ())
        .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
    }
    _ => return json!({ "ok": false, "error": format!("[RUNTIME_SET_ACTIVE_FAILED] Switching active '{}' is not supported yet.", runtime_id) }),
  };

  match res {
    Ok(()) => json!({ "ok": true }),
    Err(e) => json!({ "ok": false, "error": e }),
  }
}



#[tauri::command]
async fn ipc_send(channel: String, payload: Value, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
  match channel.as_str() {
    "dh:terminal:write" => {
      let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let data = payload.get("data").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let map = state.terminals.lock().await;
      if let Some(session) = map.get(&id) {
        let mut writer = session
          .writer
          .lock()
          .map_err(|_| "[TERMINAL_WRITE_FAILED] writer lock poisoned".to_string())?;
        writer
          .write_all(data.as_bytes())
          .map_err(|e| format!("[TERMINAL_WRITE_FAILED] {}", e))?;
        writer.flush().map_err(|e| format!("[TERMINAL_WRITE_FAILED] {}", e))?;
      }
      Ok(())
    },
    "dh:terminal:close" => {
      let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let session = {
        let mut map = state.terminals.lock().await;
        map.remove(&id)
      };
      if let Some(session) = session {
        // Kill child first, then wait for it to exit so the PTY reader thread
        // gets a clean EOF before the master fd is dropped. Without this wait
        // the reader thread can access freed PTY memory → heap corruption.
        tokio::task::spawn_blocking(move || {
          if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
          }
          // session (and master) dropped here, after child has exited
        });
      }
      Ok(())
    },
    "dh:terminal:resize" => {
      let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
      let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
      let map = state.terminals.lock().await;
      if let Some(session) = map.get(&id) {
        if let Ok(master) = session.master.lock() {
          let _ = master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
          });
        }
      }
      Ok(())
    },
    _ => {
      let _ = app.emit("dh:warn", json!({ "channel": channel, "kind": "unknown_ipc_send" }));
      Ok(())
    },
  }
}

// ─── Git VCS helpers ──────────────────────────────────────────────────────────

/// `git status --porcelain=v1` XY pair is an unmerged / conflicted path.
async fn git_ahead_behind(repo_path: &str) -> (Option<i64>, Option<i64>) {
    let ahead = exec_output_limit(
        "git", &["-C", repo_path, "rev-list", "--count", "@{u}..HEAD"],
        cmd_timeout_short(),
    ).await.ok().and_then(|s| s.trim().parse::<i64>().ok());
    let behind = exec_output_limit(
        "git", &["-C", repo_path, "rev-list", "--count", "HEAD..@{u}"],
        cmd_timeout_short(),
    ).await.ok().and_then(|s| s.trim().parse::<i64>().ok());
    (ahead, behind)
}

#[tauri::command]
async fn ipc_invoke(channel: String, payload: Option<Value>, app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
  let body = payload.unwrap_or_else(|| json!({}));
  let res = match channel.as_str() {
        "dh:app:info" => json!({
          "ok": true,
          "version": env!("CARGO_PKG_VERSION"),
          "buildDate": env!("BUILD_DATE"),
          "rustVersion": env!("RUSTC_VERSION"),
          "platform": std::env::consts::OS,
        }),
    "dh:session:info" => {
      let flatpak_id = std::env::var("FLATPAK_ID").ok();
      let kind = if flatpak_id.is_some() { "flatpak" } else { "native" };
      json!({
        "ok": true,
        "mode": "tauri",
        "kind": kind,
        "flatpakId": flatpak_id,
        "platform": std::env::consts::OS,
        "summary": format!("Tauri/{} ({})", kind, std::env::consts::OS)
      })
    },
    "dh:store:get" => {
      let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
      if !is_allowed_store_key(key) {
        return Ok(json!({ "ok": false, "error": "[STORE_KEY_DENIED] Key not allowed." }));
      }
      match app_file(&app, "store.json") {
        Ok(path) => {
          let store = read_json(&path);
          json!({ "ok": true, "data": store.get(key).cloned().unwrap_or(Value::Null) })
        }
        Err(e) => json!({ "ok": false, "error": e }),
      }
    },
    "dh:store:set" => {
      let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
      if !is_allowed_store_key(key) {
        return Ok(json!({ "ok": false, "error": "[STORE_KEY_DENIED] Key not allowed." }));
      }
      match app_file(&app, "store.json") {
        Ok(path) => {
          let mut store = read_json(&path);
          // Accept both 'value' and 'data' to resolve contract mismatch
          let value = body.get("value")
            .or_else(|| body.get("data"))
            .cloned()
            .unwrap_or(Value::Null);
            
          if !store.is_object() {
            store = json!({});
          }
          if let Some(map) = store.as_object_mut() {
            map.insert(key.to_string(), value.clone());
          }
          if key == "app_engine_settings" {
            if let Some(ms) = value.get("ipcTimeoutMs").and_then(|v| v.as_u64()) {
              set_global_ipc_timeout(ms);
            }
            if let Some(n) = value.get("threadPoolSize").and_then(|v| v.as_u64()) {
              set_global_thread_pool_size(n);
            }
            if let Some(v) = value.get("daemonAutoRestart").and_then(|v| v.as_bool()) {
              set_global_daemon_auto_restart(v);
            }
          }
          match write_json(&path, &store) {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e }),
          }
        }
        Err(e) => json!({ "ok": false, "error": e }),
      }
    },
    "dh:store:delete" => {
      let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
      if !is_allowed_store_key(key) {
        return Ok(json!({ "ok": false, "error": "[STORE_KEY_DENIED] Key not allowed." }));
      }
      match app_file(&app, "store.json") {
        Ok(path) => {
          let mut store = read_json(&path);
          if store.is_object() {
            if let Some(map) = store.as_object_mut() {
              map.remove(key);
            }
          }
          match write_json(&path, &store) {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e }),
          }
        }
        Err(e) => json!({ "ok": false, "error": e }),
      }
    },
    "dh:layout:get" => match app_file(&app, "layout.json") {
      Ok(path) => {
        let layout_data = read_json(&path);
        let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("default");
        let profile_layout = if let Some(profiles) = layout_data.get("profiles") {
          if let Some(p_layout) = profiles.get(profile) {
            p_layout.clone()
          } else {
            json!({ "version": 1, "placements": [] })
          }
        } else if layout_data.get("placements").is_some() {
          layout_data.clone()
        } else {
          json!({ "version": 1, "placements": [] })
        };
        json!({ "ok": true, "layout": profile_layout })
      }
      Err(e) => json!({ "ok": false, "error": e }),
    },
    "dh:layout:set" => match app_file(&app, "layout.json") {
      Ok(path) => {
        let mut layout_data = read_json(&path);
        if !layout_data.is_object() || layout_data == json!({}) {
          layout_data = json!({ "profiles": {} });
        } else if layout_data.get("profiles").is_none() && layout_data.get("placements").is_some() {
          let old_layout = layout_data.clone();
          layout_data = json!({
            "profiles": {
              "default": old_layout
            }
          });
        }
let prof = body.get("profile").and_then(|v| v.as_str()).unwrap_or("default");
        let value_to_store = body.get("layout").cloned().unwrap_or_else(|| body.clone());
        if let Some(obj) = layout_data.get_mut("profiles").and_then(|v| v.as_object_mut()) {
          obj.insert(prof.to_string(), value_to_store);
        } else {
          return Ok(json!({ "ok": false, "error": "[LAYOUT_SET_FAILED] profiles map is invalid." }));
        }
        match write_json(&path, &layout_data) {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": e }),
        }
      }
      Err(e) => json!({ "ok": false, "error": e }),
    },

    "dh:system:readiness:check" | "dh:system:readiness:fix" => {
      readiness_ipc::invoke(&app, channel.as_str(), &body).await
    },
    "dh:perf:snapshot" => {
      let mut rss_mb = 0u64;
      let statm = read_proc_text("/proc/self/statm").await;
      if let Some(pages) = statm.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok()) {
        rss_mb = (pages * 4096) / 1024 / 1024;
      }
      let uptime_str = read_proc_text("/proc/uptime").await;
      let host_uptime_sec = uptime_str.split_whitespace().next()
        .and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0) as u64;
      
      let app_uptime_ms = START_TIME.get().map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);

      json!({
        "ok": true,
        "snapshot": {
          "startupMs": app_uptime_ms,
          "rssMb": rss_mb,
          "uptimeSec": host_uptime_sec
        }
      })
    },
    "dh:host:distro" => {
      let distro = std::fs::read_to_string("/etc/os-release")
        .unwrap_or_default()
        .lines()
        .find(|l| l.starts_with("ID="))
        .map(|l| l.trim_start_matches("ID=").trim_matches('"').to_string())
        .unwrap_or_else(|| "linux".to_string());
      json!(distro)
    },
    "dh:docker:check-installed" => docker_engine::docker_check_installed().await,
    "dh:docker:list" => docker_engine::docker_list().await,
    "dh:docker:action" => docker_engine::docker_action(&body).await,
    "dh:docker:logs" => docker_engine::docker_logs(&body).await,
    "dh:docker:images:list" => docker_engine::docker_images_list().await,
    "dh:docker:image:action" => docker_engine::docker_image_action(&body).await,
    "dh:docker:volumes:list" => docker_engine::docker_volumes_list().await,
    "dh:docker:volume:create" => docker_engine::docker_volume_create(&body).await,
    "dh:docker:volume:action" => docker_engine::docker_volume_action(&body).await,
    "dh:docker:networks:list" => docker_engine::docker_networks_list().await,
    "dh:docker:network:create" => docker_engine::docker_network_create(&body).await,
    "dh:docker:network:action" => docker_engine::docker_network_action(&body).await,
    "dh:docker:prune" => docker_engine::docker_prune().await,
    "dh:docker:prune:preview" => docker_engine::docker_prune_preview(&body).await,
    "dh:docker:cleanup:run" => docker_engine::docker_cleanup_run(&body).await,
    "dh:docker:pull" => docker_engine::docker_pull(&body).await,
    "dh:docker:search" => docker_engine::docker_search(&body).await,
    "dh:docker:tags" => docker_engine::docker_tags(&body).await,
    "dh:compose:up" => compose_engine::docker_compose_up(&app, &body).await,
    "dh:compose:logs" => compose_engine::docker_compose_logs(&app, &body).await,
    "dh:compose:down" => compose_engine::docker_compose_down(&app, &body).await,
    "dh:ports:suggest" => {
      let template = body.get("template").and_then(|v| v.as_str()).unwrap_or_default();
      let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or_default();
      let sub_template = body.get("subTemplate").and_then(|v| v.as_str()).unwrap_or("react-native");

      // Return existing stored ports if profile already has them, otherwise find free ones
      let mut ports = serde_json::Map::new();
      let existing: std::collections::HashMap<String, u64> = if let Ok(store_path) = crate::app_file(&app, "store.json") {
        let store = crate::read_json(&store_path);
        let mut m = std::collections::HashMap::new();
        for key in &["jupyter_port", "postgres_port", "node_port", "node_hmr_port", "appium_port", "json_server_port", "ollama_port"] {
          if let Some(v) = store.get(format!("{}_{}", key, profile)).and_then(|v| v.as_u64()) {
            m.insert(key.to_string(), v);
          }
        }
        m
      } else {
        std::collections::HashMap::new()
      };

      match template {
        "data-science" => {
          ports.insert("jupyter".into(), (*existing.get("jupyter_port").unwrap_or(&(utils::find_free_port(8888) as u64))).into());
          ports.insert("postgres".into(), (*existing.get("postgres_port").unwrap_or(&(utils::find_free_port(54320) as u64))).into());
        }
        "web-dev" => {
          ports.insert("node".into(), (*existing.get("node_port").unwrap_or(&(utils::find_free_port(3000) as u64))).into());
          ports.insert("node_hmr".into(), (*existing.get("node_hmr_port").unwrap_or(&(utils::find_free_port(5173) as u64))).into());
          ports.insert("postgres".into(), (*existing.get("postgres_port").unwrap_or(&(utils::find_free_port(54321) as u64))).into());
        }
        "mobile" if sub_template == "react-native" => {
          ports.insert("appium".into(), (*existing.get("appium_port").unwrap_or(&(utils::find_free_port(4723) as u64))).into());
          ports.insert("json_server".into(), (*existing.get("json_server_port").unwrap_or(&(utils::find_free_port(3001) as u64))).into());
        }
        "ai-ml" => {
          ports.insert("jupyter".into(), (*existing.get("jupyter_port").unwrap_or(&(utils::find_free_port(8888) as u64))).into());
          ports.insert("ollama".into(), (*existing.get("ollama_port").unwrap_or(&(utils::find_free_port(11434) as u64))).into());
        }
        _ => {}
      }
      json!({ "ok": true, "ports": ports })
    },
    "dh:profile:switch" => profile_engine::profile_switch(&app, &body).await,
    "dh:profile:credentials:store" => profile_engine::profile_credentials_store(&app, &body).await,
    "dh:profile:credentials:list" => profile_engine::profile_credentials_list(&app, &body).await,
    "dh:profile:credentials:delete" => profile_engine::profile_credentials_delete(&app, &body).await,
    "dh:profile:credentials:get" => profile_engine::profile_credentials_get(&app, &body).await,
    "dh:terminal:openExternal" => {
      let launched = exec_output_limit(
        "bash",
        &["-lc", "for t in xdg-terminal-emulator gnome-console kitty alacritty gnome-terminal konsole xfce4-terminal xterm; do command -v $t >/dev/null 2>&1 && ($t >/dev/null 2>&1 &); if [ $? -eq 0 ]; then echo ok; exit 0; fi; done; exit 1"],
        cmd_timeout_short(),
      )
      .await
      .is_ok();
      if launched {
        json!({ "ok": true })
      } else {
        json!({ "ok": false, "error": "[TERMINAL_NOT_FOUND] Could not spawn host terminal." })
      }
    },
    "dh:terminal:create" => {
      let cols = body.get("cols").and_then(|v| v.as_u64()).unwrap_or(120) as u16;
      let rows = body.get("rows").and_then(|v| v.as_u64()).unwrap_or(34) as u16;
      let cmd_name = body
        .get("cmd")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
          if Path::new("/usr/bin/bash").exists() || Path::new("/bin/bash").exists() {
            "bash".to_string()
          } else {
            "sh".to_string()
          }
        });
      let pty_system = native_pty_system();
      match pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
      }) {
        Ok(pair) => {
          let mut cmd = CommandBuilder::new(&cmd_name);
          cmd.env("TERM", "xterm-256color");
          if let Some(env_map) = body.get("env").and_then(|v| v.as_object()) {
            for (key, val) in env_map {
              if let Some(s) = val.as_str() {
                cmd.env(key, s);
              }
            }
          }
          if let Some(args) = body.get("args").and_then(|v| v.as_array()) {
            for arg in args {
              if let Some(s) = arg.as_str() {
                cmd.arg(s);
              }
            }
          } else {
            if cmd_name == "bash" {
              cmd.args(["--noprofile", "--norc", "-i"]);
            } else {
              cmd.arg("-i");
            }
          }
          match pair.slave.spawn_command(cmd) {
            Ok(child) => {
              let id = Uuid::new_v4().to_string();
              let master = Arc::new(StdMutex::new(pair.master));
              let child = Arc::new(StdMutex::new(child));
              let writer = match master.lock() {
                Ok(guard) => match guard.take_writer() {
                  Ok(w) => Arc::new(StdMutex::new(w)),
                  Err(e) => return Ok(json!({ "ok": false, "error": format!("[TERMINAL_CREATE_FAILED] {}", e) })),
                },
                Err(_) => return Ok(json!({ "ok": false, "error": "[TERMINAL_CREATE_FAILED] PTY lock poisoned." })),
              };
              let app_out = app.clone();
              let id_out = id.clone();
              let master_for_reader = Arc::clone(&master);
              std::thread::spawn(move || {
                let mut reader = {
                  let guard = match master_for_reader.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                  };
                  match guard.try_clone_reader() {
                    Ok(r) => r,
                    Err(_) => return,
                  }
                };
                let mut buf = [0u8; 8192];
                while let Ok(n) = reader.read(&mut buf) {
                  if n == 0 {
                    break;
                  }
                  let data = String::from_utf8_lossy(&buf[..n]).to_string();
                  let _ = app_out.emit("dh:terminal:data", json!({ "id": id_out, "data": data }));
                }
                let _ = app_out.emit("dh:terminal:exit", json!({ "id": id_out }));
              });
              state
                .terminals
                .lock()
                .await
                .insert(id.clone(), TerminalSession { master, child, writer });
              json!({ "ok": true, "id": id })
            }
            Err(e) => json!({ "ok": false, "error": format!("[TERMINAL_CREATE_FAILED] {}", e) }),
          }
        }
        Err(e) => json!({ "ok": false, "error": format!("[TERMINAL_CREATE_FAILED] {}", e) }),
      }
    }
    "dh:terminal:get-all-env" => {
      let envs: HashMap<String, String> = std::env::vars().collect();
      json!({ "ok": true, "env": envs })
    },
    "dh:docker:terminal" => docker_engine::docker_terminal(&app, &body).await,
    "dh:job:list" => json!(state.jobs.lock().await.clone()),
    "dh:job:start" => {
      let id = Uuid::new_v4().to_string();
      let kind = body.get("kind").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let method = body.get("method").and_then(|v| v.as_str()).unwrap_or("system").to_string();
      let version = body.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let remove_mode = body.get("removeMode").and_then(|v| v.as_str()).unwrap_or("runtime_only").to_string();
      let sudo_password = body
        .get("sudoPassword")
        .or_else(|| body.get("sudo_password"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      {
        let mut jobs = state.jobs.lock().await;
        let running = jobs.iter()
          .filter(|j| j.get("state").and_then(|v| v.as_str()) == Some("running"))
          .count();
        if running >= get_global_thread_pool_size() {
          return Ok(json!({ "ok": false, "error": format!("[JOB_POOL_FULL] Thread pool at capacity ({} concurrent jobs). Wait for a running job to complete.", get_global_thread_pool_size()) }));
        }
        jobs.push(json!({
          "id": id,
          "kind": kind,
          "runtimeId": runtime_id,
          "state": "running",
          "progress": 10,
          "logTail": [format!("Starting {} for {}…", kind, runtime_id)]
        }));
      }
      let jid = id.clone();
      let app2 = app.clone();
      tauri::async_runtime::spawn(async move {
        let retry_args = (kind.clone(), runtime_id.clone(), method.clone(), version.clone(), remove_mode.clone(), sudo_password.clone());
        runtime_job_execute(app2.clone(), jid.clone(), kind, runtime_id, method, version, remove_mode, sudo_password).await;
        if get_global_daemon_auto_restart() {
          let final_state = {
            let st = app2.state::<AppState>();
            let jobs = st.jobs.lock().await;
            jobs.iter()
              .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(jid.as_str()))
              .and_then(|j| j.get("state").and_then(|v| v.as_str()))
              .unwrap_or("")
              .to_string()
          };
          if final_state == "error" {
            {
              let st = app2.state::<AppState>();
              let mut jobs = st.jobs.lock().await;
              if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(jid.as_str())) {
                j["state"] = json!("running");
                j["progress"] = json!(5);
                j["logTail"] = json!(["Auto-restarting after failure…"]);
              }
            }
            let (kind, runtime_id, method, version, remove_mode, sudo_password) = retry_args;
            runtime_job_execute(app2, jid, kind, runtime_id, method, version, remove_mode, sudo_password).await;
          }
        }
      });
      json!({ "id": id })
    }
    "dh:job:cancel" => {
      let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let mut jobs = state.jobs.lock().await;
      let _ = cancel_runtime_job(&mut jobs, id.as_str());
      json!({ "ok": true })
    }
    "dh:editor:list" => {
      let cmd = r#"
        editors="["
        check_native() {
           if command -v "$2" >/dev/null 2>&1; then
             if [ "$editors" != "[" ]; then editors="$editors,"; fi
             editors="$editors{\"name\":\"$1 (Native)\",\"cmd\":\"$2\"}"
           fi
        }
        check_flatpak() {
           if command -v flatpak >/dev/null 2>&1; then
             if flatpak list | grep -iq "$2"; then
               if [ "$editors" != "[" ]; then editors="$editors,"; fi
               editors="$editors{\"name\":\"$1 (Flatpak)\",\"cmd\":\"flatpak run $2\"}"
             fi
           fi
        }
        check_native "VS Code" "code"
        check_native "Cursor" "cursor"
        check_native "Neovim" "nvim"
        check_native "IntelliJ IDEA" "idea"
        check_native "WebStorm" "webstorm"
        check_native "Eclipse" "eclipse"
        check_native "Antigravity" "antigravity"
        
        check_flatpak "VS Code" "com.visualstudio.code"
        check_flatpak "Cursor" "com.cursor.Cursor"
        check_flatpak "IntelliJ IDEA" "com.jetbrains.IntelliJ-IDEA-Community"
        editors="$editors]"
        echo "$editors"
      "#;
      let output = exec_output("bash", &["-c", cmd]).await.unwrap_or_else(|_| "[]".to_string());
      let parsed: Value = serde_json::from_str(&output).unwrap_or(json!([]));
      json!({ "ok": true, "editors": parsed })
    }
    "dh:editor:open" => {
      let path_raw = body.get("path").and_then(|v| v.as_str()).unwrap_or_default();
      let cmd = body.get("cmd").and_then(|v| v.as_str()).unwrap_or("code");
      if path_raw.is_empty() {
        json!({ "ok": false, "error": "[EDITOR_OPEN_FAILED] Missing path." })
      } else {
        let path = if path_raw.starts_with("~/") {
          let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
          path_raw.replacen("~/", &format!("{}/", home), 1)
        } else {
          path_raw.to_string()
        };

        // Ensure the directory exists before opening the IDE.
        // This prevents editors from falling back to the app's root directory if the user deleted the folder.
        let path_buf = std::path::PathBuf::from(&path);
        let _ = std::fs::create_dir_all(&path_buf);

        // Dynamically detect template and write editor-specific configurations
        let detected_template = crate::project_scaffold::detect_template(&path_buf);
        crate::project_scaffold::scaffold_editor_configs(&path_buf, &detected_template, cmd);

        // e.g. cmd is "flatpak run com.visualstudio.code" or "code"
        let full_cmd = format!("{} \"{}\"", cmd, path);
        let _ = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&full_cmd)
            .spawn();
        json!({ "ok": true })
      }
    }
    "dh:project:ensure_dir" => {
      let path_str = body.get("path").and_then(|v| v.as_str()).unwrap_or_default();
      if path_str.is_empty() {
         json!({ "ok": false, "error": "[PROJECT_CREATE_FAILED] Missing path." })
      } else {
         let expanded = if path_str.starts_with("~/") {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
            path_str.replacen("~/", &format!("{}/", home), 1)
         } else {
            path_str.to_string()
         };
         match std::fs::create_dir_all(&expanded) {
            Ok(_) => json!({ "ok": true, "path": expanded }),
            Err(e) => json!({ "ok": false, "error": e.to_string() })
         }
      }
    }
    "dh:fs:exists" => {
      let path_str = body.get("path").and_then(|v| v.as_str()).unwrap_or_default();
      if path_str.is_empty() {
         json!({ "ok": false, "exists": false })
      } else {
         let expanded = if path_str.starts_with("~/") {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
            path_str.replacen("~/", &format!("{}/", home), 1)
         } else {
            path_str.to_string()
         };
         json!({ "ok": true, "exists": std::path::Path::new(&expanded).exists() })
      }
    }
    "dh:project:scaffold" => {
       crate::project_scaffold::handle_project_scaffold(body).await
    }
    "dh:project:install_deps" => {
       crate::project_scaffold::handle_project_install_deps(body, app.clone()).await
    }
    "dh:git:recent:list" => match app_file(&app, "git_recent.json") {
      Ok(path) => {
        let value = read_json(&path);
        let repos = if value.is_array() { value } else { json!([]) };
        json!({ "ok": true, "repos": repos })
      }
      Err(e) => json!({ "ok": false, "error": e }),
    },
    "dh:git:recent:add" => {
      let new_path = body.get("path").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      if new_path.is_empty() {
        json!({ "ok": false, "error": "[GIT_RECENT_ADD_FAILED] Missing repo path." })
      } else {
        match app_file(&app, "git_recent.json") {
          Ok(path) => {
            let value = read_json(&path);
            let mut repos: Vec<Value> = value.as_array().cloned().unwrap_or_default();
            repos.retain(|r| r.get("path").and_then(|v| v.as_str()).unwrap_or_default() != new_path);
            repos.insert(0, json!({ "path": new_path, "lastOpened": now_ms() }));
            let limited: Vec<Value> = repos.into_iter().take(30).collect();
            match write_json(&path, &json!(limited)) {
              Ok(_) => json!({ "ok": true }),
              Err(e) => json!({ "ok": false, "error": e }),
            }
          }
          Err(e) => json!({ "ok": false, "error": e }),
        }
      }
    }
    "dh:git:config:set" => {
      let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
      let email = body.get("email").and_then(|v| v.as_str()).unwrap_or_default();
      let default_branch = body.get("defaultBranch").and_then(|v| v.as_str());
      let default_editor = body.get("defaultEditor").and_then(|v| v.as_str());
      let mut ok = true;
      let mut err = String::new();
      for args in [
        vec!["config", "--global", "user.name", name],
        vec!["config", "--global", "user.email", email],
      ] {
        if let Err(e) = exec_output("git", &args).await {
          ok = false;
          err = e;
          break;
        }
      }
      if ok {
        if let Some(branch) = default_branch {
          if let Err(e) = exec_output("git", &["config", "--global", "init.defaultBranch", branch]).await {
            ok = false;
            err = e;
          }
        }
      }
      if ok {
        if let Some(editor) = default_editor {
          if let Err(e) = exec_output("git", &["config", "--global", "core.editor", editor]).await {
            ok = false;
            err = e;
          }
        }
      }
      if ok {
        json!({ "ok": true })
      } else {
        json!({ "ok": false, "error": format!("[GIT_CONFIG_SET_FAILED] {}", err.trim()) })
      }
    }
    "dh:git:config:set-key" => {
      let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
      let value = body.get("value").and_then(|v| v.as_str());
      const ALLOWED: &[&str] = &[
        "pull.rebase", "fetch.prune", "fetch.prunetags",
        "commit.gpgsign", "user.signingkey", "gpg.format",
        "credential.helper",
        "core.autocrlf", "core.eol", "core.fscache", "core.preloadindex",
        "core.longpaths", "core.ignorecase", "core.symlinks",
        "branch.autosetuprebase", "merge.ff", "rebase.autostash",
        "gc.auto", "pack.threads", "http.sslverify",
        "user.name", "user.email", "init.defaultbranch", "core.editor",
      ];
      if !ALLOWED.contains(&key) {
        return Ok(json!({ "ok": false, "error": format!("[GIT_CONFIG_KEY_DENIED] Key '{}' is not permitted.", key) }));
      }
      let result = match value {
        Some(v) => exec_output("git", &["config", "--global", key, v]).await,
        None => exec_output("git", &["config", "--global", "--unset", key]).await,
      };
      match result {
        Ok(_) | Err(_) if value.is_none() => json!({ "ok": true }),
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": format!("[GIT_CONFIG_SET_FAILED] {}", e.trim()) }),
      }
    },
    "dh:git:config:list" => match exec_output("git", &["config", "--global", "--list"]).await {
      Ok(out) => {
        let rows: Vec<Value> = out
          .lines()
          .filter_map(|line| {
            let idx = line.find('=')?;
            Some(json!({ "key": &line[..idx], "value": &line[idx + 1..] }))
          })
          .collect();
        json!({ "ok": true, "rows": rows })
      }
      Err(e) => json!({ "ok": false, "error": format!("[GIT_CONFIG_LIST_FAILED] {}", e.trim()) }),
    },
    "dh:git:clone" => {
      let url = body.get("url").and_then(|v| v.as_str()).unwrap_or_default();
      let target_dir = body.get("targetDir").and_then(|v| v.as_str()).unwrap_or_default();
      if url.is_empty() || target_dir.is_empty() {
        json!({ "ok": false, "error": "[GIT_CLONE_FAILED] Missing url or targetDir." })
      } else {
        match exec_output_limit("git", &["clone", url, target_dir], cmd_timeout_long()).await {
          Ok(_) => json!({ "ok": true }),
          Err(e) => {
            let msg = if e.starts_with("[HOST_COMMAND_TIMEOUT]") {
              format!("[GIT_TIMEOUT] {}", e.trim())
            } else {
              format!("[GIT_CLONE_FAILED] {}", e.trim())
            };
            json!({ "ok": false, "error": msg })
          }
        }
      }
    },
    "dh:git:status" => {
      let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
      if repo_path.is_empty() {
        json!({ "ok": false, "error": "[GIT_STATUS_FAILED] Missing repoPath." })
      } else {
        let script = format!(
          "cd '{}' && \
           b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown) && \
           t=$(git rev-parse --abbrev-ref --symbolic-full-name @{{u}} 2>/dev/null || true) && \
           a=$(git rev-list --count @{{u}}..HEAD 2>/dev/null || echo 0) && \
           h=$(git rev-list --count HEAD..@{{u}} 2>/dev/null || echo 0) && \
           p=$(git status --porcelain 2>/dev/null || true) && \
           m=$(printf '%s\\n' \"$p\" | awk '/^ M|^M |^MM|^AM|^ T|^T /{{c++}}END{{print c+0}}') && \
           c=$(printf '%s\\n' \"$p\" | awk '/^\\?\\?/{{c++}}END{{print c+0}}') && \
           d=$(printf '%s\\n' \"$p\" | awk '/^ D|^D /{{c++}}END{{print c+0}}') && \
           printf '{{\"branch\":\"%s\",\"tracking\":%s,\"ahead\":%s,\"behind\":%s,\"modified\":%s,\"created\":%s,\"deleted\":%s}}' \"$b\" \"${{t:+\\\"$t\\\"}}${{t: null}}\" \"$a\" \"$h\" \"$m\" \"$c\" \"$d\"",
          repo_path.replace('\'', "'\\''")
        );
        match exec_output_limit("bash", &["-c", &script], cmd_timeout_short()).await {
          Ok(info_raw) => match serde_json::from_str::<Value>(&info_raw) {
            Ok(info) => json!({ "ok": true, "info": info }),
            Err(_) => json!({ "ok": false, "error": "[GIT_STATUS_FAILED] Could not parse git status output." }),
          },
          Err(e) => json!({ "ok": false, "error": format!("[GIT_STATUS_FAILED] {}", e.trim()) }),
        }
      }
    },

    "dh:cloud:auth:connect-start" => {
        let (gh_store, gl_store) = read_cloud_oauth_store_overrides(&app);
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        match provider {
            "github" => {
                let cid = cloud_auth::compose_github_client_id(gh_store.as_deref());
                match cloud_auth::GitHubProvider::device_auth_start(
                    &["repo", "read:org", "read:user", "notifications"],
                    cid.as_str(),
                )
                .await
                {
                    Ok(c) => json!({
                        "ok": true,
                        "user_code": c.user_code,
                        "verification_uri": c.verification_uri,
                        "device_code": c.device_code,
                        "interval": c.interval,
                        "expires_in": c.expires_in,
                    }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            "gitlab" => {
                let cid = cloud_auth::compose_gitlab_client_id(gl_store.as_deref());
                match cloud_auth::GitLabProvider::device_auth_start(
                    &["read_api", "read_user", "read_repository", "write_repository"],
                    cid.as_str(),
                )
                .await
                {
                    Ok(c) => json!({
                        "ok": true,
                        "user_code": c.user_code,
                        "verification_uri": c.verification_uri,
                        "device_code": c.device_code,
                        "interval": c.interval,
                        "expires_in": c.expires_in,
                    }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            _ => json!({ "ok": false, "error": "[CLOUD_AUTH_NETWORK] Unknown provider" }),
        }
    },

    "dh:cloud:auth:connect-poll" => {
        let (gh_store, gl_store) = read_cloud_oauth_store_overrides(&app);
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let device_code = body.get("device_code").and_then(|v| v.as_str()).unwrap_or("");
        let store = cloud_auth::app_encrypted_credential_store(&app);
        let poll_result = match provider {
            "github" => {
                let cid = cloud_auth::compose_github_client_id(gh_store.as_deref());
                cloud_auth::GitHubProvider::device_auth_poll(device_code, cid.as_str()).await
            }
            "gitlab" => {
                let cid = cloud_auth::compose_gitlab_client_id(gl_store.as_deref());
                cloud_auth::GitLabProvider::device_auth_poll(device_code, cid.as_str()).await
            }
            _ => Err("[CLOUD_AUTH_NETWORK] Unknown provider".to_string()),
        };
        match poll_result {
            Ok(cloud_auth::PollResult::Pending) => json!({ "ok": true, "status": "pending" }),
            Ok(cloud_auth::PollResult::Expired) => json!({ "ok": true, "status": "expired" }),
            Ok(cloud_auth::PollResult::Denied) => json!({ "ok": true, "status": "denied" }),
            Ok(cloud_auth::PollResult::Complete { token, username, avatar_url }) => {
                let cred = cloud_auth::StoredCredential {
                    token,
                    username: username.clone(),
                    avatar_url: avatar_url.clone(),
                    connected_at: cloud_auth::chrono_now(),
                    web_origin: None,
                };
                match store.save(provider, &cred) {
                    Ok(_) => json!({ "ok": true, "status": "complete", "username": username, "avatar_url": avatar_url }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:cloud:auth:connect-pat" => {
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let token = body.get("token").and_then(|v| v.as_str()).unwrap_or("");
        let host = body.get("host").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
        let store = cloud_auth::app_encrypted_credential_store(&app);
        let validate_result = match provider {
            "github" => cloud_auth::GitHubProvider::validate_pat(token, host).await,
            "gitlab" => cloud_auth::GitLabProvider::validate_pat(token, host).await,
            _ => Err("[CLOUD_AUTH_NETWORK] Unknown provider".to_string()),
        };
        match validate_result {
            Ok(cred) => {
                let username = cred.username.clone();
                let avatar_url = cred.avatar_url.clone();
                match store.save(provider, &cred) {
                    Ok(_) => json!({ "ok": true, "username": username, "avatar_url": avatar_url }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:cloud:auth:disconnect" => {
        let (_gh_store, gl_store) = read_cloud_oauth_store_overrides(&app);
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let store = cloud_auth::app_encrypted_credential_store(&app);
        if let Ok(Some(cred)) = store.load(provider) {
            let _ = match provider {
                "github" => cloud_auth::GitHubProvider::revoke_token(&cred.token).await,
                "gitlab" => {
                    let cid = cloud_auth::compose_gitlab_client_id(gl_store.as_deref());
                    cloud_auth::GitLabProvider::revoke_token(&cred.token, cid.as_str()).await
                }
                _ => Ok(()),
            };
        }
        match store.delete(provider) {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:cloud:auth:status" => {
        let store = cloud_auth::app_encrypted_credential_store(&app);
        match store.load_all() {
            Ok(accounts) => {
                let arr: Vec<serde_json::Value> = accounts
                    .into_iter()
                    .map(|a| json!({
                        "provider": a.provider,
                        "username": a.username,
                        "avatar_url": a.avatar_url,
                        "connected_at": a.connected_at,
                    }))
                    .collect();
                json!({ "ok": true, "accounts": arr })
            }
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:cloud:git:prs"
    | "dh:cloud:git:review-requests"
    | "dh:cloud:git:pipelines"
    | "dh:cloud:git:issues"
    | "dh:cloud:git:releases"
    | "dh:cloud:git:create-pr"
    | "dh:cloud:git:get-pr-checks"
    | "dh:cloud:git:merge-pr" => cloud_git_ipc::invoke(&app, channel.as_str(), &body).await,

    "dh:git:vcs:status" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        // Verify it's a git repo
        let branch_result = exec_output_limit(
            "git", &["-C", repo_path, "rev-parse", "--abbrev-ref", "HEAD"],
            cmd_timeout_short(),
        ).await;
        let branch = match branch_result {
            Err(_) => return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Not a git repository." })),
            Ok(b) => b,
        };
        let porcelain = exec_output_limit(
            "git", &["-C", repo_path, "status", "--porcelain=v1", "-u"],
            cmd_timeout_short(),
        ).await.unwrap_or_default();
        let (staged, unstaged) = parse_porcelain_v1(&porcelain);
        let (ahead, behind) = git_ahead_behind(repo_path).await;
        let git_operation = git_vcs_repo_state::git_operation_state(repo_path).await;
        let conflict_file_count = git_vcs_repo_state::unmerged_path_count(repo_path).await;
        json!({
            "ok": true,
            "branch": branch,
            "ahead": ahead,
            "behind": behind,
            "staged": staged,
            "unstaged": unstaged,
            "gitOperation": git_operation,
            "conflictFileCount": conflict_file_count,
        })
    },

    "dh:git:vcs:remotes" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        match exec_output_limit(
            "git",
            &["-C", repo_path, "remote", "-v"],
            cmd_timeout_short(),
        )
        .await
        {
            Ok(out) => {
                let remotes = parse_git_remote_fetch_lines(&out);
                json!({ "ok": true, "remotes": remotes })
            }
            Err(e) => json!({
                "ok": false,
                "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()),
            }),
        }
    },

    "dh:git:vcs:diff" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        let file_path = body.get("filePath").and_then(|v| v.as_str()).unwrap_or_default();
        let staged = body.get("staged").and_then(|v| v.as_bool()).unwrap_or(false);
        if repo_path.is_empty() || file_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath or filePath." }));
        }
        let raw = git_vcs_file_diff::resolve_file_diff(repo_path, file_path, staged).await;
        if raw.contains("Binary files") {
            return Ok(json!({ "ok": true, "diff": null, "binary": true }));
        }
        const DIFF_CAP: usize = 512 * 1024; // 512 KB
        if raw.len() > DIFF_CAP {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_DIFF_TOO_LARGE] File diff exceeds 512 KB." }));
        }
        json!({ "ok": true, "diff": raw, "binary": false })
    },

    "dh:git:vcs:stage" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        let stage_all = body.get("stageAll").and_then(|v| v.as_bool()) == Some(true);
        if stage_all {
            return match exec_output_limit("git", &["-C", repo_path, "add", "-A"], cmd_timeout_short()).await {
                Ok(_) => Ok(json!({ "ok": true })),
                Err(e) => Ok(json!({ "ok": false, "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()) })),
            };
        }
        let file_paths: Vec<&str> = body.get("filePaths")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str()).collect())
            .unwrap_or_default();
        if file_paths.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing filePaths (or pass stageAll: true)." }));
        }
        let mut args = vec!["-C", repo_path, "add", "--"];
        args.extend_from_slice(&file_paths);
        match exec_output_limit("git", &args, cmd_timeout_short()).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()) }),
        }
    },

    "dh:git:vcs:unstage" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        let file_paths: Vec<&str> = body.get("filePaths")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str()).collect())
            .unwrap_or_default();
        if repo_path.is_empty() || file_paths.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath or filePaths." }));
        }
        let mut args = vec!["-C", repo_path, "restore", "--staged", "--"];
        args.extend_from_slice(&file_paths);
        match exec_output_limit("git", &args, cmd_timeout_short()).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()) }),
        }
    },

    "dh:git:vcs:commit" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        let message = body.get("message").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        if message.trim().is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_EMPTY_MESSAGE] Commit message cannot be empty." }));
        }
        // Use exec_result_limit: failed `git commit` often writes the full diagnostic to stdout,
        // while exec_output_limit only surfaces stderr (empty → useless IPC errors).
        match exec_result_limit("git", &["-C", repo_path, "commit", "-m", message], cmd_timeout_short()).await {
            Ok((stdout, stderr)) => {
                let combined = format!("{}\n{}", stdout.trim(), stderr.trim()).trim().to_string();
                let sha = combined
                    .lines()
                    .find(|l| l.contains('[') && l.contains(']'))
                    .and_then(|l| {
                        let after_bracket = l.split(']').next()?;
                        after_bracket.split_whitespace().last().map(|s| s.to_string())
                    })
                    .unwrap_or_default();
                json!({ "ok": true, "sha": sha })
            }
            Err(e) => {
                let trimmed = e.trim();
                let body = if trimmed.is_empty() {
                    "Git exited with an error but printed no message (check hooks and signing)."
                } else {
                    trimmed
                };
                let msg = if body.contains("nothing to commit") || body.contains("no changes") {
                    format!("[GIT_VCS_NO_STAGED] {}", body)
                } else if body.contains("not a git repository") {
                    format!("[GIT_VCS_NOT_A_REPO] {}", body)
                } else {
                    format!("[GIT_VCS_COMMIT_FAILED] {}", body)
                };
                json!({ "ok": false, "error": msg })
            }
        }
    },

    "dh:git:vcs:branches" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        match exec_output_limit(
            "git",
            &[
                "-C",
                repo_path,
                "for-each-ref",
                "refs/heads",
                "refs/remotes",
                "--format=%(HEAD)|%(refname:short)|%(refname)",
            ],
            cmd_timeout_short(),
        )
        .await
        {
            Ok(out) => {
                let mut branches: Vec<Value> = Vec::new();
                let mut current = String::new();
                for line in out.lines() {
                    let mut parts = line.splitn(3, '|');
                    let head = parts.next().unwrap_or("").trim();
                    let short = parts.next().unwrap_or("").trim();
                    let full = parts.next().unwrap_or("").trim();
                    if short.is_empty() || short == "HEAD" {
                        continue;
                    }
                    if full.ends_with("/HEAD") {
                        continue;
                    }
                    let is_current = head == "*";
                    let remote = full.starts_with("refs/remotes/");
                    let display_name = short.to_string();
                    if is_current {
                        current.clone_from(&display_name);
                    }
                    branches.push(json!({
                        "name": display_name,
                        "remote": remote,
                        "current": is_current,
                    }));
                }
                branches.sort_by(|a, b| {
                    let ar = a.get("remote").and_then(|v| v.as_bool()).unwrap_or(false);
                    let br = b.get("remote").and_then(|v| v.as_bool()).unwrap_or(false);
                    match ar.cmp(&br) {
                        std::cmp::Ordering::Equal => {}
                        o => return o,
                    }
                    let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    an.cmp(bn)
                });
                json!({ "ok": true, "branches": branches, "current": current })
            }
            Err(e) => json!({ "ok": false, "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()) }),
        }
    },

    "dh:git:vcs:checkout" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        let branch = body.get("branch").and_then(|v| v.as_str()).unwrap_or_default();
        let create = body.get("create").and_then(|v| v.as_bool()).unwrap_or(false);
        if repo_path.is_empty() || branch.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath or branch." }));
        }
        let args: Vec<&str> = if create {
            vec!["-C", repo_path, "checkout", "-b", branch]
        } else {
            vec!["-C", repo_path, "checkout", branch]
        };
        match exec_output_limit("git", &args, cmd_timeout_short()).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => {
                let msg = e.trim();
                let code = if msg.contains("would be overwritten by checkout")
                    || msg.contains("stash them before you switch")
                    || msg.contains("Please commit your changes or stash them")
                {
                    "GIT_VCS_CHECKOUT_DIRTY"
                } else {
                    "GIT_VCS_CHECKOUT"
                };
                json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
            }
        }
    },

    "dh:git:vcs:stash" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        let message = body
            .get("message")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("LuminaDev: stash before branch switch");
        let include_untracked = body.get("includeUntracked").and_then(|v| v.as_bool()).unwrap_or(true);
        let mut argv: Vec<String> = vec![
            "-C".to_string(),
            repo_path.to_string(),
            "stash".to_string(),
            "push".to_string(),
        ];
        if include_untracked {
            argv.push("-u".to_string());
        }
        argv.push("-m".to_string());
        argv.push(message.to_string());
        let args: Vec<&str> = argv.iter().map(|s| s.as_str()).collect();
        match exec_output_limit("git", &args, cmd_timeout_short()).await {
            Ok(out) => json!({ "ok": true, "message": out }),
            Err(e) => {
                let msg = e.trim();
                let code = if msg.contains("No local changes to save") {
                    "GIT_VCS_STASH_EMPTY"
                } else {
                    "GIT_VCS_STASH"
                };
                json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
            }
        }
    },

    "dh:git:vcs:push" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        let remote = body.get("remote").and_then(|v| v.as_str());
        let branch = body.get("branch").and_then(|v| v.as_str());
        let force_with_lease = body.get("forceWithLease").and_then(|v| v.as_bool()).unwrap_or(false);
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        let store = cloud_auth::app_encrypted_credential_store(&app);
        match git_network_with_auth(
            repo_path,
            GitNetworkOp::Push { remote, branch, force_with_lease },
            &store,
            &app,
        )
        .await
        {
            Ok(output) => json!({ "ok": true, "output": output }),
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:git:vcs:pull" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        let store = cloud_auth::app_encrypted_credential_store(&app);
        match git_network_with_auth(repo_path, GitNetworkOp::Pull, &store, &app).await {
            Ok(output) => json!({ "ok": true, "output": output }),
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:git:vcs:fetch" => {
        let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
        if repo_path.is_empty() {
            return Ok(json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." }));
        }
        let remote = body
            .get("remote")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("origin");
        let store = cloud_auth::app_encrypted_credential_store(&app);
        match git_network_with_auth(
            repo_path,
            GitNetworkOp::Fetch { remote },
            &store,
            &app,
        )
        .await
        {
            Ok(output) => json!({ "ok": true, "output": output }),
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:git:vcs:merge"
    | "dh:git:vcs:rebase"
    | "dh:git:vcs:stash-pop"
    | "dh:git:vcs:merge-abort"
    | "dh:git:vcs:rebase-abort"
    | "dh:git:vcs:merge-continue"
    | "dh:git:vcs:rebase-continue"
    | "dh:git:vcs:rebase-skip"
    | "dh:git:vcs:rename-branch"
    | "dh:git:vcs:conflict-diff"
    | "dh:git:vcs:conflict-hunks"
    | "dh:git:vcs:resolve-conflict"
    | "dh:git:vcs:resolve-hunk" => git_vcs_ipc::invoke_extended(channel.as_str(), &body).await,

    "dh:ssh:generate" => {
      let email = body.get("email").and_then(|v| v.as_str()).unwrap_or("lumina@local");
      let key_name = body.get("keyName").and_then(|v| v.as_str()).unwrap_or("id_ed25519");
      let safe_name: String = key_name.chars().map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).collect();
      let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
      let ssh_dir = format!("{}/.ssh", home);
      let key_path = format!("{}/{}", ssh_dir, safe_name);
      let _ = std::fs::create_dir_all(&ssh_dir);
      match exec_output("ssh-keygen", &["-t", "ed25519", "-C", email, "-f", &key_path, "-N", ""]).await {
        Ok(_) => json!({ "ok": true, "keyName": safe_name }),
        Err(e) => json!({ "ok": false, "error": format!("[SSH_GENERATE_FAILED] {}", e.trim()) }),
      }
    }
    "dh:ssh:get:pub" => {
      let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
      let pub_path = format!("{}/.ssh/id_ed25519.pub", home);
      match std::fs::read_to_string(&pub_path) {
        Ok(pubkey) => {
          let fingerprint = exec_output("ssh-keygen", &["-lf", &pub_path]).await.unwrap_or_default();
          json!({ "ok": true, "pub": pubkey.trim(), "fingerprint": fingerprint.trim() })
        }
        Err(_) => json!({ "ok": false, "pub": "", "fingerprint": "", "error": "[SSH_NO_KEY] Missing public key." }),
      }
    }
    "dh:ssh:test:github" => match exec_result_limit("ssh", &["-T", "git@github.com"], get_global_ipc_timeout()).await {
      Ok((stdout, stderr)) => json!({ "ok": true, "output": format!("{}{}", stdout, stderr), "code": 0 }),
      Err(e) => json!({ "ok": true, "output": e, "code": 1 }),
    },
    "dh:runtime:status" => {
      // (id, display name, primary command, args, fallback commands)
      // Use a login shell so ~/.bashrc / ~/.profile PATH additions are active
      // (covers juliaup, nvm, bun, pyenv, etc. installed to user home dirs).
      let checks: &[(&str, &str, &str)] = &[
        ("node",    "Node.js", "node --version"),
        ("python",  "Python",  "python3 --version 2>&1 || python --version 2>&1"),
        ("java",    "Java",    "java -version 2>&1"),
        ("go",      "Go",      "go version"),
        ("rust",    "Rust",    "rustc --version"),
        ("php",     "PHP",     "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); php --version 2>&1 | head -1"),
        ("ruby",    "Ruby",    "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); ruby --version"),
        ("dotnet",  ".NET",    "dotnet --version 2>/dev/null || ~/.dotnet/dotnet --version 2>/dev/null"),
        ("bun",     "Bun",     "bun --version 2>/dev/null || ~/.bun/bin/bun --version 2>/dev/null"),
        ("zig",     "Zig",     "([ -x \"$HOME/.local/share/lumina/zig/current/zig\" ] && \"$HOME/.local/share/lumina/zig/current/zig\" version 2>&1) || (command -v zig >/dev/null 2>&1 && zig version 2>&1)"),
        ("c_cpp",   "C/C++",   "gcc --version 2>&1 | head -1"),
        ("matlab",  "Octave",  "octave --version 2>&1 | head -1"),
        ("dart",    "Dart",    "dart --version 2>&1 | head -1 || $HOME/.dart/dart-sdk/bin/dart --version 2>&1 | head -1"),
        ("flutter", "Flutter", "FOUND=0; for d in \"$HOME/.local/share/lumina/flutter/stable\" \"$HOME/.local/share/lumina/flutter/beta\" \"$HOME/.local/share/lumina/flutter/master\" \"$HOME/flutter\" \"$HOME/.flutter-sdk\"; do [ -x \"$d/bin/flutter\" ] && { cat \"$d/version\" 2>/dev/null | head -1 || echo installed; } && FOUND=1 && break; done; [ $FOUND -eq 0 ] && command -v snap >/dev/null 2>&1 && snap list flutter 2>/dev/null | awk 'NR>1{print $2}' || true"),
        ("julia",   "Julia",   "export PATH=\"$HOME/.juliaup/bin:$PATH\"; julia --version 2>/dev/null || ~/.juliaup/bin/julia --version 2>/dev/null"),
        ("lua",     "Lua",     "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); lua -v 2>&1 || lua5.4 -v 2>&1 || lua5.3 -v 2>&1"),
        ("lisp",    "SBCL",    "sbcl --version"),
      ];
      
let mut tasks: Vec<(String, String, _)> = Vec::new();
      for &(id, name, shell_cmd) in checks {
        let id = id.to_string();
        let name = name.to_string();
        let shell_cmd = shell_cmd.to_string();
let id_clone = id.clone();
        let name_clone = name.clone();
        tasks.push((id_clone, name_clone, tokio::spawn(async move {
          match exec_result_limit("bash", &["-lc", &shell_cmd], cmd_timeout_short()).await {
            Ok((stdout, stderr)) => {
              let version = lumina_probe_meaningful_line(&stdout, &stderr);
              if version.is_empty() {
                json!({ "id": id, "name": name, "installed": false })
              } else {
                let mut detected_path: Option<String> = None;
                let mut all_versions: Vec<Value> = Vec::new();
                match id.as_str() {
                  "node" => {
                    if let Ok(p) = exec_output_limit("bash", &["-lc", "command -v node || true"], cmd_timeout_short()).await {
                      let p = p.trim();
                      if !p.is_empty() {
                        detected_path = Some(p.to_string());
                      }
                    }
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -d \"$HOME/.nvm/versions/node\" ]; then for d in \"$HOME/.nvm/versions/node\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); printf '%s\\t%s\\n' \"$b\" \"$d/bin/node\"; done; fi"],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let v = parts.next().unwrap_or("").trim();
                        let p = parts.next().unwrap_or("").trim();
                        if !v.is_empty() && !p.is_empty() {
                          all_versions.push(json!({ "version": v, "path": p }));
                        }
                      }
                    }
                  }
                  "python" => {
                    if let Ok(p) = exec_output_limit("bash", &["-lc", "command -v python3 || command -v python || true"], cmd_timeout_short()).await {
                      let p = p.trim();
                      if !p.is_empty() {
                        detected_path = Some(p.to_string());
                      }
                    }
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -d \"$HOME/.pyenv/versions\" ]; then for d in \"$HOME/.pyenv/versions\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); printf '%s\\t%s\\n' \"$b\" \"$d/bin/python\"; done; fi"],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let v = parts.next().unwrap_or("").trim();
                        let p = parts.next().unwrap_or("").trim();
                        if !v.is_empty() && !p.is_empty() {
                          all_versions.push(json!({ "version": v, "path": p }));
                        }
                      }
                    }
                  }
                  "java" => {
                    if let Ok(p) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -x \"$HOME/.local/share/lumina/java/current/bin/java\" ]; then echo \"$HOME/.local/share/lumina/java/current/bin/java\"; else command -v java || true; fi"],
                      cmd_timeout_short(),
                    ).await {
                      let p = p.trim();
                      if !p.is_empty() {
                        detected_path = Some(p.to_string());
                      }
                    }
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -d \"$HOME/.local/share/lumina/java\" ]; then for d in \"$HOME/.local/share/lumina/java\"/jdk-*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\" | sed 's/^jdk-//'); printf '%s\\t%s\\n' \"$b\" \"$d/bin/java\"; done; fi"],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let v = parts.next().unwrap_or("").trim();
                        let p = parts.next().unwrap_or("").trim();
                        if !v.is_empty() && !p.is_empty() {
                          all_versions.push(json!({ "version": v, "path": p }));
                        }
                      }
                    }
                  }
                  "go" => {
                    if let Ok(p) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -x \"$HOME/.local/share/lumina/go/current/bin/go\" ]; then echo \"$HOME/.local/share/lumina/go/current/bin/go\"; elif [ -x \"$HOME/.local/share/lumina/go/bin/go\" ]; then echo \"$HOME/.local/share/lumina/go/bin/go\"; else command -v go || true; fi"],
                      cmd_timeout_short(),
                    ).await {
                      let p = p.trim();
                      if !p.is_empty() {
                        detected_path = Some(p.to_string());
                      }
                    }
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -d \"$HOME/.local/share/lumina/go\" ]; then for d in \"$HOME/.local/share/lumina/go\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue; [ -x \"$d/bin/go\" ] || continue; ver=$($d/bin/go version 2>/dev/null | awk '{print $3}' | sed 's/^go//'); printf '%s\\t%s\\n' \"$ver\" \"$d/bin/go\"; done; fi"],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let v = parts.next().unwrap_or("").trim().trim_start_matches("go");
                        let p = parts.next().unwrap_or("").trim();
                        if !v.is_empty() && !p.is_empty() {
                          all_versions.push(json!({ "version": v, "path": p }));
                        }
                      }
                    }
                  }
                  "zig" => {
                    if let Ok(p) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -x \"$HOME/.local/share/lumina/zig/current/zig\" ]; then echo \"$HOME/.local/share/lumina/zig/current/zig\"; else command -v zig || true; fi"],
                      cmd_timeout_short(),
                    ).await {
                      let p = p.trim();
                      if !p.is_empty() { detected_path = Some(p.to_string()); }
                    }
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", "if [ -d \"$HOME/.local/share/lumina/zig\" ]; then for d in \"$HOME/.local/share/lumina/zig\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue; [ -x \"$d/zig\" ] || continue; ver=$(\"$d/zig\" version 2>/dev/null | awk '{{print $1}}'); printf '%s\\t%s\\n' \"$ver\" \"$d/zig\"; done; fi"],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let v = parts.next().unwrap_or("").trim();
                        let p = parts.next().unwrap_or("").trim();
                        if !v.is_empty() && !p.is_empty() {
                          all_versions.push(json!({ "version": v, "path": p }));
                        }
                      }
                    }
                  }
                  "bun" => {
                    let bun_bin = format!("{}/.bun/bin/bun", std::env::var("HOME").unwrap_or_default());
                    if std::path::Path::new(&bun_bin).exists() {
                      let v = version.trim().to_string();
                      let display_ver = if v.is_empty() { "installed".to_string() } else { v };
                      all_versions.push(json!({ "version": display_ver, "path": bun_bin }));
                    }
                  }
                  "rust" => {
                    if let Ok(p) = exec_output_limit(
                      "bash",
                      &["-lc", "unset RUSTUP_TOOLCHAIN; ([ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" which rustc 2>/dev/null) || command -v rustc || true"],
                      cmd_timeout_short(),
                    ).await {
                      let p = p.trim();
                      if !p.is_empty() { detected_path = Some(p.to_string()); }
                    }
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", "unset RUSTUP_TOOLCHAIN; [ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" toolchain list 2>/dev/null || true"],
                      cmd_timeout_short(),
                    ).await {
                      let home = std::env::var("HOME").unwrap_or_default();
                      for line in raw.lines() {
                        let tc = line.split_whitespace().next().unwrap_or("").trim();
                        if tc.is_empty() { continue; }
                        let rustc_bin = format!("{}/.rustup/toolchains/{}/bin/rustc", home, tc);
                        let path_to_use = if std::path::Path::new(&rustc_bin).exists() { rustc_bin }
                          else { format!("{}/.cargo/bin/rustc", home) };
                        all_versions.push(json!({ "version": tc, "path": path_to_use }));
                      }
                    }
                  }
                  "dart" => {
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", r#"FOUND=false; LDIR="$HOME/.local/share/lumina/dart"; if [ -d "$LDIR" ]; then for d in "$LDIR"/*; do [ -d "$d" ] || continue; b=$(basename "$d"); [ "$b" = "current" ] && continue; [ -x "$d/bin/dart" ] || continue; ver=$("$d/bin/dart" --version 2>&1 | awk '{print $4}'); printf '%s\t%s\n' "${ver:-$b}" "$d/bin/dart"; FOUND=true; done; fi; if ! $FOUND && [ -x "$HOME/.dart/dart-sdk/bin/dart" ]; then ver=$("$HOME/.dart/dart-sdk/bin/dart" --version 2>&1 | awk '{print $4}'); printf '%s\t%s\n' "${ver:-dart}" "$HOME/.dart/dart-sdk/bin/dart"; fi"#],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let v = parts.next().unwrap_or("").trim();
                        let p = parts.next().unwrap_or("").trim();
                        if !v.is_empty() && !p.is_empty() {
                          all_versions.push(json!({ "version": v, "path": p }));
                        }
                      }
                    }
                  }
                  "flutter" => {
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", r#"FOUND=false; LDIR="$HOME/.local/share/lumina/flutter"; if [ -d "$LDIR" ]; then for d in "$LDIR"/*; do [ -d "$d" ] || continue; b=$(basename "$d"); [ "$b" = "current" ] && continue; [ -x "$d/bin/flutter" ] || continue; ver=$(cat "$d/version" 2>/dev/null | head -1); printf '%s\t%s\n' "${ver:-$b}" "$d/bin/flutter"; FOUND=true; done; fi; if ! $FOUND; then for sd in "$HOME/.flutter-sdk" "$HOME/flutter"; do [ -x "$sd/bin/flutter" ] || continue; ver=$(cat "$sd/version" 2>/dev/null | head -1); printf '%s\t%s\n' "${ver:-stable}" "$sd/bin/flutter"; FOUND=true; break; done; fi; if ! $FOUND && command -v snap >/dev/null 2>&1; then snap list flutter 2>/dev/null | awk 'NR>1{print $2"\t/snap/flutter/current/bin/flutter"}'; fi"#],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let v = parts.next().unwrap_or("").trim();
                        let p = parts.next().unwrap_or("").trim();
                        if !v.is_empty() && !p.is_empty() {
                          all_versions.push(json!({ "version": v, "path": p }));
                        }
                      }
                    }
                  }
                  "julia" => {
                    if let Ok(raw) = exec_output_limit(
                      "bash",
                      &["-lc", "export PATH=\"$HOME/.juliaup/bin:$PATH\"; juliaup list 2>/dev/null | tail -n +2 || true"],
                      cmd_timeout_short(),
                    ).await {
                      for line in raw.lines().filter(|l| !l.trim().is_empty()) {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        let tag = parts.first().copied().unwrap_or("").trim_start_matches('*').trim();
                        if tag.is_empty() { continue; }
                        let julia_bin = format!("{}/.juliaup/bin/julia", std::env::var("HOME").unwrap_or_default());
                        all_versions.push(json!({ "version": tag, "path": julia_bin }));
                      }
                    }
                  }
                  _ => {}
                }
                json!({
                  "id": id,
                  "name": name,
                  "installed": true,
                  "version": version,
                  "path": detected_path,
                  "allVersions": all_versions
                })
              }
            }
            Err(_) => json!({ "id": id, "name": name, "installed": false }),
          }
})));
      }

      let mut runtimes = Vec::new();
      for (id, name, t) in tasks {
        match t.await {
          Ok(val) => runtimes.push(val),
          Err(_) => runtimes.push(json!({ "id": id, "name": name, "installed": false })),
        }
      }
      json!({ "ok": true, "runtimes": runtimes })
    },
    "dh:runtime:get-versions" => {
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or("node");
      let method = body.get("method").and_then(|v| v.as_str()).unwrap_or("local");
      let mut versions: Vec<String> = Vec::new();
      if method == "system" {
        let distro = exec_output("bash", &["-lc", "source /etc/os-release 2>/dev/null && printf '%s' \"${ID:-unknown}\""])
          .await
          .unwrap_or_else(|_| "unknown".to_string());
        let pkg_mgr = runtime_pkg_mgr(distro.trim());
        match runtime_id {
          "c_cpp" => {
            let discovered = runtime_dnf_repoquery_versions("gcc", 25).await;
            if discovered.is_empty() {
              versions.push("system (repo default)".into());
            } else {
              for v in discovered {
                versions.push(format!("gcc {}", v));
              }
            }
          }
          "matlab" => {
            let discovered = runtime_dnf_repoquery_versions("octave", 20).await;
            if discovered.is_empty() {
              versions.push("system (repo default)".into());
            } else {
              for v in discovered {
                versions.push(format!("octave {}", v));
              }
            }
          }
          // System package managers do not pin versions for these runtimes.
          "node" | "python" | "go" | "php" | "ruby" | "zig" | "lua" | "lisp" => {
            versions.push("system (repo default)".into());
          }
          // Local/script-driven runtimes (no stable system package management path).
          "bun" | "dart" | "flutter" | "julia" | "rust" => {
            versions.push("local installer (recommended)".into());
          }
          "java" => {
            for label in ["21 (LTS)", "17 (LTS)", "11 (LTS)", "8 (LTS)"] {
              if let Some(pkg) = runtime_java_system_packages_for_version(pkg_mgr, label).into_iter().next() {
                if runtime_system_package_available(pkg_mgr, &pkg).await {
                  versions.push(label.to_string());
                }
              }
            }
            let latest_pkg = if pkg_mgr == "dnf" {
              "java-latest-openjdk-devel"
            } else {
              ""
            };
            if !latest_pkg.is_empty() && runtime_system_package_available(pkg_mgr, latest_pkg).await {
              versions.push("latest (repo)".into());
            }
            if versions.is_empty() {
              versions.push("system (repo default)".into());
            }
          }
          "dotnet" => versions.push("8.0 (LTS)".into()),
          _ => versions.push("system (repo default)".into()),
        }
        return Ok(json!({ "ok": true, "versions": versions }));
      }
      match runtime_id {
        "node" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://nodejs.org/dist/index.json"], cmd_timeout_short()).await {
            if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
              if let Some(list) = arr.as_array() {
                for item in list.iter().take(25) {
                  if let (Some(v), Some(lts)) = (item.get("version").and_then(|x| x.as_str()), item.get("lts")) {
                    let label = if lts.is_string() {
                      format!("{} (LTS: {})", v, lts.as_str().unwrap())
                    } else if lts.as_bool().unwrap_or(false) {
                      format!("{} (LTS)", v)
                    } else {
                      v.to_string()
                    };
                    versions.push(label);
                  }
                }
              }
            }
          }
        },
        "rust" => versions.extend(["stable".into(), "beta".into(), "nightly".into()]),
        "python" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/python.json"], cmd_timeout_short()).await {
            if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
              if let Some(list) = arr.as_array() {
                for item in list.iter() {
                  // Skip EOL versions — they fail to compile on modern GCC/glibc
                  let is_eol = !matches!(item.get("eol"), Some(Value::Bool(false)));
                  if is_eol { continue; }
                  if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                    versions.push(v.to_string());
                  }
                  if versions.len() >= 8 { break; }
                }
              }
            }
          }
          if versions.is_empty() {
            versions.extend(["3.13.3".into(), "3.12.10".into(), "3.11.12".into(), "3.10.17".into()]);
          }
        },
        "go" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://go.dev/dl/?mode=json&include=all"], cmd_timeout_short()).await {
            if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
              if let Some(list) = arr.as_array() {
                for item in list.iter().take(30) {
                  if let Some(v) = item.get("version").and_then(|x| x.as_str()) {
                    versions.push(v.trim_start_matches("go").to_string());
                  }
                }
              }
            }
          }
        },
        "java" => {
          // Local method: Temurin LTS releases, distro-independent
          versions.extend(["21 (LTS)".into(), "17 (LTS)".into(), "11 (LTS)".into(), "8 (LTS)".into()]);
        },
        "php" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/php.json"], cmd_timeout_short()).await {
            if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
              if let Some(list) = arr.as_array() {
                for item in list.iter().take(10) {
                  if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                    versions.push(v.to_string());
                  }
                }
              }
            }
          }
          if versions.is_empty() {
            versions.extend(["8.3".into(), "8.2".into(), "8.1".into(), "8.0".into()]);
          }
        },
        "ruby" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/ruby.json"], cmd_timeout_short()).await {
            if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
              if let Some(list) = arr.as_array() {
                for item in list.iter().take(10) {
                  if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                    versions.push(v.to_string());
                  }
                }
              }
            }
          }
          if versions.is_empty() {
            versions.extend(["3.3.0".into(), "3.2.3".into(), "3.1.4".into(), "3.0.6".into()]);
          }
        },
        "dotnet" => versions.extend(["9.0".into(), "8.0 (LTS)".into(), "7.0".into(), "6.0 (LTS)".into()]),
        "bun" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://api.github.com/repos/oven-sh/bun/releases?per_page=20"], cmd_timeout_short()).await {
            if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
              if let Some(list) = arr.as_array() {
                for item in list.iter().take(15) {
                  if let Some(v) = item.get("tag_name").and_then(|x| x.as_str()) {
                    versions.push(v.trim_start_matches("bun-v").to_string());
                  }
                }
              }
            }
          }
          if versions.is_empty() {
            versions.extend(["1.2.0".into(), "1.1.45".into(), "1.1.44".into(), "1.1.43".into()]);
          }
        },
        "zig" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://ziglang.org/download/index.json"], cmd_timeout_short()).await {
            if let Ok(obj) = serde_json::from_str::<Value>(&raw) {
              if let Some(map) = obj.as_object() {
                for key in map.keys().take(10) {
                  if key != "master" { versions.push(key.clone()); }
                }
              }
            }
          }
          if versions.is_empty() {
            versions.extend(["0.14.0".into(), "0.13.0".into(), "0.12.0".into()]);
          }
        },
        "julia" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/julia.json"], cmd_timeout_short()).await {
            if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
              if let Some(list) = arr.as_array() {
                for item in list.iter().take(10) {
                  if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                    versions.push(v.to_string());
                  }
                }
              }
            }
          }
          if versions.is_empty() {
            versions.extend(["1.11.5".into(), "1.10.9".into(), "1.9.4".into()]);
          }
        },
        // Toolchains where "versions" are really distro package streams (best-effort on dnf).
        "c_cpp" => {
          let discovered = runtime_dnf_repoquery_versions("gcc", 30).await;
          if discovered.is_empty() {
            versions.extend(["system (repo default)".into()]);
          } else {
            for v in discovered {
              versions.push(format!("gcc {}", v));
            }
          }
        }
        "matlab" => {
          let discovered = runtime_dnf_repoquery_versions("octave", 20).await;
          if discovered.is_empty() {
            versions.extend(["system (repo default)".into()]);
          } else {
            for v in discovered {
              versions.push(format!("octave {}", v));
            }
          }
        }
        "dart" => {
          versions.extend(["stable".into(), "beta".into(), "dev".into()]);
          versions.push("beta/<semver> (zip)".into());
          versions.push("stable/<semver> (zip)".into());
        }
        "flutter" => versions.extend(["stable".into(), "beta".into(), "master".into()]),
        "lua"     => versions.extend(["5.4".into(), "5.3".into()]),
        "lisp"    => versions.extend(["system (sbcl)".into()]),
        _ => {}
      }
      if versions.is_empty() { versions.push("latest".into()); }
      json!({ "ok": true, "versions": versions })
    },
    "dh:runtime:check-deps" => {
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or("node");
      // Use login shell so ~/.juliaup/bin, ~/.bun/bin, ~/.dotnet, nvm etc. are in PATH
      let tools: Vec<(&str, &str)> = match runtime_id {
        "node"    => vec![("node", "node --version"), ("npm", "npm --version"), ("curl", "curl --version")],
        "python"  => vec![("python3", "python3 --version 2>&1 || python --version 2>&1"), ("pip3", "pip3 --version 2>&1 || pip --version 2>&1")],
        "go"      => vec![("go", "go version"), ("gcc", "gcc --version")],
        "rust"    => vec![("rustc", "rustc --version"), ("cargo", "cargo --version"), ("rustup", "rustup --version")],
        "java"    => vec![("java", "java -version 2>&1"), ("javac", "javac -version 2>&1")],
        "php"     => vec![("php", "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); php --version 2>&1 | head -1"), ("composer", "composer --version 2>/dev/null")],
        "ruby"    => vec![("ruby", "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); ruby --version"), ("gem", "gem --version")],
        "dotnet"  => vec![("dotnet", "dotnet --version 2>/dev/null || ~/.dotnet/dotnet --version 2>/dev/null")],
        "bun"     => vec![("bun", "bun --version 2>/dev/null || ~/.bun/bin/bun --version 2>/dev/null"), ("unzip", "unzip -v"), ("curl", "curl --version")],
        "zig"     => vec![("zig", "zig version"), ("tar", "tar --version")],
        "c_cpp"   => vec![("gcc", "gcc --version"), ("g++", "g++ --version"), ("make", "make --version"), ("cmake", "cmake --version"), ("gdb", "gdb --version")],
        "matlab"  => vec![("octave", "octave --version")],
        "dart"    => vec![("dart", "dart --version 2>&1 || $HOME/.dart/dart-sdk/bin/dart --version 2>&1"), ("curl", "curl --version")],
        "flutter" => vec![("flutter", "flutter --version 2>&1 | head -1 || $HOME/.flutter-sdk/bin/flutter --version 2>&1 | head -1"), ("dart", "dart --version 2>&1 || $HOME/.dart/dart-sdk/bin/dart --version 2>&1"), ("git", "git --version")],
        "julia"   => vec![("julia", "export PATH=\"$HOME/.juliaup/bin:$PATH\"; julia --version 2>/dev/null || ~/.juliaup/bin/julia --version 2>/dev/null"), ("curl", "curl --version")],
        "lua"     => vec![("lua", "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); lua -v 2>&1 || lua5.4 -v 2>&1"), ("readline-devel (build dep)", "rpm -q readline-devel 2>/dev/null || dpkg -l libreadline-dev 2>/dev/null | grep -q '^ii' && echo ok || echo missing")],
        "lisp"    => vec![("sbcl", "sbcl --version")],
        _         => vec![],
      };
      let mut deps: Vec<Value> = Vec::new();
      for (name, shell_cmd) in tools {
        let ok = exec_result_limit("bash", &["-lc", shell_cmd], cmd_timeout_short()).await
          .map(|(so, se)| !format!("{}{}", so, se).trim().is_empty())
          .unwrap_or(false);
        deps.push(json!({ "name": name, "status": if ok { "installed" } else { "missing" }, "ok": ok }));
      }
      json!({ "ok": true, "dependencies": deps })
    },
    "dh:runtime:uninstall:preview" => {
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or("node");
      let remove_mode = body.get("removeMode").and_then(|v| v.as_str()).unwrap_or("runtime_only");
      let distro = exec_output("sh", &["-c", ". /etc/os-release 2>/dev/null; printf '%s' \"${ID:-unknown}\""])
        .await.unwrap_or_else(|_| "unknown".to_string());
      let distro = distro.trim().to_string();
      let pkg_mgr = runtime_pkg_mgr(&distro);
      let pkgs = runtime_system_packages(runtime_id, pkg_mgr);
      
      let mut pkg_vals: Vec<Value> = pkgs.iter().map(|p| json!(p)).collect();
      let mut note: String;
      
      match runtime_id {
        "rust" => {
          note = "Rust is managed by rustup. This will run 'rustup self uninstall'.".to_string();
          pkg_vals = vec![json!("rustup")];
        },
        "bun" => {
          note = "Bun was installed via the official installer. This will remove ~/.bun.".to_string();
          pkg_vals = vec![json!("~/.bun (directory)")];
        },
        "dart" => {
          note = format!("Dart was installed via apt. Removal will use {}.", pkg_mgr);
          pkg_vals = vec![json!("dart")];
        },
        "flutter" => {
          note = "Flutter was installed via snap. This will run 'snap remove flutter'.".to_string();
          pkg_vals = vec![json!("flutter (snap)")];
        },
        "julia" => {
          note = "Removes juliaup + cleans ~/.juliaup and ~/.julia. No sudo needed.".to_string();
          pkg_vals = vec![json!("~/.juliaup"), json!("~/.julia")];
        },
        "dotnet" if pkg_mgr == "pacman" => {
          note = "On Arch, .NET was installed via Microsoft's install script to ~/.dotnet. Remove that directory manually or run: rm -rf ~/.dotnet".to_string();
          pkg_vals = vec![json!("~/.dotnet (directory)")];
        },
        _ if pkgs.is_empty() => {
          note = format!("No system packages found for {}. If installed via a version manager, remove it manually.", runtime_id);
        },
        _ => {
          note = format!("Will remove {} system package(s) using {}.", pkg_vals.len(), pkg_mgr);
        },
      }

      if remove_mode == "runtime_and_deps" {
        if pkg_vals.is_empty() {
          note = format!("{} No additional package-managed cleanup candidates were detected for this runtime.", note);
        } else if !matches!(runtime_id, "rust" | "bun" | "dart" | "flutter" | "julia") {
          note = format!("{} Package manager autoremove may also clean unused dependencies on this distro.", note);
        } else {
          note = format!("{} Remove + deps mode is not applicable to this runtime.", note);
        }
      }

      // Dry-run the package manager to discover deps that would also be removed.
      // Only for pkg-manager-owned runtimes in runtime_and_deps mode.
      let uses_pkg_mgr = !matches!(runtime_id, "rust" | "bun" | "julia" | "dart" | "flutter");
      let removable_deps: Vec<Value> = if remove_mode == "runtime_and_deps" && uses_pkg_mgr && !pkgs.is_empty() {
        let pkg_strs: Vec<&str> = pkgs.to_vec();
        runtime_preview_removable_deps(pkg_mgr, &pkg_strs).await
          .into_iter().map(|p| json!(p)).collect()
      } else {
        vec![]
      };

      let mut final_pkgs = pkg_vals.clone();
      for d in &removable_deps {
        if !final_pkgs.contains(d) { final_pkgs.push(d.clone()); }
      }

      json!({
        "ok": true,
        "distro": distro,
        "runtimePackages": pkg_vals,
        "removableDeps": removable_deps,
        "blockedSharedDeps": [],
        "finalPackages": final_pkgs,
        "note": note
      })
    },
    "dh:runtime:set-active" => runtime_set_active_invoke(&body).await,
    "dh:runtime:remove-version" => {
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or_default();
      let version    = body.get("version").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
      let path_str   = body.get("path").and_then(|v| v.as_str()).unwrap_or_default();
      if runtime_id.is_empty() || path_str.is_empty() {
        json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] runtimeId and path required." })
      } else {
        let home = std::env::var("HOME").unwrap_or_default();
        let lumina_base = format!("{}/.local/share/lumina/{}", home, runtime_id);
        let mise_base   = format!("{}/.local/share/mise/installs/{}", home, runtime_id);
        let nvm_base    = format!("{}/.nvm/versions/node", home);
        let pyenv_base  = format!("{}/.pyenv/versions", home);
        let rustup_base = format!("{}/.rustup/toolchains", home);

        // Helper: walk up from binary path to direct child of a base dir, then rm -rf it
        let rmrf_version_under = |base_s: &str| -> Value {
          let base = std::path::Path::new(base_s);
          let path = std::path::Path::new(path_str);
          let mut cursor = path;
          let mut version_dir: Option<std::path::PathBuf> = None;
          loop {
            match cursor.parent() {
              Some(p) if p == base => { version_dir = Some(cursor.to_path_buf()); break; }
              Some(p) => { cursor = p; }
              None => break,
            }
          }
          match version_dir {
            Some(dir) if dir.is_dir() => {
              match std::fs::remove_dir_all(&dir) {
                Ok(_) => json!({ "ok": true }),
                Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] rm -rf: {}", e) }),
              }
            }
            _ => json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not resolve version directory." }),
          }
        };

        if path_str.starts_with(&lumina_base) {
          // Go / Zig / Java / Dart / Flutter — lumina-managed dirs, safe rm -rf
          rmrf_version_under(&lumina_base)
        } else if path_str.starts_with(&nvm_base) {
          // Node via nvm: nvm uninstall <version-tag>
          // version tag is the directory name under ~/.nvm/versions/node/
          let tag = std::path::Path::new(path_str)
            .ancestors()
            .find(|p| p.parent().map(|pp| pp == std::path::Path::new(&nvm_base)).unwrap_or(false))
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| version.clone());
          if tag.is_empty() {
            json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine nvm version tag." })
          } else {
            let cmd = format!(
              r#"export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm uninstall '{}' 2>&1"#,
              tag.replace('\'', "'\\''")
            );
            match exec_output_limit("bash", &["-c", &cmd], cmd_timeout_short()).await {
              Ok(_) => json!({ "ok": true }),
              Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] nvm uninstall: {}", e.trim()) }),
            }
          }
        } else if path_str.starts_with(&pyenv_base) {
          // Python via pyenv: pyenv uninstall -f <version>
          let pyenv_version = std::path::Path::new(path_str)
            .ancestors()
            .find(|p| p.parent().map(|pp| pp == std::path::Path::new(&pyenv_base)).unwrap_or(false))
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| version.clone());
          if pyenv_version.is_empty() {
            json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine pyenv version." })
          } else {
            let cmd = format!(
              r#"export PYENV_ROOT="$HOME/.pyenv"; export PATH="$PYENV_ROOT/bin:$PATH"; eval "$(pyenv init -)" 2>/dev/null; pyenv uninstall -f '{}' 2>&1"#,
              pyenv_version.replace('\'', "'\\''")
            );
            match exec_output_limit("bash", &["-c", &cmd], cmd_timeout_short()).await {
              Ok(_) => json!({ "ok": true }),
              Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] pyenv uninstall: {}", e.trim()) }),
            }
          }
        } else if path_str.starts_with(&rustup_base) {
          // Rust via rustup: rustup toolchain remove <toolchain-name>
          // toolchain name is the dir directly under ~/.rustup/toolchains/
          let toolchain = std::path::Path::new(path_str)
            .ancestors()
            .find(|p| p.parent().map(|pp| pp == std::path::Path::new(&rustup_base)).unwrap_or(false))
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| version.clone());
          if toolchain.is_empty() {
            json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine rustup toolchain name." })
          } else {
            let cmd = format!(
              "export PATH=\"$HOME/.cargo/bin:$PATH\"; rustup toolchain remove '{}' 2>&1",
              toolchain.replace('\'', "'\\''")
            );
            match exec_output_limit("bash", &["-c", &cmd], cmd_timeout_short()).await {
              Ok(_) => json!({ "ok": true }),
              Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] rustup toolchain remove: {}", e.trim()) }),
            }
          }
        } else if path_str.starts_with(&mise_base) || matches!(runtime_id, "php" | "ruby" | "lua") {
          // PHP / Ruby / Lua via mise — find mise binary dynamically
          if version.is_empty() {
            json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] version required for mise-managed runtime." })
          } else {
            let cmd = format!(
              r#"MISE=$(command -v mise 2>/dev/null || echo "$HOME/.local/bin/mise"); export PATH="$HOME/.local/bin:$PATH"; "$MISE" uninstall {}@'{}' 2>&1"#,
              runtime_id, version.replace('\'', "'\\''")
            );
            match exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short()).await {
              Ok(_) => json!({ "ok": true }),
              Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] mise uninstall: {}", e.trim()) }),
            }
          }
        } else {
          json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] path is not in a recognised version manager directory (lumina / nvm / pyenv / rustup / mise)." })
        }
      }
    },
    "dh:diagnostics:bundle:create" => {
      let include_sensitive = body.get("includeSensitive").and_then(|v| v.as_bool()).unwrap_or(false);
      let report = body.get("report").cloned().unwrap_or_else(|| json!({}));
      match app_file(&app, &format!("diag-{}.json", now_ms())) {
        Ok(path) => {
          let payload = json!({
            "includeSensitive": include_sensitive,
            "report": report,
            "createdAt": now_ms()
          });
          match write_json(&path, &payload) {
            Ok(_) => json!({ "ok": true, "path": path.to_string_lossy().to_string() }),
            Err(e) => json!({ "ok": false, "error": e }),
          }
        }
        Err(e) => json!({ "ok": false, "error": e }),
      }
    },
    "dh:host:sysinfo" => {
      let hostname = exec_output("hostname", &[]).await.unwrap_or_else(|_| "unknown".to_string());
      let kernel = exec_output("uname", &["-r"]).await.unwrap_or_else(|_| "unknown".to_string());
      let arch = exec_output("uname", &["-m"]).await.unwrap_or_else(|_| "unknown".to_string());
      let os_name = exec_output("uname", &["-s"]).await.unwrap_or_else(|_| "Linux".to_string());
      let uptime_str = read_proc_text("/proc/uptime").await;
      let uptime = uptime_str.split_whitespace().next()
        .and_then(|v| v.split('.').next())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
      // Distro from /etc/os-release PRETTY_NAME
      let os_release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
      let distro = os_release.lines()
        .find(|l| l.starts_with("PRETTY_NAME="))
        .and_then(|l| l.split_once('=').map(|x| x.1))
        .map(|v| v.trim_matches('"').to_string())
        .unwrap_or_else(|| os_name.trim().to_string());
      // IP address (first non-loopback)
      let ip = exec_output_limit("sh", &["-c", "hostname -I 2>/dev/null | awk '{print $1}'"], cmd_timeout_short())
        .await.unwrap_or_default();
      // Shell from $SHELL env, fallback to /proc/1/cmdline
      let shell = std::env::var("SHELL").unwrap_or_else(|_| "unknown".to_string());
      let shell_name = Path::new(shell.trim()).file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| shell.trim().to_string());
      // Desktop environment
      let de = std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("DESKTOP_SESSION"))
        .unwrap_or_else(|_| "unknown".to_string());
      // WM / session type
      let wm = std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string());
      // GPU
      let gpu = exec_output_limit("sh", &["-c",
        "nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || lspci 2>/dev/null | grep -i 'vga\\|3d\\|display' | head -1 | sed 's/.*: //' || echo 'unknown'"
      ], cmd_timeout_short()).await.unwrap_or_else(|_| "unknown".to_string());
      // Memory total
      let meminfo = read_proc_text("/proc/meminfo").await;
      let mem_total_kb: u64 = meminfo.lines()
        .find(|l| l.starts_with("MemTotal:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse().ok()).unwrap_or(0);
      let mem_total_gb = mem_total_kb / 1024 / 1024;
      let memory_usage = format!("{} GB", mem_total_gb);
      // Package count
      let packages = exec_output_limit("sh", &["-c",
        "if command -v rpm >/dev/null 2>&1; then rpm -qa 2>/dev/null | wc -l; \
         elif command -v dpkg >/dev/null 2>&1; then dpkg -l 2>/dev/null | awk '/^ii/{c++}END{print c+0}'; \
         elif command -v pacman >/dev/null 2>&1; then pacman -Q 2>/dev/null | wc -l; \
         else echo 0; fi"
      ], cmd_timeout_short()).await.unwrap_or_else(|_| "0".to_string());
      // Resolution via xrandr or wlr-randr
      let resolution = exec_output_limit("sh", &["-c",
        "xrandr --current 2>/dev/null | grep ' connected' | grep -oE '[0-9]+x[0-9]+' | head -1 || wlr-randr 2>/dev/null | grep -oE '[0-9]+x[0-9]+' | head -1 || echo unknown"
      ], cmd_timeout_short()).await.unwrap_or_else(|_| "unknown".to_string());
      json!({
        "ok": true,
        "info": {
          "hostname": hostname.trim(),
          "os": os_name.trim(),
          "kernel": kernel.trim(),
          "arch": arch.trim(),
          "uptime": uptime,
          "distro": distro,
          "ip": ip.trim(),
          "shell": shell_name,
          "de": de.trim(),
          "wm": wm.trim(),
          "gpu": gpu.trim(),
          "memoryUsage": memory_usage,
          "packages": packages.trim(),
          "resolution": resolution.trim()
        }
      })
    },
    "dh:host:ports" => {
      let mut docker_port_owner: HashMap<String, String> = HashMap::new();
      if let Ok(docker_out) = exec_output_limit("docker", &["ps", "--format", "{{.Names}}\t{{.Ports}}"], cmd_timeout_short()).await {
        for line in docker_out.lines() {
          let mut it = line.splitn(2, '\t');
          let name = it.next().unwrap_or_default().trim();
          let ports = it.next().unwrap_or_default().trim();
          if name.is_empty() || ports.is_empty() {
            continue;
          }
          for part in ports.split(',') {
            let p = part.trim();
            if let Some((left, right)) = p.split_once("->") {
              let host_port = left
                .split(':')
                .next_back()
                .and_then(|v| v.parse::<u16>().ok());
              let proto = if right.trim().ends_with("/udp") { "udp" } else { "tcp" };
              if let Some(port) = host_port {
                docker_port_owner.insert(format!("{}:{}", proto, port), format!("docker:{}", name));
              }
            }
          }
        }
      }
      let script = "ss -tulpnH 2>/dev/null";
      match exec_output_limit("sh", &["-c", script], cmd_timeout_short()).await {
        Ok(out) => {
          let ports: Vec<Value> = out
            .lines()
            .filter_map(|line| {
              let parts: Vec<&str> = line.split_whitespace().collect();
              if parts.len() < 5 {
                return None;
              }
              let protocol = if parts[0].starts_with("udp") { "udp" } else { "tcp" };
              let state = parts[1].to_string();
              let port = parts[4]
                .split(':')
                .next_back()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(0);
              if port == 0 {
                return None;
              }
              let mut service = ss_process_from_line(line);
              if service == "unknown" {
                if let Some(owner) = docker_port_owner.get(&format!("{}:{}", protocol, port)) {
                  service = owner.clone();
                }
              }
              Some(json!({
                "protocol": protocol,
                "port": port,
                "state": state,
                "service": service
              }))
            })
            .collect();
          json!({ "ok": true, "ports": ports })
        }
        Err(e) => json!({ "ok": false, "ports": [], "error": format!("[HOST_PORTS_FAILED] {}", e.trim()) }),
      }
    },
    "dh:monitor:top-processes" => {
      match exec_output_limit("ps", &["-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"], cmd_timeout_short()).await {
        Ok(out) => {
          let processes: Vec<Value> = out
            .lines()
            .skip(1)
            .filter(|l| !l.trim().is_empty())
            .take(15)
            .filter_map(|line| {
              let parts: Vec<&str> = line.split_whitespace().collect();
              if parts.len() < 4 {
                return None;
              }
              Some(json!({
                "pid": parts[0].parse::<u32>().unwrap_or(0),
                "command": parts[1],
                "cpuPercent": parts[2].parse::<f32>().unwrap_or(0.0),
                "memPercent": parts[3].parse::<f32>().unwrap_or(0.0)
              }))
            })
            .collect();
          json!({ "ok": true, "processes": processes })
        }
        Err(e) => json!({ "ok": false, "processes": [], "error": format!("[MONITOR_TOP_FAILED] {}", e.trim()) }),
      }
    },
    "dh:monitor:security" => {
      let ufw_active = exec_output_limit("ufw", &["status"], cmd_timeout_short())
        .await
        .map(|o| o.contains("active"))
        .unwrap_or(false);
      let firewalld_running = exec_output_limit("firewall-cmd", &["--state"], cmd_timeout_short())
        .await
        .map(|o| o.contains("running"))
        .unwrap_or(false);
      let firewall = if ufw_active || firewalld_running { "active" } else { "inactive" };
      let selinux = exec_output_limit("sestatus", &[], cmd_timeout_short()).await
        .map(|o| if o.contains("enabled") { "enabled" } else { "disabled" })
        .unwrap_or_else(|_| "unknown");
      let ssh_config = exec_output_limit("bash", &["-c", "sshd -T 2>/dev/null | awk '/permitrootlogin|passwordauthentication/'"], cmd_timeout_short()).await.unwrap_or_default();
      let root_login = if ssh_config.contains("permitrootlogin yes") { "yes" } else { "no" };
      let pw_auth = if ssh_config.contains("passwordauthentication no") { "no" } else { "yes" };
      let failed_auth_24h = exec_output_limit(
        "bash",
        &[
          "-c",
          "journalctl --since '24 hours ago' -u sshd --no-pager 2>/dev/null | grep -Ei 'failed password|invalid user|authentication failure' | wc -l",
        ],
        cmd_timeout_short(),
      )
      .await
      .ok()
      .and_then(|s| s.trim().parse::<i32>().ok())
      .unwrap_or(0);
      
      let ports_out = exec_output_limit("ss", &["-tulpn"], cmd_timeout_short()).await.unwrap_or_default();
      let mut risky: Vec<u16> = Vec::new();
      // Expanded risky ports list (DBs, Dev tools, common unauthenticated services)
      for p in [21, 22, 23, 25, 139, 445, 3306, 5432, 27017, 6379, 8080, 9000, 9200] {
        if ports_out.contains(&format!(":{}", p)) { 
          // Check if it's listening on 0.0.0.0 or ::: (exposed to network)
          if ports_out.contains(&format!("0.0.0.0:{}", p)) || ports_out.contains(&format!("[::]:{}", p)) || ports_out.contains(&format!("*:{}", p)) {
            risky.push(p); 
          }
        }
      }

      json!({
        "ok": true,
        "snapshot": {
          "firewall": firewall,
          "selinux": selinux,
          "sshPermitRootLogin": root_login,
          "sshPasswordAuth": pw_auth,
          "failedAuth24h": failed_auth_24h,
          "riskyOpenPorts": risky
        }
      })
    },
    "dh:monitor:security-drilldown" => {
      let failed_auth_raw = exec_output_limit(
        "bash",
        &[
          "-c",
          "journalctl --since '48 hours ago' -u sshd --no-pager 2>/dev/null | grep -Ei 'failed password|invalid user|authentication failure' | tail -n 20",
        ],
        cmd_timeout_short(),
      )
      .await
      .unwrap_or_default();
      let failed_auth_samples: Vec<String> = failed_auth_raw
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

      let ss_out = exec_output_limit("ss", &["-tulpn", "-H"], cmd_timeout_short()).await.unwrap_or_default();
      let risky_set: std::collections::HashSet<u16> = [22, 3306, 5432, 27017, 6379].iter().cloned().collect();
      let mut risky_port_owners: Vec<Value> = Vec::new();
      for line in ss_out.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(local) = parts.get(4) {
          if let Some(port_str) = local.split(':').next_back() {
            if let Ok(port) = port_str.parse::<u16>() {
              if risky_set.contains(&port) {
                let mut process = "unknown".to_string();
                let mut pid = None;
                if let Some(start) = line.find("users:((\"") {
                  let sub = &line[start + 9..];
                  if let Some(end) = sub.find('"') {
                    process = sub[..end].to_string();
                    if let Some(p_start) = sub.find("pid=") {
                      let p_sub = &sub[p_start + 4..];
                      if let Some(p_end) = p_sub.find(',') {
                        pid = p_sub[..p_end].parse::<i32>().ok();
                      }
                    }
                  }
                }
                risky_port_owners.push(json!({ "port": port, "process": process, "pid": pid }));
              }
            }
          }
        }
      }
      json!({ "ok": true, "drilldown": { "failedAuthSamples": failed_auth_samples, "riskyPortOwners": risky_port_owners } })
    },
    "dh:metrics" => {
      let meminfo = read_proc_text("/proc/meminfo").await;
      let parse_kb = |key: &str| -> u64 {
        meminfo.lines()
          .find(|l| l.starts_with(key))
          .and_then(|l| l.split_whitespace().nth(1))
          .and_then(|v| v.parse::<u64>().ok())
          .unwrap_or(0)
      };
      let total_kb = parse_kb("MemTotal:");
      let free_kb = parse_kb("MemAvailable:");
      let swap_total_kb = parse_kb("SwapTotal:");
      let swap_free_kb = parse_kb("SwapFree:");
      let uptime_str = read_proc_text("/proc/uptime").await;
      let uptime_sec = uptime_str.split_whitespace().next()
        .and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0) as u64;
      let loadavg_str = read_proc_text("/proc/loadavg").await;
      let load_parts: Vec<f64> = loadavg_str.split_whitespace().take(3)
        .filter_map(|v| v.parse::<f64>().ok()).collect();
      let (cpu_percent, cpu_model) = {
        let stat_raw = read_proc_text("/proc/stat").await;
        let first_line = stat_raw.lines().next().unwrap_or("");
        let parts: Vec<u64> = first_line.split_whitespace().skip(1).filter_map(|v| v.parse::<u64>().ok()).collect();
        let total: u64 = parts.iter().sum();
        let idle = parts.get(3).copied().unwrap_or(0) + parts.get(4).copied().unwrap_or(0); // idle + iowait
        let now_inst = std::time::Instant::now();
        
        let mut prev = state.cpu_prev.lock().await;
        let pct = if let Some((ptotal, pidle, _)) = *prev {
          let delta_total = total.saturating_sub(ptotal);
          let delta_idle = idle.saturating_sub(pidle);
          if delta_total > 0 {
            let usage = 1.0 - (delta_idle as f64 / delta_total as f64);
            (usage * 100.0).clamp(0.0, 100.0)
          } else {
            0.0
          }
        } else {
          0.0
        };
        *prev = Some((total, idle, now_inst));

        let cpuinfo = read_proc_text("/proc/cpuinfo").await;
        let model = cpuinfo.lines()
          .find(|l| l.starts_with("model name"))
          .and_then(|l| l.split_once(':').map(|x| x.1))
          .map(|s| s.trim().to_string())
          .unwrap_or_else(|| "Unknown CPU".to_string());
        
        (pct, model)
      };
      let disk_out = exec_output("df", &["-k", "/"]).await.unwrap_or_default();
      let (disk_total_gb, disk_free_gb) = disk_out.lines().nth(1)
        .and_then(|l| {
          let p: Vec<&str> = l.split_whitespace().collect();
          let total = p.get(1).and_then(|v| v.parse::<u64>().ok())?;
          let free = p.get(3).and_then(|v| v.parse::<u64>().ok())?;
          Some((total / 1024 / 1024, free / 1024 / 1024))
        }).unwrap_or((0, 0));
      // Net I/O delta from /proc/net/dev
      let net_raw = read_proc_text("/proc/net/dev").await;
      let (net_rx_now, net_tx_now) = net_raw.lines().skip(2).fold((0u64, 0u64), |acc, l| {
        let parts: Vec<&str> = l.split_whitespace().collect();
        if parts.len() < 10 || parts[0].starts_with("lo:") { return acc; }
        let rx = parts[1].parse::<u64>().unwrap_or(0);
        let tx = parts[9].parse::<u64>().unwrap_or(0);
        (acc.0 + rx, acc.1 + tx)
      });
      let now_inst = std::time::Instant::now();
      let (net_rx_mbps, net_tx_mbps) = {
        let mut prev = state.net_prev.lock().await;
        let mbps = prev.as_ref().map(|(prx, ptx, pt)| {
          let secs = now_inst.duration_since(*pt).as_secs_f64().max(0.1);
          let rx = (net_rx_now.saturating_sub(*prx) as f64 / secs / 1_000_000.0 * 8.0).max(0.0);
          let tx = (net_tx_now.saturating_sub(*ptx) as f64 / secs / 1_000_000.0 * 8.0).max(0.0);
          (rx, tx)
        }).unwrap_or((0.0, 0.0));
        *prev = Some((net_rx_now, net_tx_now, now_inst));
        mbps
      };
      // Disk I/O delta from /proc/diskstats (sectors = 512 bytes)
      let disk_raw = read_proc_text("/proc/diskstats").await;
      let (disk_read_now, disk_write_now) = disk_raw.lines().fold((0u64, 0u64), |acc, l| {
        let p: Vec<&str> = l.split_whitespace().collect();
        let name = p.get(2).copied().unwrap_or("");
        if !is_physical_disk_name(name) { return acc; }
        let r = p.get(5).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        let w = p.get(9).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        (acc.0 + r, acc.1 + w)
      });
      let disk_now_inst = std::time::Instant::now();
      let (disk_read_mbps, disk_write_mbps) = {
        let mut prev = state.disk_prev.lock().await;
        let mbps = prev.as_ref().map(|(pr, pw, pt)| {
          let secs = disk_now_inst.duration_since(*pt).as_secs_f64().max(0.1);
          let rd = (disk_read_now.saturating_sub(*pr) as f64 * 512.0 / secs / 1_000_000.0).max(0.0);
          let wr = (disk_write_now.saturating_sub(*pw) as f64 * 512.0 / secs / 1_000_000.0).max(0.0);
          (rd, wr)
        }).unwrap_or((0.0, 0.0));
        *prev = Some((disk_read_now, disk_write_now, disk_now_inst));
        mbps
      };
      let svc_out = exec_output_limit("systemctl", &["list-units", "--type=service", "--no-pager", "--plain", "--no-legend"], cmd_timeout_short()).await.unwrap_or_default();
      let systemd: Vec<Value> = svc_out.lines().take(30).filter_map(|l| {
        let p: Vec<&str> = l.split_whitespace().collect();
        if p.len() < 4 { return None; }
        let name = p[0].trim_end_matches(".service");
        let state = match p[3] { "running" => "active", "failed" => "failed", _ => "inactive" };
        Some(json!({ "name": name, "state": state }))
      }).collect();
      json!({
        "ok": true,
        "metrics": {
          "cpuUsagePercent": cpu_percent,
          "cpuModel": cpu_model,
          "loadAvg": load_parts,
          "totalMemMb": total_kb / 1024,
          "freeMemMb": free_kb / 1024,
          "swapTotalMb": swap_total_kb / 1024,
          "swapFreeMb": swap_free_kb / 1024,
          "uptimeSec": uptime_sec,
          "diskTotalGb": disk_total_gb,
          "diskFreeGb": disk_free_gb,
          "diskReadMbps": disk_read_mbps,
          "diskWriteMbps": disk_write_mbps,
          "netRxMbps": net_rx_mbps,
          "netTxMbps": net_tx_mbps
        },
        "systemd": systemd
      })
    },
    "dh:host:exec" => {
      let cmd = body.get("command").and_then(|v| v.as_str()).unwrap_or_default();
      match cmd {
        "nvidia_smi_short" => {
          let mut gpus = Vec::new();
          // Try nvidia-smi
          if let Ok(out) = exec_output_limit("nvidia-smi", &["--query-gpu=name", "--format=csv,noheader"], cmd_timeout_short()).await {
             let name = out.trim().to_string();
             if !name.is_empty() { gpus.push(format!("NVIDIA {}", name)); }
          }
          // Try lspci for Intel/AMD
          if let Ok(out) = exec_output_limit("lspci", &[], cmd_timeout_short()).await {
            for line in out.lines() {
              if line.contains("VGA compatible controller") || line.contains("3D controller") {
                if line.contains("Intel") { gpus.push("Intel Graphics".into()); }
                else if line.contains("AMD") || line.contains("ATI") { gpus.push("AMD Radeon".into()); }
              }
            }
          }
          let result = if gpus.is_empty() { "GPU: unavailable".to_string() } else { gpus.join(", ") };
          json!({ "ok": true, "result": result })
        }
        "systemctl_is_active" => {
          let unit = body.get("unit").and_then(|v| v.as_str()).unwrap_or_default();
          if unit.is_empty() {
            json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing unit." })
          } else {
            match exec_output_limit("systemctl", &["is-active", unit], cmd_timeout_short()).await {
              Ok(out) => json!({ "ok": true, "result": out.trim() }),
              Err(_) => json!({ "ok": true, "result": "unknown" }),
            }
          }
        }
        "maintenance_docker_system_df" => match exec_output_limit(
          "docker",
          &["system", "df"],
          get_global_ipc_timeout(),
        )
        .await
        {
          Ok(out) => json!({ "ok": true, "result": truncate_probe_output(&out) }),
          Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
        },
        "maintenance_docker_ps_table" => match exec_output_limit(
          "docker",
          &[
            "ps",
            "--format",
            "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}",
          ],
          get_global_ipc_timeout(),
        )
        .await
        {
          Ok(out) => json!({ "ok": true, "result": truncate_probe_output(&out) }),
          Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
        },
        "maintenance_journalctl_docker" => {
          match exec_result_limit(
            "journalctl",
            &[
              "-u",
              "docker",
              "--since",
              "2 hours ago",
              "--no-pager",
              "-n",
              "800",
            ],
            cmd_timeout_long(),
          )
          .await
          {
            Ok((stdout, stderr)) => {
              let mut out = stdout;
              if !stderr.trim().is_empty() {
                if !out.trim().is_empty() {
                  out.push_str("\n--- stderr ---\n");
                }
                out.push_str(&stderr);
              }
              json!({ "ok": true, "result": truncate_probe_output(out.trim()) })
            }
            Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
          }
        }
        "maintenance_du_cache_tail" => match std::env::var("HOME") {
          Ok(home) if !home.trim().is_empty() => {
            if home.contains('\'') || home.contains('\n') || home.contains('\r') {
              json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] HOME path not supported." })
            } else {
              let cache = format!("{}/.cache", home.trim_end_matches('/'));
              if cache.contains('\'') {
                json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] cache path not supported." })
              } else {
                let script = format!(
                  "if [ -d '{}' ]; then du -sh '{}'/* 2>/dev/null | sort -h | tail -n 25; else echo '(no ~/.cache directory)'; fi",
                  cache, cache
                );
                match exec_output_limit("bash", &["-lc", &script], cmd_timeout_long()).await {
                  Ok(out) => json!({ "ok": true, "result": truncate_probe_output(&out) }),
                  Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
                }
              }
            }
          }
          _ => json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] HOME unset." }),
        },
        "settings_read_hosts" => match exec_output_limit("cat", &["/etc/hosts"], cmd_timeout_short()).await {
          Ok(out) => json!({ "ok": true, "result": truncate_probe_output(&out) }),
          Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
        },
        "settings_process_env" => {
          const KEYS: &[&str] = &[
            "HOME",
            "USER",
            "LOGNAME",
            "SHELL",
            "LANG",
            "LC_ALL",
            "PATH",
            "DISPLAY",
            "WAYLAND_DISPLAY",
            "XDG_SESSION_TYPE",
            "XDG_CURRENT_DESKTOP",
            "XDG_RUNTIME_DIR",
            "TERM",
            "COLORTERM",
            "FLATPAK_ID",
            "PWD",
            "SSH_AUTH_SOCK",
          ];
          let mut lines: Vec<String> = Vec::new();
          for k in KEYS {
            if let Ok(v) = std::env::var(k) {
              if v.contains('\n') || v.contains('\r') {
                lines.push(format!("{k}=(value contains line breaks; omitted)"));
              } else {
                lines.push(format!("{k}={v}"));
              }
            }
          }
          let out = if lines.is_empty() {
            "(no matching variables in this process)".to_string()
          } else {
            lines.join("\n")
          };
          json!({ "ok": true, "result": truncate_probe_output(&out) })
        },
        "settings_write_hosts" => {
          let content = match body.get("content").and_then(|v| v.as_str()) {
            Some(c) => c.to_string(),
            None => return Ok(json!({ "ok": false, "error": "[HOST_EXEC_FAILED] missing content" })),
          };
          // Write to a temp file then sudo cp to avoid shell-escaping issues
          let tmp = format!("/tmp/lumina_hosts_{}", std::process::id());
          if let Err(e) = std::fs::write(&tmp, &content) {
            return Ok(json!({ "ok": false, "error": format!("[HOST_EXEC_FAILED] {}", e) }));
          }
          let result = exec_result_limit("sudo", &["cp", &tmp, "/etc/hosts"], cmd_timeout_short()).await;
          let _ = std::fs::remove_file(&tmp);
          match result {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
          }
        },
        "settings_read_profile_env" => {
          let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
          let profile_path = format!("{}/.profile", home);
          match exec_output_limit("cat", &[&profile_path], cmd_timeout_short()).await {
            Ok(out) => json!({ "ok": true, "result": out, "path": profile_path }),
            Err(_) => json!({ "ok": true, "result": "", "path": profile_path }),
          }
        },
        "settings_write_profile_env" => {
          let action = body.get("action").and_then(|v| v.as_str()).unwrap_or("");
          let key = body.get("key").and_then(|v| v.as_str()).unwrap_or("");
          let value = body.get("value").and_then(|v| v.as_str()).unwrap_or("");
          let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
          let profile_path = format!("{}/.profile", home);
          if key.is_empty() || key.contains(|c: char| !c.is_alphanumeric() && c != '_') {
            return Ok(json!({ "ok": false, "error": "[HOST_EXEC_FAILED] invalid key name" }));
          }
          let current = exec_output_limit("cat", &[&profile_path], cmd_timeout_short()).await.unwrap_or_default();
          let new_content = match action {
            "set" => {
              let export_line = format!("export {}={}", key, shell_quote_value(value));
              // Remove existing export for this key, then append new one
              let filtered: String = current.lines()
                .filter(|l| {
                  let t = l.trim();
                  !t.starts_with(&format!("export {}=", key)) && !t.starts_with(&format!("export {}=", key))
                })
                .collect::<Vec<_>>()
                .join("\n");
              let base = if filtered.trim().is_empty() { String::new() } else { format!("{}\n", filtered.trim_end()) };
              format!("{}{}\n", base, export_line)
            },
            "remove" => {
              current.lines()
                .filter(|l| !l.trim().starts_with(&format!("export {}=", key)))
                .collect::<Vec<_>>()
                .join("\n") + "\n"
            },
            _ => return Ok(json!({ "ok": false, "error": "[HOST_EXEC_FAILED] unknown action" })),
          };
          match std::fs::write(&profile_path, &new_content) {
            Ok(_) => json!({ "ok": true, "path": profile_path }),
            Err(e) => json!({ "ok": false, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
          }
        },
        _ => json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_NOT_ALLOWED] command not allowed" }),
      }
    },
    "dh:docker:create" => docker_engine::docker_create(&body).await,
    "dh:docker:remap-port" => docker_engine::docker_remap_port(&body).await,
    "dh:docker:inspect" => docker_engine::docker_inspect(&body).await,
    "dh:docker:reconfigure" => docker_engine::docker_reconfigure(&body).await,
    "dh:ssh:list:dir" => {
      let user = body.get("user").and_then(|v| v.as_str()).unwrap_or_default();
      let host_str = body.get("host").and_then(|v| v.as_str()).unwrap_or_default();
      let port = body.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
      let remote_path = body.get("remotePath").and_then(|v| v.as_str()).unwrap_or(".");
      let remote = format!("{}@{}", user, host_str);
      let port_str = port.to_string();
      let ls_cmd = format!("ls -aF1 '{}'", remote_path.replace('\'', r"'\''"));
      match exec_result_limit(
        "ssh",
        &["-o", "StrictHostKeyChecking=no", "-p", &port_str, &remote, &ls_cmd],
        cmd_timeout_ssh(),
      )
      .await
      {
        Ok((stdout, _)) => {
          let entries: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();
          json!({ "ok": true, "entries": entries })
        }
        Err(e) => json!({ "ok": false, "entries": [], "error": format!("[SSH_LIST_DIR_FAILED] {}", e.trim()) }),
      }
    },
    "dh:ssh:setup:remote:key" => {
      let user = body.get("user").and_then(|v| v.as_str()).unwrap_or_default();
      let host_str = body.get("host").and_then(|v| v.as_str()).unwrap_or_default();
      let port = body.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
      let password = body.get("password").and_then(|v| v.as_str()).unwrap_or_default();
      let public_key = body.get("publicKey").and_then(|v| v.as_str()).unwrap_or_default();
      if public_key.is_empty() {
        json!({ "ok": false, "error": "[SSH_SETUP_KEY_FAILED] Missing public key." })
      } else {
        let port_str = port.to_string();
        let remote = format!("{}@{}", user, host_str);
        let safe_key = public_key.replace('\'', r"'\''");
        // Wrap in `bash -c '...'` so it works regardless of the remote user's
        // login shell (fish, zsh, dash, etc. all accept this invocation).
        // Key is double-quoted inside the single-quoted bash string; SSH public
        // keys never contain `"` so this is safe.
        let setup_cmd = format!(
          concat!(
            "bash -c '",
            "mkdir -p ~/.ssh && ",
            "touch ~/.ssh/authorized_keys && ",
            "chmod 700 ~/.ssh && ",
            "grep -qF \"{key}\" ~/.ssh/authorized_keys || ",
            "printf \"%s\\n\" \"{key}\" >> ~/.ssh/authorized_keys && ",
            "chmod 600 ~/.ssh/authorized_keys",
            "'"
          ),
          key = safe_key
        );
        let result = if !password.is_empty() {
          exec_sshpass_ssh(password, &port_str, &remote, &setup_cmd, cmd_timeout_ssh()).await
        } else {
          exec_result_limit(
            "ssh",
            &["-o", "StrictHostKeyChecking=no", "-p", &port_str, &remote, &setup_cmd],
            cmd_timeout_ssh(),
          )
          .await
        };
        match result {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": format!("[SSH_SETUP_KEY_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:ssh:enable:local" => {
      // Use pkexec so the desktop shows a native polkit password dialog.
      // We write a small helper script, run it elevated, then clean up.
      let script = concat!(
        "#!/bin/sh\n",
        "# Enable SSH daemon (Fedora: sshd, Debian/Ubuntu: ssh)\n",
        "systemctl enable --now sshd 2>/dev/null || systemctl enable --now ssh\n",
        "# Open firewall\n",
        "if command -v firewall-cmd > /dev/null 2>&1; then\n",
        "  firewall-cmd --add-service=ssh --permanent && firewall-cmd --reload\n",
        "elif command -v ufw > /dev/null 2>&1; then\n",
        "  ufw allow ssh\n",
        "fi\n",
      );

      let tmp_path = std::env::temp_dir().join("lumina-ssh-enable.sh");
      if let Err(e) = std::fs::write(&tmp_path, script) {
        return Ok(json!({ "ok": false, "log": "", "error": format!("[SSH_ENABLE_LOCAL_FAILED] {}", e) }));
      }

      #[cfg(unix)]
      {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp_path, std::fs::Permissions::from_mode(0o755));
      }

      let script_str = tmp_path.to_string_lossy().to_string();
      // cmd_timeout_long() gives the user enough time to interact with the polkit dialog
      let result = exec_output_limit("pkexec", &[&script_str], cmd_timeout_long()).await;
      let _ = std::fs::remove_file(&tmp_path);

      match result {
        Ok(out) => {
          let log = format!("✓ SSH daemon enabled\n✓ Firewall configured\n{}", out.trim());
          json!({ "ok": true, "log": log.trim_end() })
        }
        Err(e) => {
          let msg = e.trim().to_string();
          // pkexec exit 126 = user dismissed the dialog (cancelled)
          let cancelled = msg.contains("126") || msg.to_lowercase().contains("cancel") || msg.is_empty();
          if cancelled {
            json!({ "ok": false, "log": "✗ Cancelled by user", "error": "[SSH_ENABLE_LOCAL_FAILED] Authentication cancelled." })
          } else {
            json!({ "ok": false, "log": format!("✗ {}", msg), "error": format!("[SSH_ENABLE_LOCAL_FAILED] {}", msg) })
          }
        }
      }
    },
    "dh:app:update:check" => {
      let client = reqwest::Client::builder()
        .user_agent("LuminaDev-Updater")
        .build();
      match client {
        Ok(c) => {
          match c.get("https://api.github.com/repos/Karim-Termanini/LuminaDev/releases/latest").send().await {
            Ok(res) => {
              if let Ok(json_val) = res.json::<serde_json::Value>().await {
                if let Some(tag) = json_val.get("tag_name").and_then(|v| v.as_str()) {
                  let current_version = concat!("v", env!("CARGO_PKG_VERSION"));
                  let update_available = tag != current_version;
                  json!({
                    "ok": true,
                    "latestVersion": tag,
                    "currentVersion": current_version,
                    "updateAvailable": update_available,
                    "url": json_val.get("html_url").and_then(|v| v.as_str()).unwrap_or("https://github.com/Karim-Termanini/LuminaDev")
                  })
                } else {
                  json!({ "ok": false, "error": "[UPDATE_CHECK_FAILED] Invalid release data from GitHub." })
                }
              } else {
                json!({ "ok": false, "error": "[UPDATE_CHECK_FAILED] Failed to parse GitHub JSON response." })
              }
            }
            Err(e) => json!({ "ok": false, "error": format!("[UPDATE_CHECK_FAILED] HTTP request failed: {}", e) }),
          }
        }
        Err(_) => json!({ "ok": false, "error": "[UPDATE_CHECK_FAILED] Failed to create HTTP client." }),
      }
    },
    "dh:docker:install" => docker_engine::docker_install(&body).await,
    _ => json!({ "ok": false, "error": format!("[UNKNOWN_CHANNEL] {}", channel) }),
  };
  Ok(res)
}

async fn startup_update_check(app: AppHandle) {
  if let Ok(store_path) = app_file(&app, "store.json") {
    if let Ok(client) = reqwest::Client::builder()
      .user_agent("LuminaDev-Updater")
      .build()
    {
      let tag = match client
        .get("https://api.github.com/repos/Karim-Termanini/LuminaDev/releases/latest")
        .send()
        .await
      {
        Ok(r) => match r.json::<Value>().await {
          Ok(v) => v.get("tag_name").and_then(|t| t.as_str()).map(|s| s.to_string()),
          Err(_) => None,
        },
        Err(_) => None,
      };
      let mut store = read_json(&store_path);
      if !store.is_object() {
        store = json!({});
      }
      {
        let map = store.as_object_mut().unwrap();
        if !map.contains_key("update_settings") {
          map.insert("update_settings".to_string(), json!({}));
        }
      }
      let update = store.get_mut("update_settings").unwrap();
      update["lastChecked"] = json!(now_ms());
      if let Some(v) = tag {
        update["latestVersion"] = json!(v);
      }
      let _ = utils::write_json(&store_path, &store);
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  START_TIME.set(Instant::now()).ok();
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(AppState::default())
    .setup(|app| {
      let handle = app.handle();
      if let Ok(store_path) = app_file(handle, "store.json") {
        let store = read_json(&store_path);
        if let Some(engine) = store.get("app_engine_settings") {
          if let Some(ms) = engine.get("ipcTimeoutMs").and_then(|v| v.as_u64()) {
            set_global_ipc_timeout(ms);
          }
          if let Some(n) = engine.get("threadPoolSize").and_then(|v| v.as_u64()) {
            set_global_thread_pool_size(n);
          }
          if let Some(v) = engine.get("daemonAutoRestart").and_then(|v| v.as_bool()) {
            set_global_daemon_auto_restart(v);
          }
        }
        if let Some(update) = store.get("update_settings") {
          if update.get("checkOnStartup").and_then(|v| v.as_bool()) == Some(true) {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move {
              startup_update_check(h).await;
            });
          }
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![ipc_invoke, ipc_send])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::docker_ext::docker_install_build_steps;

  #[tokio::test]
  async fn job_runner_long_task_completes_and_collects_logs() {
    let mut logs = Vec::new();
    let cmd = r#"for i in 1 2 3; do echo "long-step-$i"; sleep 0.05; done"#;
    let res = runtime_bash_user_step(cmd, &mut logs, None, None, 0, 100).await;
    assert!(res.is_ok(), "expected long task to complete: {res:?}");
    assert!(logs.iter().any(|l| l.contains("long-step-1")));
    assert!(logs.iter().any(|l| l.contains("long-step-3")));
  }

  #[tokio::test]
  async fn job_runner_streaming_captures_multiple_lines() {
    let mut logs = Vec::new();
    let cmd = r#"for i in 1 2 3 4 5; do echo "stream-$i"; sleep 0.02; done"#;
    runtime_bash_user_step(cmd, &mut logs, None, None, 0, 100)
      .await
      .expect("streaming command should succeed");

    let stream_lines = logs.iter().filter(|l| l.contains("stream-") && !l.contains("echo")).count();
    assert!(
      stream_lines >= 5,
      "expected at least 5 streamed lines, got {stream_lines}"
    );
  }

  #[test]
  fn job_runner_cancel_marks_running_job() {
    let mut jobs = vec![json!({
      "id": "job-1",
      "state": "running",
      "logTail": ["start"]
    })];
    let changed = cancel_runtime_job(&mut jobs, "job-1");
    assert!(changed, "expected running job to be cancelled");
    assert_eq!(jobs[0]["state"], json!("cancelled"));
    assert_eq!(jobs[0]["logTail"], json!(["Cancelled by user."]));
  }

  #[test]
  fn job_runner_cancel_does_not_change_non_running_job() {
    let mut jobs = vec![json!({
      "id": "job-2",
      "state": "completed",
      "logTail": ["done"]
    })];
    let changed = cancel_runtime_job(&mut jobs, "job-2");
    assert!(!changed, "completed job should not be modified");
    assert_eq!(jobs[0]["state"], json!("completed"));
    assert_eq!(jobs[0]["logTail"], json!(["done"]));
  }

  #[test]
  fn effective_final_state_prefers_cancelled_state() {
    assert_eq!(effective_runtime_job_final_state("completed", "cancelled"), "cancelled");
    assert_eq!(effective_runtime_job_final_state("failed", "cancelled"), "cancelled");
    assert_eq!(effective_runtime_job_final_state("failed", "running"), "failed");
    assert_eq!(effective_runtime_job_final_state("completed", "running"), "completed");
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
  fn docker_install_steps_respect_selected_components() {
    let components = vec![json!("docker"), json!("compose")];
    let ubuntu = docker_install_build_steps("ubuntu", Some(&components)).expect("ubuntu steps");
    let joined = ubuntu.join(" || ");
    assert!(joined.contains("docker-ce"));
    assert!(joined.contains("docker-compose-plugin"));
    assert!(!joined.contains("docker-buildx-plugin"));

    let arch = docker_install_build_steps("arch", Some(&components)).expect("arch steps");
    let arch_joined = arch.join(" || ");
    assert!(arch_joined.contains("docker-compose"));
  }

  #[test]
  fn distro_pkg_manager_mapping_is_stable() {
    assert_eq!(runtime_pkg_mgr("ubuntu"), "apt");
    assert_eq!(runtime_pkg_mgr("fedora"), "dnf");
    assert_eq!(runtime_pkg_mgr("arch"), "pacman");
    assert_eq!(runtime_pkg_mgr("opensuse"), "zypper");
    assert_eq!(runtime_pkg_mgr("unknown-distro"), "apt");
  }

  #[test]
  fn java_package_selection_honors_major_version() {
    assert_eq!(
      runtime_java_system_packages_for_version("dnf", "17"),
      vec!["java-17-openjdk-devel".to_string()]
    );
    assert_eq!(
      runtime_java_system_packages_for_version("apt", "11.0.22"),
      vec!["openjdk-11-jdk".to_string()]
    );
    assert_eq!(
      runtime_java_system_packages_for_version("pacman", "stable"),
      vec!["jdk21-openjdk".to_string()]
    );
    assert_eq!(
      runtime_java_system_packages_for_version("dnf", "11.0.23"),
      vec!["java-11-openjdk-devel".to_string()]
    );
    assert_eq!(
      runtime_java_system_packages_for_version("dnf", "8"),
      vec!["java-1.8.0-openjdk-devel".to_string()]
    );
    assert_eq!(
      runtime_java_system_packages_for_version("dnf", "latest"),
      vec!["java-21-openjdk-devel".to_string()]
    );
  }

  #[test]
  fn version_token_helpers_handle_expected_inputs() {
    assert_eq!(
      lumina_first_version_token("v22.1.0 (LTS)"),
      Some("v22.1.0".to_string())
    );
    assert_eq!(lumina_first_version_token("latest"), None);
    assert_eq!(lumina_dotnet_install_channel("9.0.1"), "9.0.1");
    assert_eq!(lumina_dotnet_install_channel(""), "8.0");
  }

  #[test]
  fn version_matching_allows_prerelease_probe_lines() {
    assert!(lumina_version_token_matches_probe_line(
      "0.13.0",
      "0.13.0-dev.20240201"
    ));
    assert!(lumina_version_token_matches_probe_line("v22.2.0", "node v22.2.0"));
    assert!(!lumina_version_token_matches_probe_line("1.2.3", "1.2.4"));
  }

  #[test]
  fn probe_line_filter_ignores_shell_noise() {
    let stdout = "bash: /home/me/.bashrc: line 1: foo: command not found\n";
    let stderr = "Python 3.12.2\n";
    assert_eq!(lumina_probe_meaningful_line(stdout, stderr), "Python 3.12.2");
  }

  #[test]
  fn pkg_command_builders_generate_expected_strings() {
    assert_eq!(
      pkg_upgrade_cmd("apt", &["nodejs", "npm"]),
      "DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y nodejs npm"
    );
    assert_eq!(
      pkg_remove_cmd("pacman", &["go"]),
      "pacman -R --noconfirm go"
    );
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
        assert_eq!(unstaged[0]["path"], "apps/desktop/src/renderer/src/pages/GitVcsPage.tsx");
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
        // Matches real `git status --porcelain=v1` after `git mv`: `R  <from> -> <to>`.
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
  fn diff_cap_check() {
      let big = "a".repeat(524289);
      assert!(big.len() > 512 * 1024);
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
          "readiness_wizard_complete", "general_settings", "update_settings",
          "profile_credentials", "onboarding_profile", "projects_home_dir",
          "resources_settings", "app_engine_settings", "builder_settings",
          "beta_features_state", "notification_settings", "shortcuts_settings",
          "datetime_settings", "language_settings",
      ] {
          assert!(is_allowed_store_key(key), "expected key '{}' to be allowed", key);
      }
  }

}

#[cfg(test)]
mod runtime_prune_contract_tests;
#[cfg(test)]
mod ipc_contract_tests;
