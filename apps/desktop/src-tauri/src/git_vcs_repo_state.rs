//! Merge / rebase operation detection for `dh:git:vcs:status` (Smart-Flow backbone).

use crate::host_exec::{exec_output_limit, CMD_TIMEOUT_SHORT};

/// One of `none`, `merging`, `rebasing` — matches JSON on the status IPC payload.
pub async fn git_operation_state(repo_path: &str) -> &'static str {
    if exec_output_limit(
        "git",
        &["-C", repo_path, "rev-parse", "-q", "--verify", "MERGE_HEAD"],
        CMD_TIMEOUT_SHORT,
    )
    .await
    .is_ok()
    {
        return "merging";
    }
    if exec_output_limit(
        "git",
        &["-C", repo_path, "rev-parse", "-q", "--verify", "REBASE_HEAD"],
        CMD_TIMEOUT_SHORT,
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
        &[
            "-C",
            repo_path,
            "diff",
            "--name-only",
            "--diff-filter=U",
        ],
        CMD_TIMEOUT_SHORT,
    )
    .await
    .unwrap_or_default();
    out.lines().filter(|l| !l.trim().is_empty()).count() as u32
}
