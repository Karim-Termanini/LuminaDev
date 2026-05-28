use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use crate::state::AppState;

pub(crate) async fn handle_log_stream_start(
    app: AppHandle,
    body: &Value,
    state: &AppState,
) -> Value {
    let source = body.get("source").and_then(|v| v.as_str()).unwrap_or("unified");
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let stream_id = uuid::Uuid::new_v4().to_string();
    let stream_id_clone = stream_id.clone();
    let source_label = if id.is_empty() { source.to_string() } else { format!("{}/{}", source, id) };
    let source_label_clone = source_label.clone();

    let (cmd, args): (String, Vec<String>) = match source {
        "compose" if !id.is_empty() => (
            "docker".to_string(),
            vec!["compose".to_string(), "-p".to_string(), id.clone(), "logs".to_string(), "--follow".to_string(), "--no-log-prefix".to_string()],
        ),
        "container" if !id.is_empty() => (
            "docker".to_string(),
            vec!["logs".to_string(), "-f".to_string(), "--tail".to_string(), "100".to_string(), id.clone()],
        ),
        _ => (
            "docker".to_string(),
            vec!["compose".to_string(), "logs".to_string(), "--follow".to_string(), "--no-log-prefix".to_string()],
        ),
    };

    let handle = tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        use tokio::process::Command;

        let mut child = match Command::new(&cmd)
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("dh:log:line", json!({
                    "streamId": stream_id_clone,
                    "source": source_label_clone,
                    "line": format!("[stream error: {}]", e),
                }));
                return;
            }
        };

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => return,
        };
        let mut lines = BufReader::new(stdout).lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit("dh:log:line", json!({
                "streamId": stream_id_clone,
                "source": source_label_clone,
                "line": line,
            }));
        }

        let _ = app.emit("dh:log:line", json!({
            "streamId": stream_id_clone,
            "source": source_label_clone,
            "line": "[stream ended]",
        }));
    });

    let abort_handle = handle.abort_handle();
    {
        let mut streams = state.streams.lock().await;
        streams.insert(stream_id.clone(), abort_handle);
    }

    json!({ "ok": true, "streamId": stream_id })
}

pub(crate) async fn handle_log_stream_stop(body: &Value, state: &AppState) -> Value {
    let stream_id = body.get("streamId").and_then(|v| v.as_str()).unwrap_or_default();
    if stream_id.is_empty() {
        return json!({ "ok": false, "error": "[LOG_STREAM_INVALID] Missing streamId." });
    }
    let mut streams = state.streams.lock().await;
    if let Some(handle) = streams.remove(stream_id) {
        handle.abort();
    }
    json!({ "ok": true })
}
