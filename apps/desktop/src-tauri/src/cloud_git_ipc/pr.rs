use serde_json::{json, Value};
use tauri::AppHandle;

use crate::cloud_auth::{self, CredentialStore};
use crate::host_exec::{cmd_timeout_short, exec_output_limit};

pub(crate) async fn find_pr(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let head = body
        .get("head")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let remote_name = body
        .get("remote")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("origin");

    if head.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_FIND_PR] head branch is required." });
    }

    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({ "ok": false, "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Settings → Connected accounts first." })
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let rp = match repo_path {
        Some(p) => p,
        None => {
            return json!({ "ok": false, "error": "[CLOUD_GIT_FIND_PR] repoPath is required." })
        }
    };
    let remote_url = match exec_output_limit(
        "git",
        &["-C", rp, "remote", "get-url", remote_name],
        cmd_timeout_short(),
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[CLOUD_GIT_SCOPE] Could not read remote: {}", e.trim()) })
        }
    };
    let parsed =
        match cloud_auth::parse_remote_for_repo_scoped_pipelines(remote_url.trim(), provider) {
            Ok(p) => p,
            Err(e) => return json!({ "ok": false, "error": e }),
        };

    let url = match (provider, &parsed) {
        (
            "github",
            cloud_auth::ParsedRemoteRepo::Github {
                hostname,
                full_name,
            },
        ) => {
            let parts: Vec<&str> = full_name.splitn(2, '/').collect();
            if parts.len() != 2 {
                return json!({ "ok": false, "error": "[CLOUD_GIT_FIND_PR] Could not parse owner/repo from remote URL." });
            }
            match cloud_auth::GitHubProvider::find_open_pull_request_url(
                &cred.token,
                hostname,
                parts[0],
                parts[1],
                &head,
            )
            .await
            {
                Ok(found) => found,
                Err(e) => return json!({ "ok": false, "error": e }),
            }
        }
        (
            "gitlab",
            cloud_auth::ParsedRemoteRepo::Gitlab {
                web_origin,
                path_with_namespace,
            },
        ) => match cloud_auth::GitLabProvider::find_open_merge_request_url(
            &cred.token,
            web_origin,
            path_with_namespace,
            &head,
        )
        .await
        {
            Ok(found) => found,
            Err(e) => return json!({ "ok": false, "error": e }),
        },
        _ => {
            return json!({ "ok": false, "error": "[CLOUD_GIT_SCOPE] Provider/remote mismatch. Make sure the correct tab is active." });
        }
    };

    match url {
        Some(u) => json!({ "ok": true, "url": u }),
        None => json!({ "ok": true }),
    }
}

