use serde_json::{json, Value};
use tauri::AppHandle;

use crate::host_exec::{
    cmd_timeout_long, cmd_timeout_short, exec_output, exec_output_limit,
    set_global_daemon_auto_restart, set_global_ipc_timeout, set_global_thread_pool_size,
};
use crate::utils::{
    app_file, is_allowed_store_key, now_ms, read_json, read_json_async, write_json,
    write_json_async,
};

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
            let store = read_json_async(path).await;
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
            let mut store = read_json_async(path.clone()).await;
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
            match write_json_async(path, store).await {
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
            let mut store = read_json_async(path.clone()).await;
            if store.is_object() {
                if let Some(map) = store.as_object_mut() {
                    map.remove(key);
                }
            }
            match write_json_async(path, store).await {
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

/// Last path segment of a clone URL, without `.git` (e.g. `https://host/org/repo.git` → `repo`).
pub(crate) fn clone_repo_dir_name_from_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    let last = trimmed.rsplit('/').next().unwrap_or("repository");
    let name = last.trim_end_matches(".git").trim();
    if name.is_empty() {
        "repository".to_string()
    } else {
        name.to_string()
    }
}

/// Pick `parent/repo_name`, or `repo_name-2`, … when a non-repo path already occupies the name.
pub(crate) fn pick_clone_destination(parent_dir: &str, repo_name: &str) -> std::path::PathBuf {
    use std::path::Path;
    let parent = Path::new(parent_dir);
    let base = parent.join(repo_name);
    if !base.exists() || path_is_git_repo(&base) {
        return base;
    }
    for n in 2..=99 {
        let alt = parent.join(format!("{repo_name}-{n}"));
        if !alt.exists() {
            return alt;
        }
    }
    parent.join(format!("{repo_name}-copy"))
}

fn path_is_git_repo(path: &std::path::Path) -> bool {
    path.join(".git").is_dir()
}

pub(crate) async fn handle_git_clone(body: &Value) -> Value {
    let url = body.get("url").and_then(|v| v.as_str()).unwrap_or_default();
    let target_dir = body
        .get("targetDir")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if url.is_empty() || target_dir.is_empty() {
        return json!({ "ok": false, "error": "[GIT_CLONE_FAILED] Missing url or targetDir." });
    }

    let repo_name = clone_repo_dir_name_from_url(url);
    let dest = pick_clone_destination(target_dir, &repo_name);
    let dest_str = dest.to_string_lossy().to_string();

    if dest.exists() && path_is_git_repo(&dest) {
        return json!({
            "ok": false,
            "error": "[GIT_CLONE_EXISTS] That folder is already a Git repository. Open it instead of cloning again.",
            "path": dest_str,
        });
    }

    match exec_output_limit(
        "git",
        &["clone", "--", url, dest_str.as_str()],
        cmd_timeout_long(),
    )
    .await
    {
        Ok(_) => json!({ "ok": true, "path": dest_str }),
        Err(e) => {
            let msg = if e.starts_with("[HOST_COMMAND_TIMEOUT]") {
                format!("[GIT_TIMEOUT] {}", e.trim())
            } else if e.to_lowercase().contains("already exists") {
                format!(
                    "[GIT_CLONE_EXISTS] A folder named \"{}\" already exists under the parent you chose.",
                    repo_name
                )
            } else {
                format!("[GIT_CLONE_FAILED] {}", e.trim())
            };
            json!({ "ok": false, "error": msg, "path": dest_str })
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

#[cfg(test)]
mod clone_tests {
    use super::*;

    #[test]
    fn repo_name_from_https_url() {
        assert_eq!(
            clone_repo_dir_name_from_url("https://github.com/acme/widget.git"),
            "widget"
        );
    }

    #[test]
    fn repo_name_from_ssh_url() {
        assert_eq!(
            clone_repo_dir_name_from_url("git@github.com:acme/widget.git"),
            "widget"
        );
    }
}
