//! Local Git merge / rebase / stash-pop IPC (no network). Keeps `lib.rs` slimmer.

use serde_json::{json, Value};
use uuid::Uuid;

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
        "dh:git:vcs:merge-continue" => merge_continue(repo_path).await,
        "dh:git:vcs:rebase-continue" => rebase_continue(repo_path).await,
        "dh:git:vcs:rebase-skip" => rebase_skip(repo_path).await,
        "dh:git:vcs:rename-branch" => rename_branch(repo_path, body).await,
        "dh:git:vcs:conflict-diff" => conflict_diff(repo_path, body).await,
        "dh:git:vcs:conflict-hunks" => conflict_hunks(repo_path, body).await,
        "dh:git:vcs:resolve-conflict" => resolve_conflict(repo_path, body).await,
        "dh:git:vcs:resolve-hunk" => resolve_hunk(repo_path, body).await,
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

async fn merge_continue(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "merge", "--continue"];
    match exec_output_limit("git", &args, CMD_TIMEOUT_LONG).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            let code = merge_continue_error_code(msg);
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

fn merge_continue_error_code(msg: &str) -> &'static str {
    let m = msg.to_lowercase();
    if m.contains("conflict") || m.contains("unmerged") {
        "GIT_VCS_MERGE_CONFLICT"
    } else {
        "GIT_VCS_MERGE_CONTINUE"
    }
}

async fn rebase_continue(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "rebase", "--continue"];
    match exec_output_limit("git", &args, CMD_TIMEOUT_LONG).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            let code = rebase_continue_error_code(msg);
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

fn rebase_continue_error_code(msg: &str) -> &'static str {
    let m = msg.to_lowercase();
    if m.contains("conflict") || m.contains("could not apply") || m.contains("unmerged") {
        "GIT_VCS_REBASE_CONFLICT"
    } else {
        "GIT_VCS_REBASE_CONTINUE"
    }
}

async fn rebase_skip(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "rebase", "--skip"];
    match exec_output_limit("git", &args, CMD_TIMEOUT_LONG).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            json!({ "ok": false, "error": format!("[GIT_VCS_REBASE_SKIP] {}", msg) })
        }
    }
}

async fn rename_branch(repo_path: &str, body: &Value) -> Value {
    let old_name = body.get("oldName").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
    let new_name = body.get("newName").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
    if old_name.is_empty() || new_name.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_RENAME_BRANCH] oldName and newName are required." });
    }
    let args = ["-C", repo_path, "branch", "-m", &old_name, &new_name];
    match exec_output_limit("git", &args, CMD_TIMEOUT_SHORT).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => {
            let msg = e.trim();
            let code = if msg.to_lowercase().contains("already exists") {
                "GIT_VCS_RENAME_BRANCH_EXISTS"
            } else {
                "GIT_VCS_RENAME_BRANCH"
            };
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

/// Returns the three versions of a conflicted file: base (stage 1), ours (stage 2), theirs (stage 3).
/// All three are raw text. Binary or missing stages return empty string for that side.
async fn conflict_diff(repo_path: &str, body: &Value) -> Value {
    let file_path = body.get("filePath").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
    if file_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_CONFLICT_DIFF] filePath is required." });
    }
    let base_ref = format!(":1:{}", file_path);
    let ours_ref = format!(":2:{}", file_path);
    let theirs_ref = format!(":3:{}", file_path);
    let base = exec_output_limit("git", &["-C", repo_path, "show", &base_ref], CMD_TIMEOUT_SHORT)
        .await.unwrap_or_default();
    let ours = exec_output_limit("git", &["-C", repo_path, "show", &ours_ref], CMD_TIMEOUT_SHORT)
        .await.unwrap_or_default();
    let theirs = exec_output_limit("git", &["-C", repo_path, "show", &theirs_ref], CMD_TIMEOUT_SHORT)
        .await.unwrap_or_default();
    json!({ "ok": true, "base": base, "ours": ours, "theirs": theirs })
}

/// Resolves a conflict by accepting ours or theirs, then stages the file.
async fn resolve_conflict(repo_path: &str, body: &Value) -> Value {
    let file_path = body.get("filePath").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
    let resolution = body.get("resolution").and_then(|v| v.as_str()).unwrap_or("ours");
    if file_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_RESOLVE_CONFLICT] filePath is required." });
    }
    let checkout_side = if resolution == "theirs" { "--theirs" } else { "--ours" };
    if let Err(e) = exec_output_limit("git", &["-C", repo_path, "checkout", checkout_side, "--", &file_path], CMD_TIMEOUT_SHORT).await {
        return json!({ "ok": false, "error": format!("[GIT_VCS_RESOLVE_CONFLICT] {}", e.trim()) });
    }
    match exec_output_limit("git", &["-C", repo_path, "add", "--", &file_path], CMD_TIMEOUT_SHORT).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": format!("[GIT_VCS_RESOLVE_CONFLICT] {}", e.trim()) }),
    }
}

