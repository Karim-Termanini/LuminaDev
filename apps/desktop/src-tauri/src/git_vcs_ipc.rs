//! Local Git merge / rebase / stash-pop IPC (no network). Keeps `lib.rs` slimmer.
//! Pro-only channels remain for contract tests; renderer Git Assistant does not call merge/rebase/conflict-resolve arms.

use serde_json::{json, Value};
use tauri::AppHandle;
use uuid::Uuid;

use crate::cloud_auth;
use crate::git_vcs_file_diff;
use crate::git_vcs_network::{git_network_with_auth, GitNetworkOp};
use crate::git_vcs_repo_state::{self, git_ahead_behind};
use crate::host_exec::{cmd_timeout_long, cmd_timeout_short, exec_output_limit, exec_result_limit};
use crate::utils::{parse_git_remote_fetch_lines, parse_porcelain_v1};

fn missing_repo() -> Value {
    json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." })
}

pub async fn invoke_extended(channel: &str, body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
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
    let branch = body
        .get("branch")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if branch.trim().is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing branch to merge." });
    }
    let ff_only = body
        .get("ffOnly")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let mut argv: Vec<&str> = vec!["-C", repo_path, "merge"];
    if ff_only {
        argv.push("--ff-only");
    }
    argv.push(branch.trim());
    match exec_output_limit("git", &argv, cmd_timeout_long()).await {
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
    if m.contains("conflict") || m.contains("fix conflicts") || m.contains("unmerged files") {
        "GIT_VCS_MERGE_CONFLICT"
    } else if m.contains("not something we can merge") || m.contains("invalid reference") {
        "GIT_VCS_MERGE"
    } else if m.contains("ff-only")
        || m.contains("non-fast-forward")
        || m.contains("not possible to fast-forward")
    {
        "GIT_VCS_MERGE_FF"
    } else {
        "GIT_VCS_MERGE"
    }
}

async fn rebase(repo_path: &str, body: &Value) -> Value {
    let onto = body
        .get("onto")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if onto.trim().is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing onto ref for rebase." });
    }
    let args = ["-C", repo_path, "rebase", onto.trim()];
    match exec_output_limit("git", &args, cmd_timeout_long()).await {
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
    if m.contains("conflict") || m.contains("could not apply") || m.contains("unmerged files") {
        "GIT_VCS_REBASE_CONFLICT"
    } else {
        "GIT_VCS_REBASE"
    }
}

async fn stash_pop(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "stash", "pop"];
    match exec_output_limit("git", &args, cmd_timeout_long()).await {
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
    match exec_output_limit("git", &args, cmd_timeout_short()).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            json!({ "ok": false, "error": format!("[GIT_VCS_MERGE_ABORT] {}", msg) })
        }
    }
}

async fn rebase_abort(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "rebase", "--abort"];
    match exec_output_limit("git", &args, cmd_timeout_short()).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            json!({ "ok": false, "error": format!("[GIT_VCS_REBASE_ABORT] {}", msg) })
        }
    }
}

