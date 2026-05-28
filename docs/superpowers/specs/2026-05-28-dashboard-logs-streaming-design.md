# Spec: Dashboard-Logs — Live Streaming

**Date:** 2026-05-28
**Status:** Approved

---

## Problem

`DashboardLogsPage` already uses xterm.js with source switching (unified / compose profile / container / job). However, it fetches log snapshots in batch and re-renders the full terminal on each refresh cycle. This means:
1. The terminal clears and re-renders every N seconds — jarring UX.
2. New log lines from long-running jobs/containers are delayed by the poll interval.
3. "Unified" mode fetches all compose profiles sequentially, causing batchy output.

---

## Design

### Streaming Architecture

Replace poll-and-clear with event-driven append using Tauri `listen()`.

**Job log stream:** Jobs already emit `project-install-log` events (string payload). Extend this to all job types in `runtime_jobs.rs` — not just project scaffold. Any `job:start` background task should emit `dh:job:log:{ jobId }` events.

**Compose/container log stream:** New Rust handler `handle_log_stream_start` and `handle_log_stream_stop` that:
1. `start`: spawns a background task that tails the compose/container logs (using `docker compose logs --follow` or `docker logs --follow`) and emits Tauri events `dh:log:line` with payload `{ source: string, line: string }`.
2. `stop`: cancels the background task by ID.

**Unified mode:** subscribe to ALL active sources simultaneously. Each line is prefixed with ANSI-colored `[source]` tag in xterm.

### Frontend Changes — `DashboardLogsPage.tsx`

**Remove:**
- `setInterval` polling pattern.
- `term.clear()` + full re-render on source switch (replace with visual separator line).

**Add:**
- `useEffect` with `listen('dh:log:line', handler)` — appends new line to xterm without clearing.
- On source change: write a separator `\r\n--- [new source] ---\r\n` to xterm (does not clear history).
- `streamIdRef`: stores active stream ID for cleanup on unmount or source change.

**Search filter:** Already implemented (filters lines on writeLogs). Keep. On filter change: scan the xterm buffer via `term.buffer.active` and dim non-matching lines via ANSI escape codes (or re-render filtered view into a secondary overlay).

**Auto-scroll:** `term.scrollToBottom()` on new line, unless user has scrolled up (detect via `term.buffer.active.viewportY < term.buffer.active.length - term.rows`).

### New IPC Channels

```
dh:log:stream:start   { source: 'compose' | 'container' | 'unified', id?: string }
                      → { ok: true, streamId: string }

dh:log:stream:stop    { streamId: string }
                      → { ok: true }
```

Emits Tauri events: `dh:log:line` with payload `{ streamId: string, source: string, line: string }`.

### Rust — New Module `runtime_logs.rs`

New file (keeps `compose_engine.rs` focused on compose lifecycle ops).

`handle_log_stream_start`:
- Generates stream ID: `uuid::Uuid::new_v4().to_string()`.
- Spawns tokio task: `docker compose -p <profile> logs --follow --no-log-prefix` or `docker logs -f <containerId>`.
- Each stdout line → `app.emit("dh:log:line", { streamId, source, line })`.
- Stores abort handle in `AppState.streams: Mutex<HashMap<String, AbortHandle>>` (use `tokio::task::AbortHandle` for clean cancellation without waiting for task to finish).

`handle_log_stream_stop`:
- Looks up `streamId` in `AppState.streams`, aborts the task.

---

## Data Flow

```
Source selected
  └─ dh:log:stream:stop (previous stream if any)
  └─ dh:log:stream:start { source, id }
  └─ listen('dh:log:line') → xterm.write(line + '\r\n')

Unmount
  └─ dh:log:stream:stop
  └─ unlisten()
```

---

## Error Handling

- `docker` not available: stream emits one error line then closes. xterm shows `[stream error: docker unavailable]` in red.
- Container stopped mid-stream: stream closes naturally. xterm shows `[stream ended]` separator.
- Stream start fails: show error toast. Terminal shows last known content.

---

## Files Changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/src/lib.rs` | Add `dh:log:stream:start`, `dh:log:stream:stop` arms; add `streams` to AppState |
| `apps/desktop/src-tauri/src/state.rs` | Add `streams: Mutex<HashMap<String, JoinHandle<()>>>` to AppState |
| `apps/desktop/src-tauri/src/compose_engine.rs` (or new `runtime_logs.rs`) | `handle_log_stream_start`, `handle_log_stream_stop` |
| `packages/shared/src/ipc.ts` | Add `IPC.LOG_STREAM_START`, `IPC.LOG_STREAM_STOP` |
| `apps/desktop/src/renderer/src/api/desktopApiBridge.ts` | Add `logStreamStart`, `logStreamStop` |
| `apps/desktop/src/renderer/src/pages/DashboardLogsPage.tsx` | Replace poll with Tauri event listener; append-only xterm writes |
