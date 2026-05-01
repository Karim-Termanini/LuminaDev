use serde_json::{json, Value};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::Mutex;
use uuid::Uuid;

struct TerminalSession {
  master: Arc<StdMutex<Box<dyn MasterPty + Send>>>,
  child: Arc<StdMutex<Box<dyn Child + Send + Sync>>>,
  writer: Arc<StdMutex<Box<dyn Write + Send>>>,
}

#[derive(Default)]
struct AppState {
  terminals: Mutex<HashMap<String, TerminalSession>>,
  jobs: Mutex<Vec<Value>>,
  // (rx_bytes, tx_bytes, instant) for net delta
  net_prev: Mutex<Option<(u64, u64, std::time::Instant)>>,
  // (read_kb, write_kb, instant) for disk I/O delta
  disk_prev: Mutex<Option<(u64, u64, std::time::Instant)>>,
  // (total_ticks, idle_ticks, instant) for CPU delta
  cpu_prev: Mutex<Option<(u64, u64, std::time::Instant)>>,
}

fn app_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("[STORE_PATH_ERROR] {}", e))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("[STORE_DIR_ERROR] {}", e))?;
  Ok(dir.join(name))
}

fn read_json(path: &PathBuf) -> Value {
  if !path.exists() {
    return json!({});
  }
  let content = std::fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
  serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
}

fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
  let content = serde_json::to_string_pretty(value).map_err(|e| format!("[STORE_ENCODE_ERROR] {}", e))?;
  std::fs::write(path, content).map_err(|e| format!("[STORE_WRITE_ERROR] {}", e))
}

/// Default wall-clock bound for host `exec_output` / `exec_result` (prevents hung IPC).
const CMD_TIMEOUT_DEFAULT: Duration = Duration::from_secs(180);
/// Short probe (sudo -n, quick shell checks, `ssh -T` smoke test).
const CMD_TIMEOUT_SHORT: Duration = Duration::from_secs(30);
/// Remote SSH ops (list dir, key install) — network-bound.
const CMD_TIMEOUT_SSH: Duration = Duration::from_secs(120);
/// `git clone`, `docker pull`, `docker compose` (in-profile dir), and similar long host work.
const CMD_TIMEOUT_LONG: Duration = Duration::from_secs(900);
/// Single `sudo bash -c` step during Docker engine install.
const CMD_TIMEOUT_INSTALL_STEP: Duration = Duration::from_secs(900);

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
  logs.push(format!("RUNNING (user shell, no sudo): {}", cmd));

  let mut child = Command::new("bash")
    .arg("-c")
    .arg(cmd)
    .env_remove("npm_config_prefix")
    .env_remove("NPM_CONFIG_PREFIX")
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
  let deadline = tokio::time::Instant::now() + CMD_TIMEOUT_INSTALL_STEP;

  loop {
    tokio::select! {
      res = out_reader.next_line() => {
        match res {
          Ok(Some(line)) => {
            if !line.trim().is_empty() {
              logs.push(format!("OUT: {}", line));
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
                  if total > 0 {
                    let explicit = (cur * step_weight) / total;
                    if explicit > bonus { bonus = explicit; last_explicit_bonus = explicit; }
                  }
                }
              } else {
                let heuristic = ((line_count * step_weight) / 60).min(step_weight.saturating_sub(2));
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
        match res {
          Ok(Some(line)) => {
            if !line.trim().is_empty() { logs.push(format!("ERR: {}", line)); }
          }
          _ => {}
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
      let tail = logs.iter().rev().find(|l| l.starts_with("ERR:") || l.starts_with("OUT:"))
        .map(|l| l.as_str()).unwrap_or("non-zero exit").to_string();
      Err(format!("[RUNTIME_INSTALL_FAILED] {}", tail.trim()))
    }
    Err(e) => Err(format!("[RUNTIME_INSTALL_FAILED] wait: {}", e)),
  }
}

async fn exec_output_limit(cmd: &str, args: &[&str], limit: Duration) -> Result<String, String> {
  let fut = async {
    let output = Command::new(cmd)
      .args(args)
      .output()
      .await
      .map_err(|e| format!("[EXEC_ERROR] {}", e))?;
    if output.status.success() {
      Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
      Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
  };
  match tokio::time::timeout(limit, fut).await {
    Ok(inner) => inner,
    Err(_) => Err(format!(
      "[HOST_COMMAND_TIMEOUT] {} {}",
      cmd,
      args.join(" ")
    )),
  }
}

async fn exec_output(cmd: &str, args: &[&str]) -> Result<String, String> {
  exec_output_limit(cmd, args, CMD_TIMEOUT_DEFAULT).await
}

async fn exec_result_limit(cmd: &str, args: &[&str], limit: Duration) -> Result<(String, String), String> {
  let fut = async {
    let output = Command::new(cmd)
      .args(args)
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
      "[HOST_COMMAND_TIMEOUT] {} {}",
      cmd,
      args.join(" ")
    )),
  }
}

async fn exec_result(cmd: &str, args: &[&str]) -> Result<(String, String), String> {
  exec_result_limit(cmd, args, CMD_TIMEOUT_DEFAULT).await
}

/// `docker compose` in a fixed directory (avoids `bash -lc "cd … && …"`).
async fn exec_docker_compose_in_dir(
  compose_dir: &Path,
  compose_subargs: &[&str],
  limit: Duration,
) -> Result<(String, String), String> {
  let fut = async {
    let output = Command::new("docker")
      .current_dir(compose_dir)
      .arg("compose")
      .args(compose_subargs)
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
      "[HOST_COMMAND_TIMEOUT] docker compose {}",
      compose_subargs.join(" ")
    )),
  }
}

async fn docker_nonempty_line_count(args: &[&str]) -> u64 {
  match exec_output_limit("docker", args, CMD_TIMEOUT_SHORT).await {
    Ok(out) => out.lines().filter(|l| !l.trim().is_empty()).count() as u64,
    Err(_) => 0,
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

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn parse_size_mb(raw: &str) -> u64 {
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

fn is_physical_disk_name(name: &str) -> bool {
  let is_sd = name.starts_with("sd") && name.len() == 3;
  let is_vd = name.starts_with("vd") && name.len() == 3;
  let is_xvd = name.starts_with("xvd") && name.len() == 4;
  let is_nvme = name.starts_with("nvme") && name.contains('n') && !name.contains('p');
  let is_mmc = name.starts_with("mmcblk") && !name.contains('p');
  is_sd || is_vd || is_xvd || is_nvme || is_mmc
}

fn ss_process_from_line(line: &str) -> String {
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

fn find_repo_root(start: &Path) -> PathBuf {
  let mut cur = start.to_path_buf();
  for _ in 0..8 {
    if cur.join("docker/compose").exists() {
      return cur;
    }
    if !cur.pop() {
      break;
    }
  }
  start.to_path_buf()
}

fn sanitize_docker_name(s: &str) -> String {
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

fn docker_install_build_steps(distro: &str, components: Option<&Vec<Value>>) -> Option<Vec<String>> {
  let comp: Vec<String> = components
    .map(|v| {
      v.iter()
        .filter_map(|x| x.as_str().map(std::string::ToString::to_string))
        .collect()
    })
    .unwrap_or_default();

  let mut steps: Vec<String> = match distro {
    "ubuntu" => vec![
      "apt-get update && apt-get install -y ca-certificates curl && install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc".into(),
      "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable\" | tee /etc/apt/sources.list.d/docker.list > /dev/null && apt-get update".into(),
      "apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin".into(),
      "systemctl enable --now docker && docker --version".into(),
    ],
    "fedora" => vec![
      "dnf -y install dnf-plugins-core && curl -fsSL https://download.docker.com/linux/fedora/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo".into(),
      "dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin".into(),
      "systemctl enable --now docker && docker --version".into(),
    ],
    "arch" => vec![
      "pacman -S --needed --noconfirm docker docker-compose".into(),
      "systemctl enable --now docker && docker --version".into(),
    ],
    _ => return None,
  };

  if !comp.is_empty() {
    if distro == "ubuntu" || distro == "fedora" {
      let pkg_cmd = if distro == "ubuntu" {
        "apt-get install -y"
      } else {
        "dnf install -y"
      };
      let mut packages: Vec<&'static str> = vec![];
      if comp.iter().any(|c| c == "docker") {
        packages.extend(["docker-ce", "docker-ce-cli", "containerd.io"]);
      }
      if comp.iter().any(|c| c == "compose") {
        packages.push("docker-compose-plugin");
      }
      if comp.iter().any(|c| c == "buildx") {
        packages.push("docker-buildx-plugin");
      }
      if !packages.is_empty() {
        let joined = packages.join(" ");
        steps = steps
          .into_iter()
          .map(|s| {
            if s.contains("apt-get install -y docker-ce") || s.contains("dnf install -y docker-ce") {
              format!("{pkg_cmd} {joined}")
            } else {
              s
            }
          })
          .collect();
      }
    } else if distro == "arch" {
      let mut packages: Vec<&'static str> = vec![];
      if comp.iter().any(|c| c == "docker") {
        packages.push("docker");
      }
      if comp.iter().any(|c| c == "compose") {
        packages.push("docker-compose");
      }
      if !packages.is_empty() {
        let joined = packages.join(" ");
        steps = steps
          .into_iter()
          .map(|s| {
            if s.contains("pacman -S") {
              format!("pacman -S --needed --noconfirm {joined}")
            } else {
              s
            }
          })
          .collect();
      }
    }
  }

  Some(steps)
}

async fn sudo_bash_install_step(cmd: &str, password: Option<&str>, logs: &mut Vec<String>, app: Option<tauri::AppHandle>, job_id: Option<String>, base_progress: u32, step_weight: u32) -> Result<(), String> {
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

  let mut child = match mode {
    SpawnMode::Pkexec => Command::new("pkexec")
      .args(["bash", "-c", cmd])
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| format!("[ELEVATED_CMD_FAILED] pkexec spawn: {}", e))?,
    SpawnMode::SudoPwless => Command::new("sudo")
      .args(["bash", "-c", cmd])
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| format!("[ELEVATED_CMD_FAILED] sudo spawn: {}", e))?,
    SpawnMode::SudoStdin(pw) => {
      let mut c = Command::new("sudo")
        .arg("-S")
        .arg("-p")
        .arg("")
        .arg("bash")
        .arg("-c")
        .arg(cmd)
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
                  if total > 0 {
                    let explicit = (cur * step_weight) / total;
                    if explicit > bonus { bonus = explicit; last_explicit_bonus = explicit; }
                  }
                }
              } else {
                // Line-count heuristic: each line nudges progress forward (capped below explicit)
                let heuristic = ((line_count * step_weight) / 60).min(step_weight.saturating_sub(2));
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
              logs.push(format!("ERR: {}", line));
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

async fn sudo_passwordless_ok() -> bool {
  exec_output_limit("sudo", &["-n", "true"], CMD_TIMEOUT_SHORT)
    .await
    .is_ok()
}

fn runtime_pkg_mgr(distro: &str) -> &'static str {
  match distro {
    "ubuntu" | "debian" | "linuxmint" | "pop" | "elementary" | "raspbian" => "apt",
    "fedora" | "rhel" | "centos" | "rocky" | "alma" | "amzn" => "dnf",
    "arch" | "manjaro" | "endeavouros" | "garuda" => "pacman",
    "opensuse" | "opensuse-leap" | "opensuse-tumbleweed" | "sles" => "zypper",
    _ => "apt",
  }
}

fn runtime_system_packages(runtime_id: &str, pkg_mgr: &str) -> Vec<&'static str> {
  match (runtime_id, pkg_mgr) {
    // Node
    ("node", "apt")    => vec!["nodejs", "npm"],
    ("node", "dnf")    => vec!["nodejs", "npm"],
    ("node", "pacman") => vec!["nodejs", "npm"],
    ("node", "zypper") => vec!["nodejs", "npm"],
    // Python
    ("python", "apt")    => vec!["python3", "python3-pip"],
    ("python", "dnf")    => vec!["python3", "python3-pip"],
    ("python", "pacman") => vec!["python", "python-pip"],
    ("python", "zypper") => vec!["python3", "python3-pip"],
    // Go
    ("go", "apt")    => vec!["golang"],
    ("go", "dnf")    => vec!["golang"],
    ("go", "pacman") => vec!["go"],
    ("go", "zypper") => vec!["go"],
    // Java
    ("java", "apt")    => vec!["default-jdk"],
    ("java", "dnf")    => vec!["java-latest-openjdk-devel"],
    ("java", "pacman") => vec!["jdk-openjdk"],
    ("java", "zypper") => vec!["java-21-openjdk-devel"],
    // PHP
    ("php", "apt")    => vec!["php", "php-cli", "php-common"],
    ("php", "dnf")    => vec!["php", "php-cli"],
    ("php", "pacman") => vec!["php"],
    ("php", "zypper") => vec!["php8", "php8-cli"],
    // Ruby
    ("ruby", "apt")    => vec!["ruby", "ruby-dev"],
    ("ruby", "dnf")    => vec!["ruby", "ruby-devel"],
    ("ruby", "pacman") => vec!["ruby"],
    ("ruby", "zypper") => vec!["ruby"],
    // .NET — pacman: dotnet-sdk is AUR-only, handled separately in install job
    ("dotnet", "apt")    => vec!["dotnet-sdk-8.0"],
    ("dotnet", "dnf")    => vec!["dotnet-sdk-8.0"],
    ("dotnet", "pacman") => vec![], // AUR — use Microsoft install script instead
    ("dotnet", "zypper") => vec!["dotnet-sdk-8.0"],
    // Zig
    ("zig", "apt")    => vec!["zig"],
    ("zig", "dnf")    => vec!["zig"],
    ("zig", "pacman") => vec!["zig"],
    ("zig", "zypper") => vec!["zig"],
    // C/C++ toolchain
    ("c_cpp", "apt")    => vec!["gcc", "g++", "make", "cmake", "gdb"],
    ("c_cpp", "dnf")    => vec!["gcc", "gcc-c++", "make", "cmake", "gdb"],
    ("c_cpp", "pacman") => vec!["gcc", "make", "cmake", "gdb"],
    ("c_cpp", "zypper") => vec!["gcc", "gcc-c++", "make", "cmake", "gdb"],
    // MATLAB-compatible (Octave)
    ("matlab", "apt")    => vec!["octave"],
    ("matlab", "dnf")    => vec!["octave"],
    ("matlab", "pacman") => vec!["octave"],
    ("matlab", "zypper") => vec!["octave"],
    // Julia
    ("julia", "apt")    => vec!["julia"],
    ("julia", "dnf")    => vec!["julia"],
    ("julia", "pacman") => vec!["julia"],
    ("julia", "zypper") => vec!["julia"],
    // Lua
    ("lua", "apt")    => vec!["lua5.4"],
    ("lua", "dnf")    => vec!["lua"],
    ("lua", "pacman") => vec!["lua"],
    ("lua", "zypper") => vec!["lua54"],
    // Lisp (SBCL)
    ("lisp", "apt")    => vec!["sbcl"],
    ("lisp", "dnf")    => vec!["sbcl"],
    ("lisp", "pacman") => vec!["sbcl"],
    ("lisp", "zypper") => vec!["sbcl"],
    // bun & dart & flutter: always via local installer — no reliable system package
    _ => vec![],
  }
}

fn runtime_java_major(requested_version: &str) -> Option<u32> {
  let token = lumina_first_version_token(requested_version)?;
  let digits: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
  if digits.is_empty() {
    None
  } else {
    digits.parse::<u32>().ok()
  }
}

fn runtime_java_system_packages_for_version(pkg_mgr: &str, requested_version: &str) -> Vec<String> {
  let major = runtime_java_major(requested_version).unwrap_or(21);
  match pkg_mgr {
    "dnf" => match major {
      8 => vec!["java-1.8.0-openjdk-devel".to_string()],
      11 => vec!["java-11-openjdk-devel".to_string()],
      17 => vec!["java-17-openjdk-devel".to_string()],
      21 => vec!["java-21-openjdk-devel".to_string()],
      _ => vec!["java-latest-openjdk-devel".to_string()],
    },
    "apt" => match major {
      8 => vec!["openjdk-8-jdk".to_string()],
      11 => vec!["openjdk-11-jdk".to_string()],
      17 => vec!["openjdk-17-jdk".to_string()],
      21 => vec!["openjdk-21-jdk".to_string()],
      _ => vec!["default-jdk".to_string()],
    },
    "pacman" => match major {
      8 => vec!["jdk8-openjdk".to_string()],
      11 => vec!["jdk11-openjdk".to_string()],
      17 => vec!["jdk17-openjdk".to_string()],
      21 => vec!["jdk21-openjdk".to_string()],
      _ => vec!["jdk-openjdk".to_string()],
    },
    "zypper" => match major {
      8 => vec!["java-1_8_0-openjdk-devel".to_string()],
      11 => vec!["java-11-openjdk-devel".to_string()],
      17 => vec!["java-17-openjdk-devel".to_string()],
      21 => vec!["java-21-openjdk-devel".to_string()],
      _ => vec!["java-21-openjdk-devel".to_string()],
    },
    _ => vec!["default-jdk".to_string()],
  }
}

async fn runtime_dnf_package_available(pkg: &str) -> bool {
  let cmd = format!("dnf -q list --available '{}' >/dev/null 2>&1", pkg);
  exec_result_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT).await.is_ok()
}

async fn runtime_system_package_available(pkg_mgr: &str, pkg: &str) -> bool {
  let cmd = match pkg_mgr {
    "dnf" => format!("dnf -q list --available '{}' >/dev/null 2>&1", pkg),
    "apt" => format!("apt-cache show '{}' >/dev/null 2>&1", pkg),
    "pacman" => format!("pacman -Si '{}' >/dev/null 2>&1", pkg),
    "zypper" => format!("zypper -n info '{}' >/dev/null 2>&1", pkg),
    _ => return false,
  };
  exec_result_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT).await.is_ok()
}

async fn runtime_system_package_installed(pkg_mgr: &str, pkg: &str) -> bool {
  let cmd = match pkg_mgr {
    "dnf" | "zypper" => format!("rpm -q '{}' >/dev/null 2>&1", pkg),
    "apt" => format!("dpkg -s '{}' >/dev/null 2>&1", pkg),
    "pacman" => format!("pacman -Qi '{}' >/dev/null 2>&1", pkg),
    _ => return false,
  };
  exec_result_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT).await.is_ok()
}

