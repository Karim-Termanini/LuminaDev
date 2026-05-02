//! Local Git merge / rebase / stash-pop IPC (no network). Keeps `lib.rs` slimmer.

use serde_json::{json, Value};

use crate::host_exec::{exec_output_limit, CMD_TIMEOUT_LONG, CMD_TIMEOUT_SHORT};

fn missing_repo() -> Value {
    json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." })
}

pub async fn invoke_extended(channel: &str, body: &Value) -> Value {
    let repo_path = body.get("repoPath").and_then(|v| v.as_str()).unwrap_or_default();
    if repo_path.is_empty() {
        return missing_repo();
    }
    match channel {
        "dh:git:vcs:merge" => merge(repo_path, body).await,
        "dh:git:vcs:rebase" => rebase(repo_path, body).await,
        "dh:git:vcs:stash-pop" => stash_pop(repo_path).await,
        "dh:git:vcs:merge-abort" => merge_abort(repo_path).await,
        "dh:git:vcs:rebase-abort" => rebase_abort(repo_path).await,
        _ => json!({
            "ok": false,
            "error": format!("[UNKNOWN_CHANNEL] {}", channel)
        }),
    }
}

async fn merge(repo_path: &str, body: &Value) -> Value {
    let branch = body.get("branch").and_then(|v| v.as_str()).unwrap_or_default();
    if branch.trim().is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing branch to merge." });
    }
    let ff_only = body.get("ffOnly").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut argv: Vec<&str> = vec!["-C", repo_path, "merge"];
    if ff_only {
        argv.push("--ff-only");
    }
    argv.push(branch.trim());
    match exec_output_limit("git", &argv, CMD_TIMEOUT_LONG).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            let code = merge_error_code(msg);
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

fn merge_error_code(msg: &str) -> &'static str {
    let m = msg.to_lowercase();
    if m.contains("conflict") || m.contains("fix conflicts") {
        "GIT_VCS_MERGE_CONFLICT"
    } else if m.contains("not something we can merge") || m.contains("invalid reference") {
        "GIT_VCS_MERGE"
    } else if m.contains("ff-only") || m.contains("non-fast-forward") || m.contains("not possible to fast-forward")
    {
        "GIT_VCS_MERGE_FF"
    } else {
        "GIT_VCS_MERGE"
    }
}

async fn rebase(repo_path: &str, body: &Value) -> Value {
    let onto = body.get("onto").and_then(|v| v.as_str()).unwrap_or_default();
    if onto.trim().is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing onto ref for rebase." });
    }
    let args = ["-C", repo_path, "rebase", onto.trim()];
    match exec_output_limit("git", &args, CMD_TIMEOUT_LONG).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            let code = rebase_error_code(msg);
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

fn rebase_error_code(msg: &str) -> &'static str {
    let m = msg.to_lowercase();
    if m.contains("conflict") || m.contains("could not apply") {
        "GIT_VCS_REBASE_CONFLICT"
    } else {
        "GIT_VCS_REBASE"
    }
}

async fn stash_pop(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "stash", "pop"];
    match exec_output_limit("git", &args, CMD_TIMEOUT_LONG).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            let code = if msg.to_lowercase().contains("conflict") {
                "GIT_VCS_STASH_POP_CONFLICT"
            } else if msg.contains("No stash entries") {
                "GIT_VCS_STASH_POP_EMPTY"
            } else {
                "GIT_VCS_STASH_POP"
            };
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

async fn merge_abort(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "merge", "--abort"];
    match exec_output_limit("git", &args, CMD_TIMEOUT_SHORT).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            json!({ "ok": false, "error": format!("[GIT_VCS_MERGE_ABORT] {}", msg) })
        }
    }
}

async fn rebase_abort(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "rebase", "--abort"];
    match exec_output_limit("git", &args, CMD_TIMEOUT_SHORT).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            json!({ "ok": false, "error": format!("[GIT_VCS_REBASE_ABORT] {}", msg) })
        }
    }
}
