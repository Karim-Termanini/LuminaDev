use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadinessReport {
    pub hardware: HardwareStatus,
    pub software: SoftwareStatus,
    pub network: NetworkStatus,
    pub tools: ToolsStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareStatus {
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub ram_total_gb: f64,
    pub ram_free_gb: f64,
    pub disk_total_gb: f64,
    pub disk_free_gb: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SoftwareStatus {
    pub docker_installed: bool,
    pub docker_running: bool,
    pub docker_version: String,
    pub in_docker_group: bool,
    pub kvm_supported: bool,
    pub is_sandboxed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub github_latency_ms: Option<u64>,
    pub gitlab_latency_ms: Option<u64>,
    pub docker_hub_latency_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolsStatus {
    pub curl: bool,
    pub tar: bool,
    pub unzip: bool,
    pub git: bool,
}

pub async fn check_readiness(_app: &AppHandle) -> ReadinessReport {
    ReadinessReport {
        hardware: probe_hardware(),
        software: probe_software(),
        network: probe_network().await,
        tools: probe_tools(),
    }
}

fn probe_hardware() -> HardwareStatus {
    let mut cpu_model = "Unknown".to_string();
    let mut cpu_cores = 0;
    if let Ok(content) = fs::read_to_string("/proc/cpuinfo") {
        cpu_cores = content.split("processor\t:").count() - 1;
        if let Some(line) = content.lines().find(|l| l.contains("model name")) {
            cpu_model = line.split(':').nth(1).unwrap_or("Unknown").trim().to_string();
        }
    }

    let mut ram_total_gb = 0.0;
    let mut ram_free_gb = 0.0;
    if let Ok(content) = fs::read_to_string("/proc/meminfo") {
        for line in content.lines() {
            if line.starts_with("MemTotal:") {
                let kb: f64 = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                ram_total_gb = kb / 1024.0 / 1024.0;
            }
            if line.starts_with("MemAvailable:") {
                let kb: f64 = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                ram_free_gb = kb / 1024.0 / 1024.0;
            }
        }
    }

    let (disk_total_gb, disk_free_gb) = probe_disk_space("/");

    HardwareStatus {
        cpu_model,
        cpu_cores,
        ram_total_gb,
        ram_free_gb,
        disk_total_gb,
        disk_free_gb,
    }
}

fn probe_disk_space(path: &str) -> (f64, f64) {
    unsafe {
        let mut stats: libc::statvfs = std::mem::zeroed();
        let path_c = std::ffi::CString::new(path).unwrap();
        if libc::statvfs(path_c.as_ptr(), &mut stats) == 0 {
            let total = (stats.f_blocks as f64 * stats.f_frsize as f64) / 1024.0 / 1024.0 / 1024.0;
            let free = (stats.f_bavail as f64 * stats.f_frsize as f64) / 1024.0 / 1024.0 / 1024.0;
            return (total, free);
        }
    }
    (0.0, 0.0)
}

fn probe_software() -> SoftwareStatus {
    let docker_version_out = Command::new("docker")
        .arg("version")
        .arg("--format")
        .arg("{{.Server.Version}}")
        .output();
    
    let docker_installed = docker_version_out.is_ok();
    let (docker_running, docker_version) = if let Ok(out) = docker_version_out {
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        (out.status.success(), v)
    } else {
        (false, "N/A".to_string())
    };

    let groups_out = Command::new("id").arg("-nG").output();
    let in_docker_group = if let Ok(out) = groups_out {
        String::from_utf8_lossy(&out.stdout).contains("docker")
    } else {
        false
    };

    let kvm_supported = fs::metadata("/dev/kvm").is_ok();
    let is_sandboxed = fs::metadata("/run/flatpak-info").is_ok();

    SoftwareStatus {
        docker_installed,
        docker_running,
        docker_version,
        in_docker_group,
        kvm_supported,
        is_sandboxed,
    }
}

async fn probe_network() -> NetworkStatus {
    // Basic ping simulation via curl -I (faster/reliable in restricted envs)
    let github = check_latency("https://github.com").await;
    let gitlab = check_latency("https://gitlab.com").await;
    let docker = check_latency("https://hub.docker.com").await;

    NetworkStatus {
        github_latency_ms: github,
        gitlab_latency_ms: gitlab,
        docker_hub_latency_ms: docker,
    }
}

async fn check_latency(url: &str) -> Option<u64> {
    let start = std::time::Instant::now();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;
    
    if client.head(url).send().await.is_ok() {
        Some(start.elapsed().as_millis() as u64)
    } else {
        None
    }
}

pub fn probe_tools() -> ToolsStatus {
    ToolsStatus {
        curl: Command::new("which").arg("curl").output().map(|o| o.status.success()).unwrap_or(false),
        tar: Command::new("which").arg("tar").output().map(|o| o.status.success()).unwrap_or(false),
        unzip: Command::new("which").arg("unzip").output().map(|o| o.status.success()).unwrap_or(false),
        git: Command::new("which").arg("git").output().map(|o| o.status.success()).unwrap_or(false),
    }
}

pub async fn run_fix(id: &str) -> Result<(), String> {
    match id {
        "docker-start" => {
            let status = Command::new("sudo")
                .arg("systemctl")
                .arg("start")
                .arg("docker")
                .status()
                .map_err(|e| format!("Failed to start docker: {}", e))?;
            if status.success() { Ok(()) } else { Err("Failed to start docker service.".to_string()) }
        },
        "docker-group" => {
            let user = std::env::var("USER").unwrap_or_default();
            if user.is_empty() { return Err("Could not detect current user.".to_string()); }
            let status = Command::new("sudo")
                .arg("usermod")
                .arg("-aG")
                .arg("docker")
                .arg(&user)
                .status()
                .map_err(|e| format!("Failed to add user to group: {}", e))?;
            if status.success() { Ok(()) } else { Err("Failed to update group membership.".to_string()) }
        },
        _ => Err(format!("Unknown fix ID: {}", id)),
    }
}