pub(crate) async fn create_pr(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let description = body
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let head = body
        .get("head")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let base = body
        .get("base")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let remote_name = body
        .get("remote")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("origin");

    if title.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] title is required." });
    }
    if head.is_empty() || base.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] head and base branches are required." });
    }

    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({ "ok": false, "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Settings → Connected accounts first." })
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    // Resolve owner/repo from the git remote URL.
    let rp = match repo_path {
        Some(p) => p,
        None => {
            return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] repoPath is required." })
        }
    };
    let remote_url = match exec_output_limit(
        "git",
        &["-C", rp, "remote", "get-url", remote_name],
        cmd_timeout_short(),
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[CLOUD_GIT_SCOPE] Could not read remote: {}", e.trim()) })
        }
    };
    let parsed =
        match cloud_auth::parse_remote_for_repo_scoped_pipelines(remote_url.trim(), provider) {
            Ok(p) => p,
            Err(e) => return json!({ "ok": false, "error": e }),
        };

    let result = match (provider, &parsed) {
        (
            "github",
            cloud_auth::ParsedRemoteRepo::Github {
                hostname,
                full_name,
            },
        ) => {
            let parts: Vec<&str> = full_name.splitn(2, '/').collect();
            if parts.len() != 2 {
                return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] Could not parse owner/repo from remote URL." });
            }
            cloud_auth::GitHubProvider::create_pull_request(
                &cred.token,
                hostname,
                parts[0],
                parts[1],
                &title,
                &description,
                &head,
                &base,
            )
            .await
        }
        (
            "gitlab",
            cloud_auth::ParsedRemoteRepo::Gitlab {
                web_origin,
                path_with_namespace,
            },
        ) => {
            cloud_auth::GitLabProvider::create_merge_request(
                &cred.token,
                web_origin,
                path_with_namespace,
                &title,
                &description,
                &head,
                &base,
            )
            .await
        }
        _ => Err(
            "[CLOUD_GIT_SCOPE] Provider/remote mismatch. Make sure the correct tab is active."
                .to_string(),
        ),
    };

    match result {
        Ok(url) => json!({ "ok": true, "url": url }),
        Err(e) => {
            let mut out = json!({ "ok": false, "error": e });
            if e.contains("[CLOUD_GIT_PR_EXISTS]") {
                if let (
                    "github",
                    cloud_auth::ParsedRemoteRepo::Github {
                        hostname,
                        full_name,
                    },
                ) = (provider, &parsed)
                {
                    let parts: Vec<&str> = full_name.splitn(2, '/').collect();
                    if parts.len() == 2 {
                        if let Ok(Some(existing)) =
                            cloud_auth::GitHubProvider::find_open_pull_request_url(
                                &cred.token,
                                hostname,
                                parts[0],
                                parts[1],
                                &head,
                            )
                            .await
                        {
                            out["existingUrl"] = json!(existing);
                        }
                    }
                } else if let (
                    "gitlab",
                    cloud_auth::ParsedRemoteRepo::Gitlab {
                        web_origin,
                        path_with_namespace,
                    },
                ) = (provider, &parsed)
                {
                    if let Ok(Some(existing)) =
                        cloud_auth::GitLabProvider::find_open_merge_request_url(
                            &cred.token,
                            web_origin,
                            path_with_namespace,
                            &head,
                        )
                        .await
                    {
                        out["existingUrl"] = json!(existing);
                    }
                }
            }
            out
        }
    }
}

