use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

struct TerminalSession {
  stdin: ChildStdin,
  /// Best-effort host PID for `terminal:close` (Unix: `libc::kill`).
  pid: Option<u32>,
}

#[derive(Default)]
struct AppState {
  terminals: Mutex<HashMap<String, TerminalSession>>,
  jobs: Mutex<Vec<Value>>,
}

#[cfg(unix)]
fn kill_pid_best_effort(pid: u32) {
  if pid == 0 {
    return;
  }
  unsafe {
    libc::kill(pid as libc::pid_t, libc::SIGTERM);
  }
}

#[cfg(not(unix))]
fn kill_pid_best_effort(_pid: u32) {}

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
      .arg("-o")
      .arg("StrictHostKeyChecking=no")
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
      "dnf -y install dnf-plugins-core && dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo".into(),
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

async fn sudo_bash_install_step(cmd: &str, password: Option<&str>, logs: &mut Vec<String>) -> Result<(), String> {
  logs.push(format!("RUNNING: {}", cmd));
  let mut child = Command::new("sudo")
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
    .map_err(|e| format!("[DOCKER_INSTALL_FAILED] {}", e))?;

  if let Some(pw) = password {
    if !pw.is_empty() {
      use tokio::io::AsyncWriteExt;
      if let Some(mut stdin) = child.stdin.take() {
        stdin
          .write_all(format!("{pw}\n").as_bytes())
          .await
          .map_err(|e| format!("[DOCKER_INSTALL_FAILED] {}", e))?;
        let _ = stdin.shutdown().await;
      }
    }
  } else {
    drop(child.stdin.take());
  }

  let out = match tokio::time::timeout(CMD_TIMEOUT_INSTALL_STEP, child.wait_with_output()).await {
    Ok(Ok(o)) => o,
    Ok(Err(e)) => return Err(format!("[DOCKER_INSTALL_FAILED] {}", e)),
    Err(_) => {
      return Err(
        "[HOST_COMMAND_TIMEOUT] sudo install step exceeded wall clock (check for orphaned apt/dnf/pacman on host)"
          .to_string(),
      );
    }
  };
  let stdout = String::from_utf8_lossy(&out.stdout);
  let stderr = String::from_utf8_lossy(&out.stderr);
  for line in stdout.lines() {
    if !line.is_empty() {
      logs.push(format!("OUT: {line}"));
    }
  }
  for line in stderr.lines() {
    if line.contains("[sudo] password") {
      continue;
    }
    if !line.trim().is_empty() {
      logs.push(format!("ERR: {line}"));
    }
  }
  if out.status.success() {
    Ok(())
  } else {
    Err(format!(
      "[DOCKER_INSTALL_FAILED] command exited with status {}",
      out.status
    ))
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
    ("node", "apt") => vec!["nodejs", "npm"],
    ("node", "dnf") => vec!["nodejs", "npm"],
    ("node", "pacman") => vec!["nodejs", "npm"],
    ("node", "zypper") => vec!["nodejs", "npm"],
    ("python", "apt") => vec!["python3", "python3-pip"],
    ("python", "dnf") => vec!["python3", "python3-pip"],
    ("python", "pacman") => vec!["python", "python-pip"],
    ("python", "zypper") => vec!["python3", "python3-pip"],
    ("go", "apt") => vec!["golang"],
    ("go", "dnf") => vec!["golang"],
    ("go", "pacman") => vec!["go"],
    ("go", "zypper") => vec!["go"],
    ("java", "apt") => vec!["default-jdk"],
    ("java", "dnf") => vec!["java-latest-openjdk-devel"],
    ("java", "pacman") => vec!["jdk-openjdk"],
    ("java", "zypper") => vec!["java-21-openjdk-devel"],
    _ => vec![],  // rust: always via rustup; unknown: empty
  }
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
) {
  let mut logs: Vec<String> = vec![format!("job={} runtime={} method={}", kind, runtime_id, method)];
  let mut final_state = "done";

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
    let result: Result<(), String> = match kind.as_str() {
      "runtime_install" | "install_deps" => {
        if runtime_id == "rust" {
          let tc = if version.is_empty() { "stable" } else { version.trim() };
          let cmd = format!("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain {}", tc);
          logs.push(format!("Running: {}", cmd));
          exec_output_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e.trim()))
        } else if runtime_id == "node" && method == "local" {
          let v = if version.is_empty() { "lts/*" } else { version.trim() };
          let cmd = format!(
            "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash \
             && export NVM_DIR=\"$HOME/.nvm\" \
             && [ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\" \
             && nvm install {}", v
          );
          logs.push(format!("Running nvm install {}", v));
          exec_output_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e.trim()))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if pkgs.is_empty() {
            logs.push(format!("No system packages known for '{}' on {}. Try local/rustup method.", runtime_id, distro));
            Ok(())
          } else {
            let cmd = {
              let p: Vec<&str> = pkgs.clone();
              match pkg_mgr {
                "apt" => format!("DEBIAN_FRONTEND=noninteractive apt-get install -y {}", p.join(" ")),
                "dnf" => format!("dnf install -y {}", p.join(" ")),
                "pacman" => format!("pacman -S --needed --noconfirm {}", p.join(" ")),
                "zypper" => format!("zypper install -y {}", p.join(" ")),
                _ => format!("apt-get install -y {}", p.join(" ")),
              }
            };
            sudo_bash_install_step(&cmd, None, &mut logs).await
              .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e))
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
            sudo_bash_install_step(&cmd, None, &mut logs).await
              .map_err(|e| format!("[RUNTIME_UPDATE_FAILED] {}", e))
          }
        }
      }
      "runtime_uninstall" => {
        if runtime_id == "rust" {
          exec_output_limit("bash", &["-lc", "rustup self uninstall -y 2>/dev/null || true"], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if pkgs.is_empty() {
            logs.push(format!("No system packages to remove for '{}' on {}.", runtime_id, distro));
            Ok(())
          } else {
            let cmd = pkg_remove_cmd(pkg_mgr, &pkgs);
            sudo_bash_install_step(&cmd, None, &mut logs).await
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
    }
  }

  let st = app.state::<AppState>();
  let mut jobs = st.jobs.lock().await;
  if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str())) {
    j["state"] = json!(final_state);
    j["progress"] = json!(if final_state == "done" { 100 } else { 0 });
    j["logTail"] = json!(logs);
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
  let password = body.get("password").and_then(|v| v.as_str());
  let pw_nonempty = password.map(|p| !p.is_empty()).unwrap_or(false);
  if !pw_nonempty && !sudo_passwordless_ok().await {
    return json!({
      "ok": false,
      "log": Vec::<String>::new(),
      "error": "[DOCKER_INSTALL_FAILED] sudo needs a password or passwordless sudo. Enter the sudo password in the installer UI, or configure NOPASSWD for this user."
    });
  }

  let components = body.get("components").and_then(|v| v.as_array());
  let Some(steps) = docker_install_build_steps(distro, components) else {
    return json!({ "ok": false, "log": Vec::<String>::new(), "error": "[DOCKER_INVALID_REQUEST] Unsupported distro." });
  };

  let mut logs: Vec<String> = Vec::new();
  for cmd in steps {
    match sudo_bash_install_step(&cmd, password, &mut logs).await {
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
  if id.is_empty() || old_hp == 0 || new_hp == 0 || old_hp == new_hp {
    return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] id and two distinct host ports (1-65535) are required." });
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
      let mut map = state.terminals.lock().await;
      if let Some(session) = map.get_mut(&id) {
        session.stdin.write_all(data.as_bytes()).await.map_err(|e| format!("[TERMINAL_WRITE_FAILED] {}", e))?;
      }
      Ok(())
    },
    "dh:terminal:close" => {
      let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let mut map = state.terminals.lock().await;
      if let Some(session) = map.remove(&id) {
        if let Some(pid) = session.pid {
          kill_pid_best_effort(pid);
        }
        drop(session.stdin);
      }
      Ok(())
    },
    "dh:terminal:resize" => Ok(()),
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
    "dh:session:info" => json!({ "ok": true, "mode": "tauri", "platform": std::env::consts::OS }),
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
        json!({ "ok": true, "layout": if layout == json!({}) { json!({ "widgets": [] }) } else { layout } })
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
    "dh:perf:snapshot" => json!({
      "ok": true,
      "snapshot": {
        "startupMs": 0,
        "rssMb": 0,
        "heapUsedMb": 0,
        "heapTotalMb": 0,
        "uptimeSec": 0
      }
    }),
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
    "dh:docker:list" => match exec_output("docker", &["ps", "-a", "--format", "{{json .}}"]).await {
      Ok(out) => {
        let rows: Vec<Value> = out
          .lines()
          .filter_map(|line| serde_json::from_str::<Value>(line).ok())
          .map(|v| {
            json!({
              "id": v.get("ID").and_then(|x| x.as_str()).unwrap_or_default(),
              "name": v.get("Names").and_then(|x| x.as_str()).unwrap_or_default(),
              "image": v.get("Image").and_then(|x| x.as_str()).unwrap_or_default(),
              "imageId": "",
              "state": v.get("State").and_then(|x| x.as_str()).unwrap_or("unknown"),
              "status": v.get("Status").and_then(|x| x.as_str()).unwrap_or("unknown"),
              "ports": v.get("Ports").and_then(|x| x.as_str()).filter(|x| !x.is_empty()).unwrap_or("—"),
              "networks": [],
              "volumes": []
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
          "remove" => vec!["rm", "-f", id],
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
          Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
          Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_LOGS_FAILED] {}", e.trim()) }),
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
              "createdAt": 0
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
      let cmd = body.get("cmd").and_then(|v| v.as_str()).unwrap_or("bash").to_string();
      let args: Vec<String> = body
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_else(|| vec!["-i".to_string()]);
      let _ = (cols, rows);
      match Command::new(cmd).args(args).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).spawn() {
        Ok(mut child) => {
          let id = Uuid::new_v4().to_string();
          let pid = child.id();
          if let Some(stdin) = child.stdin.take() {
            state.terminals.lock().await.insert(id.clone(), TerminalSession { stdin, pid });
          }
          if let Some(stdout) = child.stdout.take() {
            let app_out = app.clone();
            let id_out = id.clone();
            tauri::async_runtime::spawn(async move {
              let mut lines = BufReader::new(stdout).lines();
              while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_out.emit("dh:terminal:data", json!({ "id": id_out, "data": format!("{}\n", line) }));
              }
            });
          }
          let app_exit = app.clone();
          let id_exit = id.clone();
          tauri::async_runtime::spawn(async move {
            let _ = child.wait().await;
            app_exit.state::<AppState>().terminals.lock().await.remove(&id_exit);
            let _ = app_exit.emit("dh:terminal:exit", json!({ "id": id_exit }));
          });
          json!({ "ok": true, "id": id })
        }
        Err(e) => json!({ "ok": false, "error": format!("[TERMINAL_CREATE_FAILED] {}", e) }),
      }
    }
    "dh:docker:terminal" => {
      let container_id = body.get("containerId").and_then(|v| v.as_str()).unwrap_or_default();
      if container_id.is_empty() {
        json!({ "ok": false, "error": "[DOCKER_TERMINAL_FAILED] Missing containerId." })
      } else {
        let args = vec!["exec".to_string(), "-i".to_string(), container_id.to_string(), "sh".to_string()];
        match Command::new("docker")
          .args(args)
          .stdin(std::process::Stdio::piped())
          .stdout(std::process::Stdio::piped())
          .stderr(std::process::Stdio::piped())
          .spawn()
        {
          Ok(mut child) => {
            let id = Uuid::new_v4().to_string();
            let pid = child.id();
            if let Some(stdin) = child.stdin.take() {
              state.terminals.lock().await.insert(id.clone(), TerminalSession { stdin, pid });
            }
            if let Some(stdout) = child.stdout.take() {
              let app_out = app.clone();
              let id_out = id.clone();
              tauri::async_runtime::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                  let _ = app_out.emit("dh:terminal:data", json!({ "id": id_out, "data": format!("{}\n", line) }));
                }
              });
            }
            let app_exit = app.clone();
            let id_exit = id.clone();
            tauri::async_runtime::spawn(async move {
              let _ = child.wait().await;
              app_exit.state::<AppState>().terminals.lock().await.remove(&id_exit);
              let _ = app_exit.emit("dh:terminal:exit", json!({ "id": id_exit }));
            });
            json!({ "ok": true, "id": id })
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
      {
        let mut jobs = state.jobs.lock().await;
        jobs.push(json!({
          "id": id,
          "kind": kind,
          "state": "running",
          "progress": 5,
          "logTail": [format!("Starting {} for {}…", kind, runtime_id)]
        }));
      }
      let jid = id.clone();
      let app2 = app.clone();
      tauri::async_runtime::spawn(async move {
        runtime_job_execute(app2, jid, kind, runtime_id, method, version, remove_mode).await;
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
        Err(_) => json!({ "ok": false, "pub": "", "fingerprint": "", "error": "[SSH_KEY_NOT_FOUND] Missing public key." }),
      }
    }
    "dh:ssh:test:github" => match exec_result_limit("ssh", &["-T", "git@github.com"], CMD_TIMEOUT_DEFAULT).await {
      Ok((stdout, stderr)) => json!({ "ok": true, "output": format!("{}{}", stdout, stderr), "code": 0 }),
      Err(e) => json!({ "ok": true, "output": e, "code": 1 }),
    },
    "dh:runtime:status" => {
      let checks = [
        ("node", "Node.js", "node --version"),
        ("python", "Python", "python3 --version"),
        ("java", "Java", "java -version"),
        ("go", "Go", "go version"),
        ("rust", "Rust", "rustc --version"),
      ];
      let mut runtimes: Vec<Value> = Vec::new();
      for (id, name, check) in checks {
        let parts: Vec<&str> = check.split_whitespace().collect();
        let cmd = parts[0];
        let args = &parts[1..];
        match exec_result_limit(cmd, args, CMD_TIMEOUT_SHORT).await {
          Ok((stdout, stderr)) => {
            let version = format!("{}{}", stdout, stderr).trim().to_string();
            runtimes.push(json!({ "id": id, "name": name, "installed": true, "version": version }));
          }
          Err(_) => {
            runtimes.push(json!({ "id": id, "name": name, "installed": false }));
          }
        }
      }
      json!({ "ok": true, "runtimes": runtimes })
    },
    "dh:runtime:get-versions" => json!({ "ok": true, "versions": [] }),
    "dh:runtime:check-deps" => {
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or("node");
      let tools: &[(&str, &str)] = match runtime_id {
        "node"   => &[("node", "node --version"), ("npm", "npm --version"), ("curl", "curl --version")],
        "python" => &[("python3", "python3 --version"), ("pip3", "pip3 --version")],
        "go"     => &[("go", "go version")],
        "rust"   => &[("cargo", "cargo --version"), ("rustup", "rustup --version")],
        "java"   => &[("java", "java -version"), ("javac", "javac -version")],
        _        => &[],
      };
      let mut deps: Vec<Value> = Vec::new();
      for (name, check_cmd) in tools {
        let parts: Vec<&str> = check_cmd.split_whitespace().collect();
        let ok = exec_result_limit(parts[0], &parts[1..], CMD_TIMEOUT_SHORT).await.is_ok();
        deps.push(json!({ "name": name, "status": if ok { "installed" } else { "missing" }, "ok": ok }));
      }
      json!({ "ok": true, "dependencies": deps })
    },
    "dh:runtime:uninstall:preview" => {
      let runtime_id = body.get("runtimeId").and_then(|v| v.as_str()).unwrap_or("node");
      let remove_mode = body.get("removeMode").and_then(|v| v.as_str()).unwrap_or("runtime_only");
      let distro = exec_output("bash", &["-lc", "source /etc/os-release 2>/dev/null && printf '%s' \"${ID:-unknown}\""])
        .await.unwrap_or_else(|_| "unknown".to_string());
      let distro = distro.trim().to_string();
      let pkg_mgr = runtime_pkg_mgr(&distro);
      let pkgs = runtime_system_packages(runtime_id, pkg_mgr);
      let pkg_vals: Vec<Value> = pkgs.iter().map(|p| json!(p)).collect();
      let note: Option<&str> = if pkgs.is_empty() {
        Some("No system packages found. If installed via version manager (nvm/rustup/pyenv), remove manually.")
      } else if runtime_id == "rust" {
        Some("Rust is managed by rustup; uninstall via 'rustup self uninstall'.")
      } else {
        None
      };
      let removable = if remove_mode == "runtime_and_deps" { pkg_vals.clone() } else { vec![] };
      json!({
        "ok": true,
        "distro": distro,
        "runtimePackages": pkg_vals,
        "removableDeps": removable,
        "blockedSharedDeps": [],
        "finalPackages": pkg_vals,
        "note": note
      })
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
      json!({
        "ok": true,
        "info": {
          "hostname": hostname.trim(),
          "os": os_name.trim(),
          "kernel": kernel.trim(),
          "arch": arch.trim(),
          "uptime": uptime
        }
      })
    },
    "dh:host:ports" => {
      let script = "ss -tulpnH 2>/dev/null | awk '{print $1\" \"$5\" \"$NF}'";
      match exec_output_limit("sh", &["-c", script], CMD_TIMEOUT_SHORT).await {
        Ok(out) => {
          let ports: Vec<Value> = out
            .lines()
            .filter_map(|line| {
              let parts: Vec<&str> = line.split_whitespace().collect();
              if parts.len() < 2 {
                return None;
              }
              let protocol = if parts[0].starts_with("udp") { "udp" } else { "tcp" };
              let port = parts[1]
                .split(':')
                .last()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(0);
              Some(json!({
                "protocol": protocol,
                "port": port,
                "state": "LISTEN",
                "service": parts.get(2).copied().unwrap_or("")
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
    "dh:monitor:security" => json!({
      "ok": true,
      "snapshot": {
        "firewall": "unknown",
        "selinux": "unknown",
        "sshPermitRootLogin": "unknown",
        "sshPasswordAuth": "unknown",
        "failedAuth24h": 0,
        "riskyOpenPorts": []
      }
    }),
    "dh:monitor:security-drilldown" => json!({
      "ok": true,
      "drilldown": { "failedAuthSamples": [], "riskyPortOwners": [] }
    }),
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
      let load1 = load_parts.first().copied().unwrap_or(0.0);
      let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
      let cpu_model = cpuinfo.lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.splitn(2, ':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
      let num_cpus = cpuinfo.lines().filter(|l| l.starts_with("processor")).count().max(1) as f64;
      let cpu_percent = (load1 / num_cpus * 100.0).min(100.0);
      let disk_out = exec_output("df", &["-k", "/"]).await.unwrap_or_default();
      let (disk_total_gb, disk_free_gb) = disk_out.lines().nth(1)
        .and_then(|l| {
          let p: Vec<&str> = l.split_whitespace().collect();
          let total = p.get(1).and_then(|v| v.parse::<u64>().ok())?;
          let free = p.get(3).and_then(|v| v.parse::<u64>().ok())?;
          Some((total / 1024 / 1024, free / 1024 / 1024))
        }).unwrap_or((0, 0));
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
          "diskReadMbps": 0.0,
          "diskWriteMbps": 0.0,
          "netRxMbps": 0.0,
          "netTxMbps": 0.0
        },
        "systemd": systemd
      })
    },
    "dh:host:exec" => {
      let cmd = body.get("command").and_then(|v| v.as_str()).unwrap_or_default();
      match cmd {
        "nvidia_smi_short" => {
          match exec_output_limit("nvidia-smi", &["--query-gpu=name", "--format=csv,noheader"], CMD_TIMEOUT_SHORT).await {
            Ok(out) => json!({ "ok": true, "result": out.trim() }),
            Err(_) => json!({ "ok": true, "result": "GPU: unavailable" }),
          }
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
          if !cmd_str.is_empty() { args.push(cmd_str.to_string()); }
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
      let ls_cmd = format!("ls -1 '{}'", remote_path.replace('\'', r"'\''"));
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
        let setup_cmd = format!(
          "mkdir -p ~/.ssh && chmod 700 ~/.ssh && printf '%s\\n' '{}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys",
          safe_key
        );
        let result = if !password.is_empty() {
          exec_sshpass_ssh(password, &port_str, &remote, &setup_cmd, CMD_TIMEOUT_LONG).await
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
