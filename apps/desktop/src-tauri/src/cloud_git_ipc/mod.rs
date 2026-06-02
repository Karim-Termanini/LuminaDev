//! Cloud Git IPC (`dh:cloud:git:*`). Auth handlers: `cloud_auth::ipc`.

mod feeds;
mod pipelines;
mod pr;

use serde_json::{json, Value};
use tauri::AppHandle;

pub async fn invoke(app: &AppHandle, channel: &str, body: &Value) -> Value {
    match channel {
        "dh:cloud:git:prs" => feeds::prs(app, body).await,
        "dh:cloud:git:review-requests" => feeds::review_requests(app, body).await,
        "dh:cloud:git:inbox" => feeds::inbox(app, body).await,
        "dh:cloud:git:pipelines" => pipelines::pipelines(app, body).await,
        "dh:cloud:git:issues" => feeds::issues(app, body).await,
        "dh:cloud:git:releases" => feeds::releases(app, body).await,
        "dh:cloud:git:create-pr" => pr::create_pr(app, body).await,
        "dh:cloud:git:find-pr" => pr::find_pr(app, body).await,
        "dh:cloud:git:get-pr-checks" => pr::get_pr_checks(app, body).await,
        "dh:cloud:git:merge-pr" => pr::merge_pr(app, body).await,
        _ => json!({
            "ok": false,
            "error": format!("[UNKNOWN_CHANNEL] {}", channel)
        }),
    }
}