fn pkg_upgrade_cmd(pkg_mgr: &str, packages: &[&str]) -> String {
  let pkgs = packages.join(" ");
  match pkg_mgr {
    "apt" => format!("DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y {}", pkgs),
    "dnf" => format!("dnf upgrade -y {}", pkgs),
    "pacman" => format!("pacman -Syu --noconfirm {}", pkgs),
    "zypper" => format!("zypper update -y {}", pkgs),
    _ => format!("apt-get install --only-upgrade -y {}", pkgs),
  }
}

/// First whitespace-delimited token (e.g. "v22.0.0 (LTS: Foo)" → "v22.0.0").
fn lumina_first_version_token(raw: &str) -> Option<String> {
  let t = raw.trim();
  if t.is_empty() || t.eq_ignore_ascii_case("latest") || t.eq_ignore_ascii_case("stable") || t.starts_with("system ") {
    return None;
  }
  Some(t.split_whitespace().next().unwrap_or(t).trim().trim_start_matches("go").to_string())
}

/// Channel string for Microsoft `dotnet-install.sh` (`8.0`, `9.0`, …).
fn lumina_dotnet_install_channel(version: &str) -> String {
  let raw = version.trim();
  if raw.is_empty() || raw.starts_with("system") {
    return "8.0".into();
  }
  let tok = lumina_first_version_token(raw).unwrap_or_else(|| raw.to_string());
  let s: String = tok
    .chars()
    .take_while(|c| c.is_ascii_digit() || *c == '.')
    .collect();
  let s = s.trim_matches('.').trim();
  if s.is_empty() {
    "8.0".into()
  } else {
    s.to_string()
  }
}

/// Best-effort list of distro package versions (Fedora/RHEL `dnf` only).
async fn runtime_dnf_repoquery_versions(package: &str, limit: usize) -> Vec<String> {
  let safe_pkg = package.replace('\'', "'\\''");
  let cmd = format!(
    "command -v dnf >/dev/null 2>&1 && dnf -q repoquery '{}' --qf '%{{version}}\\n' 2>/dev/null | sort -Vu | tail -n {}",
    safe_pkg, limit
  );
  exec_output_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT)
    .await
    .unwrap_or_default()
    .lines()
    .map(|l| l.trim().to_string())
    .filter(|l| !l.is_empty())
    .collect()
}

/// Compare a UI-selected version token against a one-line tool probe.
/// Handles common cases where the distro/tool prints extra pre-release metadata
/// (e.g. requested `0.13.0` vs installed `0.13.0-dev...`) without treating it as a mismatch.
fn lumina_version_token_matches_probe_line(requested_token: &str, probe_line: &str) -> bool {
  let token = requested_token.trim();
  if token.is_empty() {
    return true;
  }
  let hay = probe_line.trim();
  if hay.contains(token) {
    return true;
  }
  let token_core = token
    .split(|c| c == '-' || c == '+')
    .next()
    .unwrap_or(token)
    .trim();
  if token_core.is_empty() {
    return true;
  }
  let probe_core = hay
    .split(|c: char| c.is_whitespace() || c == '(')
    .next()
    .unwrap_or(hay)
    .trim()
    .trim_start_matches('v')
    .split(|c| c == '-' || c == '+')
    .next()
    .unwrap_or(hay)
    .trim();
  probe_core == token_core || hay.contains(token_core)
}

/// rustup toolchain channels where `rustc --version` will not contain the word "nightly"/"beta"/"stable".
fn lumina_rust_channel_token(raw: &str) -> Option<String> {
  let t = lumina_first_version_token(raw)?.to_lowercase();
  match t.as_str() {
    "nightly" | "beta" | "stable" => Some(t),
    _ => None,
  }
}

/// Dart SDK zip/deb: `stable`, `beta/3.5.0`, `dev` → (channel, release segment for archive URL).
fn lumina_dart_channel_release(version: &str) -> (&'static str, String) {
  let v = version.trim();
  if let Some((left, right)) = v.split_once('/') {
    let ch = match left.trim().to_lowercase().as_str() {
      "dev" => "dev",
      "beta" => "beta",
      "stable" => "stable",
      _ => "stable",
    };
    let rel = lumina_dart_release_segment(right);
    return (ch, rel);
  }
  let tl = v.to_lowercase();
  let ch = match tl.as_str() {
    "dev" => "dev",
    "beta" => "beta",
    _ => "stable",
  };
  (ch, lumina_dart_release_segment(v))
}

fn lumina_dart_release_segment(raw: &str) -> String {
  if let Some(tok) = lumina_first_version_token(raw) {
    let t = tok.trim().trim_start_matches('v');
    if !t.is_empty() && t.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
      return t.to_string();
    }
  }
  let s = raw.trim().trim_start_matches('v');
  if !s.is_empty() && s.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
    return s.to_string();
  }
  "latest".into()
}

fn lumina_home_dir() -> Result<PathBuf, String> {
  std::env::var_os("HOME")
    .map(PathBuf::from)
    .filter(|p| !p.as_os_str().is_empty())
    .ok_or_else(|| "[RUNTIME_SET_ACTIVE_FAILED] Missing $HOME.".to_string())
}

fn lumina_path_must_be_under_home(home: &Path, path: &Path) -> Result<PathBuf, String> {
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
fn lumina_replace_symlink(link: &Path, target: &Path) -> Result<(), String> {
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
  std::os::unix::fs::symlink(target, link)
    .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] Could not symlink {} -> {}: {}", link.display(), target.display(), e))
}

#[cfg(not(unix))]
fn lumina_replace_symlink(_link: &Path, _target: &Path) -> Result<(), String> {
  Err("[RUNTIME_SET_ACTIVE_FAILED] Unsupported platform.".to_string())
}

/// After runtime_install succeeds, probe `bash -lc` for the toolchain.
async fn runtime_append_verify(runtime_id: &str, method: &str, requested_version: &str, logs: &mut Vec<String>) {
  logs.push(format!(
    "VERIFY: login shell check requested_version={:?} install_method={} …",
    requested_version.trim(),
    method
  ));
  let probe = match runtime_id {
    "node" => "([ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\" && node --version 2>&1) || (command -v node >/dev/null 2>&1 && node --version 2>&1) || echo MISSING",
    "python" => "([ -d \"$HOME/.pyenv\" ] && export PYENV_ROOT=\"$HOME/.pyenv\" && export PATH=\"$PYENV_ROOT/bin:$PATH\" && eval \"$(pyenv init -)\" && python3 --version 2>&1) || (command -v python3 >/dev/null 2>&1 && python3 --version 2>&1) || echo MISSING",
    "go" => "([ -x \"$HOME/.local/share/lumina/go/current/bin/go\" ] && \"$HOME/.local/share/lumina/go/current/bin/go\" version 2>&1) || ([ -x \"$HOME/.local/share/lumina/go/bin/go\" ] && \"$HOME/.local/share/lumina/go/bin/go\" version 2>&1) || (command -v go >/dev/null 2>&1 && go version 2>&1) || echo MISSING",
    "rust" => "unset RUSTUP_TOOLCHAIN; ([ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" show active-toolchain 2>&1 | head -1) || ([ -x \"$HOME/.cargo/bin/rustc\" ] && \"$HOME/.cargo/bin/rustc\" --version 2>&1) || (command -v rustc >/dev/null 2>&1 && rustc --version 2>&1) || echo MISSING",
    "java" if method == "local" => "([ -x \"$HOME/.local/share/lumina/java/current/bin/java\" ] && \"$HOME/.local/share/lumina/java/current/bin/java\" -version 2>&1 | head -1) || echo MISSING",
    "java" => "command -v java >/dev/null 2>&1 && java -version 2>&1 | head -1 || echo MISSING",
    "php" if method == "local" => "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); (command -v php >/dev/null 2>&1 && php --version 2>&1 | head -1) || echo MISSING",
    "php" => "command -v php >/dev/null 2>&1 && php --version 2>&1 | head -1 || echo MISSING",
    "ruby" if method == "local" => "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); (command -v ruby >/dev/null 2>&1 && ruby --version 2>&1) || echo MISSING",
    "ruby" => "command -v ruby >/dev/null 2>&1 && ruby --version 2>&1 || echo MISSING",
    "dotnet" => "([ -x \"$HOME/.dotnet/dotnet\" ] && \"$HOME/.dotnet/dotnet\" --version 2>&1) || (command -v dotnet >/dev/null 2>&1 && dotnet --version 2>&1) || echo MISSING",
    "bun" => "([ -x \"$HOME/.bun/bin/bun\" ] && \"$HOME/.bun/bin/bun\" --version 2>&1) || (command -v bun >/dev/null 2>&1 && bun --version 2>&1) || echo MISSING",
    "zig" if method == "local" => "([ -x \"$HOME/.local/share/lumina/zig/current/zig\" ] && \"$HOME/.local/share/lumina/zig/current/zig\" version 2>&1) || (command -v zig >/dev/null 2>&1 && zig version 2>&1) || echo MISSING",
    "zig" => "command -v zig >/dev/null 2>&1 && zig version 2>&1 || echo MISSING",
    "c_cpp" => "command -v gcc >/dev/null 2>&1 && gcc --version 2>&1 | head -1 || echo MISSING",
    "matlab" => "command -v octave >/dev/null 2>&1 && octave --version 2>&1 | head -1 || echo MISSING",
    "dart" => "([ -x \"$HOME/.dart/dart-sdk/bin/dart\" ] && \"$HOME/.dart/dart-sdk/bin/dart\" --version 2>&1 | head -1) || (command -v dart >/dev/null 2>&1 && dart --version 2>&1 | head -1) || echo MISSING",
    "flutter" => "([ -x \"$HOME/.flutter-sdk/bin/flutter\" ] && \"$HOME/.flutter-sdk/bin/flutter\" --version 2>&1 | head -1) || (command -v flutter >/dev/null 2>&1 && flutter --version 2>&1 | head -1) || echo MISSING",
    "julia" => "export PATH=\"$HOME/.juliaup/bin:$PATH\"; ([ -x \"$HOME/.juliaup/bin/julia\" ] && \"$HOME/.juliaup/bin/julia\" --startup-file=no --version 2>&1) || (command -v julia >/dev/null 2>&1 && julia --startup-file=no --version 2>&1) || echo MISSING",
    "lua" if method == "local" => "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); ((command -v lua5.4 >/dev/null 2>&1 && lua5.4 -v 2>&1) || (command -v lua >/dev/null 2>&1 && lua -v 2>&1)) || echo MISSING",
    "lua" => "(command -v lua5.4 >/dev/null 2>&1 && lua5.4 -v 2>&1) || (command -v lua >/dev/null 2>&1 && lua -v 2>&1) || echo MISSING",
    "lisp" => "command -v sbcl >/dev/null 2>&1 && sbcl --version 2>&1 || echo MISSING",
    _ => {
      logs.push(format!("VERIFY: skipped (unknown runtime '{}')", runtime_id));
      return;
    }
  };
  match exec_result_limit("bash", &["-lc", probe], CMD_TIMEOUT_SHORT).await {
    Ok((stdout, stderr)) => {
      let line = format!("{}{}", stdout, stderr)
        .lines()
        .find(|l| !l.trim().is_empty())
        .map(|x| x.trim().to_string())
        .unwrap_or_default();
      if line.contains("MISSING") || line.is_empty() {
        logs.push(format!("VERIFY FAIL: {} not found on PATH after install.", runtime_id));
      } else {
        let mut ver_token = lumina_first_version_token(requested_version).unwrap_or_default();
        if runtime_id == "dart" {
          if let Some((_, rhs)) = requested_version.trim().split_once('/') {
            let r = rhs.trim();
            if !r.is_empty() {
              if let Some(t) = lumina_first_version_token(r) {
                ver_token = t;
              } else if r.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                ver_token = r.trim_start_matches('v').to_string();
              }
            }
          }
        }
        let mut is_match = true;
        if !ver_token.is_empty() && method != "system" {
          if runtime_id == "rust" {
            if let Some(ch) = lumina_rust_channel_token(requested_version) {
              is_match = line.to_lowercase().contains(&ch);
            } else if !lumina_version_token_matches_probe_line(&ver_token, &line) {
              is_match = false;
            }
          } else if !lumina_version_token_matches_probe_line(&ver_token, &line) {
            is_match = false;
          }
        }

        if !is_match {
          logs.push(format!("VERIFY WARNING: version mismatch! Got {:?}, expected token {:?}. Ensure your shell is fresh or check if another version is overriding this one.", line, ver_token));
        } else {
          logs.push(format!("VERIFY OK: {}", line));
          logs.push("Smoke test passed".to_string());
        }
      }
    }
    Err(e) => logs.push(format!("VERIFY FAIL: {}", e.trim())),
  }
}

