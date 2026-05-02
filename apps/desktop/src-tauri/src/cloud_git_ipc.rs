use serde_json::{json, Value};
use tauri::AppHandle;

use crate::cloud_auth::{self, CredentialStore};

pub async fn invoke(app: &AppHandle, channel: &str, body: &Value) -> Value {
    match channel {
        "dh:cloud:git:prs" => prs(app, body).await,
        "dh:cloud:git:pipelines" => pipelines(app, body).await,
        "dh:cloud:git:issues" => issues(app, body).await,
        "dh:cloud:git:releases" => releases(app, body).await,
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
    let result = match provider {
        "github" => cloud_auth::GitHubProvider::list_recent_pipelines(&cred.token, limit).await,
        "gitlab" => cloud_auth::GitLabProvider::list_recent_pipelines(&cred.token, limit).await,
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
            json!({ "ok": true, "pipelines": pipelines })
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