async fn merge_continue(repo_path: &str) -> Value {
    let args = ["-C", repo_path, "merge", "--continue"];
    match exec_result_limit("git", &args, cmd_timeout_long()).await {
        Ok((stdout, stderr)) => {
            let out = format!("{}\n{}", stdout.trim(), stderr.trim())
                .trim()
                .to_string();
            json!({ "ok": true, "output": out })
        }
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
    match exec_result_limit("git", &args, cmd_timeout_long()).await {
        Ok((stdout, stderr)) => {
            let out = format!("{}\n{}", stdout.trim(), stderr.trim())
                .trim()
                .to_string();
            json!({ "ok": true, "output": out })
        }
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
    match exec_output_limit("git", &args, cmd_timeout_long()).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => {
            let msg = e.trim();
            json!({ "ok": false, "error": format!("[GIT_VCS_REBASE_SKIP] {}", msg) })
        }
    }
}

async fn rename_branch(repo_path: &str, body: &Value) -> Value {
    let old_name = body
        .get("oldName")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    let new_name = body
        .get("newName")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if old_name.is_empty() || new_name.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_RENAME_BRANCH] oldName and newName are required." });
    }
    let args = ["-C", repo_path, "branch", "-m", &old_name, &new_name];
    match exec_output_limit("git", &args, cmd_timeout_short()).await {
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
    let file_path = body
        .get("filePath")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if file_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_CONFLICT_DIFF] filePath is required." });
    }
    let base_ref = format!(":1:{}", file_path);
    let ours_ref = format!(":2:{}", file_path);
    let theirs_ref = format!(":3:{}", file_path);
    let base = exec_output_limit(
        "git",
        &["-C", repo_path, "show", &base_ref],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let ours = exec_output_limit(
        "git",
        &["-C", repo_path, "show", &ours_ref],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let theirs = exec_output_limit(
        "git",
        &["-C", repo_path, "show", &theirs_ref],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    json!({ "ok": true, "base": base, "ours": ours, "theirs": theirs })
}

/// Resolves a conflict by accepting ours or theirs, then stages the file.
async fn resolve_conflict(repo_path: &str, body: &Value) -> Value {
    let file_path = body
        .get("filePath")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    let resolution = body
        .get("resolution")
        .and_then(|v| v.as_str())
        .unwrap_or("ours");
    if file_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_RESOLVE_CONFLICT] filePath is required." });
    }
    let checkout_side = if resolution == "theirs" {
        "--theirs"
    } else {
        "--ours"
    };
    if let Err(e) = exec_output_limit(
        "git",
        &["-C", repo_path, "checkout", checkout_side, "--", &file_path],
        cmd_timeout_short(),
    )
    .await
    {
        return json!({ "ok": false, "error": format!("[GIT_VCS_RESOLVE_CONFLICT] {}", e.trim()) });
    }
    match exec_output_limit(
        "git",
        &["-C", repo_path, "add", "--", &file_path],
        cmd_timeout_short(),
    )
    .await
    {
        Ok(_) => json!({ "ok": true }),
        Err(e) => {
            json!({ "ok": false, "error": format!("[GIT_VCS_RESOLVE_CONFLICT] {}", e.trim()) })
        }
    }
}

