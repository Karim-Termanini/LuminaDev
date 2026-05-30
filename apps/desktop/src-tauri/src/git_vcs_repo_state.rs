//! Merge / rebase operation detection for `dh:git:vcs:status` (Smart-Flow backbone).

use crate::host_exec::{cmd_timeout_short, exec_output_limit};

/// One of `none`, `merging`, `rebasing` — matches JSON on the status IPC payload.
pub async fn git_operation_state(repo_path: &str) -> &'static str {
    if exec_output_limit(
        "git",
        &["-C", repo_path, "rev-parse", "-q", "--verify", "MERGE_HEAD"],
        cmd_timeout_short(),
    )
    .await
    .is_ok()
    {
        return "merging";
    }
    if exec_output_limit(
        "git",
        &[
            "-C",
            repo_path,
            "rev-parse",
            "-q",
            "--verify",
            "REBASE_HEAD",
        ],
        cmd_timeout_short(),
    )
    .await
    .is_ok()
    {
        return "rebasing";
    }
    "none"
}

pub async fn unmerged_path_count(repo_path: &str) -> u32 {
    let out = exec_output_limit(
        "git",
        &["-C", repo_path, "diff", "--name-only", "--diff-filter=U"],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    out.lines().filter(|l| !l.trim().is_empty()).count() as u32
}

/// True when `repo_path` is inside a Git work tree (including repos with zero commits).
pub(crate) async fn git_is_inside_work_tree(repo_path: &str) -> bool {
    exec_output_limit(
        "git",
        &["-C", repo_path, "rev-parse", "--is-inside-work-tree"],
        cmd_timeout_short(),
    )
    .await
    .map(|s| s.trim() == "true")
    .unwrap_or(false)
}

/// True when `HEAD` exists (at least one commit).
pub(crate) async fn git_has_commits(repo_path: &str) -> bool {
    exec_output_limit(
        "git",
        &["-C", repo_path, "rev-parse", "--verify", "HEAD"],
        cmd_timeout_short(),
    )
    .await
    .is_ok()
}

/// Current branch name, or empty string for an unborn branch (no commits yet).
pub(crate) async fn git_current_branch_name(repo_path: &str) -> String {
    if !git_has_commits(repo_path).await {
        return String::new();
    }
    let name = exec_output_limit(
        "git",
        &["-C", repo_path, "rev-parse", "--abbrev-ref", "HEAD"],
        cmd_timeout_short(),
    )
    .await
    .unwrap_or_default();
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "HEAD" {
        String::new()
    } else {
        trimmed.to_string()
    }
}

pub(crate) async fn git_ahead_behind(repo_path: &str) -> (Option<i64>, Option<i64>) {
    let ahead = exec_output_limit(
        "git",
        &["-C", repo_path, "rev-list", "--count", "@{u}..HEAD"],
        cmd_timeout_short(),
    )
    .await
    .ok()
    .and_then(|s| s.trim().parse::<i64>().ok());
    let behind = exec_output_limit(
        "git",
        &["-C", repo_path, "rev-list", "--count", "HEAD..@{u}"],
        cmd_timeout_short(),
    )
    .await
    .ok()
    .and_then(|s| s.trim().parse::<i64>().ok());
    (ahead, behind)
}
