use serde_json::{json, Value};
use tauri::AppHandle;
use crate::readiness;

pub async fn invoke(app: &AppHandle, channel: &str, body: &Value) -> Value {
    match channel {
        "dh:system:readiness:check" => {
            let report = readiness::check_readiness(app).await;
            json!({ "ok": true, "report": report })
        },
        "dh:system:readiness:fix" => {
            let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
            match readiness::run_fix(id).await {
                Ok(_) => json!({ "ok": true }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        },
        _ => json!({ "ok": false, "error": format!("[UNKNOWN_CHANNEL] {}", channel) }),
    }
}
