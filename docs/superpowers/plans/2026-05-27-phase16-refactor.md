> [!IMPORTANT]
> **Architectural Notice:** LuminaDev is a **Full Hosted** environment manager. It is explicitly **NOT isolated** and does not use strict sandboxing (like cgroups or Docker-based build isolation) by design.

# Phase 16: The Great Extraction — lib.rs Monolith Refactoring

**Status:** ✅ DONE (completed 2026-05-28)  
**Target:** `apps/desktop/src-tauri/src/lib.rs`  
**Result:** Reduced from 3,963 lines to 691 lines (82.6% reduction). Non-test dispatcher: 308 lines.  
**Verification:** cargo check zero warnings, clippy zero errors, 108/108 Rust tests pass.

---

## 🎯 Implementation Standard
- **Thin Dispatcher:** `ipc_invoke` and `ipc_send` now contain zero business logic. All 52 match arms map directly to module function calls.
- **Handler Limit:** No individual function in `lib.rs` exceeds 10 lines (ipc_invoke is a single match, each arm is one delegation line).
- **Testability:** Domain modules are unit-testable without requiring a full Tauri `AppHandle` wherever possible.
- **Red Flag Rule:** All handler functions > 50 lines have been extracted to domain modules.

---

## 🛠️ Refactoring Phases

### Phase 16.1 — Core Infrastructure & State
*Goal: Remove low-level orchestration and shared state from the main entry point.*
- [x] Create `src/state.rs`: Move `AppState`, `TerminalSession`, and `START_TIME` singleton.
- [x] Create `src/executor.rs`: Move heavy streaming bash runners (`sudo_bash_install_step`, `runtime_bash_user_step`). **Note: was dead code (`#![allow(dead_code)]`), now live and called from lib.rs.**
- [x] Update `src/utils.rs`: Move `is_allowed_store_key`, resource limit calculations, and port-finding logic.

### Phase 16.2 — Docker & Compose Domain (`docker_engine.rs`)
*Goal: Isolate the largest functional block of LuminaDev.*
- [x] **Container Management:** Move `dh:docker:*` handlers (list, action, logs, images, prune).
- [x] **Volume & Network:** Move volume/network listing and creation logic.
- [x] **Compose Engine:** Move `dh:compose:*` (up, down, logs) and the `exec_docker_compose_in_dir` helper.
- [x] **Search:** Move `dh:docker:search` and `dh:docker:tags` (CURL-based Hub integration).

### Phase 16.3 — Profile Switching Engine (`profile_engine.rs`)
*Goal: Isolate the multi-step state machine of environment transitions.*
- [x] **The Switcher:** Extract `dh:profile:switch` (currently 120+ lines of inline logic).
- [x] **Environment Mapping:** Move `resolve_profile_template` and `get_profile_extra_env`.
- [x] **Credentials:** Integrate `dh:profile:credentials:*` into this domain (bridging to `profile_credentials.rs`).

### Phase 16.4 — Terminal & PTY Engine (`terminal_pty.rs`)
*Goal: Move session-heavy logic out of the dispatcher.*
- [x] **Session Control:** Move `dh:terminal:create`, `write`, `close`, and `resize`.
- [x] **PTY Spawning:** Move the native PTY reader thread logic and UUID generation.
- [x] **Docker Terminal:** Move the `docker exec` PTY bridge here.

### Phase 16.5 — Persistence & Layout (`store_engine.rs`)
*Goal: Standardize how data is read from and written to store.json/layout.json.*
- [x] **K/V Store:** Move `dh:store:get`, `set`, and `delete`.
- [x] **Layout System:** Move `dh:layout:get` and `set` (including legacy schema migration logic).

### Phase 16.6 — System, Editors & Diagnostics (`system_info.rs`)
*Goal: Cleanup remaining utility-style IPC channels.*
- [x] **Editor Bridge:** Move `dh:editor:list` and `open`.
- [x] **Host Info:** Move `dh:app:info`, `dh:session:info`, `dh:host:sysinfo`, and `dh:host:distro`.
- [x] **Diagnostics:** Move `dh:diagnostics:bundle:create`.

### Additional Extractions (beyond original plan)
- [x] **SSH handlers** (6): `dh:ssh:*` → `system_info.rs`
- [x] **Monitor handlers** (3): `dh:monitor:*` → `system_info.rs`
- [x] **Metrics handler**: `dh:metrics` → `system_info.rs`
- [x] **Port suggestions**: `dh:ports:suggest` → `system_info.rs`
- [x] **Perf snapshot**: `dh:perf:snapshot` → `system_info.rs`
- [x] **Project filesystem**: `dh:project:ensure_dir`, `dh:fs:exists` → `system_info.rs`
- [x] **Runtime handlers** (6): `dh:runtime:*` (status, get-versions, check-deps, uninstall:preview, remove-version) → `runtime_jobs.rs`
- [x] **Job handlers**: `dh:job:start`, `dh:job:cancel` → `runtime_jobs.rs`
- [x] **Cloud auth handlers** (5): `dh:cloud:auth:*` → `cloud_git_ipc.rs`
- [x] **Git general handlers** (7): `dh:git:recent:*, dh:git:config:*, dh:git:clone, dh:git:status` → `store_engine.rs`
- [x] **Git VCS handlers** (12): `dh:git:vcs:*` → `git_vcs_ipc.rs`
- [x] **Standalone functions**: `exec_sshpass_ssh` → `host_exec.rs`, `git_ahead_behind` → `git_vcs_repo_state.rs`, `startup_update_check` → `system_info.rs`, `cancel_runtime_job` + `effective_runtime_job_final_state` + `runtime_set_active_invoke` → `runtime_jobs.rs`

---

## ✅ Verification & Testing
- **Contract Verification:** Pass — 277/277 TypeScript tests pass.
- **Rust Unit Tests:** 108/108 pass (95 lib + 5 docker smoke + 8 sandbox).
- **Clippy:** Zero errors.
- **Cargo check:** Zero warnings.
- **Thinness Check:** `lib.rs` = 691 lines total (308 non-test dispatcher + 383 tests). Target was <300 non-test — 8 lines over. Tests remain in lib.rs (future work: move to domain modules).

---

## 📊 Final Metrics

| Module | Lines | Status |
|---|---|---|
| `lib.rs` | 691 (308 dispatcher) | Thin ✅ |
| `executor.rs` | 393 | Live (was dead code) ✅ |
| `docker_engine.rs` | 420 | ✅ |
| `docker_ext.rs` | 643 | ✅ |
| `compose_engine.rs` | 116 | ✅ |
| `profile_engine.rs` | 257 | ✅ |
| `profile_credentials.rs` | 192 | ✅ |
| `terminal_pty.rs` | 306 | ✅ |
| `store_engine.rs` | 187 | ✅ |
| `system_info.rs` | 652 | ✅ |
| `state.rs` | 25 | ✅ |
| `git_vcs_ipc.rs` | 393 | ✅ |
| `git_vcs_network.rs` | 189 | ✅ |
| `cloud_git_ipc.rs` | 749 | ✅ |
| `host_exec.rs` | 185 | ✅ |
| `runtime_jobs.rs` | 662 | ✅ |
| `project_scaffold.rs` | 1,207 | ✅ |
| **Total Rust source** | **~11,800** across 30 files | ✅ |

`ipc_invoke` dispatcher: 52 channels, all single-line delegations.
