use std::collections::HashMap;
use std::path::Path;

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::host_exec::{
    cmd_timeout_long, cmd_timeout_short, cmd_timeout_ssh, exec_output, exec_output_limit,
    exec_result_limit, exec_sshpass_ssh, get_global_ipc_timeout, read_proc_text,
};
use crate::state::{AppState, START_TIME};
use crate::utils::{
    app_file, find_free_port, is_physical_disk_name, now_ms, read_json, shell_quote_value,
    ss_process_from_line, truncate_probe_output, write_json,
};

// ---------------------------------------------------------------------------
// App & Session info
// ---------------------------------------------------------------------------

pub(crate) fn app_info() -> Value {
    json!({
      "ok": true,
      "version": env!("CARGO_PKG_VERSION"),
      "buildDate": env!("BUILD_DATE"),
      "rustVersion": env!("RUSTC_VERSION"),
      "platform": std::env::consts::OS,
    })
}

pub(crate) fn session_info() -> Value {
    json!({
      "ok": true,
      "mode": "tauri",
      "kind": "native",
      "platform": std::env::consts::OS,
      "summary": format!("Tauri/native ({})", std::env::consts::OS)
    })
}

// ---------------------------------------------------------------------------
// Host info
// ---------------------------------------------------------------------------

pub(crate) fn host_distro() -> Value {
    let distro = std::fs::read_to_string("/etc/os-release")
        .unwrap_or_default()
        .lines()
        .find(|l| l.starts_with("ID="))
        .map(|l| l.trim_start_matches("ID=").trim_matches('"').to_string())
        .unwrap_or_else(|| "linux".to_string());
    json!(distro)
}

pub(crate) async fn host_sysinfo() -> Value {
    let hostname = exec_output("hostname", &[])
        .await
        .unwrap_or_else(|_| "unknown".to_string());
    let kernel = exec_output("uname", &["-r"])
        .await
        .unwrap_or_else(|_| "unknown".to_string());
    let arch = exec_output("uname", &["-m"])
        .await
        .unwrap_or_else(|_| "unknown".to_string());
    let os_name = exec_output("uname", &["-s"])
        .await
        .unwrap_or_else(|_| "Linux".to_string());
    let uptime_str = read_proc_text("/proc/uptime").await;
    let uptime = uptime_str
        .split_whitespace()
        .next()
        .and_then(|v| v.split('.').next())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let os_release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
    let distro = os_release
        .lines()
        .find(|l| l.starts_with("PRETTY_NAME="))
        .and_then(|l| l.split_once('=').map(|x| x.1))
        .map(|v| v.trim_matches('"').to_string())
        .unwrap_or_else(|| os_name.trim().to_string());
    let ip = exec_output_limit(
        "sh",
        &["-c", "hostname -I 2>/dev/null | awk '{print $1}'"],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "unknown".to_string());
    let shell_name = Path::new(shell.trim())
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| shell.trim().to_string());
    let de = std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("DESKTOP_SESSION"))
        .unwrap_or_else(|_| "unknown".to_string());
    let wm = std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string());
    let gpu = exec_output_limit("sh", &["-c",
    "nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || lspci 2>/dev/null | grep -i 'vga\\|3d\\|display' | head -1 | sed 's/.*: //' || echo 'unknown'"
  ], cmd_timeout_short()).await.unwrap_or_else(|_| "unknown".to_string());
    let meminfo = read_proc_text("/proc/meminfo").await;
    let mem_total_kb: u64 = meminfo
        .lines()
        .find(|l| l.starts_with("MemTotal:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let mem_total_gb = mem_total_kb / 1024 / 1024;
    let packages = exec_output_limit("sh", &["-c",
    "if command -v rpm >/dev/null 2>&1; then rpm -qa 2>/dev/null | wc -l; \
     elif command -v dpkg >/dev/null 2>&1; then dpkg -l 2>/dev/null | awk '/^ii/{c++}END{print c+0}'; \
     elif command -v pacman >/dev/null 2>&1; then pacman -Q 2>/dev/null | wc -l; \
     else echo 0; fi"
  ], cmd_timeout_short()).await.unwrap_or_else(|_| "0".to_string());
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
        "memoryUsage": format!("{} GB", mem_total_gb),
        "packages": packages.trim(),
        "resolution": resolution.trim()
      }
    })
}

