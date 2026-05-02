use serde_json::{json, Value};
use tauri::AppHandle;

use crate::cloud_auth::{self, CredentialStore, ParsedRemoteRepo};
use crate::host_exec::{exec_output_limit, CMD_TIMEOUT_SHORT};

pub async fn invoke(app: &AppHandle, channel: &str, body: &Value) -> Value {
    match channel {
        "dh:cloud:git:prs" => prs(app, body).await,
        "dh:cloud:git:review-requests" => review_requests(app, body).await,
        "dh:cloud:git:pipelines" => pipelines(app, body).await,
        "dh:cloud:git:issues" => issues(app, body).await,
        "dh:cloud:git:releases" => releases(app, body).await,
        "dh:cloud:git:create-pr" => create_pr(app, body).await,
        "dh:cloud:git:get-pr-checks" => get_pr_checks(app, body).await,
        _ => json!({
            "ok": false,
            "error": format!("[UNKNOWN_CHANNEL] {}", channel)
        }),
    }
}

async fn prs(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|x| x.clamp(1, 50) as usize)
        .unwrap_or(12);
    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({
                "ok": false,
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Cloud Git first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let result = match provider {
        "github" => cloud_auth::GitHubProvider::list_open_pull_requests(&cred.token, limit).await,
        "gitlab" => cloud_auth::GitLabProvider::list_open_pull_requests(&cred.token, limit).await,
        _ => Err("[CLOUD_GIT_NETWORK] Unknown provider".to_string()),
    };
    match result {
        Ok(items) => {
            let prs: Vec<Value> = items
                .into_iter()
                .map(|x| {
                    json!({
                        "id": x.id,
                        "title": x.title,
                        "url": x.url,
                        "repo": x.repo,
                        "author": x.author,
                        "updatedAt": x.updated_at,
                    })
                })
                .collect();
            json!({ "ok": true, "prs": prs })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

async fn review_requests(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|x| x.clamp(1, 50) as usize)
        .unwrap_or(12);
    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({
                "ok": false,
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Cloud Git first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let result = match provider {
        "github" => {
            cloud_auth::GitHubProvider::list_review_requested_pull_requests(
                &cred.token,
                cred.username.trim(),
                limit,
            )
            .await
        }
        "gitlab" => {
            cloud_auth::GitLabProvider::list_review_requested_merge_requests(
                &cred.token,
                cred.username.trim(),
                limit,
            )
            .await
        }
        _ => Err("[CLOUD_GIT_NETWORK] Unknown provider".to_string()),
    };
    match result {
        Ok(items) => {
            let review_requests: Vec<Value> = items
                .into_iter()
                .map(|x| {
                    json!({
                        "id": x.id,
                        "title": x.title,
                        "url": x.url,
                        "repo": x.repo,
                        "author": x.author,
                        "updatedAt": x.updated_at,
                    })
                })
                .collect();
            json!({ "ok": true, "reviewRequests": review_requests })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

async fn pipelines(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|x| x.clamp(1, 50) as usize)
        .unwrap_or(8);
    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({
                "ok": false,
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Cloud Git first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };

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

    let scoped: Option<ParsedRemoteRepo> = if let Some(rp) = repo_path {
        let url_out = match exec_output_limit(
            "git",
            &["-C", rp, "remote", "get-url", remote_name],
            CMD_TIMEOUT_SHORT,
        )
        .await
        {
            Ok(u) => u,
            Err(e) => {
                return json!({
                    "ok": false,
                    "error": format!(
                        "[CLOUD_GIT_SCOPE] Could not read remote {:?}: {}",
                        remote_name,
                        e.trim()
                    )
                });
            }
        };
        match cloud_auth::parse_remote_for_repo_scoped_pipelines(url_out.trim(), provider) {
            Ok(p) => Some(p),
            Err(e) => {
                return json!({ "ok": false, "error": e });
            }
        }
    } else {
        None
    };

    let result = match (provider, scoped.as_ref()) {
        ("github", None) => {
            cloud_auth::GitHubProvider::list_recent_pipelines(&cred.token, limit).await
        }
        ("gitlab", None) => {
            cloud_auth::GitLabProvider::list_recent_pipelines(&cred.token, limit).await
        }
        ("github", Some(ParsedRemoteRepo::Github { hostname, full_name })) => {
            cloud_auth::GitHubProvider::list_repo_pipelines(&cred.token, hostname, full_name, limit).await
        }
        ("github", Some(ParsedRemoteRepo::Gitlab { .. })) => {
            Err("[CLOUD_GIT_SCOPE] This remote points to GitLab; open Git VCS with a GitHub remote or switch the Cloud account tab to GitLab.".to_string())
        }
        ("gitlab", Some(ParsedRemoteRepo::Gitlab {
            web_origin,
            path_with_namespace,
        })) => {
            cloud_auth::GitLabProvider::list_repo_pipelines(
                &cred.token,
                web_origin,
                path_with_namespace,
                limit,
            )
            .await
        }
        ("gitlab", Some(ParsedRemoteRepo::Github { .. })) => {
            Err("[CLOUD_GIT_SCOPE] This remote points to GitHub; open Git VCS with a GitLab remote or switch the Cloud account tab to GitHub.".to_string())
        }
        _ => Err("[CLOUD_GIT_NETWORK] Unknown provider".to_string()),
    };

    match result {
        Ok(items) => {
            let pipelines: Vec<Value> = items
                .into_iter()
                .map(|x| {
                    json!({
                        "id": x.id,
                        "name": x.name,
                        "url": x.url,
                        "repo": x.repo,
                        "status": x.status,
                        "updatedAt": x.updated_at,
                    })
                })
                .collect();
            json!({
                "ok": true,
                "pipelines": pipelines,
                "repoScoped": scoped.is_some(),
            })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

async fn issues(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|x| x.clamp(1, 50) as usize)
        .unwrap_or(10);
    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({
                "ok": false,
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Cloud Git first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let result = match provider {
        "github" => cloud_auth::GitHubProvider::list_assigned_issues(&cred.token, limit).await,
        "gitlab" => {
            cloud_auth::GitLabProvider::list_assigned_issues(&cred.token, &cred.username, limit).await
        }
        _ => Err("[CLOUD_GIT_NETWORK] Unknown provider".to_string()),
    };
    match result {
        Ok(items) => {
            let issues: Vec<Value> = items
                .into_iter()
                .map(|x| {
                    json!({
                        "id": x.id,
                        "title": x.title,
                        "url": x.url,
                        "repo": x.repo,
                        "state": x.state,
                        "updatedAt": x.updated_at,
                    })
                })
                .collect();
            json!({ "ok": true, "issues": issues })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

async fn create_pr(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let title = body.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let description = body.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let head = body.get("head").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let base = body.get("base").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let repo_path = body.get("repoPath").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
    let remote_name = body.get("remote").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("origin");

    if title.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] title is required." });
    }
    if head.is_empty() || base.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] head and base branches are required." });
    }

    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => return json!({ "ok": false, "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Cloud Git first." }),
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    // Resolve owner/repo from the git remote URL.
    let rp = match repo_path {
        Some(p) => p,
        None => return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] repoPath is required." }),
    };
    let remote_url = match exec_output_limit("git", &["-C", rp, "remote", "get-url", remote_name], CMD_TIMEOUT_SHORT).await {
        Ok(u) => u,
        Err(e) => return json!({ "ok": false, "error": format!("[CLOUD_GIT_SCOPE] Could not read remote: {}", e.trim()) }),
    };
    let parsed = match cloud_auth::parse_remote_for_repo_scoped_pipelines(remote_url.trim(), provider) {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let result = match (provider, &parsed) {
        ("github", cloud_auth::ParsedRemoteRepo::Github { hostname: _, full_name }) => {
            let parts: Vec<&str> = full_name.splitn(2, '/').collect();
            if parts.len() != 2 {
                return json!({ "ok": false, "error": "[CLOUD_GIT_CREATE_PR] Could not parse owner/repo from remote URL." });
            }
            cloud_auth::GitHubProvider::create_pull_request(&cred.token, parts[0], parts[1], &title, &description, &head, &base).await
        }
        ("gitlab", cloud_auth::ParsedRemoteRepo::Gitlab { web_origin, path_with_namespace }) => {
            cloud_auth::GitLabProvider::create_merge_request(&cred.token, web_origin, path_with_namespace, &title, &description, &head, &base).await
        }
        _ => Err("[CLOUD_GIT_SCOPE] Provider/remote mismatch. Make sure the correct tab is active.".to_string()),
    };

    match result {
        Ok(url) => json!({ "ok": true, "url": url }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

async fn get_pr_checks(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let repo_path = body.get("repoPath").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
    let remote_name = body.get("remote").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("origin");
    let reference = body.get("reference").and_then(|v| v.as_str()).unwrap_or("").trim();

    if reference.is_empty() {
        return json!({ "ok": false, "error": "[CLOUD_GIT_GET_PR_CHECKS] reference is required." });
    }

    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => return json!({ "ok": false, "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider first." }),
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let rp = match repo_path {
        Some(p) => p,
        None => return json!({ "ok": false, "error": "[CLOUD_GIT_GET_PR_CHECKS] repoPath is required." }),
    };

    let remote_url = match exec_output_limit("git", &["-C", rp, "remote", "get-url", remote_name], CMD_TIMEOUT_SHORT).await {
        Ok(u) => u,
        Err(e) => return json!({ "ok": false, "error": format!("[CLOUD_GIT_SCOPE] Could not read remote: {}", e.trim()) }),
    };

    let parsed = match cloud_auth::parse_remote_for_repo_scoped_pipelines(remote_url.trim(), provider) {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let result = match (provider, &parsed) {
        ("github", cloud_auth::ParsedRemoteRepo::Github { hostname, full_name }) => {
            cloud_auth::GitHubProvider::list_pr_checks(&cred.token, hostname, full_name, reference).await
        }
        ("gitlab", cloud_auth::ParsedRemoteRepo::Gitlab { web_origin, path_with_namespace }) => {
            cloud_auth::GitLabProvider::list_pr_checks(&cred.token, web_origin, path_with_namespace, reference).await
        }
        _ => Err("[CLOUD_GIT_SCOPE] Provider/remote mismatch.".to_string()),
    };

    match result {
        Ok(details) => json!({ "ok": true, "details": details }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

async fn releases(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|x| x.clamp(1, 50) as usize)
        .unwrap_or(8);
    let store = cloud_auth::app_encrypted_credential_store(app);
    let cred = match store.load(provider) {
        Ok(Some(c)) => c,
        Ok(None) => {
            return json!({
                "ok": false,
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Cloud Git first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let result = match provider {
        "github" => cloud_auth::GitHubProvider::list_recent_releases(&cred.token, limit).await,
        "gitlab" => cloud_auth::GitLabProvider::list_recent_releases(&cred.token, limit).await,
        _ => Err("[CLOUD_GIT_NETWORK] Unknown provider".to_string()),
    };
    match result {
        Ok(items) => {
            let releases: Vec<Value> = items
                .into_iter()
                .map(|x| {
                    json!({
                        "id": x.id,
                        "tag": x.tag,
                        "title": x.title,
                        "url": x.url,
                        "repo": x.repo,
                        "publishedAt": x.published_at,
                    })
                })
                .collect();
            json!({ "ok": true, "releases": releases })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