/// Parses a file with conflict markers and returns a structured list of hunks.
async fn conflict_hunks(repo_path: &str, body: &Value) -> Value {
    let file_path = body
        .get("filePath")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if file_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_CONFLICT_HUNKS] filePath is required." });
    }

    // Get the three versions for context
    let base = exec_output_limit(
        "git",
        &["-C", repo_path, "show", &format!(":1:{}", file_path)],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let ours_all = exec_output_limit(
        "git",
        &["-C", repo_path, "show", &format!(":2:{}", file_path)],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let theirs_all = exec_output_limit(
        "git",
        &["-C", repo_path, "show", &format!(":3:{}", file_path)],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();

    // Read the current file content (with markers)
    let content = match tokio::fs::read_to_string(std::path::Path::new(repo_path).join(&file_path))
        .await
    {
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
    let file_path = body
        .get("filePath")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    let hunk_id = body
        .get("hunkId")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let _resolution = body
        .get("resolution")
        .and_then(|v| v.as_str())
        .unwrap_or("ours");
    let merged_content = body
        .get("mergedContent")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if file_path.is_empty() || hunk_id.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_RESOLVE_HUNK] filePath and hunkId are required." });
    }

    let full_path = std::path::Path::new(repo_path).join(&file_path);
    let content = match tokio::fs::read_to_string(&full_path).await {
        Ok(c) => c,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[GIT_VCS_RESOLVE_HUNK] Read: {}", e) })
        }
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
    let recheck = tokio::fs::read_to_string(&full_path)
        .await
        .unwrap_or_default();
    if !recheck.contains("<<<<<<<") && !recheck.contains(">>>>>>>") {
        let _ = exec_output_limit(
            "git",
            &["-C", repo_path, "add", "--", &file_path],
            cmd_timeout_short(),
        )
        .await;
    }

    json!({ "ok": true })
}

// ---------------------------------------------------------------------------
// VCS status / remotes / diff / stage / unstage / commit (inline → delegated)
// ---------------------------------------------------------------------------

pub(crate) async fn handle_vcs_status(app: &AppHandle, body: &Value) -> Value {
    let _ = app; // reserved for future use (e.g. encrypted credential store)
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    if !git_vcs_repo_state::git_is_inside_work_tree(repo_path).await {
        return json!({
            "ok": false,
            "error": "[GIT_VCS_NOT_A_REPO] This folder is not a Git repository."
        });
    }
    let unborn = !git_vcs_repo_state::git_has_commits(repo_path).await;
    let branch = git_vcs_repo_state::git_current_branch_name(repo_path).await;
    let porcelain = exec_output_limit(
        "git",
        &["-C", repo_path, "status", "--porcelain=v1", "-u"],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let (staged, unstaged) = parse_porcelain_v1(&porcelain);
    let (ahead, behind) = git_ahead_behind(repo_path).await;
    let git_operation = git_vcs_repo_state::git_operation_state(repo_path).await;
    let conflict_file_count = git_vcs_repo_state::unmerged_path_count(repo_path).await;
    json!({
        "ok": true,
        "branch": branch,
        "unborn": unborn,
        "ahead": ahead,
        "behind": behind,
        "staged": staged,
        "unstaged": unstaged,
        "gitOperation": git_operation,
        "conflictFileCount": conflict_file_count,
    })
}

pub(crate) async fn handle_vcs_remotes(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    match exec_output_limit(
        "git",
        &["-C", repo_path, "remote", "-v"],
        cmd_timeout_short(),
    )
    .await
    {
        Ok(out) => {
            let remotes = parse_git_remote_fetch_lines(&out);
            json!({ "ok": true, "remotes": remotes })
        }
        Err(e) => json!({
            "ok": false,
            "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()),
        }),
    }
}

pub(crate) async fn handle_vcs_diff(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let file_path = body
        .get("filePath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let staged = body
        .get("staged")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if repo_path.is_empty() || file_path.is_empty() {
        return json!({
            "ok": false,
            "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath or filePath."
        });
    }
    let raw = git_vcs_file_diff::resolve_file_diff(repo_path, file_path, staged).await;
    if raw.contains("Binary files") {
        return json!({ "ok": true, "diff": null, "binary": true });
    }
    const DIFF_CAP: usize = 512 * 1024; // 512 KB
    if raw.len() > DIFF_CAP {
        return json!({
            "ok": false,
            "error": "[GIT_VCS_DIFF_TOO_LARGE] File diff exceeds 512 KB."
        });
    }
    json!({ "ok": true, "diff": raw, "binary": false })
}

pub(crate) async fn handle_vcs_stage(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    let stage_all = body.get("stageAll").and_then(|v| v.as_bool()) == Some(true);
    if stage_all {
        return match exec_output_limit("git", &["-C", repo_path, "add", "-A"], cmd_timeout_short())
            .await
        {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({
                "ok": false,
                "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim())
            }),
        };
    }
    let file_paths: Vec<&str> = body
        .get("filePaths")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str()).collect())
        .unwrap_or_default();
    if file_paths.is_empty() {
        return json!({
            "ok": false,
            "error":
                "[GIT_VCS_NOT_A_REPO] Missing filePaths (or pass stageAll: true)."
        });
    }
    let mut args = vec!["-C", repo_path, "add", "--"];
    args.extend_from_slice(&file_paths);
    match exec_output_limit("git", &args, cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => {
            json!({ "ok": false, "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_vcs_unstage(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let file_paths: Vec<&str> = body
        .get("filePaths")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str()).collect())
        .unwrap_or_default();
    if repo_path.is_empty() || file_paths.is_empty() {
        return json!({
            "ok": false,
            "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath or filePaths."
        });
    }
    let mut args = vec!["-C", repo_path, "restore", "--staged", "--"];
    args.extend_from_slice(&file_paths);
    match exec_output_limit("git", &args, cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => {
            json!({ "ok": false, "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_vcs_commit(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let message = body
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    if message.trim().is_empty() {
        return json!({
            "ok": false,
            "error": "[GIT_VCS_EMPTY_MESSAGE] Commit message cannot be empty."
        });
    }
    match exec_result_limit(
        "git",
        &["-C", repo_path, "commit", "-m", message],
        cmd_timeout_short(),
    )
    .await
    {
        Ok((stdout, stderr)) => {
            let combined = format!("{}\n{}", stdout.trim(), stderr.trim())
                .trim()
                .to_string();
            let sha = combined
                .lines()
                .find(|l| l.contains('[') && l.contains(']'))
                .and_then(|l| {
                    let after_bracket = l.split(']').next()?;
                    after_bracket
                        .split_whitespace()
                        .last()
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            json!({ "ok": true, "sha": sha })
        }
        Err(e) => {
            let trimmed = e.trim();
            let error_body = if trimmed.is_empty() {
                "Git exited with an error but printed no message (check hooks and signing)."
            } else {
                trimmed
            };
            let msg =
                if error_body.contains("nothing to commit") || error_body.contains("no changes") {
                    format!("[GIT_VCS_NO_STAGED] {}", error_body)
                } else if error_body.contains("not a git repository") {
                    format!("[GIT_VCS_NOT_A_REPO] {}", error_body)
                } else {
                    format!("[GIT_VCS_COMMIT_FAILED] {}", error_body)
                };
            json!({ "ok": false, "error": msg })
        }
    }
}

pub(crate) async fn handle_vcs_branches(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    match exec_output_limit(
        "git",
        &[
            "-C",
            repo_path,
            "for-each-ref",
            "refs/heads",
            "refs/remotes",
            "--format=%(HEAD)|%(refname:short)|%(refname)",
        ],
        cmd_timeout_short(),
    )
    .await
    {
        Ok(out) => {
            let mut branches: Vec<Value> = Vec::new();
            let mut current = String::new();
            for line in out.lines() {
                let mut parts = line.splitn(3, '|');
                let head = parts.next().unwrap_or("").trim();
                let short = parts.next().unwrap_or("").trim();
                let full = parts.next().unwrap_or("").trim();
                if short.is_empty() || short == "HEAD" {
                    continue;
                }
                if full.ends_with("/HEAD") {
                    continue;
                }
                let is_current = head == "*";
                let remote = full.starts_with("refs/remotes/");
                let display_name = short.to_string();
                if is_current {
                    current.clone_from(&display_name);
                }
                branches.push(json!({
                    "name": display_name,
                    "remote": remote,
                    "current": is_current,
                }));
            }
            branches.sort_by(|a, b| {
                let ar = a.get("remote").and_then(|v| v.as_bool()).unwrap_or(false);
                let br = b.get("remote").and_then(|v| v.as_bool()).unwrap_or(false);
                match ar.cmp(&br) {
                    std::cmp::Ordering::Equal => {}
                    o => return o,
                }
                let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                an.cmp(bn)
            });
            json!({ "ok": true, "branches": branches, "current": current })
        }
        Err(e) => {
            json!({ "ok": false, "error": format!("[GIT_VCS_NOT_A_REPO] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_vcs_checkout(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let branch = body
        .get("branch")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let create = body
        .get("create")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if repo_path.is_empty() || branch.is_empty() {
        return json!({
            "ok": false,
            "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath or branch."
        });
    }
    let args: Vec<&str> = if create {
        vec!["-C", repo_path, "checkout", "-b", branch]
    } else {
        vec!["-C", repo_path, "checkout", branch]
    };
    match exec_output_limit("git", &args, cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => {
            let msg = e.trim();
            let code = if msg.contains("would be overwritten by checkout")
                || msg.contains("stash them before you switch")
                || msg.contains("Please commit your changes or stash them")
            {
                "GIT_VCS_CHECKOUT_DIRTY"
            } else {
                "GIT_VCS_CHECKOUT"
            };
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

pub(crate) async fn handle_vcs_stash(body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    let message = body
        .get("message")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("LuminaDev: stash before branch switch");
    let include_untracked = body
        .get("includeUntracked")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let mut argv: Vec<String> = vec![
        "-C".to_string(),
        repo_path.to_string(),
        "stash".to_string(),
        "push".to_string(),
    ];
    if include_untracked {
        argv.push("-u".to_string());
    }
    argv.push("-m".to_string());
    argv.push(message.to_string());
    let args: Vec<&str> = argv.iter().map(|s| s.as_str()).collect();
    match exec_output_limit("git", &args, cmd_timeout_short()).await {
        Ok(out) => json!({ "ok": true, "message": out }),
        Err(e) => {
            let msg = e.trim();
            let code = if msg.contains("No local changes to save") {
                "GIT_VCS_STASH_EMPTY"
            } else {
                "GIT_VCS_STASH"
            };
            json!({ "ok": false, "error": format!("[{}] {}", code, msg) })
        }
    }
}

pub(crate) async fn handle_vcs_push(app: &AppHandle, body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let remote = body.get("remote").and_then(|v| v.as_str());
    let branch = body.get("branch").and_then(|v| v.as_str());
    let force_with_lease = body
        .get("forceWithLease")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    let store = cloud_auth::app_encrypted_credential_store(app);
    match git_network_with_auth(
        repo_path,
        GitNetworkOp::Push {
            remote,
            branch,
            force_with_lease,
        },
        &store,
        app,
    )
    .await
    {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn handle_vcs_pull(app: &AppHandle, body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    let store = cloud_auth::app_encrypted_credential_store(app);
    match git_network_with_auth(repo_path, GitNetworkOp::Pull, &store, app).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn handle_vcs_fetch(app: &AppHandle, body: &Value) -> Value {
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if repo_path.is_empty() {
        return json!({ "ok": false, "error": "[GIT_VCS_NOT_A_REPO] Missing repoPath." });
    }
    let remote = body
        .get("remote")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("origin");
    let store = cloud_auth::app_encrypted_credential_store(app);
    match git_network_with_auth(repo_path, GitNetworkOp::Fetch { remote }, &store, app).await {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