fn pkg_remove_cmd(pkg_mgr: &str, packages: &[&str]) -> String {
  let pkgs = packages.join(" ");
  match pkg_mgr {
    "apt" => format!("apt-get remove -y {}", pkgs),
    "dnf" => format!("dnf remove -y {}", pkgs),
    "pacman" => format!("pacman -R --noconfirm {}", pkgs),
    "zypper" => format!("zypper remove -y {}", pkgs),
    _ => format!("apt-get remove -y {}", pkgs),
  }
}

async fn runtime_job_execute(
  app: AppHandle,
  job_id: String,
  kind: String,
  runtime_id: String,
  method: String,
  version: String,
  _remove_mode: String,
  sudo_password: String,
) {
  let mut logs: Vec<String> = vec![format!("job={} runtime={} method={}", kind, runtime_id, method)];
  let password_opt: Option<&str> = if sudo_password.is_empty() { None } else { Some(&sudo_password) };
  let mut final_state = "completed";
  let effective_verify_method = method.clone();

  let distro = exec_output("bash", &["-lc", "source /etc/os-release 2>/dev/null && printf '%s' \"${ID:-unknown}\""])
    .await
    .unwrap_or_else(|_| "unknown".to_string());
  let distro = distro.trim().to_string();
  let pkg_mgr = runtime_pkg_mgr(&distro);
  logs.push(format!("distro={} pkg_mgr={}", distro, pkg_mgr));

  // Flatpak guard for privileged operations
  let in_flatpak = std::env::var("FLATPAK_ID").is_ok();
  if in_flatpak && kind != "runtime_uninstall" && runtime_id != "rust" {
    logs.push("[RUNTIME_INSTALL_FAILED] Flatpak sandbox: cannot run host package managers. Install the runtime on the host and expose it via Flatpak overrides.".to_string());
    final_state = "failed";
  } else {
    {
      let st = app.state::<AppState>();
      let mut jobs = st.jobs.lock().await;
      if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str())) {
        j["progress"] = json!(30);
      }
    }
    let result: Result<(), String> = match kind.as_str() {
      "runtime_install" | "install_deps" => {
        if runtime_id == "rust" {
          let tc_raw = version.trim();
          let tc = if tc_raw.is_empty() { "stable" } else { tc_raw };
          let safe_tc = tc.replace('\'', "'\\''").replace('"', "");
          // Re-assert default toolchain: rustup self-update / prior installs can leave a non-matching default.
          let cmd = format!(
            r#"set -e
               curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain '{safe_tc}'
               export PATH="$HOME/.cargo/bin:$PATH"
               if command -v rustup >/dev/null 2>&1; then
                 rustup default '{safe_tc}'
               fi"#,
            safe_tc = safe_tc
          );
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "node" && method == "local" {
          let v = lumina_first_version_token(&version).unwrap_or_else(|| "lts/*".into());
          // nvm refuses to operate when ~/.npmrc pins npm prefix/globalconfig; strip those keys (with backup).
          let cmd = format!(
            r#"set -e
               NPMRC="$HOME/.npmrc"
               if [ -f "$NPMRC" ] && grep -qE '^[[:space:]]*(prefix|globalconfig)[[:space:]]*=' "$NPMRC" 2>/dev/null; then
                 TS="$(date +%s)"
                 cp -p "$NPMRC" "$NPMRC.lumina-nvm-backup-$TS"
                 sed -i '/^[[:space:]]*prefix[[:space:]]*=/d;/^[[:space:]]*globalconfig[[:space:]]*=/d' "$NPMRC"
                 echo "NOTE: Removed incompatible prefix/globalconfig entries from ~/.npmrc (backup: $NPMRC.lumina-nvm-backup-$TS)." >&2
               fi
               curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
               export NVM_DIR="$HOME/.nvm"
               [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
               unset npm_config_prefix NPM_CONFIG_PREFIX npm_CONFIG_PREFIX
               export NPM_CONFIG_USERCONFIG=/dev/null
               nvm install {v}
               nvm use --delete-prefix {v}"#,
            v = v
          );
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "go" && method == "local" {
          let v = lumina_first_version_token(&version).unwrap_or_else(|| "1.22.2".into());
          let cmd = format!(
            "set -e \
             && GO_BASE=\"$HOME/.local/share/lumina/go\" \
             && GO_VER_DIR=\"$GO_BASE/{v}\" \
             && mkdir -p \"$GO_BASE\" \
             && if [ ! -x \"$GO_VER_DIR/bin/go\" ]; then \
                  curl -L -o \"/tmp/lumina-go-{v}.tar.gz\" \"https://go.dev/dl/go{v}.linux-amd64.tar.gz\"; \
                  rm -rf \"$GO_VER_DIR\"; \
                  mkdir -p \"$GO_VER_DIR\"; \
                  tar -xzf \"/tmp/lumina-go-{v}.tar.gz\" -C \"$GO_VER_DIR\" --strip-components=1; \
                  rm -f \"/tmp/lumina-go-{v}.tar.gz\"; \
                fi \
             && ln -sfn \"$GO_VER_DIR\" \"$GO_BASE/current\" \
             && grep -q lumina-go \"$HOME/.bashrc\" \
             || echo 'export PATH=\"$HOME/.local/share/lumina/go/current/bin:$PATH\"  # lumina-go' >> \"$HOME/.bashrc\"",
            v = v
          );
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "zig" && method == "local" {
          let mut v = lumina_first_version_token(&version).unwrap_or_else(|| "0.13.0".into());
          v = v.trim().trim_start_matches('v').trim().to_string();
          if v.is_empty() {
            v = "0.13.0".into();
          }
          let cmd = format!(
            "set -e \
             && ZIG_BASE=\"$HOME/.local/share/lumina/zig\" \
             && ZIG_VER_DIR=\"$ZIG_BASE/{v}\" \
             && mkdir -p \"$ZIG_BASE\" \
             && ARCH_RAW=\"$(uname -m 2>/dev/null || echo x86_64)\" \
             && case \"$ARCH_RAW\" in aarch64|arm64) ZIG_ARCH=\"aarch64\" ;; *) ZIG_ARCH=\"x86_64\" ;; esac \
             && if [ ! -x \"$ZIG_VER_DIR/zig\" ]; then \
                  TMP=\"/tmp/lumina-zig-{v}-$ZIG_ARCH.tar.xz\"; \
                  curl -fsSL \"https://ziglang.org/download/{v}/zig-linux-$ZIG_ARCH-{v}.tar.xz\" -o \"$TMP\"; \
                  rm -rf \"$ZIG_VER_DIR\"; \
                  mkdir -p \"$ZIG_VER_DIR\"; \
                  tar -xf \"$TMP\" -C \"$ZIG_VER_DIR\" --strip-components=1; \
                  rm -f \"$TMP\"; \
                fi \
             && ln -sfn \"$ZIG_VER_DIR\" \"$ZIG_BASE/current\" \
             && grep -q lumina-zig \"$HOME/.bashrc\" \
             || echo 'export PATH=\"$HOME/.local/share/lumina/zig/current:$PATH\"  # lumina-zig' >> \"$HOME/.bashrc\"",
            v = v
          );
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "python" && method == "local" {
          if pkg_mgr == "dnf" {
            if let Some(pw) = password_opt.filter(|p| !p.is_empty()) {
              logs.push(
                "Installing Fedora build dependencies for pyenv (gcc, openssl headers, …) — one-time.".into(),
              );
              let dep_cmd = "dnf install -y @development-tools gcc zlib-devel bzip2-devel readline-devel sqlite-devel openssl-devel tk-devel gdbm-devel libffi-devel xz-devel libuuid-devel";
              let _ = sudo_bash_install_step(dep_cmd, Some(pw), &mut logs, Some(app.clone()), Some(job_id.clone()), 5, 25).await;
            } else {
              logs.push(
                "NOTE: pyenv builds CPython from source on Fedora. If install fails, add your sudo password in the wizard and retry, or run: sudo dnf install @development-tools openssl-devel …".into(),
              );
            }
          }
          let v = lumina_first_version_token(&version).unwrap_or_else(|| "3.12.2".into());
          let cmd = format!(
            "if [ ! -d \"$HOME/.pyenv\" ]; then curl https://pyenv.run | bash; fi \
             && export PYENV_ROOT=\"$HOME/.pyenv\" \
             && [[ -d $PYENV_ROOT/bin ]] && export PATH=\"$PYENV_ROOT/bin:$PATH\" \
             && eval \"$(pyenv init -)\" \
             && (pyenv versions --bare | grep -qx '{v}' || pyenv install {v}) \
             && pyenv global {v}",
            v = v
          );
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "java" {
          if method.trim() == "local" {
            let major = runtime_java_major(&version).unwrap_or(21);
            logs.push(format!("Installing Java {} locally via Adoptium…", major));
            let cmd = format!(
              r#"set -e
                 LUMINA_JAVA_DIR="$HOME/.local/share/lumina/java"
                 mkdir -p "$LUMINA_JAVA_DIR"
                 TMP_JAVA="/tmp/lumina-java-{major}.tar.gz"
                 curl -fsSL "https://api.adoptium.net/v3/binary/latest/{major}/ga/linux/x64/jdk/hotspot/normal/eclipse" -o "$TMP_JAVA"
                 TMP_EXTRACT="$LUMINA_JAVA_DIR/.tmp-jdk-{major}-$$"
                 rm -rf "$TMP_EXTRACT"
                 mkdir -p "$TMP_EXTRACT"
                 tar -xzf "$TMP_JAVA" -C "$TMP_EXTRACT" --strip-components=1
                 rm -f "$TMP_JAVA"
                 DETECTED_VER=$("$TMP_EXTRACT/bin/java" -version 2>&1 | awk -F\" '/version/ {{print $2; exit}}')
                 [ -n "$DETECTED_VER" ] || DETECTED_VER="{major}"
                 SAFE_VER=$(printf '%s' "$DETECTED_VER" | tr '/ ' '__')
                 TARGET_DIR="$LUMINA_JAVA_DIR/jdk-$SAFE_VER"
                 if [ ! -d "$TARGET_DIR" ]; then mv "$TMP_EXTRACT" "$TARGET_DIR"; else rm -rf "$TMP_EXTRACT"; fi
                 ln -s "$TARGET_DIR" "$LUMINA_JAVA_DIR/current"
                 for f in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
                   if [ -f "$f" ] && ! grep -q 'lumina-java' "$f"; then
                     printf '\n# lumina-java\nexport JAVA_HOME="$HOME/.local/share/lumina/java/current"\nexport PATH="$JAVA_HOME/bin:$PATH"\n' >> "$f"
                   fi
                 done
                 [ -x "$LUMINA_JAVA_DIR/current/bin/java" ]
                 "$LUMINA_JAVA_DIR/current/bin/java" -version 2>&1 | head -1"#,
              major = major
            );
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          } else {
            if pkg_mgr == "dnf" && runtime_java_major(&version) == Some(8) {
              Err("[RUNTIME_INSTALL_FAILED] Fedora repositories on this host do not provide java-1.8.0-openjdk-devel. Use Isolated Script (Local) for Java 8.".to_string())
            } else {
              let pkgs = runtime_java_system_packages_for_version(pkg_mgr, &version);
              if pkgs.is_empty() {
                logs.push(format!("No Java packages known for '{}' on {}.", version, distro));
                Ok(())
              } else {
                let pkg = pkgs[0].clone();
                if pkg_mgr == "dnf" && !runtime_dnf_package_available(&pkg).await {
                  let maj = runtime_java_major(&version).unwrap_or(21);
                  Err(format!(
                    "[RUNTIME_INSTALL_FAILED] Requested Java {} is not available in Fedora repositories on this machine (missing package: {}). Use Isolated Script (Local) for exact version installs.",
                    maj, pkg
                  ))
                } else if runtime_system_package_installed(pkg_mgr, &pkg).await {
                  logs.push(format!("NOTE: Java package {} is already installed; nothing to do.", pkg));
                  Ok(())
                } else {
                  let cmd = match pkg_mgr {
                    "apt" => format!("DEBIAN_FRONTEND=noninteractive apt-get install -y {}", pkg),
                    "dnf" => format!("dnf install -y {}", pkg),
                    "pacman" => format!("pacman -S --needed --noconfirm {}", pkg),
                    "zypper" => format!("zypper install -y {}", pkg),
                    _ => format!("apt-get install -y {}", pkg),
                  };
                  logs.push(format!("Installing Java package: {}…", pkg));
                  let step_res = sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 75).await;
                  if let Err(e) = step_res {
                    Err(format!("[RUNTIME_INSTALL_FAILED] Failed to install {}: {}", pkg, e))
                  } else {
                  if pkg_mgr == "dnf" {
                      let alt_cmd = format!(
                        "JAVA_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/java$/'\"'\"'{{print; exit}}'\"'\"') ; \
                         JAVAC_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/javac$/'\"'\"'{{print; exit}}'\"'\"') ; \
                         [ -n \"$JAVA_BIN\" ] && alternatives --set java \"$JAVA_BIN\" || true ; \
                         [ -n \"$JAVAC_BIN\" ] && alternatives --set javac \"$JAVAC_BIN\" || true",
                        pkg = pkg
                      );
                    let _ = sudo_bash_install_step(&alt_cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 85, 10).await;
                    }
                    Ok(())
                  }
                }
              }
            }
          }
        } else if runtime_id == "dotnet" && (method.trim() == "local" || pkg_mgr == "pacman") {
          // User-space SDK install (works on Fedora too; avoids pinning via distro metapackages).
          let ch = lumina_dotnet_install_channel(&version);
          logs.push(format!(
            "Installing .NET channel {} via Microsoft dotnet-install.sh (user ~/.dotnet)…",
            ch
          ));
          let cmd = format!(
            "set -e \
             && curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel {ch} --install-dir \"$HOME/.dotnet\" \
             && grep -q 'Microsoft .NET' \"$HOME/.bashrc\" 2>/dev/null || grep -q dotnet-install \"$HOME/.bashrc\" 2>/dev/null \
             || echo 'export PATH=\"$HOME/.dotnet:$HOME/.dotnet/tools:$PATH\"  # Microsoft .NET (lumina)' >> \"$HOME/.bashrc\"",
            ch = ch
          );
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "bun" {
          let ver = lumina_first_version_token(&version).unwrap_or_default();
          let ver = ver.trim().trim_start_matches('v').to_string();
          if ver.is_empty() {
            logs.push("Installing Bun via official installer (latest)…".into());
            runtime_bash_user_step("curl -fsSL https://bun.sh/install | bash", &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65)
              .await
              .map_err(|e| format!("{}", e))
          } else {
            logs.push(format!("Installing Bun {} via official installer…", ver));
            let cmd = format!(
              "curl -fsSL https://bun.sh/install | bash -s \"bun-v{}\"",
              ver.replace('"', "").replace('\'', "")
            );
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          }
        } else if runtime_id == "dart" {
          let (channel, release) = lumina_dart_channel_release(&version);
          logs.push(format!(
            "Installing Dart SDK (channel={}, release={})…",
            channel, release
          ));
          if pkg_mgr == "apt" {
            let cmd = format!(
              "curl -fsSL https://dl-ssl.google.com/linux/linux_signing_key.pub \
                 | gpg --dearmor -o /usr/share/keyrings/dart.gpg 2>/dev/null && \
               echo 'deb [signed-by=/usr/share/keyrings/dart.gpg] \
                 https://storage.googleapis.com/download.dartlang.org/linux/debian {channel} main' \
                 > /etc/apt/sources.list.d/dart_{channel}.list && \
               apt-get update -qq && apt-get install -y dart",
              channel = channel
            );
            sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 20, 70).await
              .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e))
          } else {
            let rel_safe = release.replace('\'', "'\\''");
            let cmd = format!(
              r#"set -e
                 ARCH_RAW="$(uname -m 2>/dev/null || echo x86_64)"
                 case "$ARCH_RAW" in aarch64|arm64) DARCH="arm64" ;; *) DARCH="x64" ;; esac
                 curl -fsSL "https://storage.googleapis.com/dart-archive/channels/{channel}/release/{rel}/sdk/dartsdk-linux-$DARCH-release.zip" -o /tmp/dart-sdk.zip
                 mkdir -p "$HOME/.dart"
                 unzip -q -o /tmp/dart-sdk.zip -d "$HOME/.dart"
                 rm /tmp/dart-sdk.zip
                 grep -q 'dart-sdk' "$HOME/.bashrc" || echo 'export PATH="$HOME/.dart/dart-sdk/bin:$PATH"' >> "$HOME/.bashrc""#,
              channel = channel,
              rel = rel_safe
            );
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          }
        } else if runtime_id == "flutter" {
          let has_snap = exec_output_limit("which", &["snap"], CMD_TIMEOUT_SHORT).await.is_ok();
          if has_snap {
            logs.push("Installing Flutter via snap…".into());
            sudo_bash_install_step("snap install flutter --classic", password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
              .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e))
          } else {
            let flutter_ch = match version.trim().to_lowercase().as_str() {
              "beta" => "beta",
              "master" => "master",
              _ => "stable",
            };
            logs.push(format!(
              "snap not found — downloading Flutter SDK ({}) tarball into ~/.flutter-sdk…",
              flutter_ch
            ));
            let cmd = format!(
              r#"
              FLUTTER_JSON=$(curl -fsSL https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json 2>/dev/null)
              FLUTTER_ARCHIVE=$(echo "$FLUTTER_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(r['archive'] for r in d['releases'] if r['channel']=='{ch}'))" 2>/dev/null)
              if [ -z "$FLUTTER_ARCHIVE" ]; then
                echo "Could not resolve latest Flutter release URL" >&2; exit 1
              fi
              curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/$FLUTTER_ARCHIVE" -o /tmp/flutter.tar.xz
              mkdir -p "$HOME/.flutter-sdk"
              tar xf /tmp/flutter.tar.xz -C "$HOME/.flutter-sdk" --strip-components=1
              rm /tmp/flutter.tar.xz
              grep -q 'flutter-sdk' "$HOME/.bashrc" || echo 'export PATH="$HOME/.flutter-sdk/bin:$PATH"' >> "$HOME/.bashrc"
            "#,
              ch = flutter_ch
            );
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          }
        } else if (runtime_id == "php" || runtime_id == "ruby" || runtime_id == "lua") && method == "local" {
          if runtime_id == "php" {
            // PHP source compilation is too slow and fragile on non-Debian systems.
            // Always install via system package manager regardless of "local" track selection.
            logs.push("Installing PHP via system package manager (source compile not supported)…".into());
            let cmd = r#"
if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y php-cli php-common php-mbstring php-xml php-json php-curl php-zip 2>&1
elif command -v apt-get >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y php-cli php-common php-mbstring php-xml php-curl php-zip 2>&1
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm php 2>&1
else
  echo "[RUNTIME_INSTALL_FAILED] No supported package manager found" >&2; exit 1
fi"#;
            sudo_bash_install_step(cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
              .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e))
          } else {
          let ver_guess = lumina_first_version_token(&version)
            .unwrap_or_else(|| version.trim().to_string())
            .trim()
            .trim_start_matches('v')
            .to_string();
          if ver_guess.is_empty() {
            Err(
              "[RUNTIME_INSTALL_FAILED] Pick a concrete version for isolated install (examples: Ruby 3.3.5, Lua 5.4)."
                .to_string(),
            )
          } else {
            let spec = if ver_guess.contains('@') {
              ver_guess.clone()
            } else {
              format!("{}@{}", runtime_id, ver_guess)
            };
            let safe_spec = spec.replace('\'', "'\\''").replace('"', "");
            logs.push(format!(
              "Installing {} via mise (https://mise.jdx.dev) — downloads prebuilt binaries when available…",
              spec
            ));
            let build_deps_cmd = if runtime_id == "lua" {
              r#"
              if command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y readline-devel 2>/dev/null || true
              elif command -v apt-get >/dev/null 2>&1; then
                sudo apt-get install -y libreadline-dev 2>/dev/null || true
              elif command -v pacman >/dev/null 2>&1; then
                sudo pacman -S --needed --noconfirm readline 2>/dev/null || true
              fi"#
            } else {
              ""
            };
            if !build_deps_cmd.is_empty() {
              logs.push(format!("Pre-installing build dependencies for {}…", runtime_id));
              let _ = sudo_bash_install_step(build_deps_cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 5, 20).await;
            }
            let cmd = format!(
              r#"set -e
                 export PATH="$HOME/.local/bin:$PATH"
                 if [ ! -x "$HOME/.local/bin/mise" ]; then
                   curl -fsSL https://mise.run | sh
                 fi
                 export PATH="$HOME/.local/bin:$PATH"
                 "$HOME/.local/bin/mise" install '{spec}'
                 "$HOME/.local/bin/mise" use -g '{spec}'
                 if ! grep -q 'mise activate' "$HOME/.bashrc" 2>/dev/null; then
                   echo 'eval "$($HOME/.local/bin/mise activate bash)"' >> "$HOME/.bashrc"
                 fi"#,
              spec = safe_spec
            );
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          }
          }
        } else if runtime_id == "julia" {
          let want = lumina_first_version_token(&version).unwrap_or_default();
          let want = want.trim().to_string();
          logs.push("Installing Julia via juliaup…".into());
          let cmd = if want.is_empty() {
            r#"set -e
               export PATH="$HOME/.juliaup/bin:$PATH"
               if ! command -v juliaup >/dev/null 2>&1 && [ ! -x "$HOME/.juliaup/bin/juliaup" ]; then
                 curl -fsSL https://install.julialang.org | sh -s -- -y
               fi"#
              .to_string()
          } else {
            let safe = want.replace('\'', "'\\''").replace('"', "");
            format!(
              r#"set -e
                 export PATH="$HOME/.juliaup/bin:$PATH"
                 if ! command -v juliaup >/dev/null 2>&1 && [ ! -x "$HOME/.juliaup/bin/juliaup" ]; then
                   curl -fsSL https://install.julialang.org | sh -s -- -y
                   export PATH="$HOME/.juliaup/bin:$PATH"
                 fi
                 export PATH="$HOME/.juliaup/bin:$PATH"
                 JUP="$HOME/.juliaup/bin/juliaup"
                 if [ ! -x "$JUP" ]; then
                   echo "[RUNTIME_INSTALL_FAILED] juliaup not found after install" >&2
                   exit 1
                 fi
                 "$JUP" status >/dev/null 2>&1 || true
                 juliaup_add() {{
                   if "$JUP" add "$1" 2>/dev/null; then return 0; fi
                   return 1
                 }}
                 if ! juliaup_add '{want}' && ! juliaup_add "release~{want}"; then
                   echo "[RUNTIME_INSTALL_FAILED] juliaup add failed for {want} (tried bare name and release~…)" >&2
                   "$JUP" add '{want}'
                 fi
                 juliaup_def() {{
                   if "$JUP" default "$1" 2>/dev/null; then return 0; fi
                   return 1
                 }}
                 if ! juliaup_def '{want}' && ! juliaup_def "release~{want}"; then
                   "$JUP" default '{want}'
                 fi"#,
              want = safe
            )
          };
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if method.trim() == "local"
            && !matches!(
              runtime_id.as_str(),
              "node" | "python" | "go" | "zig" | "rust" | "bun" | "dart" | "flutter" | "julia" | "php" | "ruby" | "lua"
            )
            && !pkgs.is_empty()
          {
            Err(format!(
              "[RUNTIME_INSTALL_FAILED] Isolated (local) install is not implemented for runtime '{}' on this distro (package manager: {}). Choose System for distro packages, pick a toolchain with a supported local installer, or install manually.",
              runtime_id, pkg_mgr
            ))
          } else {
            if method.trim() == "system" && !pkgs.is_empty() && matches!(runtime_id.as_str(), "node" | "python" | "go") {
              logs.push(
                "NOTE: System installs use distro package names only—your Target Version choice is ignored. Pick Local for Node.js, Python, or Go if you want the selected version.".to_string(),
              );
            }
            if pkgs.is_empty() {
              logs.push(format!("No system packages known for '{}' on {}. Try local/rustup method.", runtime_id, distro));
              Ok(())
            } else {
              let total = pkgs.len();
              let mut loop_res = Ok(());
              for (idx, pkg) in pkgs.iter().enumerate() {
                let base = (idx as u32 * 100) / total as u32;
                let weight = 100 / total as u32;
                if runtime_system_package_installed(pkg_mgr, pkg).await {
                  logs.push(format!("NOTE: {} already installed; skipping.", pkg));
                  continue;
                }
                let cmd = match pkg_mgr {
                  "apt" => format!("DEBIAN_FRONTEND=noninteractive apt-get install -y {}", pkg),
                  "dnf" => format!("dnf install -y {}", pkg),
                  "pacman" => format!("pacman -S --needed --noconfirm {}", pkg),
                  "zypper" => format!("zypper install -y {}", pkg),
                  _ => format!("apt-get install -y {}", pkg),
                };
                logs.push(format!("Installing dependency {} of {}: {}…", idx + 1, total, pkg));
                let step_res = sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), base, weight).await;
                if let Err(e) = step_res {
                  loop_res = Err(format!("[RUNTIME_INSTALL_FAILED] Failed to install {}: {}", pkg, e));
                  break;
                }
              }
              loop_res
            }
          }
        }
      }
      "runtime_update" => {
        if runtime_id == "rust" {
          exec_output_limit("bash", &["-lc", "rustup update"], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UPDATE_FAILED] {}", e.trim()))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if pkgs.is_empty() {
            logs.push(format!("No system packages to update for '{}' on {}.", runtime_id, distro));
            Ok(())
          } else {
            let cmd = pkg_upgrade_cmd(pkg_mgr, &pkgs);
            sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
              .map_err(|e| format!("[RUNTIME_UPDATE_FAILED] {}", e))
          }
        }
      }
      "runtime_uninstall" => {
        if runtime_id == "rust" {
          exec_output_limit("bash", &["-lc", "rustup self uninstall -y 2>/dev/null || true"], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
        } else if runtime_id == "bun" {
          logs.push("Removing Bun (~/.bun)…".into());
          exec_output_limit("bash", &["-lc", "rm -rf \"$HOME/.bun\" && sed -i '/BUN_INSTALL/d;/.bun\\/bin/d' \"$HOME/.bashrc\" \"$HOME/.zshrc\" 2>/dev/null || true"], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
        } else if runtime_id == "flutter" {
          logs.push("Removing Flutter snap…".into());
          sudo_bash_install_step("snap remove flutter", password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e))
        } else if runtime_id == "julia" {
          // juliaup self uninstall doesn't accept -y; pipe stdin to confirm,
          // then fall back to manual directory removal if juliaup isn't found.
          let cmd = r#"
            if command -v juliaup > /dev/null 2>&1 || [ -x "$HOME/.juliaup/bin/juliaup" ]; then
              JULIAUP="$( command -v juliaup 2>/dev/null || echo "$HOME/.juliaup/bin/juliaup" )"
              echo y | "$JULIAUP" self uninstall 2>/dev/null || true
            fi
            rm -rf "$HOME/.juliaup" "$HOME/.julia" 2>/dev/null || true
            sed -i '/juliaup/d;/\.julia/d' "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile" "$HOME/.bash_profile" 2>/dev/null || true
          "#;
          logs.push("Removing Julia via juliaup and cleaning home directories…".into());
          exec_output_limit("bash", &["-lc", cmd], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if pkgs.is_empty() {
            logs.push(format!("No system packages to remove for '{}' on {}.", runtime_id, distro));
            Ok(())
          } else {
            let cmd = pkg_remove_cmd(pkg_mgr, &pkgs);
            sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
              .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e))
          }
        }
      }
      _ => {
        logs.push(format!("Unknown job kind: {}.", kind));
        Ok(())
      }
    };
    if let Err(e) = result {
      logs.push(format!("ERROR: {}", e));
      final_state = "failed";
    } else {
      let st = app.state::<AppState>();
      let mut jobs = st.jobs.lock().await;
      if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str())) {
        j["progress"] = json!(85);
      }
      drop(jobs);

      if matches!(kind.as_str(), "runtime_install" | "install_deps") {
        runtime_append_verify(&runtime_id, &effective_verify_method, &version, &mut logs).await;
      }
    }
  }

  let st = app.state::<AppState>();
  let mut jobs = st.jobs.lock().await;
  if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str())) {
    j["state"] = json!(final_state);
    j["progress"] = json!(if final_state == "completed" { 100 } else { 0 });
    j["logTail"] = json!(logs.into_iter().rev().take(48).collect::<Vec<String>>().into_iter().rev().collect::<Vec<String>>());
  }
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
      exec_output_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT)
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
      exec_output_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT)
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
      exec_output_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT)
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

