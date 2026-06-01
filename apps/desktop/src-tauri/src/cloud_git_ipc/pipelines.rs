use serde_json::{json, Value};
use tauri::AppHandle;

use crate::cloud_auth::{self, CredentialStore, ParsedRemoteRepo};
use crate::host_exec::{cmd_timeout_short, exec_output_limit};

pub(crate) async fn pipelines(app: &AppHandle, body: &Value) -> Value {
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
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Settings → Connected accounts first."
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
            cmd_timeout_short(),
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
            cloud_auth::GitHubProvider::list_recent_pipelines(
                &cred.token,
                limit,
                cred.web_origin.as_deref().unwrap_or("github.com"),
            )
            .await
        }
        ("gitlab", None) => {
            cloud_auth::GitLabProvider::list_recent_pipelines(
                &cred.token,
                limit,
                cred.web_origin.as_deref(),
            )
            .await
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
