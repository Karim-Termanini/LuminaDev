use serde_json::json;
use std::process::Stdio;
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::process::Command;

use crate::host_exec::{cmd_timeout_install_step, cmd_timeout_short, exec_output_limit};
use crate::state::{self};
use crate::utils::calculate_limit_cores;

pub(crate) fn get_resource_limits() -> (usize, usize, u64) {
    const CPU_LIMIT: u64 = 80;
    const RAM_LIMIT_MB: u64 = 4096;
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let limit_cores = calculate_limit_cores(cores, CPU_LIMIT);
    (limit_cores, cores, RAM_LIMIT_MB)
}

/// Run a bootstrap script without elevation (writes under $HOME only).
pub(crate) async fn runtime_bash_user_step(
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
    if app.is_some() {
        let (limit_cores, cores, ram_limit_mb) = get_resource_limits();
        logs.push(format!(
      "[RESOURCE_ENFORCEMENT] Constraints: CPU Cores = {}/{} (nice 19, CARGO_BUILD_JOBS, MAKEFLAGS), RAM limit = {} MB (ulimit -v + runtime env vars), max processes = 4096 (ulimit -u)",
      limit_cores, cores, ram_limit_mb
    ));
        prefixed_cmd = format!(
            "ulimit -v {} 2>/dev/null; ulimit -u 4096 2>/dev/null; ",
            ram_limit_mb.saturating_mul(1024)
        );
        prefixed_cmd.push_str(cmd);
        cmd_builder
            .env("CARGO_BUILD_JOBS", limit_cores.to_string())
            .env("MAKEFLAGS", format!("-j{}", limit_cores))
            .env("MISE_JOBS", limit_cores.to_string())
            .env(
                "NODE_OPTIONS",
                format!("--max-old-space-size={}", ram_limit_mb),
            )
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

    let stdout = child
        .stdout
        .take()
        .ok_or("[RUNTIME_INSTALL_FAILED] stdout not piped")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("[RUNTIME_INSTALL_FAILED] stderr not piped")?;
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
                  let st = app_h.state::<state::AppState>();
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
            let tail = logs
                .last()
                .map(|l| l.as_str())
                .unwrap_or("non-zero exit")
                .to_string();
            Err(format!("[RUNTIME_INSTALL_FAILED] {}", tail.trim()))
        }
        Err(e) => Err(format!("[RUNTIME_INSTALL_FAILED] wait: {}", e)),
    }
}

/// Execute a shell command with elevated privileges (sudo/pkexec).
///
/// # Security
/// This function runs `bash -c` with root privileges. Callers MUST only pass
/// hardcoded command strings from trusted sources within the codebase.
/// Never pass unsanitized user input, file contents, or network data as `cmd`.
///
/// The command is always wrapped with `nice -n 19` for CPU priority reduction
/// and resource limits from the app engine settings (if `app` is provided).
pub(crate) async fn sudo_bash_install_step(
    cmd: &str,
    password: Option<&str>,
    logs: &mut Vec<String>,
    app: Option<tauri::AppHandle>,
    job_id: Option<String>,
    base_progress: u32,
    step_weight: u32,
) -> Result<(), String> {
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
    let has_limits = app.is_some();
    if has_limits {
        let (l_cores, c, r_limit) = get_resource_limits();
        limit_cores = l_cores;
        cores = c;
        ram_limit_mb = r_limit;
    }

    let mut wrapped_cmd: String;
    let effective_cmd: &str = if has_limits {
        logs.push(format!(
      "[RESOURCE_ENFORCEMENT] Constraints: CPU Cores = {}/{} (nice 19, CARGO_BUILD_JOBS, MAKEFLAGS), RAM limit = {} MB (ulimit -v + runtime env vars), max processes = 4096 (ulimit -u)",
      limit_cores, cores, ram_limit_mb
    ));
        wrapped_cmd = format!(
            "ulimit -v {} 2>/dev/null; ulimit -u 4096 2>/dev/null; ",
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
                    .env(
                        "NODE_OPTIONS",
                        format!("--max-old-space-size={}", ram_limit_mb),
                    )
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
                    .env(
                        "NODE_OPTIONS",
                        format!("--max-old-space-size={}", ram_limit_mb),
                    )
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
                    .env(
                        "NODE_OPTIONS",
                        format!("--max-old-space-size={}", ram_limit_mb),
                    )
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

    let stdout = child
        .stdout
        .take()
        .ok_or("[ELEVATED_CMD_FAILED] stdout not piped")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("[ELEVATED_CMD_FAILED] stderr not piped")?;
    let mut reader = tokio::io::BufReader::new(stdout).lines();
    let mut err_reader = tokio::io::BufReader::new(stderr).lines();

    let job_id_clone = job_id.clone();
    let app_clone = app.clone();

    let mut line_count: u32 = 0;
    let mut last_explicit_bonus: u32 = 0;

    loop {
        tokio::select! {
          res = reader.next_line() => {
            match res {
              Ok(Some(line)) => {
                if !line.trim().is_empty() {
                  logs.push(format!("OUT: {}", line.clone()));
                  line_count += 1;
                }
                if let (Some(app2), Some(jid)) = (&app_clone, &job_id_clone) {
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
                    let heuristic = (line_count * step_weight)
                      .checked_div(60)
                      .unwrap_or(0)
                      .min(step_weight.saturating_sub(2));
                    if heuristic > bonus { bonus = heuristic; }
                  }
                  let prog = (base_progress + bonus).min(base_progress + step_weight.saturating_sub(1));
                  let st = app2.state::<state::AppState>();
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

    let status = child
        .wait()
        .await
        .map_err(|e| format!("[DOCKER_INSTALL_FAILED] {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "[PROCESS_EXIT_ERROR] Command failed with code {}",
            status.code().unwrap_or(-1)
        ))
    }
}

pub(crate) async fn sudo_passwordless_ok() -> bool {
    exec_output_limit("sudo", &["-n", "true"], cmd_timeout_short())
        .await
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

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

        let stream_lines = logs
            .iter()
            .filter(|l| l.contains("stream-") && !l.contains("echo"))
            .count();
        assert!(
            stream_lines >= 5,
            "expected at least 5 streamed lines, got {stream_lines}"
        );
    }
}
