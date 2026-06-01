//! Docker Engine API via bollard (Unix socket). Avoids parsing CLI human-readable output.

use bollard::query_parameters::{
    CreateImageOptionsBuilder, ListContainersOptionsBuilder, ListNetworksOptionsBuilder,
    ListVolumesOptionsBuilder, LogsOptionsBuilder, RemoveContainerOptionsBuilder,
    RemoveImageOptionsBuilder, StatsOptionsBuilder,
};
use bollard::Docker;
use futures_util::StreamExt;
use serde_json::{json, Value};

const BYTES_PER_MB: f64 = 1024.0 * 1024.0;

fn connect_docker() -> Result<Docker, String> {
    Docker::connect_with_local_defaults().map_err(|e| format!("[DOCKER_API_ERROR] {}", e))
}

fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / BYTES_PER_MB
}

/// CPU percent from two consecutive stats samples (Docker API formula).
fn cpu_percent_from_stats(
    cpu_total: u64,
    precpu_total: u64,
    system: u64,
    presystem: u64,
    online_cpus: u32,
) -> f64 {
    let cpu_delta = cpu_total.saturating_sub(precpu_total) as f64;
    let system_delta = system.saturating_sub(presystem) as f64;
    if system_delta <= 0.0 || online_cpus == 0 {
        return 0.0;
    }
    (cpu_delta / system_delta) * online_cpus as f64 * 100.0
}

pub(crate) async fn container_stats(id: &str) -> Value {
    if id.trim().is_empty() {
        return json!({"ok": false, "error": "[DOCKER_STATS_FAILED] Missing container id."});
    }
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({"ok": false, "error": e}),
    };
    let options = StatsOptionsBuilder::default()
        .stream(false)
        .one_shot(true)
        .build();
    let mut stream = docker.stats(id, Some(options));
    let stat = match stream.next().await {
        Some(Ok(s)) => s,
        Some(Err(e)) => {
            return json!({"ok": false, "error": format!("[DOCKER_STATS_FAILED] {}", e)});
        }
        None => {
            return json!({"ok": false, "error": "[DOCKER_STATS_FAILED] No stats returned."});
        }
    };

    let cpu_stats = stat.cpu_stats.as_ref();
    let precpu_stats = stat.precpu_stats.as_ref();
    let cpu_pct = match (cpu_stats, precpu_stats) {
        (Some(cur), Some(prev)) => {
            let total = cur
                .cpu_usage
                .as_ref()
                .and_then(|u| u.total_usage)
                .unwrap_or(0);
            let pre_total = prev
                .cpu_usage
                .as_ref()
                .and_then(|u| u.total_usage)
                .unwrap_or(0);
            let system = cur.system_cpu_usage.unwrap_or(0);
            let presystem = prev.system_cpu_usage.unwrap_or(0);
            let cpus = cur.online_cpus.unwrap_or(1);
            cpu_percent_from_stats(total, pre_total, system, presystem, cpus)
        }
        _ => 0.0,
    };

    let (mem_mb, mem_limit_mb) = stat
        .memory_stats
        .as_ref()
        .map(|m| {
            let usage = m.usage.unwrap_or(0);
            let limit = m.limit.unwrap_or(0);
            (bytes_to_mb(usage), bytes_to_mb(limit))
        })
        .unwrap_or((0.0, 0.0));

    let (net_rx_mb, net_tx_mb) = stat
        .networks
        .as_ref()
        .map(|nets| {
            let mut rx: u64 = 0;
            let mut tx: u64 = 0;
            for iface in nets.values() {
                rx = rx.saturating_add(iface.rx_bytes.unwrap_or(0));
                tx = tx.saturating_add(iface.tx_bytes.unwrap_or(0));
            }
            (bytes_to_mb(rx), bytes_to_mb(tx))
        })
        .unwrap_or((0.0, 0.0));

    json!({
      "ok": true,
      "cpuPct": (cpu_pct * 100.0).round() / 100.0,
      "memMb": (mem_mb * 100.0).round() / 100.0,
      "memLimitMb": (mem_limit_mb * 100.0).round() / 100.0,
      "netRxMb": (net_rx_mb * 100.0).round() / 100.0,
      "netTxMb": (net_tx_mb * 100.0).round() / 100.0
    })
}