pub(crate) async fn get_pr_checks(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let remote_name = body
        .get("remote")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("origin");
    let reference = body
        .get("reference")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if reference.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_GET_PR_CHECKS] reference is required." });
    }

    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({ "ok": false, "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider first." })
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let rp = match repo_path {
        Some(p) => p,
        None => {
            return json!({ "ok": false, "error": "[CLOUD_GIT_GET_PR_CHECKS] repoPath is required." })
        }
    };

    let remote_url = match exec_output_limit(
        "git",
        &["-C", rp, "remote", "get-url", remote_name],
        cmd_timeout_short(),
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[CLOUD_GIT_SCOPE] Could not read remote: {}", e.trim()) })
        }
    };

    let parsed =
        match cloud_auth::parse_remote_for_repo_scoped_pipelines(remote_url.trim(), provider) {
            Ok(p) => p,
            Err(e) => return json!({ "ok": false, "error": e }),
        };

    let result = match (provider, &parsed) {
        (
            "github",
            cloud_auth::ParsedRemoteRepo::Github {
                hostname,
                full_name,
            },
        ) => {
            cloud_auth::GitHubProvider::list_pr_checks(&cred.token, hostname, full_name, reference)
                .await
        }
        (
            "gitlab",
            cloud_auth::ParsedRemoteRepo::Gitlab {
                web_origin,
                path_with_namespace,
            },
        ) => {
            cloud_auth::GitLabProvider::list_pr_checks(
                &cred.token,
                web_origin,
                path_with_namespace,
                reference,
            )
            .await
        }
        _ => Err("[CLOUD_GIT_SCOPE] Provider/remote mismatch.".to_string()),
    };

    match result {
        Ok(details) => json!({ "ok": true, "details": details }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

fn parse_github_pr_merge_params(pr_url: &str) -> Result<(String, String, u32), String> {
    let u = pr_url.trim();
    let u = u
        .split('?')
        .next()
        .unwrap_or(u)
        .split('#')
        .next()
        .unwrap_or(u)
        .trim();
    let u = u.strip_suffix("/merge").unwrap_or(u).trim_end_matches('/');

    let lower = u.to_ascii_lowercase();
    const NEEDLE: &str = "/pull/";
    let p = lower.find(NEEDLE).ok_or_else(|| {
        "[CLOUD_GIT_MERGE_PR] URL must be a GitHub pull request link.".to_string()
    })?;
    let head = &u[..p];
    let tail = &u[p + NEEDLE.len()..];
    let num_str = tail
        .split('/')
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "[CLOUD_GIT_MERGE_PR] Invalid pull request URL.".to_string())?;
    let num = num_str
        .parse::<u32>()
        .map_err(|_| "[CLOUD_GIT_MERGE_PR] Invalid pull request number.".to_string())?;

    const SCHEME: &str = "://";
    let si = head
        .find(SCHEME)
        .ok_or_else(|| "[CLOUD_GIT_MERGE_PR] Invalid pull request URL.".to_string())?;
    let after = &head[si + SCHEME.len()..];
    let slash = after.find('/').ok_or_else(|| {
        "[CLOUD_GIT_MERGE_PR] Invalid pull request URL (expected host/owner/repo).".to_string()
    })?;
    let hostname = after[..slash].to_ascii_lowercase();
    let full = after[slash + 1..].to_string();
    if full.matches('/').count() != 1 {
        return Err(
            "[CLOUD_GIT_MERGE_PR] GitHub pull URL must use a single owner/repo path.".to_string(),
        );
    }
    Ok((hostname, full, num))
}

fn parse_gitlab_mr_merge_params(pr_url: &str) -> Result<(String, String, u32), String> {
    let u = pr_url.trim();
    let u = u
        .split('?')
        .next()
        .unwrap_or(u)
        .split('#')
        .next()
        .unwrap_or(u)
        .trim_end_matches('/');
    let u = u.strip_suffix("/merge").unwrap_or(u).trim_end_matches('/');
    let needle = "/-/merge_requests/";
    let pos = u.find(needle).ok_or_else(|| {
        "[CLOUD_GIT_MERGE_PR] URL must be a GitLab merge request link.".to_string()
    })?;
    let prefix = &u[..pos];
    let tail = &u[pos + needle.len()..];
    let num_str = tail
        .split('/')
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "[CLOUD_GIT_MERGE_PR] Invalid merge request URL.".to_string())?;
    let num = num_str
        .parse::<u32>()
        .map_err(|_| "[CLOUD_GIT_MERGE_PR] Invalid merge request IID.".to_string())?;

    const SCHEME: &str = "://";
    let si = prefix
        .find(SCHEME)
        .ok_or_else(|| "[CLOUD_GIT_MERGE_PR] Invalid merge request URL.".to_string())?;
    let after_scheme = &prefix[si + SCHEME.len()..];
    let slash = after_scheme.find('/').ok_or_else(|| {
        "[CLOUD_GIT_MERGE_PR] Invalid merge request URL (expected host and project path)."
            .to_string()
    })?;
    let hostpart = after_scheme[..slash].to_ascii_lowercase();
    let scheme = &prefix[..si];
    let web_origin = format!("{}://{}", scheme, hostpart);
    let path_ns = prefix[si + SCHEME.len() + slash + 1..].to_string();
    if path_ns.is_empty() {
        return Err("[CLOUD_GIT_MERGE_PR] Missing project path in merge request URL.".to_string());
    }
    Ok((web_origin, path_ns, num))
}

fn merge_gitlab_web_origins_match(a: &str, b: &str) -> bool {
    fn key(s: &str) -> String {
        s.trim_end_matches('/')
            .to_ascii_lowercase()
            .replace("://www.", "://")
    }
    key(a) == key(b)
}

fn gitlab_path_canonical(s: &str) -> String {
    match urlencoding::decode(s) {
        Ok(c) => c.to_string().trim_matches('/').to_ascii_lowercase(),
        Err(_) => s.trim_matches('/').to_ascii_lowercase(),
    }
}

