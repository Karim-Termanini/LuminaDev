use serde_json::{json, Value};

use crate::host_exec::{
  cmd_timeout_long, cmd_timeout_short, exec_output, exec_output_limit, exec_result, exec_result_limit,
};
use crate::utils::{docker_prune_preview_payload, parse_size_mb};

pub(crate) async fn docker_check_installed() -> Value {
  let docker = exec_output_limit("docker", &["--version"], cmd_timeout_short()).await.is_ok();
  let compose = exec_output_limit("docker", &["compose", "version"], cmd_timeout_short()).await.is_ok();
  let buildx = exec_output_limit("docker", &["buildx", "version"], cmd_timeout_short()).await.is_ok();
  json!({ "docker": docker, "compose": compose, "buildx": buildx })
}

pub(crate) async fn docker_list() -> Value {
  match exec_output("docker", &["ps", "-a", "--format", "{\"ID\":\"{{.ID}}\",\"Names\":\"{{.Names}}\",\"Image\":\"{{.Image}}\",\"State\":\"{{.State}}\",\"Status\":\"{{.Status}}\",\"Ports\":\"{{.Ports}}\",\"Networks\":\"{{.Networks}}\",\"Mounts\":\"{{.Mounts}}\"}"]).await {
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
  }
}

pub(crate) async fn docker_action(body: &Value) -> Value {
  let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
  let action = body.get("action").and_then(|v| v.as_str()).unwrap_or_default();
  if id.is_empty() || action.is_empty() {
    return json!({ "ok": false, "error": "[DOCKER_ACTION_FAILED] Missing id or action." });
  }
  if action == "remove" {
    let remove_volumes = body.get("removeVolumes").and_then(|v| v.as_bool()).unwrap_or(false);
    let remove_image = body.get("removeImage").and_then(|v| v.as_bool()).unwrap_or(false);
    let image_ref = body.get("image").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let remove_args: Vec<&str> = if remove_volumes {
      vec!["rm", "-f", "-v", id]
    } else {
      vec!["rm", "-f", id]
    };
    return match exec_output("docker", &remove_args).await {
      Ok(_) => {
        if remove_image && !image_ref.trim().is_empty() {
          let _ = exec_output("docker", &["rmi", image_ref.trim()]).await;
        }
        json!({ "ok": true })
      }
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] {}", e.trim()) }),
    };
  }
  let args: Vec<&str> = match action {
    "start" => vec!["start", id],
    "stop" => vec!["stop", id],
    "restart" => vec!["restart", id],
    _ => return json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] Unsupported action: {}", action) }),
  };
  match exec_output("docker", &args).await {
    Ok(_) => json!({ "ok": true }),
    Err(e) => json!({ "ok": false, "error": format!("[DOCKER_ACTION_FAILED] {}", e.trim()) }),
  }
}

pub(crate) async fn docker_logs(body: &Value) -> Value {
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
}

pub(crate) async fn docker_images_list() -> Value {
  match exec_output("docker", &["images", "--format", "{{json .}}", "--no-trunc"]).await {
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
  }
}

pub(crate) async fn docker_image_action(body: &Value) -> Value {
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
}

pub(crate) async fn docker_volumes_list() -> Value {
  match exec_output("docker", &["volume", "ls", "--format", "{{.Name}}"]).await {
    Ok(out) => {
      let rows: Vec<Value> = out
        .lines()
        .filter(|name| !name.trim().is_empty())
        .map(|name| json!({ "name": name.trim(), "driver": "local", "mountpoint": "", "scope": "local", "usedBy": [] }))
        .collect();
      json!({ "ok": true, "rows": rows })
    }
    Err(e) => json!({ "ok": false, "error": format!("[DOCKER_VOLUMES_FAILED] {}", e.trim()) }),
  }
}

pub(crate) async fn docker_volume_create(body: &Value) -> Value {
  let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
  if name.is_empty() {
    json!({ "ok": false, "error": "[DOCKER_VOLUME_CREATE_FAILED] Missing volume name." })
  } else {
    match exec_output("docker", &["volume", "create", name]).await {
      Ok(_) => json!({ "ok": true }),
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_VOLUME_CREATE_FAILED] {}", e.trim()) }),
    }
  }
}

pub(crate) async fn docker_volume_action(body: &Value) -> Value {
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
}

pub(crate) async fn docker_networks_list() -> Value {
  match exec_output("docker", &["network", "ls", "--format", "{{json .}}"]).await {
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
  }
}