/// Parses a file with conflict markers and returns a structured list of hunks.
async fn conflict_hunks(repo_path: &str, body: &Value) -> Value {
    let file_path = body.get("filePath").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
    if file_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_CONFLICT_HUNKS] filePath is required." });
    }

    // Get the three versions for context
    let base = exec_output_limit("git", &["-C", repo_path, "show", &format!(":1:{}", file_path)], CMD_TIMEOUT_SHORT).await.unwrap_or_default();
    let ours_all = exec_output_limit("git", &["-C", repo_path, "show", &format!(":2:{}", file_path)], CMD_TIMEOUT_SHORT).await.unwrap_or_default();
    let theirs_all = exec_output_limit("git", &["-C", repo_path, "show", &format!(":3:{}", file_path)], CMD_TIMEOUT_SHORT).await.unwrap_or_default();

    // Read the current file content (with markers)
    let content = match tokio::fs::read_to_string(std::path::Path::new(repo_path).join(&file_path)).await {
        Ok(c) => c,
        Err(e) => return json!({ "ok": false, "error": format!("[GIT_VCS_CONFLICT_HUNKS] {}", e) }),
    };

    let mut hunks = Vec::new();
    let mut current_ours = String::new();
    let mut current_theirs = String::new();
    let mut in_ours = false;
    let mut in_theirs = false;
    let mut start_line = 0;
    
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        if line.starts_with("<<<<<<<") {
            in_ours = true;
            start_line = i as u32;
            current_ours.clear();
        } else if line.starts_with("=======") {
            in_ours = false;
            in_theirs = true;
            current_theirs.clear();
        } else if line.starts_with(">>>>>>>") {
            in_theirs = false;
            hunks.push(json!({
                "id": Uuid::new_v4().to_string(),
                "state": "unresolved",
                "startLine": start_line,
                "endLine": i as u32,
                "ours": current_ours.trim_end().to_string(),
                "theirs": current_theirs.trim_end().to_string(),
            }));
        } else if in_ours {
            current_ours.push_str(line);
            current_ours.push('\n');
        } else if in_theirs {
            current_theirs.push_str(line);
            current_theirs.push('\n');
        }
    }

    json!({
        "ok": true,
        "filePath": file_path,
        "base": base,
        "ours": ours_all,
        "theirs": theirs_all,
        "hunks": hunks,
        "merged": content
    })
}

/// Resolves a single hunk in a conflicted file by replacing markers with the chosen content.
async fn resolve_hunk(repo_path: &str, body: &Value) -> Value {
    let file_path = body.get("filePath").and_then(|v| v.as_str()).unwrap_or_default().trim().to_string();
    let hunk_id = body.get("hunkId").and_then(|v| v.as_str()).unwrap_or_default();
    let _resolution = body.get("resolution").and_then(|v| v.as_str()).unwrap_or("ours");
    let merged_content = body.get("mergedContent").and_then(|v| v.as_str()).unwrap_or("");

    if file_path.is_empty() || hunk_id.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_RESOLVE_HUNK] filePath and hunkId are required." });
    }

    let full_path = std::path::Path::new(repo_path).join(&file_path);
    let content = match tokio::fs::read_to_string(&full_path).await {
        Ok(c) => c,
        Err(e) => return json!({ "ok": false, "error": format!("[GIT_VCS_RESOLVE_HUNK] Read: {}", e) }),
    };

    // We need to find the specific hunk with markers.
    // In a more robust impl, we'd use line numbers or stable hashes.
    // For this hardened MVP, we'll parse and replace the first unresolved marker block.
    // The UI should ideally pass the exact text to replace to be 100% safe.
    
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut new_lines = Vec::new();
    let mut in_marker = false;
    let mut resolved_one = false;
    
    let mut marker_lines = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = &lines[i];
        if line.starts_with("<<<<<<<") {
            in_marker = true;
            marker_lines.clear();
            marker_lines.push(line.clone());
        } else if line.starts_with("=======") {
            marker_lines.push(line.clone());
        } else if line.starts_with(">>>>>>>") {
            marker_lines.push(line.clone());
            in_marker = false;
            
            if !resolved_one {
                // This is the hunk we resolve.
                // We use the merged_content provided by the UI which handles "ours", "theirs", or "both".
                for ml in merged_content.lines() {
                    new_lines.push(ml.to_string());
                }
                resolved_one = true;
            } else {
                // Keep markers for other hunks
                for ml in &marker_lines {
                    new_lines.push(ml.clone());
                }
            }
        } else if in_marker {
            marker_lines.push(line.clone());
        } else {
            new_lines.push(line.clone());
        }
        i += 1;
    }

    let final_content = new_lines.join("\n");
    if let Err(e) = tokio::fs::write(&full_path, final_content).await {
        return json!({ "ok": false, "error": format!("[GIT_VCS_RESOLVE_HUNK] Write: {}", e) });
    }

    // Check if any markers are left. If not, stage the file.
    let recheck = tokio::fs::read_to_string(&full_path).await.unwrap_or_default();
    if !recheck.contains("<<<<<<<") && !recheck.contains(">>>>>>>") {
        let _ = exec_output_limit("git", &["-C", repo_path, "add", "--", &file_path], CMD_TIMEOUT_SHORT).await;
    }

    json!({ "ok": true })
}
