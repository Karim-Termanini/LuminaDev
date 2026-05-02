//! HTTPS/SSH Git fetch, pull, and push with Cloud Git tokens + push error classification.

use tauri::{AppHandle, Manager};

use crate::cloud_auth::{self, CredentialStore};
use crate::host_exec::{
    exec_output_limit, exec_output_with_env, CMD_TIMEOUT_LONG, CMD_TIMEOUT_SHORT,
};

#[derive(Clone, Copy)]
pub enum GitNetworkOp<'a> {
    Push {
        remote: Option<&'a str>,
        branch: Option<&'a str>,
    },
    Pull,
    Fetch { remote: &'a str },
}

pub fn git_push_error_is_protected_branch(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("protected branch")
        || lower.contains("protected branches")
        || lower.contains("branch protection")
        || lower.contains("ruleset")
        || lower.contains("pre-receive hook declined")
        || lower.contains("required status check")
        || lower.contains("required linear history")
        || lower.contains("gh006")
        || lower.contains("protected ref")
}

pub fn git_network_classify_error(op: &GitNetworkOp<'_>, stderr: &str, https: bool) -> String {
    let e = stderr.trim();
    let is_push = matches!(op, GitNetworkOp::Push { .. });
    if is_push && git_push_error_is_protected_branch(e) {
        return format!("[GIT_VCS_PROTECTED_BRANCH] {}", e);
    }
    if is_push && (e.contains("rejected") || e.contains("non-fast-forward")) {
        return format!("[GIT_VCS_PUSH_REJECTED] {}", e);
    }
    if https && (e.contains("Authentication") || e.contains("auth") || e.contains("403")) {
        return format!("[GIT_VCS_AUTH_FAILED] {}", e);
    }
    format!("[GIT_VCS_NETWORK] {}", e)
}

pub async fn git_network_with_auth(
    repo_path: &str,
    op: GitNetworkOp<'_>,
    store: &cloud_auth::EncryptedFileStore,
    app: &AppHandle,
) -> Result<String, String> {
    let remote_for_url = match &op {
        GitNetworkOp::Push { remote, .. } => remote.unwrap_or("origin"),
        GitNetworkOp::Pull => "origin",
        GitNetworkOp::Fetch { remote } => *remote,
    };
    let remote_url = exec_output_limit(
        "git",
        &["-C", repo_path, "remote", "get-url", remote_for_url],
        CMD_TIMEOUT_SHORT,
    )
    .await
    .unwrap_or_default();

    let cmd_args: Vec<String> = match op {
        GitNetworkOp::Push { remote, branch } => {
            let r = remote.unwrap_or("origin");
            let mut a = vec!["-C".to_string(), repo_path.to_string(), "push".to_string(), r.to_string()];
            if let Some(b) = branch {
                a.push(b.to_string());
            }
            a
        }
        GitNetworkOp::Pull => vec!["-C".to_string(), repo_path.to_string(), "pull".to_string()],
        GitNetworkOp::Fetch { remote } => vec![
            "-C".to_string(),
            repo_path.to_string(),
            "fetch".to_string(),
            remote.to_string(),
            "--prune".to_string(),
        ],
    };
    let args_refs: Vec<&str> = cmd_args.iter().map(|s| s.as_str()).collect();

    if remote_url.starts_with("https://") {
        let host = remote_url
            .trim_start_matches("https://")
            .split('/')
            .next()
            .unwrap_or("");
        let token = if host.contains("gitlab") {
            store.load("gitlab").ok().flatten().map(|c| c.token)
        } else {
            store.load("github").ok().flatten().map(|c| c.token)
        };
        let token = token.ok_or_else(|| {
            "[GIT_VCS_AUTH_FAILED] No stored token for this remote. Connect your account in Cloud Git.".to_string()
        })?;

        let script_name = format!("git-askpass-{}.sh", uuid::Uuid::new_v4());
        let script_path = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("[GIT_VCS_AUTH_FAILED] {}", e))?
            .join(&script_name);
        let script_content = format!("#!/bin/sh\necho '{}'\n", token.replace('\'', "'\\''"));
        std::fs::write(&script_path, &script_content)
            .map_err(|e| format!("[GIT_VCS_AUTH_FAILED] Could not write askpass: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("[GIT_VCS_AUTH_FAILED] chmod 700: {}", e))?;
        }
        let script_str = script_path.to_string_lossy().to_string();
        let env = [("GIT_ASKPASS", script_str.as_str()), ("GIT_TERMINAL_PROMPT", "0")];
        let result = exec_output_with_env("git", &args_refs, &env, CMD_TIMEOUT_LONG).await;
        let _ = std::fs::remove_file(&script_path);
        result.map_err(|e| git_network_classify_error(&op, &e, true))
    } else {
        exec_output_limit("git", &args_refs, CMD_TIMEOUT_LONG)
            .await
            .map_err(|e| git_network_classify_error(&op, &e, false))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_push_error_detects_protected_branch_messages() {
        assert!(git_push_error_is_protected_branch(
            "remote: GH006: Protected branch update failed for refs/heads/main"
        ));
        assert!(git_push_error_is_protected_branch("pre-receive hook declined"));
        assert!(git_push_error_is_protected_branch("Required status check \"ci\" is failing"));
        assert!(!git_push_error_is_protected_branch("non-fast-forward"));
    }

    #[test]
    fn git_network_classify_push_protected_before_rejected() {
        let op = GitNetworkOp::Push {
            remote: None,
            branch: None,
        };
        let prot = git_network_classify_error(&op, "remote: protected branch", true);
        assert!(prot.starts_with("[GIT_VCS_PROTECTED_BRANCH]"));
        let ff = git_network_classify_error(&op, "! [rejected] main (non-fast-forward)", true);
        assert!(ff.starts_with("[GIT_VCS_PUSH_REJECTED]"));
        let fetch_op = GitNetworkOp::Fetch { remote: "origin" };
        let net = git_network_classify_error(&fetch_op, "protected branch nonsense", true);
        assert!(net.starts_with("[GIT_VCS_NETWORK]"));
    }
}