async fn docker_install_invoke(body: &Value) -> Value {
  if std::env::var("FLATPAK_ID").is_ok() {
    return json!({
      "ok": false,
      "log": vec![
        "Blocked: Flatpak sandbox cannot run privileged host package managers (apt/dnf/pacman).".to_string()
      ],
      "error": "[DOCKER_INSTALL_FAILED] Install Docker on the host outside Flatpak (see https://docs.docker.com/engine/install/), grant socket access to this app, then retry."
    });
  }

  let distro = body.get("distro").and_then(|v| v.as_str()).unwrap_or_default();
  if !matches!(distro, "ubuntu" | "fedora" | "arch") {
    return json!({ "ok": false, "log": Vec::<String>::new(), "error": "[DOCKER_INVALID_REQUEST] Unsupported distro." });
  }
  let host_distro_id = std::fs::read_to_string("/etc/os-release")
    .unwrap_or_default()
    .lines()
    .find(|l| l.starts_with("ID="))
    .map(|l| l.trim_start_matches("ID=").trim_matches('"').to_string())
    .unwrap_or_else(|| "linux".to_string())
    .to_lowercase();
  let distro_family = |id: &str| -> &'static str {
    match id {
      "ubuntu" | "debian" | "linuxmint" | "pop" | "elementary" | "raspbian" => "ubuntu",
      "fedora" | "rhel" | "centos" | "rocky" | "alma" | "amzn" => "fedora",
      "arch" | "manjaro" | "endeavouros" | "garuda" => "arch",
      _ => "unknown",
    }
  };
  let host_family = distro_family(&host_distro_id);
  if host_family != "unknown" && host_family != distro {
    return json!({
      "ok": false,
      "log": vec![format!("Host distro detected as '{}' (family: {}). Installer selection was '{}'.", host_distro_id, host_family, distro)],
      "error": format!("[DOCKER_INSTALL_FAILED] Selected distro '{}' does not match host distro '{}'. Choose '{}' in the installer.", distro, host_distro_id, host_family),
    });
  }
  let password = body.get("password").and_then(|v| v.as_str());
  let pw_nonempty = password.map(|p| !p.is_empty()).unwrap_or(false);
  if !pw_nonempty && !sudo_passwordless_ok().await {
    return json!({
      "ok": false,
      "log": Vec::<String>::new(),
      "error": "[DOCKER_INSTALL_FAILED] sudo needs a password or passwordless sudo. Enter the sudo password in the installer UI, or configure NOPASSWD for this user."
    });
  }

  let requested_components: Vec<String> = body
    .get("components")
    .and_then(|v| v.as_array())
    .map(|arr| {
      arr.iter()
        .filter_map(|x| x.as_str().map(std::string::ToString::to_string))
        .collect::<Vec<String>>()
    })
    .unwrap_or_default();
  let docker_installed = exec_output_limit("docker", &["--version"], CMD_TIMEOUT_SHORT).await.is_ok();
  let compose_installed = exec_output_limit("docker", &["compose", "version"], CMD_TIMEOUT_SHORT).await.is_ok();
  let buildx_installed = exec_output_limit("docker", &["buildx", "version"], CMD_TIMEOUT_SHORT).await.is_ok();

  let mut effective_components = requested_components;
  if effective_components.is_empty() {
    effective_components = vec!["docker".into(), "compose".into(), "buildx".into()];
  }
  effective_components.retain(|c| match c.as_str() {
    "docker" => !docker_installed,
    "compose" => !compose_installed,
    "buildx" => !buildx_installed,
    _ => false,
  });

  let mut logs: Vec<String> = Vec::new();
  logs.push(format!(
    "Detected install status => docker: {}, compose: {}, buildx: {}",
    docker_installed, compose_installed, buildx_installed
  ));
  if effective_components.is_empty() {
    logs.push("Nothing to install: requested Docker components are already present.".to_string());
    return json!({ "ok": true, "log": logs });
  }
  let effective_json: Vec<Value> = effective_components.into_iter().map(Value::String).collect();
  let Some(steps) = docker_install_build_steps(distro, Some(&effective_json)) else {
    return json!({ "ok": false, "log": Vec::<String>::new(), "error": "[DOCKER_INVALID_REQUEST] Unsupported distro." });
  };

  for cmd in steps {
    match sudo_bash_install_step(&cmd, password, &mut logs, None, None, 0, 0).await {
      Ok(()) => {}
      Err(e) => return json!({ "ok": false, "log": logs, "error": e }),
    }
  }
  json!({ "ok": true, "log": logs })
}

