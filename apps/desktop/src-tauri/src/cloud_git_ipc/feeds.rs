use serde_json::{json, Value};
use tauri::AppHandle;

use crate::cloud_auth::{self, CredentialStore};

pub(crate) async fn prs(app: &AppHandle, body: &Value) -> Value {
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
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Settings → Connected accounts first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let result = match provider {
        "github" => {
            cloud_auth::GitHubProvider::list_open_pull_requests(
                &cred.token,
                limit,
                cred.web_origin.as_deref().unwrap_or("github.com"),
            )
            .await
        }
        "gitlab" => {
            cloud_auth::GitLabProvider::list_open_pull_requests(
                &cred.token,
                limit,
                cred.web_origin.as_deref(),
            )
            .await
        }
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

pub(crate) async fn review_requests(app: &AppHandle, body: &Value) -> Value {
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
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Settings → Connected accounts first."
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
                cred.web_origin.as_deref().unwrap_or("github.com"),
            )
            .await
        }
        "gitlab" => {
            cloud_auth::GitLabProvider::list_review_requested_merge_requests(
                &cred.token,
                cred.username.trim(),
                limit,
                cred.web_origin.as_deref(),
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
pub(crate) async fn issues(app: &AppHandle, body: &Value) -> Value {
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
                "error": "[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Settings → Connected accounts first."
            });
        }
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let result = match provider {
        "github" => {
            cloud_auth::GitHubProvider::list_assigned_issues(
                &cred.token,
                limit,
                cred.web_origin.as_deref().unwrap_or("github.com"),
            )
            .await
        }
        "gitlab" => {
            cloud_auth::GitLabProvider::list_assigned_issues(
                &cred.token,
                &cred.username,
                limit,
                cred.web_origin.as_deref(),
            )
            .await
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
fn merge_inbox_items(mut items: Vec<crate::cloud_auth::types::CloudInboxEntry>, limit: usize) -> Vec<crate::cloud_auth::types::CloudInboxEntry> {
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    items.dedup_by(|a, b| a.url == b.url && a.category == b.category);
    items.truncate(limit);
    items
}

pub(crate) async fn inbox(app: &AppHandle, body: &Value) -> Value {
    let limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|x| x.clamp(1, 50) as usize)
        .unwrap_or(30);
    let store = cloud_auth::app_encrypted_credential_store(app);
    let mut items = Vec::new();

    let mut errors: Vec<String> = Vec::new();

    if let Ok(Some(cred)) = store.load("github") {
        let hostname = cred.web_origin.as_deref().unwrap_or("github.com");
        match cloud_auth::GitHubProvider::list_inbox_notifications(&cred.token, limit, hostname).await
        {
            Ok(mut rows) => items.append(&mut rows),
            Err(e) => errors.push(e),
        }
    }

    if let Ok(Some(cred)) = store.load("gitlab") {
        match cloud_auth::GitLabProvider::list_inbox_notifications(
            &cred.token,
            limit,
            cred.web_origin.as_deref(),
        )
        .await
        {
            Ok(mut rows) => items.append(&mut rows),
            Err(e) => errors.push(e),
        }
    }

    if items.is_empty() && !errors.is_empty() {
        return json!({ "ok": false, "error": errors[0] });
    }

    let merged = merge_inbox_items(items, limit);
    json!({
        "ok": true,
        "items": merged.into_iter().map(|x| {
            json!({
                "id": x.id,
                "provider": x.provider,
                "category": x.category,
                "title": x.title,
                "url": x.url,
                "repo": x.repo,
                "updatedAt": x.updated_at,
                "unread": x.unread,
            })
        }).collect::<Vec<Value>>()
    })
}

pub(crate) async fn releases(app: &AppHandle, body: &Value) -> Value {
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
    let result = match provider {
        "github" => {
            cloud_auth::GitHubProvider::list_recent_releases(
                &cred.token,
                limit,
                cred.web_origin.as_deref().unwrap_or("github.com"),
            )
            .await
        }
        "gitlab" => {
            cloud_auth::GitLabProvider::list_recent_releases(
                &cred.token,
                limit,
                cred.web_origin.as_deref(),
            )
            .await
        }
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