pub(crate) async fn list_containers() -> Value {
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let options = ListContainersOptionsBuilder::default().all(true).build();
    match docker.list_containers(Some(options)).await {
        Ok(containers) => {
            let rows: Vec<Value> = containers
                .into_iter()
                .map(|c| {
                    let id = c.id.unwrap_or_default();
                    let name = c
                        .names
                        .as_ref()
                        .and_then(|n| n.first())
                        .map(|n| n.trim_start_matches('/').to_string())
                        .unwrap_or_default();
                    let image = c.image.unwrap_or_default();
                    let state = c
                        .state
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    let status = c.status.unwrap_or_else(|| state.clone());
                    let ports = c
                        .ports
                        .as_ref()
                        .map(|ps| {
                            ps.iter()
                                .filter_map(|p| {
                                    let host =
                                        p.public_port.map(|hp| hp.to_string()).unwrap_or_default();
                                    let ctr = p.private_port.to_string();
                                    let proto = p
                                        .typ
                                        .map(|t| t.to_string())
                                        .unwrap_or_else(|| "tcp".to_string());
                                    if host.is_empty() {
                                        None
                                    } else {
                                        Some(format!("{}:{}/{}", host, ctr, proto))
                                    }
                                })
                                .collect::<Vec<_>>()
                                .join(", ")
                        })
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "—".to_string());
                    let networks: Vec<String> = c
                        .network_settings
                        .as_ref()
                        .and_then(|ns| ns.networks.as_ref())
                        .map(|n| n.keys().cloned().collect())
                        .filter(|v: &Vec<String>| !v.is_empty())
                        .unwrap_or_else(|| vec!["bridge".to_string()]);
                    json!({
                      "id": id,
                      "name": name,
                      "image": image,
                      "imageId": "",
                      "state": state,
                      "status": status,
                      "ports": ports,
                      "networks": networks,
                      "volumes": []
                    })
                })
                .collect();
            json!({ "ok": true, "rows": rows })
        }
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_LIST_FAILED] {}", e) }),
    }
}

pub(crate) async fn list_images() -> Value {
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    use bollard::query_parameters::ListImagesOptions;
    let options: Option<ListImagesOptions> = None;
    match docker.list_images(options).await {
        Ok(images) => {
            let rows: Vec<Value> = images
                .into_iter()
                .map(|img| {
                    let id = img.id;
                    let repo_tags = img.repo_tags;
                    let size_bytes = img.size as u64;
                    let created = img.created;
                    json!({
                      "id": id,
                      "repoTags": repo_tags,
                      "sizeMb": (bytes_to_mb(size_bytes) * 100.0).round() / 100.0,
                      "createdAt": created.to_string()
                    })
                })
                .collect();
            json!({ "ok": true, "rows": rows })
        }
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_IMAGES_FAILED] {}", e) }),
    }
}

fn split_image_ref(image: &str) -> (String, String) {
    let image = image.trim();
    if let Some(idx) = image.rfind(':') {
        let (name, tag_part) = image.split_at(idx);
        let tag = &tag_part[1..];
        if !name.is_empty() && !tag.contains('/') {
            return (name.to_string(), tag.to_string());
        }
    }
    (image.to_string(), "latest".to_string())
}

/// Pull image via Engine API; `on_progress(current_bytes, total_bytes, status_line)`.
pub(crate) async fn pull_image<F>(image: &str, mut on_progress: F) -> Result<(), String>
where
    F: FnMut(u64, u64, &str),
{
    let docker = connect_docker()?;
    let (from_image, tag) = split_image_ref(image);
    let options = CreateImageOptionsBuilder::default()
        .from_image(from_image.as_str())
        .tag(tag.as_str())
        .build();
    let mut stream = docker.create_image(Some(options), None, None);
    while let Some(item) = stream.next().await {
        let info = item.map_err(|e| format!("[DOCKER_PULL_FAILED] {}", e))?;
        let status = info.status.as_deref().unwrap_or("pulling");
        let (current, total) = info
            .progress_detail
            .as_ref()
            .map(|d| (d.current.unwrap_or(0), d.total.unwrap_or(0)))
            .unwrap_or((0, 0));
        on_progress(current.max(0) as u64, total.max(0) as u64, status);
    }
    Ok(())
}

pub(crate) async fn container_action(id: &str, action: &str, remove_volumes: bool) -> Value {
    if id.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_ACTION_FAILED] Missing id." });
    }
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let result = match action {
        "start" => docker.start_container(id, None).await.map(|_| ()),
        "stop" => docker.stop_container(id, None).await.map(|_| ()),
        "restart" => docker.restart_container(id, None).await.map(|_| ()),
        "remove" => {
            let opts = RemoveContainerOptionsBuilder::default()
                .force(true)
                .v(remove_volumes)
                .build();
            docker.remove_container(id, Some(opts)).await.map(|_| ())
        }
        other => {
            return json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] Unsupported action: {}", other) });
        }
    };
    match result {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] {}", e) }),
    }
}