pub(crate) async fn host_ports() -> Value {
    let mut docker_port_owner: HashMap<String, String> = HashMap::new();
    if let Ok(docker_out) = exec_output_limit(
        "docker",
        &["ps", "--format", "{{.Names}}\t{{.Ports}}"],
        cmd_timeout_short(),
    )
    .await
    {
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
                    let proto = if right.trim().ends_with("/udp") {
                        "udp"
                    } else {
                        "tcp"
                    };
                    if let Some(port) = host_port {
                        docker_port_owner
                            .insert(format!("{}:{}", proto, port), format!("docker:{}", name));
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
                    let protocol = if parts[0].starts_with("udp") {
                        "udp"
                    } else {
                        "tcp"
                    };
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
                        if let Some(owner) =
                            docker_port_owner.get(&format!("{}:{}", protocol, port))
                        {
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
        Err(e) => {
            json!({ "ok": false, "ports": [], "error": format!("[HOST_PORTS_FAILED] {}", e.trim()) })
        }
    }
}

// ---------------------------------------------------------------------------
// Editor discovery & launch
// ---------------------------------------------------------------------------

pub(crate) async fn editor_list() -> Value {
    let cmd = r#"
    editors="["
    check_native() {
       if command -v "$2" >/dev/null 2>&1; then
         if [ "$editors" != "[" ]; then editors="$editors,"; fi
         editors="$editors{\"name\":\"$1\",\"cmd\":\"$2\"}"
       fi
    }
    check_native "VS Code" "code"
    check_native "Cursor" "cursor"
    check_native "Neovim" "nvim"
    check_native "IntelliJ IDEA" "idea"
    check_native "WebStorm" "webstorm"
    check_native "Eclipse" "eclipse"
    check_native "Antigravity" "antigravity"
    editors="$editors]"
    echo "$editors"
  "#;
    let output = exec_output("bash", &["-c", cmd])
        .await
        .unwrap_or_else(|_| "[]".to_string());
    let parsed: Value = serde_json::from_str(&output).unwrap_or(json!([]));
    json!({ "ok": true, "editors": parsed })
}

pub(crate) async fn editor_open(_app: &AppHandle, body: &Value) -> Value {
    let path_raw = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let cmd = body.get("cmd").and_then(|v| v.as_str()).unwrap_or("code");
    if path_raw.is_empty() {
        return json!({ "ok": false, "error": "[EDITOR_OPEN_FAILED] Missing path." });
    }
    let path = if path_raw.starts_with("~/") {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        path_raw.replacen("~/", &format!("{}/", home), 1)
    } else {
        path_raw.to_string()
    };

    // Ensure the directory exists before opening the IDE.
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

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

pub(crate) async fn diagnostics_bundle_create(app: &AppHandle, body: &Value) -> Value {
    let include_sensitive = body
        .get("includeSensitive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let report = body.get("report").cloned().unwrap_or_else(|| json!({}));
    match app_file(app, &format!("diag-{}.json", now_ms())) {
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
}

// ---------------------------------------------------------------------------
// Host exec (dh:host:exec) — multi-command dispatcher
// ---------------------------------------------------------------------------

pub(crate) async fn host_exec_handler(body: &Value) -> Value {
    let cmd = body
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    match cmd {
        "nvidia_smi_short" => host_exec_nvidia_smi().await,
        "systemctl_is_active" => host_exec_systemctl_is_active(body).await,
        "systemctl_start" => host_exec_systemctl_start(body).await,
        "systemctl_stop" => host_exec_systemctl_stop(body).await,
        "systemctl_is_active_fallback" => host_exec_systemctl_is_active_fallback(body).await,
        "maintenance_docker_system_df" => host_exec_docker_system_df().await,
        "maintenance_docker_ps_table" => host_exec_docker_ps_table().await,
        "maintenance_journalctl_docker" => host_exec_journalctl_docker().await,
        "maintenance_du_cache_tail" => host_exec_du_cache_tail().await,
        "settings_read_hosts" => host_exec_read_hosts().await,
        "settings_process_env" => host_exec_process_env(),
        "settings_write_hosts" => host_exec_write_hosts(body).await,
        "settings_read_profile_env" => host_exec_read_profile_env().await,
        "settings_write_profile_env" => host_exec_write_profile_env(body).await,
        _ => {
            json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_NOT_ALLOWED] command not allowed" })
        }
    }
}

async fn host_exec_nvidia_smi() -> Value {
    let mut gpus = Vec::new();
    if let Ok(out) = exec_output_limit(
        "nvidia-smi",
        &["--query-gpu=name", "--format=csv,noheader"],
        cmd_timeout_short(),
    )
    .await
    {
        let name = out.trim().to_string();
        if !name.is_empty() {
            gpus.push(format!("NVIDIA {}", name));
        }
    }
    if let Ok(out) = exec_output_limit("lspci", &[], cmd_timeout_short()).await {
        for line in out.lines() {
            if line.contains("VGA compatible controller") || line.contains("3D controller") {
                if line.contains("Intel") {
                    gpus.push("Intel Graphics".into());
                } else if line.contains("AMD") || line.contains("ATI") {
                    gpus.push("AMD Radeon".into());
                }
            }
        }
    }
    let result = if gpus.is_empty() {
        "GPU: unavailable".to_string()
    } else {
        gpus.join(", ")
    };
    json!({ "ok": true, "result": result })
}

async fn host_exec_systemctl_is_active(body: &Value) -> Value {
    let unit = body
        .get("unit")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if unit.is_empty() {
        return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing unit." });
    }
    match exec_output_limit("systemctl", &["is-active", unit], cmd_timeout_short()).await {
        Ok(out) => json!({ "ok": true, "result": out.trim() }),
        Err(_) => json!({ "ok": true, "result": "unknown" }),
    }
}

async fn host_exec_systemctl_start(body: &Value) -> Value {
    let unit = body.get("unit").and_then(|v| v.as_str()).unwrap_or_default();
    let user_mode = body.get("user").and_then(|v| v.as_bool()).unwrap_or(false);
    if unit.is_empty() {
        return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing unit." });
    }
    let (cmd, args): (&str, Vec<&str>) = if user_mode {
        ("systemctl", vec!["--user", "start", unit])
    } else {
        ("pkexec", vec!["systemctl", "start", unit])
    };
    match exec_output_limit(cmd, &args, cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true, "result": "started" }),
        Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[SYSTEMCTL_START_FAILED] {}", e) }),
    }
}

async fn host_exec_systemctl_stop(body: &Value) -> Value {
    let unit = body.get("unit").and_then(|v| v.as_str()).unwrap_or_default();
    let user_mode = body.get("user").and_then(|v| v.as_bool()).unwrap_or(false);
    if unit.is_empty() {
        return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing unit." });
    }
    let (cmd, args): (&str, Vec<&str>) = if user_mode {
        ("systemctl", vec!["--user", "stop", unit])
    } else {
        ("pkexec", vec!["systemctl", "stop", unit])
    };
    match exec_output_limit(cmd, &args, cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true, "result": "stopped" }),
        Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[SYSTEMCTL_STOP_FAILED] {}", e) }),
    }
}

