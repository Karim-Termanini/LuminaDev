use serde_json::{json, Value};
use tauri::AppHandle;

use crate::host_exec::{
    cmd_timeout_long, cmd_timeout_short, exec_output, exec_output_limit,
    set_global_daemon_auto_restart, set_global_ipc_timeout, set_global_thread_pool_size,
};
use crate::utils::{app_file, is_allowed_store_key, now_ms, read_json, write_json};

// ---------------------------------------------------------------------------
// Store operations (dh:store:*)
// ---------------------------------------------------------------------------

pub(crate) async fn store_get(app: &AppHandle, body: &Value) -> Value {
    let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
    if !is_allowed_store_key(key) {
        return json!({ "ok": false, "error": "[STORE_KEY_DENIED] Key not allowed." });
    }
    match app_file(app, "store.json") {
        Ok(path) => {
            let store = read_json(&path);
            json!({ "ok": true, "data": store.get(key).cloned().unwrap_or(Value::Null) })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn store_set(app: &AppHandle, body: &Value) -> Value {
    let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
    if !is_allowed_store_key(key) {
        return json!({ "ok": false, "error": "[STORE_KEY_DENIED] Key not allowed." });
    }
    match app_file(app, "store.json") {
        Ok(path) => {
            let mut store = read_json(&path);
            // Accept both 'value' and 'data' to resolve contract mismatch
            let value = body
                .get("value")
                .or_else(|| body.get("data"))
                .cloned()
                .unwrap_or(Value::Null);

            if !store.is_object() {
                store = json!({});
            }
            if let Some(map) = store.as_object_mut() {
                map.insert(key.to_string(), value.clone());
            }
            if key == "app_engine_settings" {
                if let Some(ms) = value.get("ipcTimeoutMs").and_then(|v| v.as_u64()) {
                    set_global_ipc_timeout(ms);
                }
                if let Some(n) = value.get("threadPoolSize").and_then(|v| v.as_u64()) {
                    set_global_thread_pool_size(n);
                }
                if let Some(v) = value.get("daemonAutoRestart").and_then(|v| v.as_bool()) {
                    set_global_daemon_auto_restart(v);
                }
            }
            match write_json(&path, &store) {
                Ok(_) => json!({ "ok": true }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn store_delete(app: &AppHandle, body: &Value) -> Value {
    let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
    if !is_allowed_store_key(key) {
        return json!({ "ok": false, "error": "[STORE_KEY_DENIED] Key not allowed." });
    }
    match app_file(app, "store.json") {
        Ok(path) => {
            let mut store = read_json(&path);
            if store.is_object() {
                if let Some(map) = store.as_object_mut() {
                    map.remove(key);
                }
            }
            match write_json(&path, &store) {
                Ok(_) => json!({ "ok": true }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

// ---------------------------------------------------------------------------
// Layout operations (dh:layout:*)
// ---------------------------------------------------------------------------

pub(crate) async fn layout_get(app: &AppHandle, body: &Value) -> Value {
    match app_file(app, "layout.json") {
        Ok(path) => {
            let layout_data = read_json(&path);
            let profile = body
                .get("profile")
                .and_then(|v| v.as_str())
                .unwrap_or("default");
            let profile_layout = if let Some(profiles) = layout_data.get("profiles") {
                if let Some(p_layout) = profiles.get(profile) {
                    p_layout.clone()
                } else {
                    json!({ "version": 1, "placements": [] })
                }
            } else if layout_data.get("placements").is_some() {
                layout_data.clone()
            } else {
                json!({ "version": 1, "placements": [] })
            };
            json!({ "ok": true, "layout": profile_layout })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn layout_set(app: &AppHandle, body: &Value) -> Value {
    match app_file(app, "layout.json") {
        Ok(path) => {
            let mut layout_data = read_json(&path);
            if !layout_data.is_object() || layout_data == json!({}) {
                layout_data = json!({ "profiles": {} });
            } else if layout_data.get("profiles").is_none()
                && layout_data.get("placements").is_some()
            {
                let old_layout = layout_data.clone();
                layout_data = json!({
                  "profiles": {
                    "default": old_layout
                  }
                });
            }
            let prof = body
                .get("profile")
                .and_then(|v| v.as_str())
                .unwrap_or("default");
            let value_to_store = body.get("layout").cloned().unwrap_or_else(|| body.clone());
            if let Some(obj) = layout_data
                .get_mut("profiles")
                .and_then(|v| v.as_object_mut())
            {
                obj.insert(prof.to_string(), value_to_store);
            } else {
                return json!({ "ok": false, "error": "[LAYOUT_SET_FAILED] profiles map is invalid." });
            }
            match write_json(&path, &layout_data) {
                Ok(_) => json!({ "ok": true }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

// ---------------------------------------------------------------------------
// Store helpers (formerly in lib.rs)
// ---------------------------------------------------------------------------

pub(crate) fn read_cloud_oauth_store_overrides(
    app: &AppHandle,
) -> (Option<String>, Option<String>) {
    let Ok(path) = app_file(app, "store.json") else {
        return (None, None);
    };
    let root = read_json(&path);
    let Some(bag) = root.get("cloud_oauth_clients") else {
        return (None, None);
    };
    let gh = bag
        .get("github_client_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let gl = bag
        .get("gitlab_client_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    (gh, gl)
}

// ---------------------------------------------------------------------------
// Git recent / config / clone / status (inline → delegated from lib.rs)
// ---------------------------------------------------------------------------

pub(crate) async fn handle_git_recent_list(app: &AppHandle) -> Value {
    match app_file(app, "git_recent.json") {
        Ok(path) => {
            let value = read_json(&path);
            let repos = if value.is_array() { value } else { json!([]) };
            json!({ "ok": true, "repos": repos })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn handle_git_recent_add(app: &AppHandle, body: &Value) -> Value {
    let new_path = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if new_path.is_empty() {
        json!({ "ok": false, "error": "[GIT_RECENT_ADD_FAILED] Missing repo path." })
    } else {
        match app_file(app, "git_recent.json") {
            Ok(path) => {
                let value = read_json(&path);
                let mut repos: Vec<Value> = value.as_array().cloned().unwrap_or_default();
                repos.retain(|r| {
                    r.get("path").and_then(|v| v.as_str()).unwrap_or_default() != new_path
                });
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

pub(crate) async fn handle_git_config_set(body: &Value) -> Value {
    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
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
            if let Err(e) =
                exec_output("git", &["config", "--global", "init.defaultBranch", branch]).await
            {
                ok = false;
                err = e;
            }
        }
    }
    if ok {
        if let Some(editor) = default_editor {
            if let Err(e) = exec_output("git", &["config", "--global", "core.editor", editor]).await
            {
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

pub(crate) async fn handle_git_config_set_key(body: &Value) -> Value {
    let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
    let value = body.get("value").and_then(|v| v.as_str());
    const ALLOWED: &[&str] = &[
        "pull.rebase",
        "fetch.prune",
        "fetch.prunetags",
        "commit.gpgsign",
        "user.signingkey",
        "gpg.format",
        "credential.helper",
        "core.autocrlf",
        "core.eol",
        "core.fscache",
        "core.preloadindex",
        "core.longpaths",
        "core.ignorecase",
        "core.symlinks",
        "branch.autosetuprebase",
        "merge.ff",
        "rebase.autostash",
        "gc.auto",
        "pack.threads",
        "http.sslverify",
        "user.name",
        "user.email",
        "init.defaultbranch",
        "core.editor",
    ];
    if !ALLOWED.contains(&key) {
        return json!({
            "ok": false,
            "error": format!("[GIT_CONFIG_KEY_DENIED] Key '{}' is not permitted.", key)
        });
    }
    let result = match value {
        Some(v) => exec_output("git", &["config", "--global", key, v]).await,
        None => exec_output("git", &["config", "--global", "--unset", key]).await,
    };
    match result {
        Ok(_) | Err(_) if value.is_none() => json!({ "ok": true }),
        Ok(_) => json!({ "ok": true }),
        Err(e) => {
            json!({ "ok": false, "error": format!("[GIT_CONFIG_SET_FAILED] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_git_config_list() -> Value {
    match exec_output("git", &["config", "--global", "--list"]).await {
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
        Err(e) => {
            json!({ "ok": false, "error": format!("[GIT_CONFIG_LIST_FAILED] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_git_clone(body: &Value) -> Value {
    let url = body.get("url").and_then(|v| v.as_str()).unwrap_or_default();
    let target_dir = body
        .get("targetDir")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if url.is_empty() || target_dir.is_empty() {
        json!({ "ok": false, "error": "[GIT_CLONE_FAILED] Missing url or targetDir." })
    } else {
        match exec_output_limit("git", &["clone", url, target_dir], cmd_timeout_long()).await {
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
}

pub(crate) async fn handle_git_status(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
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
        match exec_output_limit("bash", &["-c", &script], cmd_timeout_short()).await {
            Ok(info_raw) => match serde_json::from_str::<Value>(&info_raw) {
                Ok(info) => json!({ "ok": true, "info": info }),
                Err(_) => {
                    json!({ "ok": false, "error": "[GIT_STATUS_FAILED] Could not parse git status output." })
                }
            },
            Err(e) => {
                json!({ "ok": false, "error": format!("[GIT_STATUS_FAILED] {}", e.trim()) })
            }
        }
    }
}