pub(crate) async fn remove_image(id: &str, force: bool) -> Value {
    if id.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_IMAGE_ACTION_FAILED] Missing image id." });
    }
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let opts = RemoveImageOptionsBuilder::default().force(force).build();
    match docker.remove_image(id, Some(opts), None).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_IMAGE_ACTION_FAILED] {}", e) }),
    }
}

pub(crate) async fn container_logs(id: &str, tail: u64) -> Value {
    if id.is_empty() {
        return json!({ "ok": false, "text": "", "error": "[DOCKER_LOGS_FAILED] Missing id." });
    }
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "text": "", "error": e }),
    };
    let tail_s = tail.to_string();
    let opts = LogsOptionsBuilder::default()
        .stdout(true)
        .stderr(true)
        .tail(&tail_s)
        .build();
    let mut stream = docker.logs(id, Some(opts));
    let mut text = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(out) => text.push_str(&out.to_string()),
            Err(e) => {
                return json!({ "ok": false, "text": "", "error": format!("[DOCKER_LOGS_FAILED] {}", e) });
            }
        }
    }
    json!({ "ok": true, "text": text })
}

pub(crate) async fn list_volumes(
    usage_map: std::collections::HashMap<String, Vec<String>>,
) -> Value {
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let opts = ListVolumesOptionsBuilder::default().build();
    match docker.list_volumes(Some(opts)).await {
        Ok(resp) => {
            let rows: Vec<Value> = resp
                .volumes
                .unwrap_or_default()
                .into_iter()
                .map(|v| {
                    let name = v.name;
                    let used_by = usage_map.get(&name).cloned().unwrap_or_default();
                    json!({
                      "name": name,
                      "driver": v.driver,
                      "mountpoint": v.mountpoint,
                      "scope": v.scope.map(|s| s.to_string()).unwrap_or_else(|| "local".to_string()),
                      "usedBy": used_by
                    })
                })
                .collect();
            json!({ "ok": true, "rows": rows })
        }
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_VOLUMES_FAILED] {}", e) }),
    }
}

#[allow(dead_code)]
pub(crate) async fn create_volume(name: &str) -> Value {
    let _ = name;
    json!({ "ok": false, "error": "[DOCKER_VOLUME_CREATE_FAILED] not implemented via API." })
}

#[allow(dead_code)]
pub(crate) async fn remove_volume(name: &str) -> Value {
    let _ = name;
    json!({ "ok": false, "error": "[DOCKER_VOLUME_ACTION_FAILED] not implemented via API." })
}

pub(crate) async fn list_networks() -> Value {
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let opts = ListNetworksOptionsBuilder::default().build();
    match docker.list_networks(Some(opts)).await {
        Ok(networks) => {
            let rows: Vec<Value> = networks
                .into_iter()
                .map(|n| {
                    json!({
                      "id": n.id.unwrap_or_default(),
                      "name": n.name.unwrap_or_default(),
                      "driver": n.driver.unwrap_or_else(|| "bridge".to_string()),
                      "scope": n.scope.unwrap_or_else(|| "local".to_string()),
                      "usedBy": []
                    })
                })
                .collect();
            json!({ "ok": true, "rows": rows })
        }
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_NETWORKS_FAILED] {}", e) }),
    }
}

#[allow(dead_code)]
pub(crate) async fn create_network(name: &str) -> Value {
    let _ = name;
    json!({ "ok": false, "error": "[DOCKER_NETWORK_CREATE_FAILED] not implemented via API." })
}

#[allow(dead_code)]
pub(crate) async fn remove_network(id: &str) -> Value {
    if id.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_NETWORK_ACTION_FAILED] Invalid payload." });
    }
    let docker = match connect_docker() {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    match docker.remove_network(id).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_NETWORK_ACTION_FAILED] {}", e) }),
    }
}

pub(crate) async fn pull_image_simple(image: &str) -> Value {
    if image.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_PULL_FAILED] Missing image name." });
    }
    match pull_image(image, |_, _, _| {}).await {
        Ok(()) => json!({ "ok": true, "log": format!("Pulled {}", image) }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_percent_from_delta() {
        let pct = cpu_percent_from_stats(200_000_000, 100_000_000, 1_000_000_000, 500_000_000, 2);
        assert!((pct - 40.0).abs() < 0.01);
    }

    #[test]
    fn bytes_to_mb_converts() {
        assert!((bytes_to_mb(10 * 1024 * 1024) - 10.0).abs() < 0.01);
    }
}
