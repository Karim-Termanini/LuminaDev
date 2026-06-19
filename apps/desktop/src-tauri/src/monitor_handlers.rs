use serde_json::{json, Value};
use tauri::AppHandle;

use crate::host_exec::{cmd_timeout_short, exec_output, exec_output_limit, read_proc_text};
use crate::state::AppState;
use crate::utils::{is_physical_disk_name, sanitize_compose_project_name};

// ---------------------------------------------------------------------------

/// True when `ufw status` output indicates an active firewall (not "inactive").
pub(crate) fn parse_ufw_status_active(output: &str) -> bool {
    output.lines().any(|line| {
        let t = line.trim().to_ascii_lowercase();
        t.starts_with("status:") && t.contains("active") && !t.contains("inactive")
    })
}

async fn probe_ufw_active() -> bool {
    if exec_output_limit("systemctl", &["is-active", "ufw"], cmd_timeout_short())
        .await
        .map(|o| o.trim() == "active")
        .unwrap_or(false)
    {
        return true;
    }
    exec_output_limit("ufw", &["status"], cmd_timeout_short())
        .await
        .map(|o| parse_ufw_status_active(&o))
        .unwrap_or(false)
}

async fn probe_firewalld_active() -> bool {
    if exec_output_limit("systemctl", &["is-active", "firewalld"], cmd_timeout_short())
        .await
        .map(|o| o.trim() == "active")
        .unwrap_or(false)
    {
        return true;
    }
    exec_output_limit("firewall-cmd", &["--state"], cmd_timeout_short())
        .await
        .map(|o| o.to_ascii_lowercase().contains("running"))
        .unwrap_or(false)
}

async fn probe_sshd_test_config() -> String {
    exec_output_limit("sshd", &["-T"], cmd_timeout_short())
        .await
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// Last non-comment `Directive value` wins across concatenated sshd config fragments.
pub(crate) fn parse_sshd_directive(config: &str, directive: &str) -> Option<String> {
    let want = directive.to_ascii_lowercase();
    let mut last: Option<String> = None;
    for line in config.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        let mut parts = t.split_whitespace();
        let key = parts.next()?.to_ascii_lowercase();
        let val = parts.next()?.to_ascii_lowercase();
        if key == want {
            last = Some(val);
        }
    }
    last
}

fn expand_sshd_include_pattern(pattern: &str) -> Vec<std::path::PathBuf> {
    if !pattern.contains('*') {
        let path = std::path::PathBuf::from(pattern);
        return if path.is_file() { vec![path] } else { vec![] };
    }
    let (dir, file_glob) = match pattern.rsplit_once('/') {
        Some((d, g)) => (d, g),
        None => (".", pattern),
    };
    let prefix = file_glob.trim_end_matches('*');
    let mut paths: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(prefix))
                    .unwrap_or(false)
        })
        .collect();
    paths.sort();
    paths
}

async fn read_sshd_config_blob() -> String {
    let main = std::path::Path::new("/etc/ssh/sshd_config");
    let Ok(content) = tokio::fs::read_to_string(main).await else {
        return String::new();
    };
    let mut blob = content.clone();
    for line in content.lines() {
        let t = line.trim();
        if !t.to_ascii_lowercase().starts_with("include ") {
            continue;
        }
        let Some(pattern) = t.split_whitespace().nth(1) else {
            continue;
        };
        for path in expand_sshd_include_pattern(pattern) {
            if let Ok(extra) = tokio::fs::read_to_string(&path).await {
                blob.push('\n');
                blob.push_str(&extra);
            }
        }
    }
    blob
}

pub(crate) fn resolve_ssh_password_auth(sshd_t: &str, config: &str) -> &'static str {
    if sshd_t.contains("passwordauthentication no") {
        return "no";
    }
    if sshd_t.contains("passwordauthentication yes") {
        return "yes";
    }
    match parse_sshd_directive(config, "PasswordAuthentication").as_deref() {
        Some("no" | "false") => "no",
        Some("yes" | "true") => "yes",
        _ => "yes",
    }
}

