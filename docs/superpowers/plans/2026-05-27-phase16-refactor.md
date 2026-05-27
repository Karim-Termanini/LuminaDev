# Phase 16: The Great Extraction — lib.rs Monolith Refactoring

**Status:** Proposed (Technical Debt Remediation)  
**Target:** `apps/desktop/src-tauri/src/lib.rs`  
**Goal:** Reduce `lib.rs` from ~4,700 lines to < 300 lines by transforming it into a "Thin Dispatcher".

---

## 🎯 Implementation Standard
- **Thin Dispatcher:** `ipc_invoke` and `ipc_send` must contain zero business logic. They should only map strings to module function calls.
- **Handler Limit:** No individual function in `lib.rs` should exceed 10 lines.
- **Testability:** Domain modules must be unit-testable without requiring a full Tauri `AppHandle` wherever possible.
- **Red Flag Rule:** Any handler function > 50 lines must be extracted to a domain module immediately.

---

## 🛠️ Refactoring Phases

### Phase 16.1 — Core Infrastructure & State
*Goal: Remove low-level orchestration and shared state from the main entry point.*
- [ ] Create `src/state.rs`: Move `AppState`, `TerminalSession`, and `START_TIME` singleton.
- [ ] Create `src/executor.rs`: Move heavy streaming bash runners (`sudo_bash_install_step`, `runtime_bash_user_step`).
- [ ] Update `src/utils.rs`: Move `is_allowed_store_key`, resource limit calculations, and port-finding logic.

### Phase 16.2 — Docker & Compose Domain (`docker_engine.rs`)
*Goal: Isolate the largest functional block of LuminaDev.*
- [ ] **Container Management:** Move `dh:docker:*` handlers (list, action, logs, images, prune).
- [ ] **Volume & Network:** Move volume/network listing and creation logic.
- [ ] **Compose Engine:** Move `dh:compose:*` (up, down, logs) and the `exec_docker_compose_in_dir` helper.
- [ ] **Search:** Move `dh:docker:search` and `dh:docker:tags` (CURL-based Hub integration).

### Phase 16.3 — Profile Switching Engine (`profile_engine.rs`)
*Goal: Isolate the multi-step state machine of environment transitions.*
- [ ] **The Switcher:** Extract `dh:profile:switch` (currently 120+ lines of inline logic).
- [ ] **Environment Mapping:** Move `resolve_profile_template` and `get_profile_extra_env`.
- [ ] **Credentials:** Integrate `dh:profile:credentials:*` into this domain (bridging to `profile_credentials.rs`).

### Phase 16.4 — Terminal & PTY Engine (`terminal_pty.rs`)
*Goal: Move session-heavy logic out of the dispatcher.*
- [ ] **Session Control:** Move `dh:terminal:create`, `write`, `close`, and `resize`.
- [ ] **PTY Spawning:** Move the native PTY reader thread logic and UUID generation.
- [ ] **Docker Terminal:** Move the `docker exec` PTY bridge here.

### Phase 16.5 — Persistence & Layout (`store_engine.rs`)
*Goal: Standardize how data is read from and written to store.json/layout.json.*
- [ ] **K/V Store:** Move `dh:store:get`, `set`, and `delete`.
- [ ] **Layout System:** Move `dh:layout:get` and `set` (including legacy schema migration logic).

### Phase 16.6 — System, Editors & Diagnostics (`system_info.rs`)
*Goal: Cleanup remaining utility-style IPC channels.*
- [ ] **Editor Bridge:** Move `dh:editor:list` and `open`.
- [ ] **Host Info:** Move `dh:app:info`, `dh:session:info`, `dh:host:sysinfo`, and `dh:host:distro`.
- [ ] **Diagnostics:** Move `dh:diagnostics:bundle:create`.

---

## ✅ Verification & Testing
- **Contract Verification:** Run `pnpm test:contract` (renderer side) after every module extraction to ensure no regressions in JSON payloads.
- **Rust Unit Tests:** Each new module (`docker_engine.rs`, etc.) must include a `#[cfg(test)] mod tests` block with at least 80% logic coverage.
- **Thinness Check:** Final line count check on `lib.rs` to confirm < 300 line target.

---

## 📦 Reference Architecture
```rust
// lib.rs (Ideal State)
mod docker_engine;
mod profile_engine;
mod terminal_pty;
// ... (imports)

#[tauri::command]
async fn ipc_invoke(channel: String, payload: Option<Value>, app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
  let body = payload.unwrap_or_else(|| json!({}));
  match channel.as_str() {
    "dh:docker:list"   => docker_engine::list_containers(&app).await,
    "dh:profile:switch" => profile_engine::switch(&app, &body).await,
    "dh:terminal:create" => terminal_pty::create(&app, &state, &body).await,
    // ...
    _ => Err(format!("Unknown channel: {}", channel))
  }
}
```
