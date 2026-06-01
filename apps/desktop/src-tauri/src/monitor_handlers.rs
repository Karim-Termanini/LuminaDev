use serde_json::{json, Value};
use tauri::AppHandle;

use crate::host_exec::{cmd_timeout_short, exec_output, exec_output_limit, read_proc_text};
use crate::state::AppState;
use crate::utils::{is_physical_disk_name, sanitize_compose_project_name};

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

pub(crate) async fn running_compose_project_names() -> std::collections::HashSet<String> {
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
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
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