async fn host_exec_systemctl_is_active_fallback(body: &Value) -> Value {
    let units_val = body.get("units").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let units: Vec<String> = units_val.iter().filter_map(|v| v.as_str().map(String::from)).collect();
    if units.is_empty() {
        return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing units array." });
    }
    for unit in &units {
        match exec_output_limit("systemctl", &["is-active", unit.as_str()], cmd_timeout_short()).await {
            Ok(out) => {
                let status = out.trim();
                if matches!(status, "active" | "failed" | "inactive") {
                    return json!({ "ok": true, "result": status, "resolvedUnit": unit });
                }
            }
            Err(_) => continue,
        }
    }
    json!({ "ok": true, "result": "unknown", "resolvedUnit": Value::Null })
}

async fn host_exec_docker_system_df() -> Value {
    match exec_output_limit("docker", &["system", "df"], get_global_ipc_timeout()).await {
        Ok(out) => json!({ "ok": true, "result": truncate_probe_output(&out) }),
        Err(e) => {
            json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) })
        }
    }
}

async fn host_exec_docker_ps_table() -> Value {
    match exec_output_limit(
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
        Err(e) => {
            json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) })
        }
    }
}

async fn host_exec_journalctl_docker() -> Value {
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
        Err(e) => {
            json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) })
        }
    }
}

async fn host_exec_du_cache_tail() -> Value {
    match std::env::var("HOME") {
        Ok(home) if !home.trim().is_empty() => {
            if home.contains('\'') || home.contains('\n') || home.contains('\r') {
                return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] HOME path not supported." });
            }
            let cache = format!("{}/.cache", home.trim_end_matches('/'));
            if cache.contains('\'') {
                return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] cache path not supported." });
            }
            let script = format!(
        "if [ -d '{}' ]; then du -sh '{}'/* 2>/dev/null | sort -h | tail -n 25; else echo '(no ~/.cache directory)'; fi",
        cache, cache
      );
            match exec_output_limit("bash", &["-lc", &script], cmd_timeout_long()).await {
                Ok(out) => json!({ "ok": true, "result": truncate_probe_output(&out) }),
                Err(e) => {
                    json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) })
                }
            }
        }
        _ => {
            json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] HOME unset." })
        }
    }
}

async fn host_exec_read_hosts() -> Value {
    match exec_output_limit("cat", &["/etc/hosts"], cmd_timeout_short()).await {
        Ok(out) => json!({ "ok": true, "result": truncate_probe_output(&out) }),
        Err(e) => {
            json!({ "ok": false, "result": Value::Null, "error": format!("[HOST_EXEC_FAILED] {}", e) })
        }
    }
}

fn host_exec_process_env() -> Value {
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
}

