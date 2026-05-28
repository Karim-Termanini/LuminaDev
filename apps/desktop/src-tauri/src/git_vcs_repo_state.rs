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
