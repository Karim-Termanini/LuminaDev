use std::time::Duration;
use tokio::process::Command;

/// Default wall-clock bound for host `exec_output` / `exec_result` (prevents hung IPC).
pub(crate) const CMD_TIMEOUT_DEFAULT: Duration = Duration::from_secs(180);
/// Short probe (sudo -n, quick shell checks, `ssh -T` smoke test).
pub(crate) const CMD_TIMEOUT_SHORT: Duration = Duration::from_secs(30);
/// Remote SSH ops (list dir, key install) — network-bound.
pub(crate) const CMD_TIMEOUT_SSH: Duration = Duration::from_secs(120);
/// `git clone`, `docker pull`, `docker compose` (in-profile dir), and similar long host work.
pub(crate) const CMD_TIMEOUT_LONG: Duration = Duration::from_secs(900);
/// Single `sudo bash -c` step during Docker engine install.
pub(crate) const CMD_TIMEOUT_INSTALL_STEP: Duration = Duration::from_secs(900);

fn running_in_flatpak() -> bool {
  std::env::var("FLATPAK_ID")
    .map(|v| !v.trim().is_empty())
    .unwrap_or(false)
}

fn host_command(cmd: &str, args: &[&str]) -> Command {
  let mut command = if running_in_flatpak() && cmd != "flatpak-spawn" {
    let mut wrapped = Command::new("flatpak-spawn");
    wrapped.arg("--host").arg(cmd);
    wrapped
  } else {
    Command::new(cmd)
  };
  command.args(args);
  command
}

pub(crate) async fn exec_output_limit(cmd: &str, args: &[&str], limit: Duration) -> Result<String, String> {
  let fut = async {
    let output = host_command(cmd, args)
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
    Err(_) => Err(format!("[HOST_COMMAND_TIMEOUT] {} {}", cmd, args.join(" "))),
  }
}

pub(crate) async fn exec_output(cmd: &str, args: &[&str]) -> Result<String, String> {
  exec_output_limit(cmd, args, CMD_TIMEOUT_DEFAULT).await
}

pub(crate) async fn exec_result_limit(
  cmd: &str,
  args: &[&str],
  limit: Duration,
) -> Result<(String, String), String> {
  let fut = async {
    let output = host_command(cmd, args)
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
    Err(_) => Err(format!("[HOST_COMMAND_TIMEOUT] {} {}", cmd, args.join(" "))),
  }
}

pub(crate) async fn exec_result(cmd: &str, args: &[&str]) -> Result<(String, String), String> {
  exec_result_limit(cmd, args, CMD_TIMEOUT_DEFAULT).await
}

/// Like `exec_output_limit` but injects additional environment variables.
/// In Flatpak sessions, env vars are passed via `flatpak-spawn --env=K=V` args.
pub(crate) async fn exec_output_with_env(
    cmd: &str,
    args: &[&str],
    env: &[(&str, &str)],
    limit: Duration,
) -> Result<String, String> {
    let env_owned: Vec<(String, String)> =
        env.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let cmd_owned = cmd.to_string();
    let fut = async move {
        let mut command = if running_in_flatpak() && cmd_owned != "flatpak-spawn" {
            let mut wrapped = Command::new("flatpak-spawn");
            wrapped.arg("--host");
            for (k, v) in &env_owned {
                wrapped.arg(format!("--env={}={}", k, v));
            }
            wrapped.arg(&cmd_owned);
            wrapped
        } else {
            let mut c = Command::new(&cmd_owned);
            for (k, v) in &env_owned {
                c.env(k, v);
            }
            c
        };
        command.args(&args_owned);
        let output = command
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
        Err(_) => Err(format!("[HOST_COMMAND_TIMEOUT] {} {}", cmd, args.join(" "))),
    }
}

pub(crate) async fn read_proc_text(path: &str) -> String {
  if let Ok(text) = std::fs::read_to_string(path) {
    if !text.trim().is_empty() {
      return text;
    }
  }
  if running_in_flatpak() {
    return exec_output_limit("cat", &[path], CMD_TIMEOUT_SHORT)
      .await
      .unwrap_or_default();
  }
  String::new()
}