async fn host_exec_write_hosts(body: &Value) -> Value {
    let content = match body.get("content").and_then(|v| v.as_str()) {
        Some(c) => c.to_string(),
        None => return json!({ "ok": false, "error": "[HOST_EXEC_FAILED] missing content" }),
    };
    let mut named_tmp = match tempfile::NamedTempFile::new() {
        Ok(t) => t,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[HOST_EXEC_FAILED] tempfile: {}", e) })
        }
    };
    if let Err(e) = std::io::Write::write_all(&mut named_tmp, content.as_bytes()) {
        return json!({ "ok": false, "error": format!("[HOST_EXEC_FAILED] write: {}", e) });
    }

    let tmp_path = named_tmp.path().to_string_lossy().to_string();
    let result = exec_result_limit(
        "sudo",
        &["cp", &tmp_path, "/etc/hosts"],
        cmd_timeout_short(),
    )
    .await;

    match result {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
    }
}

async fn host_exec_read_profile_env() -> Value {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let profile_path = format!("{}/.profile", home);
    match exec_output_limit("cat", &[&profile_path], cmd_timeout_short()).await {
        Ok(out) => json!({ "ok": true, "result": out, "path": profile_path }),
        Err(_) => json!({ "ok": true, "result": "", "path": profile_path }),
    }
}

async fn host_exec_write_profile_env(body: &Value) -> Value {
    let action = body.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let key = body.get("key").and_then(|v| v.as_str()).unwrap_or("");
    let value = body.get("value").and_then(|v| v.as_str()).unwrap_or("");
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let profile_path = format!("{}/.profile", home);
    if key.is_empty() || key.contains(|c: char| !c.is_alphanumeric() && c != '_') {
        return json!({ "ok": false, "error": "[HOST_EXEC_FAILED] invalid key name" });
    }
    let current = exec_output_limit("cat", &[&profile_path], cmd_timeout_short())
        .await
        .unwrap_or_default();
    let new_content = match action {
        "set" => {
            let export_line = format!("export {}={}", key, shell_quote_value(value));
            let filtered: String = current
                .lines()
                .filter(|l| {
                    let t = l.trim();
                    !t.starts_with(&format!("export {}=", key))
                })
                .collect::<Vec<_>>()
                .join("\n");
            let base = if filtered.trim().is_empty() {
                String::new()
            } else {
                format!("{}\n", filtered.trim_end())
            };
            format!("{}{}\n", base, export_line)
        }
        "remove" => {
            current
                .lines()
                .filter(|l| !l.trim().starts_with(&format!("export {}=", key)))
                .collect::<Vec<_>>()
                .join("\n")
                + "\n"
        }
        _ => return json!({ "ok": false, "error": "[HOST_EXEC_FAILED] unknown action" }),
    };
    match std::fs::write(&profile_path, &new_content) {
        Ok(_) => json!({ "ok": true, "path": profile_path }),
        Err(e) => json!({ "ok": false, "error": format!("[HOST_EXEC_FAILED] {}", e) }),
    }
}

// ---------------------------------------------------------------------------
// Startup update check (runs at app launch if checkOnStartup is enabled)
// ---------------------------------------------------------------------------

pub(crate) async fn startup_update_check(app: AppHandle) {
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
                    Ok(v) => v
                        .get("tag_name")
                        .and_then(|t| t.as_str())
                        .map(|s| s.to_string()),
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
            let _ = write_json(&store_path, &store);
        }
    }
}

// ---------------------------------------------------------------------------
// App update check (dh:app:update:check)
// ---------------------------------------------------------------------------

pub(crate) async fn app_update_check(_app: &AppHandle, _body: &Value) -> Value {
    let client = match reqwest::Client::builder()
        .user_agent("LuminaDev-Updater")
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            return json!({ "ok": false, "error": "[UPDATE_CHECK_FAILED] Failed to create HTTP client." })
        }
    };
    match client
        .get("https://api.github.com/repos/Karim-Termanini/LuminaDev/releases/latest")
        .send()
        .await
    {
        Ok(res) => match res.json::<Value>().await {
            Ok(json_val) => {
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
            }
            Err(_) => {
                json!({ "ok": false, "error": "[UPDATE_CHECK_FAILED] Failed to parse GitHub JSON response." })
            }
        },
        Err(e) => {
            json!({ "ok": false, "error": format!("[UPDATE_CHECK_FAILED] HTTP request failed: {}", e) })
        }
    }
}

// ---------------------------------------------------------------------------
// Performance snapshot (dh:perf:snapshot)
// ---------------------------------------------------------------------------

