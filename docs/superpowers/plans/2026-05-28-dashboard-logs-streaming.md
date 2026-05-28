# Dashboard-Logs Live Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `DashboardLogsPage`'s poll-and-clear approach with live Tauri event streaming. Log lines append to xterm without clearing; source changes emit a separator line.

**Architecture:** New `runtime_logs.rs` Rust module handles `dh:log:stream:start` and `dh:log:stream:stop`. Streams are tracked in `AppState.streams` using `AbortHandle`. The frontend listens on `dh:log:line` Tauri events and appends to xterm. The 2s `setInterval` poll and `term.clear()` on refresh are removed.

**Tech Stack:** Rust/Tokio (AbortHandle, process streaming), `@tauri-apps/api/event` listen, xterm.js append-only writes.

---

### Task 1: Add `streams` to AppState

**Files:**
- Modify: `apps/desktop/src-tauri/src/state.rs`

- [ ] **Step 1: Add the streams field**

Open `apps/desktop/src-tauri/src/state.rs`. The `AppState` struct currently has `terminals`, `jobs`, `net_prev`, `disk_prev`, `cpu_prev`. Add:

```rust
pub streams: Mutex<std::collections::HashMap<String, tokio::task::AbortHandle>>,
```

The full struct becomes:

```rust
#[derive(Default)]
pub(crate) struct AppState {
  pub terminals: Mutex<HashMap<String, TerminalSession>>,
  pub jobs: Mutex<Vec<Value>>,
  pub net_prev: Mutex<Option<(u64, u64, Instant)>>,
  pub disk_prev: Mutex<Option<(u64, u64, Instant)>>,
  pub cpu_prev: Mutex<Option<(u64, u64, Instant)>>,
  pub streams: Mutex<HashMap<String, tokio::task::AbortHandle>>,
}
```

Note: `tokio::task::AbortHandle` does not implement `Default`, so `AppState` can no longer use `#[derive(Default)]` if `streams` is in the struct — unless you initialize it explicitly. Check if `#[derive(Default)]` still works. If it doesn't (because `AbortHandle` is non-Default), change the derive to a manual impl:

```rust
impl Default for AppState {
    fn default() -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
            jobs: Mutex::new(Vec::new()),
            net_prev: Mutex::new(None),
            disk_prev: Mutex::new(None),
            cpu_prev: Mutex::new(None),
            streams: Mutex::new(HashMap::new()),
        }
    }
}
```

Remove `#[derive(Default)]` if you switch to the manual impl.

- [ ] **Step 2: cargo check**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/state.rs
git commit -m "feat(logs): add streams AbortHandle map to AppState"
```

---

### Task 2: Create `runtime_logs.rs` Rust module

**Files:**
- Create: `apps/desktop/src-tauri/src/runtime_logs.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Create `runtime_logs.rs`**

Create `apps/desktop/src-tauri/src/runtime_logs.rs`:

```rust
use serde_json::{json, Value};
use tauri::AppHandle;
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

    let (cmd, args): (String, Vec<String>) = match source {
        "compose" if !id.is_empty() => (
            "docker".to_string(),
            vec!["compose".to_string(), "-p".to_string(), id.clone(), "logs".to_string(), "--follow".to_string(), "--no-log-prefix".to_string()],
        ),
        "container" if !id.is_empty() => (
            "docker".to_string(),
            vec!["logs".to_string(), "-f".to_string(), "--tail".to_string(), "100".to_string(), id.clone()],
        ),
        _ => {
            // unified: tail all running containers merged
            (
                "docker".to_string(),
                vec!["compose".to_string(), "logs".to_string(), "--follow".to_string(), "--no-log-prefix".to_string()],
            )
        }
    };

    let source_label = if id.is_empty() { source.to_string() } else { format!("{}/{}", source, id) };

    let handle = tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        use tokio::process::Command;

        let mut child = match Command::new(&cmd)
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("dh:log:line", serde_json::json!({
                    "streamId": stream_id_clone,
                    "source": source_label,
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
            let _ = app.emit("dh:log:line", serde_json::json!({
                "streamId": stream_id_clone,
                "source": source_label,
                "line": line,
            }));
        }

        let _ = app.emit("dh:log:line", serde_json::json!({
            "streamId": stream_id_clone,
            "source": source_label,
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
```

- [ ] **Step 2: Add `uuid` to Cargo.toml**

Check if `uuid` is already a dependency:

```bash
grep "uuid" apps/desktop/src-tauri/Cargo.toml
```

If not present, add to `[dependencies]` in `apps/desktop/src-tauri/Cargo.toml`:

```toml
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 3: Declare module and add dispatcher arms in `lib.rs`**

In `apps/desktop/src-tauri/src/lib.rs`:

1. Add at the top with other module declarations:
```rust
mod runtime_logs;
```

2. In `ipc_invoke`, add two new arms (pass `app` handle — check how `terminal_pty` or other handlers receive the AppHandle; the dispatcher signature is `pub async fn ipc_invoke(app: AppHandle, channel: &str, payload: Value, state: AppState)`):

```rust
"dh:log:stream:start" => runtime_logs::handle_log_stream_start(app, &payload, &state).await,
"dh:log:stream:stop" => runtime_logs::handle_log_stream_stop(&payload, &state).await,
```

- [ ] **Step 4: cargo check**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1
```

