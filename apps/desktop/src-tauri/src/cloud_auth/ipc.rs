use serde_json::{json, Value};
use tauri::AppHandle;

use crate::cloud_auth::{self, CredentialStore};
use crate::store_engine;

pub(crate) async fn handle_cloud_auth_connect_start(app: &AppHandle, body: &Value) -> Value {
    let (gh_store, gl_store) = store_engine::read_cloud_oauth_store_overrides(app);
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    match provider {
        "github" => {
            let cid = cloud_auth::compose_github_client_id(gh_store.as_deref());
            match cloud_auth::GitHubProvider::device_auth_start(
                &["repo", "read:org", "read:user", "notifications"],
                cid.as_str(),
            )
            .await
            {
                Ok(c) => json!({
                    "ok": true,
                    "user_code": c.user_code,
                    "verification_uri": c.verification_uri,
                    "device_code": c.device_code,
                    "interval": c.interval,
                    "expires_in": c.expires_in,
                }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        "gitlab" => {
            let cid = cloud_auth::compose_gitlab_client_id(gl_store.as_deref());
            match cloud_auth::GitLabProvider::device_auth_start(
                &[
                    "read_api",
                    "read_user",
                    "read_repository",
                    "write_repository",
                ],
                cid.as_str(),
            )
            .await
            {
                Ok(c) => json!({
                    "ok": true,
                    "user_code": c.user_code,
                    "verification_uri": c.verification_uri,
                    "device_code": c.device_code,
                    "interval": c.interval,
                    "expires_in": c.expires_in,
                }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        _ => json!({ "ok": false, "error": "[CLOUD_AUTH_NETWORK] Unknown provider" }),
    }
}

pub(crate) async fn handle_cloud_auth_connect_poll(app: &AppHandle, body: &Value) -> Value {
    let (gh_store, gl_store) = store_engine::read_cloud_oauth_store_overrides(app);
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let device_code = body
        .get("device_code")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let store = cloud_auth::app_encrypted_credential_store(app);
    let poll_result = match provider {
        "github" => {
            let cid = cloud_auth::compose_github_client_id(gh_store.as_deref());
            cloud_auth::GitHubProvider::device_auth_poll(device_code, cid.as_str()).await
        }
        "gitlab" => {
            let cid = cloud_auth::compose_gitlab_client_id(gl_store.as_deref());
            cloud_auth::GitLabProvider::device_auth_poll(device_code, cid.as_str()).await
        }
        _ => Err("[CLOUD_AUTH_NETWORK] Unknown provider".to_string()),
    };
    match poll_result {
        Ok(cloud_auth::PollResult::Pending) => json!({ "ok": true, "status": "pending" }),
        Ok(cloud_auth::PollResult::Expired) => json!({ "ok": true, "status": "expired" }),
        Ok(cloud_auth::PollResult::Denied) => json!({ "ok": true, "status": "denied" }),
        Ok(cloud_auth::PollResult::Complete {
            token,
            username,
            avatar_url,
        }) => {
            let cred = cloud_auth::StoredCredential {
                token,
                username: username.clone(),
                avatar_url: avatar_url.clone(),
                connected_at: cloud_auth::chrono_now(),
                web_origin: None,
            };
            match store.save(provider, &cred) {
                Ok(_) => {
                    json!({ "ok": true, "status": "complete", "username": username, "avatar_url": avatar_url })
                }
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn handle_cloud_auth_connect_pat(app: &AppHandle, body: &Value) -> Value {
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let token = body.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let host = body
        .get("host")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let store = cloud_auth::app_encrypted_credential_store(app);
    let validate_result = match provider {
        "github" => cloud_auth::GitHubProvider::validate_pat(token, host).await,
        "gitlab" => cloud_auth::GitLabProvider::validate_pat(token, host).await,
        _ => Err("[CLOUD_AUTH_NETWORK] Unknown provider".to_string()),
    };
    match validate_result {
        Ok(cred) => {
            let username = cred.username.clone();
            let avatar_url = cred.avatar_url.clone();
            match store.save(provider, &cred) {
                Ok(_) => {
                    json!({ "ok": true, "username": username, "avatar_url": avatar_url })
                }
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn handle_cloud_auth_disconnect(app: &AppHandle, body: &Value) -> Value {
    let (_gh_store, gl_store) = store_engine::read_cloud_oauth_store_overrides(app);
    let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
    let store = cloud_auth::app_encrypted_credential_store(app);
    if let Ok(Some(cred)) = store.load(provider) {
        let _ = match provider {
            "github" => cloud_auth::GitHubProvider::revoke_token(&cred.token).await,
            "gitlab" => {
                let cid = cloud_auth::compose_gitlab_client_id(gl_store.as_deref());
                cloud_auth::GitLabProvider::revoke_token(&cred.token, cid.as_str()).await
            }
            _ => Ok(()),
        };
    }
    match store.delete(provider) {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn handle_cloud_auth_status(app: &AppHandle) -> Value {
    let store = cloud_auth::app_encrypted_credential_store(app);
    match store.load_all() {
        Ok(accounts) => {
            let arr: Vec<serde_json::Value> = accounts
                .into_iter()
                .map(|a| {
                    json!({
                        "provider": a.provider,
                        "username": a.username,
                        "avatar_url": a.avatar_url,
                        "connected_at": a.connected_at,
                    })
                })
                .collect();
            json!({ "ok": true, "accounts": arr })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