pub(crate) async fn handle_perf_snapshot(_app: &AppHandle) -> Value {
    let mut rss_mb = 0u64;
    let statm = read_proc_text("/proc/self/statm").await;
    if let Some(pages) = statm
        .split_whitespace()
        .nth(1)
        .and_then(|v| v.parse::<u64>().ok())
    {
        rss_mb = (pages * 4096) / 1024 / 1024;
    }
    let uptime_str = read_proc_text("/proc/uptime").await;
    let host_uptime_sec = uptime_str
        .split_whitespace()
        .next()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0) as u64;

    let app_uptime_ms = START_TIME
        .get()
        .map(|t| t.elapsed().as_millis() as u64)
        .unwrap_or(0);

    json!({
      "ok": true,
      "snapshot": {
        "startupMs": app_uptime_ms,
        "rssMb": rss_mb,
        "uptimeSec": host_uptime_sec
      }
    })
}

// ---------------------------------------------------------------------------
// Port suggestion (dh:ports:suggest)
// ---------------------------------------------------------------------------

pub(crate) async fn handle_ports_suggest(app: &AppHandle, body: &Value) -> Value {
    let template = body
        .get("template")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let profile = body
        .get("profile")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let sub_template = body
        .get("subTemplate")
        .and_then(|v| v.as_str())
        .unwrap_or("react-native");

    // Return existing stored ports if profile already has them, otherwise find free ones
    let mut ports = serde_json::Map::new();
    let existing: std::collections::HashMap<String, u64> =
        if let Ok(store_path) = crate::app_file(app, "store.json") {
            let store = crate::read_json(&store_path);
            let mut m = std::collections::HashMap::new();
            for key in &[
                "jupyter_port",
                "postgres_port",
                "node_port",
                "node_hmr_port",
                "appium_port",
                "json_server_port",
                "ollama_port",
            ] {
                if let Some(v) = store
                    .get(format!("{}_{}", key, profile))
                    .and_then(|v| v.as_u64())
                {
                    m.insert(key.to_string(), v);
                }
            }
            m
        } else {
            std::collections::HashMap::new()
        };

    match template {
        "data-science" => {
            ports.insert(
                "jupyter".into(),
                (*existing
                    .get("jupyter_port")
                    .unwrap_or(&(find_free_port(8888) as u64)))
                .into(),
            );
            ports.insert(
                "postgres".into(),
                (*existing
                    .get("postgres_port")
                    .unwrap_or(&(find_free_port(54320) as u64)))
                .into(),
            );
        }
        "web-dev" => {
            ports.insert(
                "node".into(),
                (*existing
                    .get("node_port")
                    .unwrap_or(&(find_free_port(3000) as u64)))
                .into(),
            );
            ports.insert(
                "node_hmr".into(),
                (*existing
                    .get("node_hmr_port")
                    .unwrap_or(&(find_free_port(5173) as u64)))
                .into(),
            );
            ports.insert(
                "postgres".into(),
                (*existing
                    .get("postgres_port")
                    .unwrap_or(&(find_free_port(54321) as u64)))
                .into(),
            );
        }
        "mobile" if sub_template == "react-native" => {
            ports.insert(
                "appium".into(),
                (*existing
                    .get("appium_port")
                    .unwrap_or(&(find_free_port(4723) as u64)))
                .into(),
            );
            ports.insert(
                "json_server".into(),
                (*existing
                    .get("json_server_port")
                    .unwrap_or(&(find_free_port(3001) as u64)))
                .into(),
            );
        }
        "ai-ml" => {
            ports.insert(
                "jupyter".into(),
                (*existing
                    .get("jupyter_port")
                    .unwrap_or(&(find_free_port(18888) as u64)))
                .into(),
            );
            ports.insert(
                "ollama".into(),
                (*existing
                    .get("ollama_port")
                    .unwrap_or(&(find_free_port(11434) as u64)))
                .into(),
            );
        }
        _ => {}
    }
    json!({ "ok": true, "ports": ports })
}

// ---------------------------------------------------------------------------
// Project ensure_dir (dh:project:ensure_dir) — synchronous
// ---------------------------------------------------------------------------

pub(crate) fn handle_project_ensure_dir(body: &Value) -> Value {
    let path_str = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
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
            Err(e) => json!({ "ok": false, "error": e.to_string() }),
        }
    }
}

// ---------------------------------------------------------------------------
// Filesystem exists check (dh:fs:exists) — synchronous
// ---------------------------------------------------------------------------

