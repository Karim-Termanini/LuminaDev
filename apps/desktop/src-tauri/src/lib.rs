use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Default)]
struct AppState {
  terminals: Mutex<HashMap<String, ChildStdin>>,
  jobs: Mutex<Vec<Value>>,
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

async fn exec_output(cmd: &str, args: &[&str]) -> Result<String, String> {
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
}

async fn exec_result(cmd: &str, args: &[&str]) -> Result<(String, String), String> {
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

async fn invoke_node_bridge(channel: &str, payload: &Value) -> Value {
  let payload_raw = payload.to_string();
  let output = Command::new("node")
    .arg("../scripts/tauri-ipc-bridge.mjs")
    .arg(channel)
    .arg(payload_raw)
    .output()
    .await;
  match output {
    Ok(out) => {
      if out.status.success() {
        let body = String::from_utf8_lossy(&out.stdout).trim().to_string();
        serde_json::from_str(&body).unwrap_or_else(|_| json!({ "ok": false, "error": "[TAURI_BRIDGE_PARSE_ERROR] Invalid JSON from node bridge." }))
      } else {
        json!({
          "ok": false,
          "error": format!("[TAURI_BRIDGE_FAILED] {}", String::from_utf8_lossy(&out.stderr).trim())
        })
      }
    },
    Err(e) => json!({ "ok": false, "error": format!("[TAURI_BRIDGE_SPAWN_FAILED] {}", e) }),
  }
}

#[tauri::command]
async fn ipc_send(channel: String, payload: Value, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
  match channel.as_str() {
    "dh:terminal:write" => {
      let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let data = payload.get("data").and_then(|v| v.as_str()).unwrap_or_default().to_string();
      let mut map = state.terminals.lock().await;
      if let Some(stdin) = map.get_mut(&id) {
        stdin.write_all(data.as_bytes()).await.map_err(|e| format!("[TERMINAL_WRITE_FAILED] {}", e))?;
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
      let distro = exec_output("bash", &["-lc", "source /etc/os-release >/dev/null 2>&1; echo ${ID:-linux}"])
        .await
        .unwrap_or_else(|_| "linux".to_string());
      json!(distro)
    },
    "dh:docker:check-installed" => {
      let docker = exec_output("bash", &["-lc", "command -v docker >/dev/null 2>&1 && echo ok"]).await.is_ok();
      let compose = exec_output("bash", &["-lc", "docker compose version >/dev/null 2>&1 && echo ok"]).await.is_ok();
      let buildx = exec_output("bash", &["-lc", "docker buildx version >/dev/null 2>&1 && echo ok"]).await.is_ok();
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
      let containers = exec_output("bash", &["-lc", "docker ps -a -q --filter status=exited | wc -l"]).await.unwrap_or_else(|_| "0".to_string());
      let images = exec_output("bash", &["-lc", "docker images -f dangling=true -q | wc -l"]).await.unwrap_or_else(|_| "0".to_string());
      let volumes = exec_output("bash", &["-lc", "docker volume ls -qf dangling=true | wc -l"]).await.unwrap_or_else(|_| "0".to_string());
      let networks = exec_output("bash", &["-lc", "docker network ls -qf dangling=true | wc -l"]).await.unwrap_or_else(|_| "0".to_string());
      json!({
        "ok": true,
        "preview": {
          "containers": containers.trim().parse::<u64>().unwrap_or(0),
          "images": images.trim().parse::<u64>().unwrap_or(0),
          "volumes": volumes.trim().parse::<u64>().unwrap_or(0),
          "networks": networks.trim().parse::<u64>().unwrap_or(0)
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
        match exec_result("docker", &["pull", image]).await {
          Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
          Err(e) => json!({ "ok": false, "error": format!("[DOCKER_PULL_FAILED] {}", e.trim()) }),
        }
      }
    },
    "dh:docker:search" => {
      let term = body.as_str().unwrap_or_default();
      match exec_output("curl", &["-fsSL", &format!("https://hub.docker.com/v2/search/repositories/?query={}&page_size=12", term)]).await {
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
      match exec_output("curl", &["-fsSL", &url]).await {
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
    "dh:compose:up" | "dh:compose:logs" => {
      let profile = body.get("profile").and_then(|v| v.as_str()).unwrap_or("web-dev");
      let dir = find_repo_root(&std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("docker")
        .join("compose")
        .join(profile)
        .to_string_lossy()
        .to_string();
      let cmd = if channel == "dh:compose:up" {
        format!("cd '{}' && docker compose up -d", dir.replace('\'', "'\\''"))
      } else {
        format!("cd '{}' && docker compose logs --tail 200", dir.replace('\'', "'\\''"))
      };
      match exec_result("bash", &["-lc", &cmd]).await {
        Ok((stdout, stderr)) => json!({ "ok": true, "log": format!("{}{}", stdout, stderr) }),
        Err(e) => json!({ "ok": false, "log": "", "error": format!("[DOCKER_COMPOSE_FAILED] {}", e.trim()) }),
      }
    },
    "dh:terminal:openExternal" => {
      let launched = exec_output("bash", &["-lc", "for t in xdg-terminal-emulator gnome-console kitty alacritty gnome-terminal konsole xfce4-terminal xterm; do command -v $t >/dev/null 2>&1 && ($t >/dev/null 2>&1 &); if [ $? -eq 0 ]; then echo ok; exit 0; fi; done; exit 1"]).await.is_ok();
      if launched {
        json!({ "ok": true })
      } else {
        json!({ "ok": false, "error": "[TERMINAL_NOT_FOUND] Could not spawn host terminal." })
      }
    }
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
          if let Some(stdin) = child.stdin.take() {
            state.terminals.lock().await.insert(id.clone(), stdin);
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
            if let Some(stdin) = child.stdin.take() {
              state.terminals.lock().await.insert(id.clone(), stdin);
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
      let mut jobs = state.jobs.lock().await;
      jobs.push(json!({"id": id, "kind": body.get("kind").cloned().unwrap_or(json!("job")), "state": "done", "progress": 100, "logTail": ["No-op job under Tauri bridge."]}));
      json!({ "id": id })
    }
    "dh:job:cancel" => json!({ "ok": true }),
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
        match exec_output("git", &["clone", url, target_dir]).await {
          Ok(_) => json!({ "ok": true }),
          Err(e) => json!({ "ok": false, "error": format!("[GIT_CLONE_FAILED] {}", e.trim()) }),
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
        match exec_output("bash", &["-lc", &script]).await {
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
    "dh:ssh:test:github" => match exec_result("ssh", &["-T", "git@github.com"]).await {
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
        match exec_result("bash", &["-lc", check]).await {
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
    "dh:runtime:check-deps" => json!({ "ok": true, "dependencies": [] }),
    "dh:runtime:uninstall:preview" => json!({
      "ok": true,
      "runtimePackages": [],
      "removableDeps": [],
      "blockedSharedDeps": [],
      "finalPackages": [],
      "note": "Preview unavailable in Rust-native baseline implementation."
    }),
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
      let uptime = exec_output("bash", &["-lc", "cut -d. -f1 /proc/uptime 2>/dev/null || echo 0"])
        .await
        .unwrap_or_else(|_| "0".to_string())
        .trim()
        .parse::<u64>()
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
      match exec_output("bash", &["-lc", script]).await {
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
      let script = "ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 16";
      match exec_output("bash", &["-lc", script]).await {
        Ok(out) => {
          let processes: Vec<Value> = out
            .lines()
            .skip(1)
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
    // Stage 2: routed to Node bridge for parity while Rust-native port progresses.
    "dh:docker:create"
    | "dh:docker:remap-port"
    | "dh:metrics"
    | "dh:host:exec"
    | "dh:dialog:folder"
    | "dh:dialog:file:open"
    | "dh:dialog:file:save"
    | "dh:ssh:list:dir"
    | "dh:ssh:setup:remote:key"
    | "dh:docker:install"
    => invoke_node_bridge(&channel, &body).await,
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