Fix any type errors (e.g., if `AppHandle` isn't in scope, add `use tauri::AppHandle;` at the top of `runtime_logs.rs`).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/runtime_logs.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/Cargo.toml
git commit -m "feat(logs): add runtime_logs.rs with dh:log:stream:start/stop handlers"
```

---

### Task 3: Add IPC constants and bridge methods

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`

- [ ] **Step 1: Add IPC constants**

In `packages/shared/src/ipc.ts`, in the IPC object, add:

```ts
logStreamStart: 'dh:log:stream:start',
logStreamStop: 'dh:log:stream:stop',
```

- [ ] **Step 2: Add bridge methods**

In `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`, add:

```ts
logStreamStart: (payload: { source: 'compose' | 'container' | 'unified'; id?: string }) =>
  tauriInvoke<{ ok: boolean; streamId: string }>(IPC.logStreamStart, payload),
logStreamStop: (payload: { streamId: string }) =>
  tauriInvoke<{ ok: boolean }>(IPC.logStreamStop, payload),
```

- [ ] **Step 3: Build shared and typecheck**

```bash
cd packages/shared && pnpm build 2>&1
cd ../../apps/desktop && pnpm typecheck 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ipc.ts apps/desktop/src/renderer/src/api/desktopApiBridge.ts
git commit -m "feat(logs): add logStreamStart/Stop IPC constants and bridge methods"
```

---

### Task 4: Update DashboardLogsPage to use streaming

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DashboardLogsPage.tsx`

- [ ] **Step 1: Add imports**

At the top, ensure `listen` is imported:

```ts
import { listen } from '@tauri-apps/api/event'
```

(It may already be imported — check.)

- [ ] **Step 2: Add `streamIdRef` and `unlistenRef`**

In the component body, after the existing `activeRef`:

```ts
const streamIdRef = useRef<string | null>(null)
const unlistenRef = useRef<(() => void) | null>(null)
```

- [ ] **Step 3: Add `startStream` helper**

```ts
const startStream = useCallback(async () => {
  // Stop previous stream
  if (streamIdRef.current) {
    await window.dh.logStreamStop({ streamId: streamIdRef.current }).catch(() => {})
    streamIdRef.current = null
  }
  // Stop previous listener
  if (unlistenRef.current) {
    unlistenRef.current()
    unlistenRef.current = null
  }

  const term = terminalRef.current
  if (!term) return

  // Write separator
  term.write(`\r\n\x1b[90m--- ${activeSource.label} ---\x1b[0m\r\n`)

  // Start new stream
  try {
    const res = await window.dh.logStreamStart({
      source: activeSource.type as 'compose' | 'container' | 'unified',
      id: activeSource.id,
    })
    if (!res.ok) return
    streamIdRef.current = res.streamId

    // Listen for log lines
    const unlisten = await listen<{ streamId: string; source: string; line: string }>(
      'dh:log:line',
      (event) => {
        if (event.payload.streamId !== streamIdRef.current) return
        const term = terminalRef.current
        if (!term) return

        const line = colorizeLine(event.payload.line)
        // Auto-scroll only if user hasn't scrolled up
        const atBottom =
          term.buffer.active.viewportY >=
          term.buffer.active.length - term.rows - 1
        term.write(line + '\r\n')
        if (atBottom) term.scrollToBottom()
      }
    )
    unlistenRef.current = unlisten
  } catch (e) {
    term.write(`\x1b[31m[stream error: ${e instanceof Error ? e.message : String(e)}]\x1b[0m\r\n`)
  }
}, [activeSource])
```

- [ ] **Step 4: Replace the polling effect with streaming**

Find this `useEffect` (around line 340):

```ts
useEffect(() => {
  void refreshJobs()
  void refreshContainers()
  const id = setInterval(() => {
    if (activeRef.current) {
      void refreshJobs()
      void refreshContainers()
    }
  }, 2000)
  return () => clearInterval(id)
}, [refreshJobs, refreshContainers])
```

Replace it with:

```ts
// Start stream on source change
useEffect(() => {
  void startStream()
  return () => {
    // Cleanup on unmount or source change
    if (streamIdRef.current) {
      void window.dh.logStreamStop({ streamId: streamIdRef.current })
      streamIdRef.current = null
    }
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }
  }
}, [startStream])

// Still poll jobs/containers for the source list in the sidebar
useEffect(() => {
  void refreshJobs()
  void refreshContainers()
  const id = setInterval(() => {
    void refreshJobs()
    void refreshContainers()
  }, 5000)
  return () => clearInterval(id)
}, [refreshJobs, refreshContainers])
```

- [ ] **Step 5: Remove `loadSourceLogs` usage**

The `loadSourceLogs` callback and its `useEffect` dependency are no longer needed. Remove:
- The `loadSourceLogs` `useCallback` definition
- The `useEffect(() => { void loadSourceLogs() }, [loadSourceLogs])` effect
- The `activeRef` usage in the old polling effect (the new poll doesn't use `activeRef`)

Keep `refreshJobs` and `refreshContainers` — still used for the sidebar source list.

- [ ] **Step 6: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1
```

- [ ] **Step 7: Manual smoke test**

Run `pnpm dev`. Navigate to `/dashboard/logs`. Verify:
1. The unified log source shows a separator line and starts streaming.
2. Switching sources shows a new separator, new stream starts.
3. No terminal flicker/clear on refresh.
4. Navigating away stops the stream (no memory leak).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/DashboardLogsPage.tsx
git commit -m "feat(logs): replace poll-and-clear with live Tauri event streaming"
```