pub(crate) fn resolve_ssh_permit_root_login(sshd_t: &str, config: &str) -> &'static str {
    if sshd_t.contains("permitrootlogin yes") {
        return "yes";
    }
    if sshd_t.contains("permitrootlogin no")
        || sshd_t.contains("permitrootlogin prohibit-password")
        || sshd_t.contains("permitrootlogin without-password")
        || sshd_t.contains("permitrootlogin forced-commands-only")
    {
        return "no";
    }
    match parse_sshd_directive(config, "PermitRootLogin").as_deref() {
        Some("yes") => "yes",
        Some("no" | "prohibit-password" | "without-password" | "forced-commands-only") => "no",
        _ => "no",
    }
}

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
    let ufw_active = probe_ufw_active().await;
    let firewalld_running = probe_firewalld_active().await;
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
    let sshd_t = probe_sshd_test_config().await;
    let ssh_config_blob = read_sshd_config_blob().await;
    let root_login = resolve_ssh_permit_root_login(&sshd_t, &ssh_config_blob);
    let pw_auth = resolve_ssh_password_auth(&sshd_t, &ssh_config_blob);
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let ssh_host_key_present = ["/.ssh/id_ed25519.pub", "/.ssh/id_rsa.pub"]
        .iter()
        .any(|suffix| std::path::Path::new(&format!("{home}{suffix}")).exists());
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
        "sshHostKeyPresent": ssh_host_key_present,
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

/// Short wait on first metrics call so delta-based rates have a baseline sample.
const METRICS_PRIME_MS: u64 = 300;

struct CpuSample {
    total: u64,
    idle: u64,
}

struct NetSample {
    rx: u64,
    tx: u64,
}

struct DiskSample {
    read_sectors: u64,
    write_sectors: u64,
}

fn cpu_usage_percent(prev: &CpuSample, now: &CpuSample) -> f64 {
    let delta_total = now.total.saturating_sub(prev.total);
    let delta_idle = now.idle.saturating_sub(prev.idle);
    if delta_total == 0 {
        return 0.0;
    }
    ((1.0 - delta_idle as f64 / delta_total as f64) * 100.0).clamp(0.0, 100.0)
}

fn net_rates_mbps(prev: &NetSample, now: &NetSample, secs: f64) -> (f64, f64) {
    let secs = secs.max(0.1);
    let rx = (now.rx.saturating_sub(prev.rx) as f64 / secs / 1_000_000.0 * 8.0).max(0.0);
    let tx = (now.tx.saturating_sub(prev.tx) as f64 / secs / 1_000_000.0 * 8.0).max(0.0);
    (rx, tx)
}

fn disk_rates_mbps(prev: &DiskSample, now: &DiskSample, secs: f64) -> (f64, f64) {
    let secs = secs.max(0.1);
    let read = (now
        .read_sectors
        .saturating_sub(prev.read_sectors) as f64
        * 512.0
        / secs
        / 1_000_000.0)
        .max(0.0);
    let write = (now
        .write_sectors
        .saturating_sub(prev.write_sectors) as f64
        * 512.0
        / secs
        / 1_000_000.0)
        .max(0.0);
    (read, write)
}

async fn sample_cpu() -> CpuSample {
    let stat_raw = read_proc_text("/proc/stat").await;
    let first_line = stat_raw.lines().next().unwrap_or("");
    let parts: Vec<u64> = first_line
        .split_whitespace()
        .skip(1)
        .filter_map(|v| v.parse::<u64>().ok())
        .collect();
    let total: u64 = parts.iter().sum();
    let idle = parts.get(3).copied().unwrap_or(0) + parts.get(4).copied().unwrap_or(0);
    CpuSample { total, idle }
}

async fn sample_net() -> NetSample {
    let net_raw = read_proc_text("/proc/net/dev").await;
    let (rx, tx) = net_raw.lines().skip(2).fold((0u64, 0u64), |acc, l| {
        let parts: Vec<&str> = l.split_whitespace().collect();
        if parts.len() < 10 || parts[0].starts_with("lo:") {
            return acc;
        }
        let rx = parts[1].parse::<u64>().unwrap_or(0);
        let tx = parts[9].parse::<u64>().unwrap_or(0);
        (acc.0 + rx, acc.1 + tx)
    });
    NetSample { rx, tx }
}