pub(crate) async fn docker_network_create(body: &Value) -> Value {
  let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
  if name.is_empty() {
    json!({ "ok": false, "error": "[DOCKER_NETWORK_CREATE_FAILED] Missing network name." })
  } else {
    match exec_output("docker", &["network", "create", name]).await {
      Ok(_) => json!({ "ok": true }),
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_NETWORK_CREATE_FAILED] {}", e.trim()) }),
    }
  }
}

pub(crate) async fn docker_network_action(body: &Value) -> Value {
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
}

pub(crate) async fn docker_prune() -> Value {
  match exec_output("docker", &["system", "prune", "-f", "--volumes"]).await {
    Ok(log) => json!({ "ok": true, "log": log }),
    Err(e) => json!({ "ok": false, "error": format!("[DOCKER_PRUNE_FAILED] {}", e.trim()) }),
  }
}

pub(crate) async fn docker_prune_preview(_body: &Value) -> Value {
  let containers = docker_nonempty_line_count(&["ps", "-a", "-q", "--filter", "status=exited"]).await;
  let images = docker_nonempty_line_count(&["images", "-f", "dangling=true", "-q"]).await;
  let volumes = docker_nonempty_line_count(&["volume", "ls", "-qf", "dangling=true"]).await;
  let networks = docker_nonempty_line_count(&["network", "ls", "-qf", "dangling=true"]).await;
  docker_prune_preview_payload(containers, images, volumes, networks)
}

pub(crate) async fn docker_cleanup_run(body: &Value) -> Value {
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
}

pub(crate) async fn docker_pull(body: &Value) -> Value {
  let image = body.get("image").and_then(|v| v.as_str()).unwrap_or_default();
  if image.is_empty() {
    json!({ "ok": false, "error": "[DOCKER_PULL_FAILED] Missing image name." })
  } else {
    match exec_result_limit("docker", &["pull", image], cmd_timeout_long()).await {
      Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
      Err(e) => json!({ "ok": false, "error": format!("[DOCKER_PULL_FAILED] {}", e.trim()) }),
    }
  }
}

pub(crate) async fn docker_search(body: &Value) -> Value {
  let term = body.as_str().unwrap_or_default();
  match exec_output_limit("curl", &["-fsSL", &format!("https://hub.docker.com/v2/search/repositories/?query={}&page_size=12", term)], cmd_timeout_short()).await {
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
}

pub(crate) async fn docker_tags(body: &Value) -> Value {
  let image = body.as_str().unwrap_or_default();
  let mut parts = image.split('/');
  let (namespace, repo) = if image.contains('/') {
    (parts.next().unwrap_or("library"), parts.collect::<Vec<_>>().join("/"))
  } else {
    ("library", image.to_string())
  };
  let url = format!("https://hub.docker.com/v2/repositories/{}/{}/tags/?page_size=20", namespace, repo);
  match exec_output_limit("curl", &["-fsSL", &url], cmd_timeout_short()).await {
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
}

pub(crate) async fn docker_create(body: &Value) -> Value {
  let image = body.get("image").and_then(|v| v.as_str()).unwrap_or_default();
  let name = body.get("name").and_then(|v| v.as_str()).unwrap_or_default();
  if image.is_empty() || name.is_empty() {
    return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] Missing image or name." });
  }
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
    args.push("sh".to_string());
    args.push("-c".to_string());
    args.push("while true; do sleep 3600; done".to_string());
  }
  let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
  match exec_output("docker", &refs).await {
    Ok(out) => {
      let id = out.trim().to_string();
      if id.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_CREATE_FAILED] docker create returned empty id.", "id": "" });
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

pub(crate) async fn docker_remap_port(body: &Value) -> Value {
  crate::docker_ext::docker_remap_port_invoke(body).await
}

pub(crate) async fn docker_inspect(body: &Value) -> Value {
  crate::docker_ext::docker_inspect_invoke(body).await
}

pub(crate) async fn docker_reconfigure(body: &Value) -> Value {
  crate::docker_ext::docker_reconfigure_invoke(body).await
}

pub(crate) async fn docker_install(body: &Value) -> Value {
  crate::docker_ext::docker_install_invoke(body).await
}

async fn docker_nonempty_line_count(args: &[&str]) -> u64 {
  match exec_output_limit("docker", args, cmd_timeout_short()).await {
    Ok(out) => out.lines().filter(|l| !l.trim().is_empty()).count() as u64,
    Err(_) => 0,
  }
}
