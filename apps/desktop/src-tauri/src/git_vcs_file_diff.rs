//! Unstaged merge-aware `git diff` for the Git VCS IPC surface (`dh:git:vcs:diff`).

use crate::host_exec::{exec_output_limit, CMD_TIMEOUT_SHORT};

async fn diff_raw(repo_path: &str, file_path: &str, staged: bool) -> String {
    let diff_args: Vec<&str> = if staged {
        vec!["-C", repo_path, "diff", "--cached", "--", file_path]
    } else {
        vec!["-C", repo_path, "diff", "--", file_path]
    };
    match exec_output_limit("git", &diff_args, CMD_TIMEOUT_SHORT).await {
        Err(_) => {
            let untracked_args = vec!["-C", repo_path, "diff", "--no-index", "/dev/null", file_path];
            exec_output_limit("git", &untracked_args, CMD_TIMEOUT_SHORT)
                .await
                .unwrap_or_default()
        }
        Ok(r) => r,
    }
}

/// When the working tree file is unmerged, `git diff -- path` can be empty; try combined diff then ours vs worktree.
async fn diff_maybe_merge(repo_path: &str, file_path: &str, raw: String) -> String {
    if raw.trim().is_empty() {
        let unmerged = exec_output_limit(
            "git",
            &["-C", repo_path, "ls-files", "-u", "--", file_path],
            CMD_TIMEOUT_SHORT,
        )
        .await
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
        if unmerged {
            if let Ok(cc) = exec_output_limit(
                "git",
                &["-C", repo_path, "diff", "--cc", "--", file_path],
                CMD_TIMEOUT_SHORT,
            )
            .await
            {
                if !cc.trim().is_empty() {
                    return cc;
                }
            }
            if let Ok(ours) = exec_output_limit(
                "git",
                &["-C", repo_path, "diff", ":2", "--", file_path],
                CMD_TIMEOUT_SHORT,
            )
            .await
            {
                if !ours.trim().is_empty() {
                    return ours;
                }
            }
        }
    }
    raw
}

pub async fn resolve_file_diff(repo_path: &str, file_path: &str, staged: bool) -> String {
    let raw = diff_raw(repo_path, file_path, staged).await;
    if staged {
        raw
    } else {
        diff_maybe_merge(repo_path, file_path, raw).await
    }
}