async fn sample_disk() -> DiskSample {
    let disk_raw = read_proc_text("/proc/diskstats").await;
    let (read_sectors, write_sectors) = disk_raw.lines().fold((0u64, 0u64), |acc, l| {
        let p: Vec<&str> = l.split_whitespace().collect();
        let name = p.get(2).copied().unwrap_or("");
        if !is_physical_disk_name(name) {
            return acc;
        }
        let r = p.get(5).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        let w = p.get(9).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        (acc.0 + r, acc.1 + w)
    });
    DiskSample {
        read_sectors,
        write_sectors,
    }
}

async fn cpu_model_name() -> String {
    let cpuinfo = read_proc_text("/proc/cpuinfo").await;
    cpuinfo
        .lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.split_once(':').map(|x| x.1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string())
}

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
    let (cpu_percent, cpu_model, net_rx_mbps, net_tx_mbps, disk_read_mbps, disk_write_mbps) = {
        let cpu_now = sample_cpu().await;
        let net_now = sample_net().await;
        let disk_now = sample_disk().await;
        let cpu_model = cpu_model_name().await;
        let now_inst = std::time::Instant::now();

        let mut cpu_prev = state.cpu_prev.lock().await;
        let mut net_prev = state.net_prev.lock().await;
        let mut disk_prev = state.disk_prev.lock().await;
        let need_prime = cpu_prev.is_none() || net_prev.is_none() || disk_prev.is_none();

        if need_prime {
            *cpu_prev = Some((cpu_now.total, cpu_now.idle, now_inst));
            *net_prev = Some((net_now.rx, net_now.tx, now_inst));
            *disk_prev = Some((
                disk_now.read_sectors,
                disk_now.write_sectors,
                now_inst,
            ));
            drop(cpu_prev);
            drop(net_prev);
            drop(disk_prev);

            tokio::time::sleep(std::time::Duration::from_millis(METRICS_PRIME_MS)).await;

            let cpu_after = sample_cpu().await;
            let net_after = sample_net().await;
            let disk_after = sample_disk().await;
            let after_inst = std::time::Instant::now();
            let secs = after_inst.duration_since(now_inst).as_secs_f64();

            let cpu_percent = cpu_usage_percent(&cpu_now, &cpu_after);
            let (net_rx_mbps, net_tx_mbps) = net_rates_mbps(&net_now, &net_after, secs);
            let (disk_read_mbps, disk_write_mbps) =
                disk_rates_mbps(&disk_now, &disk_after, secs);

            *state.cpu_prev.lock().await = Some((cpu_after.total, cpu_after.idle, after_inst));
            *state.net_prev.lock().await = Some((net_after.rx, net_after.tx, after_inst));
            *state.disk_prev.lock().await = Some((
                disk_after.read_sectors,
                disk_after.write_sectors,
                after_inst,
            ));

            (
                cpu_percent,
                cpu_model,
                net_rx_mbps,
                net_tx_mbps,
                disk_read_mbps,
                disk_write_mbps,
            )
        } else {
            let cpu_percent = cpu_prev.as_ref().map(|(ptotal, pidle, _)| {
                cpu_usage_percent(
                    &CpuSample {
                        total: *ptotal,
                        idle: *pidle,
                    },
                    &cpu_now,
                )
            }).unwrap_or(0.0);
            *cpu_prev = Some((cpu_now.total, cpu_now.idle, now_inst));

            let (net_rx_mbps, net_tx_mbps) = net_prev
                .as_ref()
                .map(|(prx, ptx, pt)| {
                    let secs = now_inst.duration_since(*pt).as_secs_f64();
                    net_rates_mbps(
                        &NetSample { rx: *prx, tx: *ptx },
                        &net_now,
                        secs,
                    )
                })
                .unwrap_or((0.0, 0.0));
            *net_prev = Some((net_now.rx, net_now.tx, now_inst));

            let (disk_read_mbps, disk_write_mbps) = disk_prev
                .as_ref()
                .map(|(pr, pw, pt)| {
                    let secs = now_inst.duration_since(*pt).as_secs_f64();
                    disk_rates_mbps(
                        &DiskSample {
                            read_sectors: *pr,
                            write_sectors: *pw,
                        },
                        &disk_now,
                        secs,
                    )
                })
                .unwrap_or((0.0, 0.0));
            *disk_prev = Some((
                disk_now.read_sectors,
                disk_now.write_sectors,
                now_inst,
            ));

            (
                cpu_percent,
                cpu_model,
                net_rx_mbps,
                net_tx_mbps,
                disk_read_mbps,
                disk_write_mbps,
            )
        }
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

#[cfg(test)]
mod metrics_tests {
    use super::*;

    #[test]
    fn cpu_usage_percent_from_delta() {
        let prev = CpuSample { total: 100, idle: 80 };
        let now = CpuSample { total: 200, idle: 150 };
        assert!((cpu_usage_percent(&prev, &now) - 30.0).abs() < 0.01);
    }

    #[test]
    fn net_rates_mbps_from_byte_delta() {
        let prev = NetSample { rx: 0, tx: 0 };
        // 1_000_000 bytes in 1s => 8 Mbps
        let now = NetSample {
            rx: 1_000_000,
            tx: 500_000,
        };
        let (rx, tx) = net_rates_mbps(&prev, &now, 1.0);
        assert!((rx - 8.0).abs() < 0.01);
        assert!((tx - 4.0).abs() < 0.01);
    }

    #[test]
    fn disk_rates_mbps_from_sector_delta() {
        let prev = DiskSample {
            read_sectors: 0,
            write_sectors: 0,
        };
        let now = DiskSample {
            read_sectors: 2048,
            write_sectors: 1024,
        };
        let (read, write) = disk_rates_mbps(&prev, &now, 1.0);
        let expected_read = 2048.0 * 512.0 / 1_000_000.0;
        let expected_write = 1024.0 * 512.0 / 1_000_000.0;
        assert!((read - expected_read).abs() < 0.01);
        assert!((write - expected_write).abs() < 0.01);
    }
}

#[cfg(test)]
mod security_probe_tests {
    use super::{
        parse_sshd_directive, parse_ufw_status_active, resolve_ssh_password_auth,
        resolve_ssh_permit_root_login,
    };

    #[test]
    fn ufw_status_active_only_when_status_line_active() {
        assert!(parse_ufw_status_active("Status: active\n"));
        assert!(!parse_ufw_status_active("Status: inactive\n"));
        assert!(!parse_ufw_status_active("ERROR: You need to be root to run this script\n"));
    }

    #[test]
    fn parse_sshd_directive_uses_last_uncommented_value() {
        let cfg = "#PasswordAuthentication yes\nPasswordAuthentication no\n";
        assert_eq!(
            parse_sshd_directive(cfg, "PasswordAuthentication").as_deref(),
            Some("no")
        );
    }

    #[test]
    fn resolve_password_auth_from_config_when_sshd_t_unavailable() {
        let cfg = "Include /etc/ssh/sshd_config.d/*.conf\nPasswordAuthentication no\n";
        assert_eq!(resolve_ssh_password_auth("", cfg), "no");
        assert_eq!(resolve_ssh_password_auth("sshd: no hostkeys available", cfg), "no");
    }

    #[test]
    fn resolve_password_auth_prefers_sshd_t_when_present() {
        assert_eq!(
            resolve_ssh_password_auth("passwordauthentication yes", "PasswordAuthentication no"),
            "yes"
        );
        assert_eq!(
            resolve_ssh_password_auth("passwordauthentication no", "PasswordAuthentication yes"),
            "no"
        );
    }

    #[test]
    fn resolve_root_login_from_config_when_sshd_t_unavailable() {
        assert_eq!(
            resolve_ssh_permit_root_login("", "#PermitRootLogin yes\nPermitRootLogin no\n"),
            "no"
        );
    }
}