async fn docker_remap_port_invoke(body: &Value) -> Value {
  let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
  let old_hp = body.get("oldHostPort").and_then(|v| v.as_u64()).unwrap_or(0);
  let new_hp = body.get("newHostPort").and_then(|v| v.as_u64()).unwrap_or(0);
  let requested_network = body
    .get("networkMode")
    .and_then(|v| v.as_str())
    .map(|s| s.trim())
    .filter(|s| !s.is_empty());
  if id.is_empty() || old_hp == 0 || new_hp == 0 {
    return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] id and host ports (1-65535) are required." });
  }

  let inspect_raw = match exec_output("docker", &["inspect", id]).await {
    Ok(s) => s,
    Err(e) => return json!({ "ok": false, "error": format!("[DOCKER_NOT_FOUND] {}", e.trim()) }),
  };
  let arr: Vec<Value> = match serde_json::from_str(&inspect_raw) {
    Ok(a) => a,
    Err(e) => return json!({ "ok": false, "error": format!("[DOCKER_INVALID_REQUEST] inspect parse: {}", e) }),
  };
  let Some(info) = arr.first() else {
    return json!({ "ok": false, "error": "[DOCKER_NOT_FOUND] empty inspect result." });
  };

  let image = info
    .pointer("/Config/Image")
    .and_then(|v| v.as_str())
    .unwrap_or_default();
  if image.is_empty() {
    return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] container image missing from inspect." });
  }

  let name_raw = info.pointer("/Name").and_then(|v| v.as_str()).unwrap_or("");
  let old_name = name_raw.trim_start_matches('/');
  let base = if old_name.is_empty() {
    format!("ctr-{}", &id[..id.len().min(12)])
  } else {
    old_name.to_string()
  };
  let mut new_name = sanitize_docker_name(&format!("{base}-p{new_hp}"));
  let current_network_mode = info
    .pointer("/HostConfig/NetworkMode")
    .and_then(|v| v.as_str())
    .unwrap_or("bridge")
    .to_string();
  let target_network_mode = requested_network.unwrap_or(current_network_mode.as_str()).to_string();

  // Nothing to do: same port AND same network.
  if old_hp == new_hp && target_network_mode == current_network_mode {
    return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] port and network are identical — nothing to change." });
  }

  let mut bindings = info
    .pointer("/HostConfig/PortBindings")
    .cloned()
    .unwrap_or(json!({}));
  let Some(bind_obj) = bindings.as_object() else {
    return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] PortBindings missing or invalid." });
  };
  if bind_obj.is_empty() {
    return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] no published host ports to remap." });
  }

  let mut matched = false;
  if let Some(obj) = bindings.as_object_mut() {
    for arr_val in obj.values_mut() {
      let Some(arr) = arr_val.as_array_mut() else {
        continue;
      };
      for b in arr.iter_mut() {
        let Some(o) = b.as_object_mut() else {
          continue;
        };
        if let Some(hp) = o.get("HostPort").and_then(|v| v.as_str()) {
          if hp.parse::<u64>().ok() == Some(old_hp) {
            o.insert("HostPort".to_string(), json!(new_hp.to_string()));
            matched = true;
          }
        }
      }
    }
  }
  if !matched {
    return json!({
      "ok": false,
      "error": format!("[DOCKER_INVALID_REQUEST] host port {old_hp} not found in container port bindings.")
    });
  }

  let build_create_args = |name_try: &str| -> Vec<String> {
    let mut args: Vec<String> = vec!["create".into(), "--name".into(), name_try.to_string()];
    args.push("--network".into());
    args.push(target_network_mode.to_string());
    if let Some(true) = info.pointer("/Config/Tty").and_then(|v| v.as_bool()) {
      args.push("-t".into());
    }
    if let Some(true) = info.pointer("/Config/OpenStdin").and_then(|v| v.as_bool()) {
      args.push("-i".into());
    }
    if let Some(rp) = info.pointer("/HostConfig/RestartPolicy/Name").and_then(|v| v.as_str()) {
      if !rp.is_empty() && rp != "no" {
        args.push("--restart".into());
        args.push(rp.to_string());
      }
    }
    if let Some(binds) = info.pointer("/HostConfig/Binds").and_then(|v| v.as_array()) {
      for b in binds {
        if let Some(s) = b.as_str() {
          args.push("-v".into());
          args.push(s.to_string());
        }
      }
    }
    if let Some(envs) = info.pointer("/Config/Env").and_then(|v| v.as_array()) {
      for e in envs {
        if let Some(s) = e.as_str() {
          args.push("-e".into());
          args.push(s.to_string());
        }
      }
    }
    if let Some(obj) = bindings.as_object() {
      for (ctr_key, arr_val) in obj.iter() {
        let parts: Vec<&str> = ctr_key.split('/').collect();
        if parts.len() != 2 {
          continue;
        }
        let ctr_port = parts[0];
        let proto = parts[1];
        if let Some(arr) = arr_val.as_array() {
          for b in arr {
            let hp = b.get("HostPort").and_then(|v| v.as_str()).unwrap_or("");
            if hp.is_empty() {
              continue;
            }
            args.push("-p".into());
            args.push(format!("{hp}:{ctr_port}/{proto}"));
          }
        }
      }
    }
    args.push(image.to_string());
    if let Some(cmd_arr) = info.pointer("/Config/Cmd").and_then(|v| v.as_array()) {
      for c in cmd_arr {
        if let Some(s) = c.as_str() {
          args.push(s.to_string());
        }
      }
    }
    args
  };

  for attempt in 0u32..4u32 {
    if attempt > 0 {
      let suf = Uuid::new_v4().to_string();
      let short = suf.split('-').next().unwrap_or("x");
      new_name = sanitize_docker_name(&format!("{base}-p{new_hp}-{short}"));
    }
    let args = build_create_args(&new_name);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    match exec_output("docker", &refs).await {
      Ok(out) => {
        let cid = out.trim().to_string();
        if cid.is_empty() {
          return json!({ "ok": false, "error": "[DOCKER_REMAP_FAILED] docker create returned empty id." });
        }
        if let Err(e) = exec_output("docker", &["start", &cid]).await {
          let _ = exec_output("docker", &["rm", "-f", &cid]).await;
          return json!({ "ok": false, "error": format!("[DOCKER_REMAP_FAILED] start: {}", e.trim()) });
        }
        // Stop then remove source container (only rm after successful stop; avoids two copies).
        let mut source_stopped = false;
        let mut source_stop_note = serde_json::Value::Null;
        let mut source_removed = false;
        let mut source_remove_note = serde_json::Value::Null;
        match exec_output("docker", &["stop", id]).await {
          Ok(_) => {
            source_stopped = true;
            match exec_output("docker", &["rm", id]).await {
              Ok(_) => source_removed = true,
              Err(e) => source_remove_note = json!(e.trim()),
            }
          }
          Err(e) => source_stop_note = json!(format!("source still running: {}", e.trim())),
        }
        return json!({
          "ok": true,
          "id": cid,
          "name": new_name,
          "sourceStopped": source_stopped,
          "sourceStopNote": source_stop_note,
          "sourceRemoved": source_removed,
          "sourceRemoveNote": source_remove_note,
        });
      }
      Err(e) => {
        let msg = e.to_lowercase();
        if msg.contains("already in use") || msg.contains("conflict") || msg.contains("already exists") {
          continue;
        }
        return json!({ "ok": false, "error": format!("[DOCKER_REMAP_FAILED] {}", e.trim()) });
      }
    }
  }
  json!({ "ok": false, "error": "[DOCKER_REMAP_FAILED] could not allocate a unique container name." })
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