pub(crate) fn handle_fs_exists(body: &Value) -> Value {
    let path_str = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
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

/// Open a directory path in the system file manager (xdg-open on Linux).
/// Fire-and-forget; always returns ok:true so the UI isn't blocked on the result.
pub(crate) fn handle_fs_open(body: &Value) -> Value {
    let path_str = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if path_str.is_empty() {
        return json!({ "ok": false, "error": "[FS_OPEN_FAILED] Missing path." });
    }
    let expanded = if path_str.starts_with("~/") {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        path_str.replacen("~/", &format!("{}/", home), 1)
    } else {
        path_str.to_string()
    };
    // Spawn xdg-open detached; ignore errors (file manager may not be installed)
    let _ = std::process::Command::new("xdg-open").arg(&expanded).spawn();
    json!({ "ok": true })
}

// ---------------------------------------------------------------------------
// SSH handlers
// ---------------------------------------------------------------------------

pub(crate) async fn handle_ssh_generate(body: &Value) -> Value {
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("lumina@local");
    let key_name = body
        .get("keyName")
        .and_then(|v| v.as_str())
        .unwrap_or("id_ed25519");
    let safe_name: String = key_name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let ssh_dir = format!("{}/.ssh", home);
    let key_path = format!("{}/{}", ssh_dir, safe_name);
    let _ = std::fs::create_dir_all(&ssh_dir);
    match exec_output(
        "ssh-keygen",
        &["-t", "ed25519", "-C", email, "-f", &key_path, "-N", ""],
    )
    .await
    {
        Ok(_) => json!({ "ok": true, "keyName": safe_name }),
        Err(e) => {
            json!({ "ok": false, "error": format!("[SSH_GENERATE_FAILED] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_ssh_get_pub() -> Value {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let pub_path = format!("{}/.ssh/id_ed25519.pub", home);
    match std::fs::read_to_string(&pub_path) {
        Ok(pubkey) => {
            let fingerprint = exec_output("ssh-keygen", &["-lf", &pub_path])
                .await
                .unwrap_or_default();
            json!({ "ok": true, "pub": pubkey.trim(), "fingerprint": fingerprint.trim() })
        }
        Err(_) => {
            json!({ "ok": false, "pub": "", "fingerprint": "", "error": "[SSH_NO_KEY] Missing public key." })
        }
    }
}

pub(crate) async fn handle_ssh_test_github() -> Value {
    match exec_result_limit("ssh", &["-T", "git@github.com"], get_global_ipc_timeout()).await {
        Ok((stdout, stderr)) => {
            json!({ "ok": true, "output": format!("{}{}", stdout, stderr), "code": 0 })
        }
        Err(e) => json!({ "ok": true, "output": e, "code": 1 }),
    }
}

pub(crate) async fn handle_ssh_list_dir(body: &Value) -> Value {
    let user = body
        .get("user")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let host_str = body
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let port = body.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let remote_path = body
        .get("remotePath")
        .and_then(|v| v.as_str())
        .unwrap_or(".");
    let remote = format!("{}@{}", user, host_str);
    let port_str = port.to_string();
    let ls_cmd = format!("ls -aF1 '{}'", remote_path.replace('\'', r"'\''"));
    match exec_result_limit(
        "ssh",
        &[
            "-o",
            "StrictHostKeyChecking=no",
            "-p",
            &port_str,
            &remote,
            &ls_cmd,
        ],
        cmd_timeout_ssh(),
    )
    .await
    {
        Ok((stdout, _)) => {
            let entries: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();
            json!({ "ok": true, "entries": entries })
        }
        Err(e) => {
            json!({ "ok": false, "entries": [], "error": format!("[SSH_LIST_DIR_FAILED] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_ssh_setup_remote_key(body: &Value) -> Value {
    let user = body
        .get("user")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let host_str = body
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let port = body.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let password = body
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let public_key = body
        .get("publicKey")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
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
                &[
                    "-o",
                    "StrictHostKeyChecking=no",
                    "-p",
                    &port_str,
                    &remote,
                    &setup_cmd,
                ],
                cmd_timeout_ssh(),
            )
            .await
        };
        match result {
            Ok(_) => json!({ "ok": true }),
            Err(e) => {
                json!({ "ok": false, "error": format!("[SSH_SETUP_KEY_FAILED] {}", e.trim()) })
            }
        }
    }
}

pub(crate) async fn handle_ssh_enable_local() -> Value {
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
        return json!({ "ok": false, "log": "", "error": format!("[SSH_ENABLE_LOCAL_FAILED] {}", e) });
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
            let log = format!(
                "✓ SSH daemon enabled\n✓ Firewall configured\n{}",
                out.trim()
            );
            json!({ "ok": true, "log": log.trim_end() })
        }
        Err(e) => {
            let msg = e.trim().to_string();
            // pkexec exit 126 = user dismissed the dialog (cancelled)
            let cancelled =
                msg.contains("126") || msg.to_lowercase().contains("cancel") || msg.is_empty();
            if cancelled {
                json!({ "ok": false, "log": "✗ Cancelled by user", "error": "[SSH_ENABLE_LOCAL_FAILED] Authentication cancelled." })
            } else {
                json!({ "ok": false, "log": format!("✗ {}", msg), "error": format!("[SSH_ENABLE_LOCAL_FAILED] {}", msg) })
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Monitor handlers
// ---------------------------------------------------------------------------

pub(crate) async fn handle_monitor_top_processes() -> Value {
    match exec_output_limit(
        "ps",
        &["-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"],
        cmd_timeout_short(),
    )
    .await
    {
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
        Err(e) => {
            json!({ "ok": false, "processes": [], "error": format!("[MONITOR_TOP_FAILED] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_monitor_security() -> Value {
    let ufw_active = exec_output_limit("ufw", &["status"], cmd_timeout_short())
        .await
        .map(|o| o.contains("active"))
        .unwrap_or(false);
    let firewalld_running = exec_output_limit("firewall-cmd", &["--state"], cmd_timeout_short())
        .await
        .map(|o| o.contains("running"))
        .unwrap_or(false);
    let firewall = if ufw_active || firewalld_running {
        "active"
    } else {
        "inactive"
    };
    let selinux = exec_output_limit("sestatus", &[], cmd_timeout_short())
        .await
        .map(|o| {
            if o.contains("enabled") {
                "enabled"
            } else {
                "disabled"
            }
        })
        .unwrap_or_else(|_| "unknown");
    let ssh_config = exec_output_limit(
        "bash",
        &[
            "-c",
            "sshd -T 2>/dev/null | awk '/permitrootlogin|passwordauthentication/'",
        ],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let root_login = if ssh_config.contains("permitrootlogin yes") {
        "yes"
    } else {
        "no"
    };
    let pw_auth = if ssh_config.contains("passwordauthentication no") {
        "no"
    } else {
        "yes"
    };
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

    let ports_out = exec_output_limit("ss", &["-tulpn"], cmd_timeout_short())
        .await
        .unwrap_or_default();
    let mut risky: Vec<u16> = Vec::new();
    // Expanded risky ports list (DBs, Dev tools, common unauthenticated services)
    for p in [
        21, 22, 23, 25, 139, 445, 3306, 5432, 27017, 6379, 8080, 9000, 9200,
    ] {
        if ports_out.contains(&format!(":{}", p)) {
            // Check if it's listening on 0.0.0.0 or ::: (exposed to network)
            if ports_out.contains(&format!("0.0.0.0:{}", p))
                || ports_out.contains(&format!("[::]:{}", p))
                || ports_out.contains(&format!("*:{}", p))
            {
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
}

pub(crate) async fn handle_monitor_security_drilldown() -> Value {
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

    let ss_out = exec_output_limit("ss", &["-tulpn", "-H"], cmd_timeout_short())
        .await
        .unwrap_or_default();
    let risky_set: std::collections::HashSet<u16> =
        [22, 3306, 5432, 27017, 6379].iter().cloned().collect();
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
                        risky_port_owners
                            .push(json!({ "port": port, "process": process, "pid": pid }));
                    }
                }
            }
        }
    }
    json!({ "ok": true, "drilldown": { "failedAuthSamples": failed_auth_samples, "riskyPortOwners": risky_port_owners } })
}

// ---------------------------------------------------------------------------
// Metrics (dh:metrics)
// ---------------------------------------------------------------------------

pub(crate) async fn handle_metrics(state: &AppState) -> Value {
    let meminfo = read_proc_text("/proc/meminfo").await;
    let parse_kb = |key: &str| -> u64 {
        meminfo
            .lines()
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
    let uptime_sec = uptime_str
        .split_whitespace()
        .next()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0) as u64;
    let loadavg_str = read_proc_text("/proc/loadavg").await;
    let load_parts: Vec<f64> = loadavg_str
        .split_whitespace()
        .take(3)
        .filter_map(|v| v.parse::<f64>().ok())
        .collect();
    let (cpu_percent, cpu_model) = {
        let stat_raw = read_proc_text("/proc/stat").await;
        let first_line = stat_raw.lines().next().unwrap_or("");
        let parts: Vec<u64> = first_line
            .split_whitespace()
            .skip(1)
            .filter_map(|v| v.parse::<u64>().ok())
            .collect();
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
        let model = cpuinfo
            .lines()
            .find(|l| l.starts_with("model name"))
            .and_then(|l| l.split_once(':').map(|x| x.1))
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());

        (pct, model)
    };
    let disk_out = exec_output("df", &["-k", "/"]).await.unwrap_or_default();
    let (disk_total_gb, disk_free_gb) = disk_out
        .lines()
        .nth(1)
        .and_then(|l| {
            let p: Vec<&str> = l.split_whitespace().collect();
            let total = p.get(1).and_then(|v| v.parse::<u64>().ok())?;
            let free = p.get(3).and_then(|v| v.parse::<u64>().ok())?;
            Some((total / 1024 / 1024, free / 1024 / 1024))
        })
        .unwrap_or((0, 0));
    // Net I/O delta from /proc/net/dev
    let net_raw = read_proc_text("/proc/net/dev").await;
    let (net_rx_now, net_tx_now) = net_raw.lines().skip(2).fold((0u64, 0u64), |acc, l| {
        let parts: Vec<&str> = l.split_whitespace().collect();
        if parts.len() < 10 || parts[0].starts_with("lo:") {
            return acc;
        }
        let rx = parts[1].parse::<u64>().unwrap_or(0);
        let tx = parts[9].parse::<u64>().unwrap_or(0);
        (acc.0 + rx, acc.1 + tx)
    });
    let now_inst = std::time::Instant::now();
    let (net_rx_mbps, net_tx_mbps) = {
        let mut prev = state.net_prev.lock().await;
        let mbps = prev
            .as_ref()
            .map(|(prx, ptx, pt)| {
                let secs = now_inst.duration_since(*pt).as_secs_f64().max(0.1);
                let rx =
                    (net_rx_now.saturating_sub(*prx) as f64 / secs / 1_000_000.0 * 8.0).max(0.0);
                let tx =
                    (net_tx_now.saturating_sub(*ptx) as f64 / secs / 1_000_000.0 * 8.0).max(0.0);
                (rx, tx)
            })
            .unwrap_or((0.0, 0.0));
        *prev = Some((net_rx_now, net_tx_now, now_inst));
        mbps
    };
    // Disk I/O delta from /proc/diskstats (sectors = 512 bytes)
    let disk_raw = read_proc_text("/proc/diskstats").await;
    let (disk_read_now, disk_write_now) = disk_raw.lines().fold((0u64, 0u64), |acc, l| {
        let p: Vec<&str> = l.split_whitespace().collect();
        let name = p.get(2).copied().unwrap_or("");
        if !is_physical_disk_name(name) {
            return acc;
        }
        let r = p.get(5).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        let w = p.get(9).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        (acc.0 + r, acc.1 + w)
    });
    let disk_now_inst = std::time::Instant::now();
    let (disk_read_mbps, disk_write_mbps) = {
        let mut prev = state.disk_prev.lock().await;
        let mbps = prev
            .as_ref()
            .map(|(pr, pw, pt)| {
                let secs = disk_now_inst.duration_since(*pt).as_secs_f64().max(0.1);
                let rd = (disk_read_now.saturating_sub(*pr) as f64 * 512.0 / secs / 1_000_000.0)
                    .max(0.0);
                let wr = (disk_write_now.saturating_sub(*pw) as f64 * 512.0 / secs / 1_000_000.0)
                    .max(0.0);
                (rd, wr)
            })
            .unwrap_or((0.0, 0.0));
        *prev = Some((disk_read_now, disk_write_now, disk_now_inst));
        mbps
    };
    let svc_out = exec_output_limit(
        "systemctl",
        &[
            "list-units",
            "--type=service",
            "--no-pager",
            "--plain",
            "--no-legend",
        ],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let systemd: Vec<Value> = svc_out
        .lines()
        .take(30)
        .filter_map(|l| {
            let p: Vec<&str> = l.split_whitespace().collect();
            if p.len() < 4 {
                return None;
            }
            let name = p[0].trim_end_matches(".service");
            let state = match p[3] {
                "running" => "active",
                "failed" => "failed",
                _ => "inactive",
            };
            Some(json!({ "name": name, "state": state }))
        })
        .collect();
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
}

use crate::utils::sanitize_compose_project_name;

async fn running_compose_project_names() -> std::collections::HashSet<String> {
    let ls_json = exec_output("docker", &["compose", "ls", "--all", "--format", "json"])
        .await
        .unwrap_or_default();
    serde_json::from_str::<Vec<Value>>(&ls_json)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| {
            let name = v.get("Name")?.as_str()?;
            let status = v.get("Status")?.as_str()?.to_lowercase();
            if status.contains("running") || status.contains("restarting") {
                Some(sanitize_compose_project_name(name))
            } else {
                None
            }
        })
        .collect()
}

pub(crate) async fn is_compose_profile_running(profile_name: &str) -> bool {
    let key = sanitize_compose_project_name(profile_name);
    if key.is_empty() {
        return false;
    }
    running_compose_project_names().await.contains(&key)
}

/// Returns which profile names from the given list have a running Docker Compose project.
/// Uses `docker compose ls --format json` — the authoritative source of project state.
pub(crate) async fn handle_profile_running_status(_app: &AppHandle, body: &Value) -> Value {
    let names: Vec<String> = body
        .get("names")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    if names.is_empty() {
        return json!({ "ok": true, "running": [] });
    }

    let running_projects = running_compose_project_names().await;

    let running: Vec<String> = names
        .into_iter()
        .filter(|n| running_projects.contains(&sanitize_compose_project_name(n)))
        .collect();

    json!({ "ok": true, "running": running })
}