pub(crate) async fn merge_pr(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let branch_fallback = body
        .get("reference")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let pr_url = body
        .get("prUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let repo_path = body
        .get("repoPath")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let remote_name = body
        .get("remote")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("origin");

    if pr_url.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_MERGE_PR] prUrl is required." });
    }

    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({
                "ok": false,
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Settings → Connected accounts first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let rp = match repo_path {
        Some(p) => p,
        None => {
            return json!({ "ok": false, "error": "[CLOUD_GIT_MERGE_PR] repoPath is required." });
        }
    };

    let remote_url = match exec_output_limit(
        "git",
        &["-C", rp, "remote", "get-url", remote_name],
        cmd_timeout_short(),
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return json!({
                "ok": false,
                "error": format!("[CLOUD_GIT_SCOPE] Could not read remote: {}", e.trim())
            });
        }
    };

    let parsed =
        match cloud_auth::parse_remote_for_repo_scoped_pipelines(remote_url.trim(), provider) {
            Ok(p) => p,
            Err(e) => return json!({ "ok": false, "error": e }),
        };

    let result = match (provider, &parsed) {
        (
            "github",
            cloud_auth::ParsedRemoteRepo::Github {
                hostname,
                full_name,
            },
        ) => {
            let (url_host, url_repo, num) = match parse_github_pr_merge_params(pr_url) {
                Ok(x) => x,
                Err(e) => return json!({ "ok": false, "error": e }),
            };
            if !url_host.eq_ignore_ascii_case(hostname) {
                return json!({
                    "ok": false,
                    "error": "[CLOUD_GIT_MERGE_PR] Pull request URL host does not match this repository remote."
                });
            }
            if !url_repo.eq_ignore_ascii_case(full_name) {
                return json!({
                    "ok": false,
                    "error": "[CLOUD_GIT_MERGE_PR] Pull request is for a different repository than the selected remote."
                });
            }
            cloud_auth::GitHubProvider::merge_pull_request(&cred.token, hostname, full_name, num)
                .await
        }
        (
            "gitlab",
            cloud_auth::ParsedRemoteRepo::Gitlab {
                web_origin,
                path_with_namespace,
            },
        ) => {
            let (url_origin, url_path, num) = match parse_gitlab_mr_merge_params(pr_url) {
                Ok(x) => x,
                Err(e) => return json!({ "ok": false, "error": e }),
            };
            if !merge_gitlab_web_origins_match(&url_origin, web_origin) {
                return json!({
                    "ok": false,
                    "error": "[CLOUD_GIT_MERGE_PR] Merge request URL host does not match this repository remote."
                });
            }
            if gitlab_path_canonical(&url_path) != gitlab_path_canonical(path_with_namespace) {
                return json!({
                    "ok": false,
                    "error": "[CLOUD_GIT_MERGE_PR] Merge request is for a different project than the selected remote."
                });
            }
            cloud_auth::GitLabProvider::merge_merge_request(
                &cred.token,
                web_origin,
                path_with_namespace,
                num,
                branch_fallback,
            )
            .await
        }
        _ => Err("[CLOUD_GIT_SCOPE] Provider/remote mismatch.".to_string()),
    };

    match result {
        Ok(url) => json!({ "ok": true, "url": url }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
#[cfg(test)]
mod merge_pr_url_tests {
    use super::{
        gitlab_path_canonical, merge_gitlab_web_origins_match, parse_github_pr_merge_params,
        parse_gitlab_mr_merge_params,
    };

    #[test]
    fn gitlab_origin_ignores_www() {
        assert!(merge_gitlab_web_origins_match(
            "https://www.gitlab.com/foo/bar",
            "https://gitlab.com/foo/bar"
        ));
    }

    #[test]
    fn gitlab_path_decodes_percent_encoded() {
        assert_eq!(
            gitlab_path_canonical("group%2Fsub"),
            gitlab_path_canonical("group/sub")
        );
    }

    #[test]
    fn parses_github_pr_url() {
        let (h, repo, n) =
            parse_github_pr_merge_params("https://github.com/acme/app/pull/42").unwrap();
        assert_eq!(h, "github.com");
        assert_eq!(repo, "acme/app");
        assert_eq!(n, 42);
    }

    #[test]
    fn parses_gitlab_mr_url() {
        let (origin, path, n) =
            parse_gitlab_mr_merge_params("https://gitlab.com/group/sub/-/merge_requests/7")
                .unwrap();
        assert_eq!(origin, "https://gitlab.com");
        assert_eq!(path, "group/sub");
        assert_eq!(n, 7);
    }
}