#[tauri::command]
async fn ipc_invoke(channel: String, payload: Option<Value>, app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
  let body = payload.unwrap_or_else(|| json!({}));
  let res = match channel.as_str() {
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
      let data = body.get("data").cloned().unwrap_or(Value::Null);
      match app_file(&app, "store.json") {
        Ok(path) => {
          let mut store = read_json(&path);
          if !store.is_object() {
            store = json!({});
          }
          if let Some(map) = store.as_object_mut() {
            map.insert(key.to_string(), data);
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
        let layout = read_json(&path);
        json!({ "ok": true, "layout": if layout == json!({}) { json!({ "version": 1, "placements": [] }) } else { layout } })
      }
      Err(e) => json!({ "ok": false, "error": e }),
    },
    "dh:layout:set" => match app_file(&app, "layout.json") {
      Ok(path) => match write_json(&path, &body) {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
      },
      Err(e) => json!({ "ok": false, "error": e }),
    },
    "dh:perf:snapshot" => {
      let mut rss_mb = 0u64;
      if let Ok(statm) = std::fs::read_to_string("/proc/self/statm") {
        if let Some(pages) = statm.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok()) {
          rss_mb = (pages * 4096) / 1024 / 1024; // Assuming 4KB page size
        }
      }
      let uptime_str = std::fs::read_to_string("/proc/uptime").unwrap_or_default();
      let uptime_sec = uptime_str.split_whitespace().next()
        .and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0) as u64;
      
      json!({
        "ok": true,
        "snapshot": {
          "startupMs": 150, // Approximation or track in AppState
          "rssMb": rss_mb,
          "heapUsedMb": rss_mb / 2, // Approximation
          "heapTotalMb": rss_mb,
          "uptimeSec": uptime_sec
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
    "dh:docker:check-installed" => {
      let docker = exec_output_limit("docker", &["--version"], CMD_TIMEOUT_SHORT).await.is_ok();
      let compose = exec_output_limit("docker", &["compose", "version"], CMD_TIMEOUT_SHORT).await.is_ok();
      let buildx = exec_output_limit("docker", &["buildx", "version"], CMD_TIMEOUT_SHORT).await.is_ok();
      json!({ "docker": docker, "compose": compose, "buildx": buildx })
    },
    "dh:docker:list" => match exec_output("docker", &["ps", "-a", "--format", "{\"ID\":\"{{.ID}}\",\"Names\":\"{{.Names}}\",\"Image\":\"{{.Image}}\",\"State\":\"{{.State}}\",\"Status\":\"{{.Status}}\",\"Ports\":\"{{.Ports}}\",\"Networks\":\"{{.Networks}}\",\"Mounts\":\"{{.Mounts}}\"}"]).await {
      Ok(out) => {
        let rows: Vec<Value> = out
          .lines()
          .filter_map(|line| serde_json::from_str::<Value>(line).ok())
          .map(|v| {
            let mut networks: Vec<String> = v
              .get("Networks")
              .and_then(|x| x.as_str())
              .unwrap_or_default()
              .split(',')
              .map(|s| s.trim().to_string())
              .filter(|s| !s.is_empty())
              .collect();
            // `docker ps --format {{.Networks}}` is occasionally empty for running containers
            // that are actually on the default bridge; avoid misclassifying them as `none`.
            if networks.is_empty() {
              networks.push("bridge".to_string());
            }
            let volumes: Vec<String> = v
              .get("Mounts")
              .and_then(|x| x.as_str())
              .unwrap_or_default()
              .split(',')
              .map(|s| s.trim().to_string())
              .filter(|s| !s.is_empty())
              .collect();
            json!({
              "id": v.get("ID").and_then(|x| x.as_str()).unwrap_or_default(),
              "name": v.get("Names").and_then(|x| x.as_str()).map(|s| s.trim_start_matches('/')).unwrap_or_default(),
              "image": v.get("Image").and_then(|x| x.as_str()).unwrap_or_default(),
              "imageId": "",
              "state": v.get("State").and_then(|x| x.as_str()).unwrap_or("unknown"),
              "status": v.get("Status").and_then(|x| x.as_str()).unwrap_or("unknown"),
              "ports": v.get("Ports").and_then(|x| x.as_str()).filter(|x| !x.is_empty()).unwrap_or("—"),
              "networks": networks,
              "volumes": volumes
            })
          })
          .collect();
        json!({ "ok": true, "rows": rows })
      }
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_LIST_FAILED] {}", e.trim()) }),
    },
    "dh:docker:action" => {
      let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
      let action = body.get("action").and_then(|v| v.as_str()).unwrap_or_default();
      if id.is_empty() || action.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_ACTION_FAILED] Missing id or action." })
      } else {
        let args: Vec<&str> = match action {
          "start" => vec!["start", id],
          "stop" => vec!["stop", id],
          "restart" => vec!["restart", id],
          "remove" => {
            let remove_volumes = body.get("removeVolumes").and_then(|v| v.as_bool()).unwrap_or(false);
            let remove_image = body.get("removeImage").and_then(|v| v.as_bool()).unwrap_or(false);
            let image_ref = body.get("image").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let remove_args: Vec<&str> = if remove_volumes {
              vec!["rm", "-f", "-v", id]
            } else {
              vec!["rm", "-f", id]
            };
            match exec_output("docker", &remove_args).await {
              Ok(_) => {
                if remove_image && !image_ref.trim().is_empty() {
                  let _ = exec_output("docker", &["rmi", image_ref.trim()]).await;
                }
                return Ok(json!({ "ok": true }));
              }
              Err(e) => return Ok(json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] {}", e.trim()) })),
            }
          }
          _ => vec![],
        };
        if args.is_empty() {
          json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] Unsupported action: {}", action) })
        } else {
          match exec_output("docker", &args).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] {}", e.trim()) }),
          }
        }
      }
    },
    "dh:docker:logs" => {
      let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
      let tail = body.get("tail").and_then(|v| v.as_u64()).unwrap_or(200).to_string();
      if id.is_empty() {
        json!({ "ok": false, "log": "", "error": "[DOCKER_LOGS_FAILED] Missing id." })
      } else {
        match exec_result("docker", &["logs", "--tail", &tail, id]).await {
          Ok((stdout, stderr)) => json!({ "ok": true, "text": format!("{}{}", stdout, stderr) }),
          Err(e) => json!({ "ok": false, "text": "", "error": format!("[DOCKER_LOGS_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:images:list" => match exec_output("docker", &["images", "--format", "{{json .}}", "--no-trunc"]).await {
      Ok(out) => {
        let rows: Vec<Value> = out
          .lines()
          .filter_map(|line| serde_json::from_str::<Value>(line).ok())
          .map(|v| {
            let repository = v.get("Repository").and_then(|x| x.as_str()).unwrap_or("<none>");
            let tag = v.get("Tag").and_then(|x| x.as_str()).unwrap_or("<none>");
            let id = v.get("ID").and_then(|x| x.as_str()).unwrap_or_default();
            let size = v.get("Size").and_then(|x| x.as_str()).unwrap_or("0MB");
            json!({
              "id": id,
              "repoTags": [format!("{}:{}", repository, tag)],
              "sizeMb": parse_size_mb(size),
              "createdAt": v.get("CreatedAt").and_then(|x| x.as_str()).unwrap_or_default()
            })
          })
          .collect();
        json!({ "ok": true, "rows": rows })
      }
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_IMAGES_FAILED] {}", e.trim()) }),
    },
    "dh:docker:image:action" => {
      let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
      let force = body.get("force").and_then(|v| v.as_bool()).unwrap_or(false);
      if id.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_IMAGE_ACTION_FAILED] Missing image id." })
      } else {
        let args: Vec<&str> = if force { vec!["rmi", "-f", id] } else { vec!["rmi", id] };
        match exec_output("docker", &args).await {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_IMAGE_ACTION_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:volumes:list" => match exec_output("docker", &["volume", "ls", "--format", "{{.Name}}"]).await {
      Ok(out) => {
        let rows: Vec<Value> = out
          .lines()
          .filter(|name| !name.trim().is_empty())
          .map(|name| json!({ "name": name.trim(), "driver": "local", "mountpoint": "", "scope": "local", "usedBy": [] }))
          .collect();
        json!({ "ok": true, "rows": rows })
      }
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_VOLUMES_FAILED] {}", e.trim()) }),
    },
    "dh:docker:volume:create" => {
      let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
      if name.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_VOLUME_CREATE_FAILED] Missing volume name." })
      } else {
        match exec_output("docker", &["volume", "create", name]).await {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_VOLUME_CREATE_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:volume:action" => {
      let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
      let action = body.get("action").and_then(|v| v.as_str()).unwrap_or_default();
      if name.is_empty() || action != "remove" {
        json!({ "ok": false, "error": "[DOCKER_VOLUME_ACTION_FAILED] Invalid payload." })
      } else {
        match exec_output("docker", &["volume", "rm", name]).await {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_VOLUME_ACTION_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:networks:list" => match exec_output("docker", &["network", "ls", "--format", "{{json .}}"]).await {
      Ok(out) => {
        let rows: Vec<Value> = out
          .lines()
          .filter_map(|line| serde_json::from_str::<Value>(line).ok())
          .map(|v| json!({
            "id": v.get("ID").and_then(|x| x.as_str()).unwrap_or_default(),
            "name": v.get("Name").and_then(|x| x.as_str()).unwrap_or_default(),
            "driver": v.get("Driver").and_then(|x| x.as_str()).unwrap_or("bridge"),
            "scope": v.get("Scope").and_then(|x| x.as_str()).unwrap_or("local"),
            "usedBy": []
          }))
          .collect();
        json!({ "ok": true, "rows": rows })
      }
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_NETWORKS_FAILED] {}", e.trim()) }),
    },
    "dh:docker:network:create" => {
      let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
      if name.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_NETWORK_CREATE_FAILED] Missing network name." })
      } else {
        match exec_output("docker", &["network", "create", name]).await {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_NETWORK_CREATE_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:network:action" => {
      let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
      let action = body.get("action").and_then(|v| v.as_str()).unwrap_or_default();
      if id.is_empty() || action != "remove" {
        json!({ "ok": false, "error": "[DOCKER_NETWORK_ACTION_FAILED] Invalid payload." })
      } else {
        match exec_output("docker", &["network", "rm", id]).await {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_NETWORK_ACTION_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:prune" => match exec_output("docker", &["system", "prune", "-f", "--volumes"]).await {
      Ok(log) => json!({ "ok": true, "log": log }),
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_PRUNE_FAILED] {}", e.trim()) }),
    },
    "dh:docker:prune:preview" => {
      let containers = docker_nonempty_line_count(&["ps", "-a", "-q", "--filter", "status=exited"]).await;
      let images = docker_nonempty_line_count(&["images", "-f", "dangling=true", "-q"]).await;
      let volumes = docker_nonempty_line_count(&["volume", "ls", "-qf", "dangling=true"]).await;
      let networks = docker_nonempty_line_count(&["network", "ls", "-qf", "dangling=true"]).await;
      json!({
        "ok": true,
        "preview": {
          "containers": containers,
          "images": images,
          "volumes": volumes,
          "networks": networks
        }
      })
    },
    "dh:docker:cleanup:run" => {
      let mut logs: Vec<String> = Vec::new();
      if body.get("containers").and_then(|v| v.as_bool()).unwrap_or(false) {
        logs.push(exec_output("docker", &["container", "prune", "-f"]).await.unwrap_or_else(|e| e));
      }
      if body.get("images").and_then(|v| v.as_bool()).unwrap_or(false) {
        logs.push(exec_output("docker", &["image", "prune", "-af"]).await.unwrap_or_else(|e| e));
      }
      if body.get("volumes").and_then(|v| v.as_bool()).unwrap_or(false) {
        logs.push(exec_output("docker", &["volume", "prune", "-f"]).await.unwrap_or_else(|e| e));
      }
      if body.get("networks").and_then(|v| v.as_bool()).unwrap_or(false) {
        logs.push(exec_output("docker", &["network", "prune", "-f"]).await.unwrap_or_else(|e| e));
      }
      json!({ "ok": true, "log": logs.join("\n") })
    },
    "dh:docker:pull" => {
      let image = body.get("image").and_then(|v| v.as_str()).unwrap_or_default();
      if image.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_PULL_FAILED] Missing image name." })
      } else {
        match exec_result_limit("docker", &["pull", image], CMD_TIMEOUT_LONG).await {
          Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_PULL_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:search" => {
      let term = body.as_str().unwrap_or_default();
      match exec_output_limit("curl", &["-fsSL", &format!("https://hub.docker.com/v2/search/repositories/?query={}&page_size=12", term)], CMD_TIMEOUT_SHORT).await {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
          Ok(v) => {
            let results: Vec<Value> = v
              .get("results")
              .and_then(|x| x.as_array())
              .cloned()
              .unwrap_or_default()
              .into_iter()
              .map(|r| {
                json!({
                  "name": r.get("repo_name").and_then(|x| x.as_str()).unwrap_or_default(),
                  "description": r.get("short_description").and_then(|x| x.as_str()).unwrap_or_default(),
                  "star_count": r.get("star_count").and_then(|x| x.as_u64()).unwrap_or(0),
                  "is_official": r.get("is_official").and_then(|x| x.as_bool()).unwrap_or(false),
                })
              })
              .collect();
            json!({ "ok": true, "results": results })
          }
          Err(_) => json!({ "ok": false, "error": "[DOCKER_SEARCH_FAILED] Invalid response format." }),
        },
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_SEARCH_FAILED] {}", e.trim()) }),
      }
    },
    "dh:docker:tags" => {
      let image = body.as_str().unwrap_or_default();
      let mut parts = image.split('/');
      let (namespace, repo) = if image.contains('/') {
        (parts.next().unwrap_or("library"), parts.collect::<Vec<_>>().join("/"))
      } else {
        ("library", image.to_string())
      };
      let url = format!("https://hub.docker.com/v2/repositories/{}/{}/tags/?page_size=20", namespace, repo);
      match exec_output_limit("curl", &["-fsSL", &url], CMD_TIMEOUT_SHORT).await {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
          Ok(v) => {
            let tags: Vec<Value> = v
              .get("results")
              .and_then(|x| x.as_array())
              .cloned()
              .unwrap_or_default()
              .into_iter()
              .filter_map(|item| item.get("name").cloned())
              .collect();
            json!({ "ok": true, "tags": tags })
          }
          Err(_) => json!({ "ok": false, "error": "[DOCKER_TAGS_FAILED] Invalid response format." }),
        },
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_TAGS_FAILED] {}", e.trim()) }),
      }
    },
    "dh:compose:up" => {
      let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
      let dir = find_repo_root(&std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("docker")
        .join("compose")
        .join(profile);
      if !dir.is_dir() {
        json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] missing compose directory: {}", dir.display()) })
      } else {
        match exec_docker_compose_in_dir(&dir, &["up", "-d"], CMD_TIMEOUT_LONG).await {
          Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
          Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:compose:logs" => {
      let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
      let dir = find_repo_root(&std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("docker")
        .join("compose")
        .join(profile);
      if !dir.is_dir() {
        json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] missing compose directory: {}", dir.display()) })
      } else {
        match exec_docker_compose_in_dir(&dir, &["logs", "--tail", "200"], CMD_TIMEOUT_DEFAULT).await {
          Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
          Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:terminal:openExternal" => {
      let launched = exec_output_limit(
        "bash",
        &["-lc", "for t in xdg-terminal-emulator gnome-console kitty alacritty gnome-terminal konsole xfce4-terminal xterm; do command -v $t >/dev/null 2>&1 && ($t >/dev/null 2>&1 &); if [ $? -eq 0 ]; then echo ok; exit 0; fi; done; exit 1"],
        CMD_TIMEOUT_SHORT,
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
    "dh:docker:terminal" => {
      let container_id = body.get("containerId").and_then(|v| v.as_str()).unwrap_or_default();
      if container_id.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_TERMINAL_FAILED] Missing containerId." })
      } else {
        let cols = body.get("cols").and_then(|v| v.as_u64()).unwrap_or(120) as u16;
        let rows = body.get("rows").and_then(|v| v.as_u64()).unwrap_or(34) as u16;
        let pty_system = native_pty_system();
        match pty_system.openpty(PtySize {
          rows,
          cols,
          pixel_width: 0,
          pixel_height: 0,
        }) {
          Ok(pair) => {
            let mut cmd = CommandBuilder::new("docker");
            cmd.args([
              "exec",
              "-it",
              container_id,
              "sh",
              "-lc",
              "if command -v bash >/dev/null 2>&1; then exec bash --noprofile --norc -i; else exec sh -i; fi",
            ]);
            match pair.slave.spawn_command(cmd) {
              Ok(child) => {
                let id = Uuid::new_v4().to_string();
                let master = Arc::new(StdMutex::new(pair.master));
                let child = Arc::new(StdMutex::new(child));
                let writer = match master.lock() {
                  Ok(guard) => match guard.take_writer() {
                    Ok(w) => Arc::new(StdMutex::new(w)),
                    Err(e) => return Ok(json!({ "ok": false, "error": format!("[DOCKER_TERMINAL_FAILED] {}", e) })),
                  },
                  Err(_) => return Ok(json!({ "ok": false, "error": "[DOCKER_TERMINAL_FAILED] PTY lock poisoned." })),
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
              Err(e) => json!({ "ok": false, "error": format!("[DOCKER_TERMINAL_FAILED] {}", e) }),
            }
          }
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_TERMINAL_FAILED] {}", e) }),
        }
      }
    }
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
        runtime_job_execute(app2, jid, kind, runtime_id, method, version, remove_mode, sudo_password).await;
      });
      json!({ "id": id })
    }
    "dh:job:cancel" => {
      let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let mut jobs = state.jobs.lock().await;
      if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(id.as_str())) {
        if j.get("state").and_then(|v| v.as_str()) == Some("running") {
          j["state"] = json!("cancelled");
          j["logTail"] = json!(["Cancelled by user."]);
        }
      }
      json!({ "ok": true })
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
        match exec_output_limit("git", &["clone", url, target_dir], CMD_TIMEOUT_LONG).await {
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
        match exec_output_limit("bash", &["-c", &script], CMD_TIMEOUT_SHORT).await {
          Ok(info_raw) => match serde_json::from_str::<Value>(&info_raw) {
            Ok(info) => json!({ "ok": true, "info": info }),
            Err(_) => json!({ "ok": false, "error": "[GIT_STATUS_FAILED] Could not parse git status output." }),
          },
          Err(e) => json!({ "ok": false, "error": format!("[GIT_STATUS_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:ssh:generate" => {
      let email = body.get("email").and_then(|v| v.as_str()).unwrap_or("lumina@local");
      let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
      let ssh_dir = format!("{}/.ssh", home);
      let key_path = format!("{}/id_ed25519", ssh_dir);
      let _ = std::fs::create_dir_all(&ssh_dir);
      match exec_output("ssh-keygen", &["-t", "ed25519", "-C", email, "-f", &key_path, "-N", ""]).await {
        Ok(_) => json!({ "ok": true }),
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
    "dh:ssh:test:github" => match exec_result_limit("ssh", &["-T", "git@github.com"], CMD_TIMEOUT_DEFAULT).await {
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
      let mut runtimes: Vec<Value> = Vec::new();
      for (id, name, shell_cmd) in checks {
        match exec_result_limit("bash", &["-lc", shell_cmd], CMD_TIMEOUT_SHORT).await {
          Ok((stdout, stderr)) => {
            let combined = format!("{}{}", stdout, stderr);
            let version = combined.trim().lines().next().unwrap_or("").to_string();
            if version.is_empty() {
              runtimes.push(json!({ "id": id, "name": name, "installed": false }));
            } else {
              let mut detected_path: Option<String> = None;
              let mut all_versions: Vec<Value> = Vec::new();
              match *id {
                "node" => {
                  if let Ok(p) = exec_output_limit("bash", &["-lc", "command -v node || true"], CMD_TIMEOUT_SHORT).await {
                    let p = p.trim();
                    if !p.is_empty() {
                      detected_path = Some(p.to_string());
                    }
                  }
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", "if [ -d \"$HOME/.nvm/versions/node\" ]; then for d in \"$HOME/.nvm/versions/node\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); printf '%s\\t%s\\n' \"$b\" \"$d/bin/node\"; done; fi"],
                    CMD_TIMEOUT_SHORT,
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
                  if let Ok(p) = exec_output_limit("bash", &["-lc", "command -v python3 || command -v python || true"], CMD_TIMEOUT_SHORT).await {
                    let p = p.trim();
                    if !p.is_empty() {
                      detected_path = Some(p.to_string());
                    }
                  }
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", "if [ -d \"$HOME/.pyenv/versions\" ]; then for d in \"$HOME/.pyenv/versions\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); printf '%s\\t%s\\n' \"$b\" \"$d/bin/python\"; done; fi"],
                    CMD_TIMEOUT_SHORT,
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
                    CMD_TIMEOUT_SHORT,
                  ).await {
                    let p = p.trim();
                    if !p.is_empty() {
                      detected_path = Some(p.to_string());
                    }
                  }
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", "if [ -d \"$HOME/.local/share/lumina/java\" ]; then for d in \"$HOME/.local/share/lumina/java\"/jdk-*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\" | sed 's/^jdk-//'); printf '%s\\t%s\\n' \"$b\" \"$d/bin/java\"; done; fi"],
                    CMD_TIMEOUT_SHORT,
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
                    CMD_TIMEOUT_SHORT,
                  ).await {
                    let p = p.trim();
                    if !p.is_empty() {
                      detected_path = Some(p.to_string());
                    }
                  }
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", "if [ -d \"$HOME/.local/share/lumina/go\" ]; then for d in \"$HOME/.local/share/lumina/go\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue; [ -x \"$d/bin/go\" ] || continue; ver=$($d/bin/go version 2>/dev/null | awk '{print $3}' | sed 's/^go//'); printf '%s\\t%s\\n' \"$ver\" \"$d/bin/go\"; done; fi"],
                    CMD_TIMEOUT_SHORT,
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
                    CMD_TIMEOUT_SHORT,
                  ).await {
                    let p = p.trim();
                    if !p.is_empty() { detected_path = Some(p.to_string()); }
                  }
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", "if [ -d \"$HOME/.local/share/lumina/zig\" ]; then for d in \"$HOME/.local/share/lumina/zig\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue; [ -x \"$d/zig\" ] || continue; ver=$(\"$d/zig\" version 2>/dev/null | awk '{{print $1}}'); printf '%s\\t%s\\n' \"$ver\" \"$d/zig\"; done; fi"],
                    CMD_TIMEOUT_SHORT,
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
                  // Bun installs a single binary to ~/.bun/bin/bun; version already known
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
                    CMD_TIMEOUT_SHORT,
                  ).await {
                    let p = p.trim();
                    if !p.is_empty() { detected_path = Some(p.to_string()); }
                  }
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", "unset RUSTUP_TOOLCHAIN; [ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" toolchain list 2>/dev/null || true"],
                    CMD_TIMEOUT_SHORT,
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
                  // Check lumina dir and ~/.dart/dart-sdk (tarball install)
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", r#"FOUND=false; LDIR="$HOME/.local/share/lumina/dart"; if [ -d "$LDIR" ]; then for d in "$LDIR"/*; do [ -d "$d" ] || continue; b=$(basename "$d"); [ "$b" = "current" ] && continue; [ -x "$d/bin/dart" ] || continue; ver=$("$d/bin/dart" --version 2>&1 | awk '{print $4}'); printf '%s\t%s\n' "${ver:-$b}" "$d/bin/dart"; FOUND=true; done; fi; if ! $FOUND && [ -x "$HOME/.dart/dart-sdk/bin/dart" ]; then ver=$("$HOME/.dart/dart-sdk/bin/dart" --version 2>&1 | awk '{print $4}'); printf '%s\t%s\n' "${ver:-dart}" "$HOME/.dart/dart-sdk/bin/dart"; fi"#],
                    CMD_TIMEOUT_SHORT,
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
                  // Read version file (never run flutter binary — it grabs a startup lock)
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", r#"FOUND=false; LDIR="$HOME/.local/share/lumina/flutter"; if [ -d "$LDIR" ]; then for d in "$LDIR"/*; do [ -d "$d" ] || continue; b=$(basename "$d"); [ "$b" = "current" ] && continue; [ -x "$d/bin/flutter" ] || continue; ver=$(cat "$d/version" 2>/dev/null | head -1); printf '%s\t%s\n' "${ver:-$b}" "$d/bin/flutter"; FOUND=true; done; fi; if ! $FOUND; then for sd in "$HOME/.flutter-sdk" "$HOME/flutter"; do [ -x "$sd/bin/flutter" ] || continue; ver=$(cat "$sd/version" 2>/dev/null | head -1); printf '%s\t%s\n' "${ver:-stable}" "$sd/bin/flutter"; FOUND=true; break; done; fi; if ! $FOUND && command -v snap >/dev/null 2>&1; then snap list flutter 2>/dev/null | awk 'NR>1{print $2"\t/snap/flutter/current/bin/flutter"}'; fi"#],
                    CMD_TIMEOUT_SHORT,
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
                  // List juliaup toolchains
                  if let Ok(raw) = exec_output_limit(
                    "bash",
                    &["-lc", "export PATH=\"$HOME/.juliaup/bin:$PATH\"; juliaup list 2>/dev/null | tail -n +2 || true"],
                    CMD_TIMEOUT_SHORT,
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
              runtimes.push(json!({
                "id": id,
                "name": name,
                "installed": true,
                "version": version,
                "path": detected_path,
                "allVersions": all_versions
              }));
            }
          }
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
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://nodejs.org/dist/index.json"], CMD_TIMEOUT_SHORT).await {
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
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/python.json"], CMD_TIMEOUT_SHORT).await {
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
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://go.dev/dl/?mode=json&include=all"], CMD_TIMEOUT_SHORT).await {
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
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/php.json"], CMD_TIMEOUT_SHORT).await {
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
        },
        "ruby" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/ruby.json"], CMD_TIMEOUT_SHORT).await {
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
        },
        "dotnet" => versions.extend(["9.0".into(), "8.0 (LTS)".into(), "7.0".into(), "6.0 (LTS)".into()]),
        "bun" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://api.github.com/repos/oven-sh/bun/releases?per_page=20"], CMD_TIMEOUT_SHORT).await {
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
        },
        "zig" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://ziglang.org/download/index.json"], CMD_TIMEOUT_SHORT).await {
            if let Ok(obj) = serde_json::from_str::<Value>(&raw) {
              if let Some(map) = obj.as_object() {
                for key in map.keys().take(10) {
                  if key != "master" { versions.push(key.clone()); }
                }
              }
            }
          }
        },
        "julia" => {
          if let Ok(raw) = exec_output_limit("curl", &["-fsSL", "https://endoflife.date/api/julia.json"], CMD_TIMEOUT_SHORT).await {
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
        let ok = exec_result_limit("bash", &["-lc", shell_cmd], CMD_TIMEOUT_SHORT).await
          .map(|(so, se)| !format!("{}{}", so, se).trim().is_empty())
          .unwrap_or(false);
        deps.push(json!({ "name": name, "status": if ok { "installed" } else { "missing" }, "ok": ok }));
      }
      json!({ "ok": true, "dependencies": deps })
    },
    "dh:runtime:uninstall:preview" => {
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or("node");
      let _remove_mode = body.get("removeMode").and_then(|v| v.as_str()).unwrap_or("runtime_only");
      let distro = exec_output("sh", &["-c", ". /etc/os-release 2>/dev/null; printf '%s' \"${ID:-unknown}\""])
        .await.unwrap_or_else(|_| "unknown".to_string());
      let distro = distro.trim().to_string();
      let pkg_mgr = runtime_pkg_mgr(&distro);
      let pkgs = runtime_system_packages(runtime_id, pkg_mgr);
      
      let mut pkg_vals: Vec<Value> = pkgs.iter().map(|p| json!(p)).collect();
      let note: String;
      
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

      json!({
        "ok": true,
        "distro": distro,
        "runtimePackages": pkg_vals,
        "removableDeps": [],
        "blockedSharedDeps": [],
        "finalPackages": pkg_vals,
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
            match exec_output_limit("bash", &["-c", &cmd], CMD_TIMEOUT_SHORT).await {
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
            match exec_output_limit("bash", &["-c", &cmd], CMD_TIMEOUT_SHORT).await {
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
            match exec_output_limit("bash", &["-c", &cmd], CMD_TIMEOUT_SHORT).await {
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
            match exec_output_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT).await {
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
      let uptime_str = std::fs::read_to_string("/proc/uptime").unwrap_or_default();
      let uptime = uptime_str.split_whitespace().next()
        .and_then(|v| v.split('.').next())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
      // Distro from /etc/os-release PRETTY_NAME
      let os_release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
      let distro = os_release.lines()
        .find(|l| l.starts_with("PRETTY_NAME="))
        .and_then(|l| l.splitn(2, '=').nth(1))
        .map(|v| v.trim_matches('"').to_string())
        .unwrap_or_else(|| os_name.trim().to_string());
      // IP address (first non-loopback)
      let ip = exec_output_limit("sh", &["-c", "hostname -I 2>/dev/null | awk '{print $1}'"], CMD_TIMEOUT_SHORT)
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
      ], CMD_TIMEOUT_SHORT).await.unwrap_or_else(|_| "unknown".to_string());
      // Memory total
      let meminfo = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
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
      ], CMD_TIMEOUT_SHORT).await.unwrap_or_else(|_| "0".to_string());
      // Resolution via xrandr or wlr-randr
      let resolution = exec_output_limit("sh", &["-c",
        "xrandr --current 2>/dev/null | grep ' connected' | grep -oE '[0-9]+x[0-9]+' | head -1 || wlr-randr 2>/dev/null | grep -oE '[0-9]+x[0-9]+' | head -1 || echo unknown"
      ], CMD_TIMEOUT_SHORT).await.unwrap_or_else(|_| "unknown".to_string());
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
      if let Ok(docker_out) = exec_output_limit("docker", &["ps", "--format", "{{.Names}}\t{{.Ports}}"], CMD_TIMEOUT_SHORT).await {
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
                .last()
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
      match exec_output_limit("sh", &["-c", script], CMD_TIMEOUT_SHORT).await {
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
                .last()
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
      match exec_output_limit("ps", &["-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"], CMD_TIMEOUT_SHORT).await {
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
      let firewall = if exec_output_limit("ufw", &["status"], CMD_TIMEOUT_SHORT).await.map(|o| o.contains("active")).unwrap_or(false) {
        "active"
      } else if exec_output_limit("firewall-cmd", &["--state"], CMD_TIMEOUT_SHORT).await.map(|o| o.contains("running")).unwrap_or(false) {
        "active"
      } else {
        "inactive"
      };
      let selinux = exec_output_limit("sestatus", &[], CMD_TIMEOUT_SHORT).await
        .map(|o| if o.contains("enabled") { "enabled" } else { "disabled" })
        .unwrap_or_else(|_| "unknown");
      let ssh_config = exec_output_limit("bash", &["-c", "sshd -T 2>/dev/null | awk '/permitrootlogin|passwordauthentication/'"], CMD_TIMEOUT_SHORT).await.unwrap_or_default();
      let root_login = if ssh_config.contains("permitrootlogin yes") { "yes" } else { "no" };
      let pw_auth = if ssh_config.contains("passwordauthentication no") { "no" } else { "yes" };
      let failed_auth_24h = exec_output_limit(
        "bash",
        &[
          "-c",
          "journalctl --since '24 hours ago' -u sshd --no-pager 2>/dev/null | grep -Ei 'failed password|invalid user|authentication failure' | wc -l",
        ],
        CMD_TIMEOUT_SHORT,
      )
      .await
      .ok()
      .and_then(|s| s.trim().parse::<i32>().ok())
      .unwrap_or(0);
      
      let ports_out = exec_output_limit("ss", &["-tulpn"], CMD_TIMEOUT_SHORT).await.unwrap_or_default();
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
        CMD_TIMEOUT_SHORT,
      )
      .await
      .unwrap_or_default();
      let failed_auth_samples: Vec<String> = failed_auth_raw
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

      let ss_out = exec_output_limit("ss", &["-tulpn", "-H"], CMD_TIMEOUT_SHORT).await.unwrap_or_default();
      let risky_set: std::collections::HashSet<u16> = [22, 3306, 5432, 27017, 6379].iter().cloned().collect();
      let mut risky_port_owners: Vec<Value> = Vec::new();
      for line in ss_out.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(local) = parts.get(4) {
          if let Some(port_str) = local.split(':').last() {
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
      let meminfo = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
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
      let uptime_str = std::fs::read_to_string("/proc/uptime").unwrap_or_default();
      let uptime_sec = uptime_str.split_whitespace().next()
        .and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0) as u64;
      let loadavg_str = std::fs::read_to_string("/proc/loadavg").unwrap_or_default();
      let load_parts: Vec<f64> = loadavg_str.split_whitespace().take(3)
        .filter_map(|v| v.parse::<f64>().ok()).collect();
      let (cpu_percent, cpu_model) = {
        let stat_raw = std::fs::read_to_string("/proc/stat").unwrap_or_default();
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
            (usage * 100.0).max(0.0).min(100.0)
          } else {
            0.0
          }
        } else {
          0.0
        };
        *prev = Some((total, idle, now_inst));

        let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
        let model = cpuinfo.lines()
          .find(|l| l.starts_with("model name"))
          .and_then(|l| l.splitn(2, ':').nth(1))
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
      let net_raw = std::fs::read_to_string("/proc/net/dev").unwrap_or_default();
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
      let disk_raw = std::fs::read_to_string("/proc/diskstats").unwrap_or_default();
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
      let svc_out = exec_output_limit("systemctl", &["list-units", "--type=service", "--no-pager", "--plain", "--no-legend"], CMD_TIMEOUT_SHORT).await.unwrap_or_default();
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
          if let Ok(out) = exec_output_limit("nvidia-smi", &["--query-gpu=name", "--format=csv,noheader"], CMD_TIMEOUT_SHORT).await {
             let name = out.trim().to_string();
             if !name.is_empty() { gpus.push(format!("NVIDIA {}", name)); }
          }
          // Try lspci for Intel/AMD
          if let Ok(out) = exec_output_limit("lspci", &[], CMD_TIMEOUT_SHORT).await {
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
            match exec_output_limit("systemctl", &["is-active", unit], CMD_TIMEOUT_SHORT).await {
              Ok(out) => json!({ "ok": true, "result": out.trim() }),
              Err(_) => json!({ "ok": true, "result": "unknown" }),
            }
          }
        }
        _ => json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_NOT_ALLOWED] command not allowed" }),
      }
    },
    "dh:docker:create" => {
      let image = body.get("image").and_then(|v| v.as_str()).unwrap_or_default();
      let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
      if image.is_empty() || name.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] Missing image or name." })
      } else {
        let mut args = vec!["create".to_string(), "--name".to_string(), name.to_string()];
        let network_mode = body.get("networkMode").and_then(|v| v.as_str()).unwrap_or("bridge");
        if !network_mode.trim().is_empty() {
          args.push("--network".to_string());
          args.push(network_mode.trim().to_string());
        }
        if let Some(ports) = body.get("ports").and_then(|v| v.as_array()) {
          for p in ports {
            let host = p.get("hostPort").and_then(|v| v.as_u64()).unwrap_or(0);
            let ctr = p.get("containerPort").and_then(|v| v.as_u64()).unwrap_or(0);
            let proto = p.get("protocol").and_then(|v| v.as_str()).unwrap_or("tcp");
            args.push("-p".to_string());
            args.push(format!("{}:{}/{}", host, ctr, proto));
          }
        }
        if let Some(envs) = body.get("env").and_then(|v| v.as_array()) {
          for e in envs {
            if let Some(s) = e.as_str() {
              args.push("-e".to_string());
              args.push(s.to_string());
            }
          }
        }
        if let Some(vols) = body.get("volumes").and_then(|v| v.as_array()) {
          for v in vols {
            let hp = v.get("hostPath").and_then(|v| v.as_str()).unwrap_or_default();
            let cp = v.get("containerPath").and_then(|v| v.as_str()).unwrap_or_default();
            if !hp.is_empty() && !cp.is_empty() {
              args.push("-v".to_string());
              args.push(format!("{}:{}", hp, cp));
            }
          }
        }
        args.push(image.to_string());
        if let Some(cmd_str) = body.get("command").and_then(|v| v.as_str()) {
          if !cmd_str.is_empty() {
            args.push(cmd_str.to_string());
          }
        } else if image.to_lowercase().contains("bash") {
          // UX default: keep utility bash containers running without requiring manual terminal input.
          args.push("sh".to_string());
          args.push("-c".to_string());
          args.push("while true; do sleep 3600; done".to_string());
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        match exec_output("docker", &refs).await {
          Ok(out) => {
            let id = out.trim().to_string();
            if id.is_empty() {
              return Ok(json!({ "ok": false, "error": "[DOCKER_CREATE_FAILED] docker create returned empty id.", "id": "" }));
            }
            let auto_start = body.get("autoStart").and_then(|v| v.as_bool()).unwrap_or(true);
            if auto_start {
              let _ = exec_output("docker", &["start", &id]).await;
            }
            json!({ "ok": true, "id": id })
          }
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_CREATE_FAILED] {}", e.trim()), "id": "" }),
        }
      }
    },
    "dh:docker:remap-port" => docker_remap_port_invoke(&body).await,
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
        CMD_TIMEOUT_SSH,
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
          exec_sshpass_ssh(password, &port_str, &remote, &setup_cmd, CMD_TIMEOUT_SSH).await
        } else {
          exec_result_limit(
            "ssh",
            &["-o", "StrictHostKeyChecking=no", "-p", &port_str, &remote, &setup_cmd],
            CMD_TIMEOUT_SSH,
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
      // CMD_TIMEOUT_LONG gives the user enough time to interact with the polkit dialog
      let result = exec_output_limit("pkexec", &[&script_str], CMD_TIMEOUT_LONG).await;
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
    "dh:docker:install" => docker_install_invoke(&body).await,
    _ => json!({ "ok": false, "error": format!("[UNKNOWN_CHANNEL] {}", channel) }),
  };
  Ok(res)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![ipc_invoke, ipc_send])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
