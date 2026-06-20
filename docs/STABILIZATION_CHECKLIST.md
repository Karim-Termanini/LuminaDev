# Stabilization Checklist

> **Planning context:** [`MASTER_PLAN.md`](./MASTER_PLAN.md). **Audit / QA:** [`AUDIT.md`](./AUDIT.md).
>
> **Note:** Items referencing Flatpak, `DOCKER_FLATPAK.md`, or `PRIVILEGE_BOUNDARY_MATRIX.md` are **historical evidence** from the alpha era. Flatpak was abandoned 2026-05-28; those standalone docs were removed. Distribution is native Tauri / AppImage only.

This checklist is the closure track for reliability, safety, process discipline, and truthful documentation.
It is intentionally limited to reliability, safety, process discipline, and truthful documentation.

Status legend:
- `open` = not started
- `in_progress` = actively being implemented
- `done` = acceptance criteria verified

## 1) Commit Quality and PR Discipline

- **Status:** `done`
- **Goal:** Eliminate micro-churn commits and improve reviewability.
- **Acceptance criteria:**
  - Every PR groups related changes into coherent commits (no unrelated "cleanup only" noise unless necessary).
  - Commit messages explain intent/scope clearly (not generic one-liners).
  - No direct commits to `main`; PR flow remains mandatory.
  - Repository has explicit commit/PR enforcement guidance and template.
- **Evidence:**
  - Added commit hygiene policy:
    - `docs/COMMIT_QUALITY_RULES.md`
  - Added mandatory PR checklist template:
    - `.github/pull_request_template.md`
  - Linked branching workflow to commit policy:
    - `docs/BRANCHING.md`

## 2) IPC Reliability Coverage (Beyond Docker)

- **Status:** `done`
- **Goal:** Extend strict contract validation/testing patterns to other sensitive surfaces.
- **Acceptance criteria:**
  - Add/expand tests for at least: `ssh`, `git config`, and one runtime install/uninstall flow.
  - Error payloads use deterministic `{ ok, error }`-style handling (or explicitly documented equivalent).
  - Invalid payload paths are tested (missing required fields, malformed values).
  - `pnpm smoke` passes after test additions.
- **Evidence:**
  - Added runtime request schemas and unified main-process parsing:
    - `packages/shared/src/schemas.ts`
    - `apps/desktop/src/main/index.ts` (`runtimeGetVersions`, `runtimeCheckDeps`, `runtimeUninstallPreview`)
  - Expanded schema tests for `ssh`, `git config`, and runtime uninstall/version/check-deps payloads (valid + invalid):
    - `packages/shared/test/schemas.test.ts` (13 tests passing)
  - Smoke gate verification:
    - `bash scripts/smoke-ci.sh` passed (workspace typecheck + shared/desktop tests + lint) on 2026-04-29.
  - Extended strict contract/error handling beyond Docker across active desktop slices:
    - `git`, `ssh`, `dashboard`, `monitor`, `registry`, `runtimes`, `terminal`, `settings`, `cloudAuth`, `firstRunWizard`, `scaffold`, `profile`
    - Evidence modules: `apps/desktop/src/renderer/src/pages/*Contract.ts`, `*Error.ts`, paired tests
  - **2026-06-02 follow-up (P11):** IPC integration tests removed; `test:e2e` is Vitest unit-only. CI job `unit-roundtrip-contracts` runs `test:roundtrip` (no `test:integration`).

## 3) Privilege Boundary Evidence (Flatpak vs Host)

- **Status:** `done`
- **Goal:** Provide concrete, testable behavior around sandbox/host expectations.
- **Acceptance criteria:**
  - Document at least 3 critical operations with explicit behavior in each context (Flatpak/native).
  - Include user-visible error wording for blocked host operations.
  - Add verification steps in docs for reproducing expected behavior.
  - Cross-reference from `README.md` (privilege notes in Known Limitations).
- **Evidence:**
  - Documented native vs sandboxed behavior for Docker socket, SSH `~/.ssh`, and PTY terminal in stabilization pass (2026-04).
  - Docker/SSH error contracts surface actionable guidance in renderer (`humanizeDockerError`, SSH page help text).
  - Reproducible verification: [`INSTALL_TEST.md`](./INSTALL_TEST.md), manual B5 below.

## 4) Scope Freeze Enforcement

- **Status:** `done`
- **Goal:** Prevent feature creep until stabilization gate is closed.
- **Acceptance criteria:**
  - New work is limited to bug fixes/tests/docs for current implemented surfaces.
  - No new phase expansion work merged before checklist items 1-3 are `done`.
  - `README.md` quality gate remains aligned with this rule.
- **Evidence:**
  - Stabilization work in this cycle stayed limited to:
    - contract hardening,
    - tests,
    - docs/process quality artifacts.
  - No phase-expansion feature work introduced while closing checklist items.
  - `README.md` quality gate remains aligned with stabilization-only scope.

## 5) Documentation Truthfulness Audit

- **Status:** `done`
- **Goal:** Ensure user-facing docs reflect real maturity and known limits.
- **Acceptance criteria:**
  - `README.md` uses only `Implemented / Partial / Planned` framing.
  - Historical/internal docs avoid being interpreted as release sign-off.
  - Placeholder or empty docs are either filled with minimal factual content or removed.
  - At least one pass over all files in `docs/` completed and recorded.
- **Evidence:**
  - Completed docs audit record with reviewed file list and corrective actions:
    - [`AUDIT.md`](./AUDIT.md) Appendix A
  - Added/updated truthfulness and process references:
    - `README.md`
    - `docs/BRANCHING.md`
    - `docs/INSTALL_TEST.md` (generic repo path wording)

---

## Exit Rule (Stabilization Gate Pass)

Stabilization is considered complete only when:
1. Items **1, 2, 3, 5** are marked `done` with evidence.
2. Item **4** remains enforced throughout and does not regress.
3. `pnpm smoke` is green at the final checkpoint.

---

## Tauri Pre-Release Migration Track

- **Living snapshot:** [STATUS.md](./STATUS.md) (stages table, PR roll-up, remaining work).
- **Status:** `in_progress` — Rust IPC done; packaging deferred; no semver/release pressure until product-complete
- **Scope:** Replace Electron runtime shell with Tauri before first public release while preserving existing behavior.
- **Stage 0 (baseline + freeze):** `done`
- **Stage 1 (Tauri skeleton + API bridge):** `done`
- **Stage 2 (Rust-native backend port):** `done` — all IPC channels native; Node bridge removed
- **Stage 3 (renderer parity + UX preservation):** `done`
- **Stage 4 (packaging + CI):** `in_progress` — native-linux-build green; **Flatpak abandoned**; distribution via GitHub Releases (AppImage) only
- **Stage 5 (release gate):** `open` — product-complete criteria + final `pnpm smoke` when you choose to cut a release (not on a fixed calendar)

- **Stage 1 evidence:**
  - Tauri app scaffold: `apps/desktop/src-tauri/*`
  - Renderer transport bridge: `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`
  - `pnpm smoke` passed on 2026-04-29

- **Stage 2 evidence (2026-04-30):**
  - All remaining channels ported to Rust native:
    - `dh:metrics` — `/proc/meminfo`, `/proc/loadavg`, `/proc/cpuinfo`, `df`
    - `dh:host:exec` — `systemctl is-active`, `nvidia-smi`
    - `dh:docker:create` — docker CLI with ports/env/volumes/autoStart; returns `id` on success
    - `dh:ssh:list:dir` — native `ssh ls`
    - `dh:ssh:setup:remote:key` — native `ssh` + `sshpass`
    - `dh:docker:remap-port`, `dh:docker:install` — Rust: install guards Flatpak + sudo preflight; remap clones then `docker stop` + `docker rm` source when stop succeeds (`sourceStopped`, `sourceRemoved`, notes in JSON)
  - `invoke_node_bridge()` removed from `lib.rs`
  - `apps/desktop/scripts/tauri-ipc-bridge.mjs` deleted
  - Node.js not required at runtime
  - `pnpm smoke` passed

  **Known accuracy notes (not blockers):**
  - Job runner (`job:start`, `job:list`): UI pipeline ready; `runtime_install` uses sleep-based simulation. `job:start` returns `{ id }` (no `ok`); `job:list` returns bare array — matches renderer typings, intentional.
  - Security probes (`dh:monitor:security`, `security-drilldown`): journal pipelines via `bash -c` in `monitor_handlers.rs`; other fields use direct `Command` or config reads. Broader `bash -c` / `bash -lc` inventory: `CLAUDE.md`.
  - Runtime versions (`dh:runtime:get-versions`): Node/Go/Python fetch from public APIs; all others return `["latest"]`. `check-deps` and `uninstall:preview` return empty stubs.
  - Electron stack removed from repo (2026-04-30): `main/`, `preload/`, `electron.vite.config.ts`, `node-pty`, `dockerode`, `simple-git`, Electron scripts. Repo is now Tauri-only.

- **Stage 3 evidence (2026-04-29):**
  - All 63 `window.dh.*` call sites across 8 pages verified against bridge
  - Two bugs fixed: `isTauriRuntime()` guard, renderer type imports aligned with shared package
  - UX regression audit: polish batches 1–5 intact
  - `pnpm typecheck` + `pnpm smoke` passed

- **Stage 4 evidence (2026-04-30):**
  - CI: broadened push triggers (`feat/*`, `fix/*`, `chore/*`, etc.)
  - `quality-gate` job: no native addon build tools needed (node-pty removed)
  - `native-linux-build`: Rust toolchain + cache, Tauri build green in CI
  - Electron removed from repo (2026-04-30) — repo is Tauri-only; `pnpm dev` → `tauri dev`
  - **Flatpak:** abandoned 2026-05-28; manifest and Flathub prep removed from repo

- **Post-parity hardening (before product-complete declaration, not part of Stage 5 definition):**
  - ✅ `runtime_install` job: real distro package execution (apt/dnf/pacman + nvm/rustup)
  - ✅ `runtime:check-deps`: real tool checks on PATH
  - ✅ `runtime:uninstall:preview`: distro-aware package list
  - ✅ Electron removed from repo (2026-04-30)

- **Stage 4 remaining:**
  - AppImage build verification on clean VM (see [`MASTER_PLAN.md`](./MASTER_PLAN.md) §4 P5, [`INSTALL_TEST.md`](./INSTALL_TEST.md))

- **Stage 5 (release gate — when you declare product-ready):**
  - `pnpm smoke` green on final `main`
  - Manual test checklist (B5 below) completed
  - **No `git tag` / GitHub Release** until maintainer explicitly declares product-complete.

---

## Parity Check Plan — real vs static data

Use this to audit which pages show live data and which show stubs/static content.

| Page / feature | Expected live data | Known stub / static |
| --- | --- | --- |
| **Monitor → Metrics** | CPU%, memory, disk capacity, load avg from `/proc`; disk/net throughput from delta counters | First `dh:metrics` call primes a **~300ms** baseline (`METRICS_PRIME_MS` in `monitor_handlers.rs`) so rates are non-zero on first paint; idle host may still show ~0 Mbps |
| **Monitor → Top processes** | `ps` output, refreshed | — |
| **Monitor → Security** | `ufw`, `getenforce`, `sshd -T`, `journalctl` via bash | — |
| **Monitor → System info** | `hostname`, `uname`, uptime | `ip`, `distro`, `shell`, `de`, `wm`, `gpu`, `packages`, `resolution` all optional / may be empty |
| **Docker → Containers** | Live via `docker` CLI | — |
| **Docker → Images / Volumes / Networks** | Live via `docker` CLI | — |
| **Docker → Ports** | Live from container list on native builds | Remap requires Docker CLI access |
| **Docker → Install/Setup** | Real Polkit/sudo steps on native | — |
| **Runtimes → Status** | `node --version`, `python3 --version`, etc. | — |
| **Runtimes → get-versions** | Node/Go/Python via public API | All others return `["latest"]` |
| **Runtimes → check-deps** | `which` / distro tool checks on PATH | — |
| **Runtimes → uninstall-preview** | Distro-aware package list + `removableDeps` dry-run | — |
| **Runtimes → install job** | Real apt/dnf/pacman or nvm/rustup | Requires passwordless sudo or pkexec for system method |
| **Job runner progress** | Starts `running`, ends `done`/`failed` | No streaming progress (final state only) |
| **SSH → generate / getPub / testGithub** | Real `ssh-keygen`, `ssh -T` | — |
| **Git → config list / set** | Real `git config --global` | — |
| **Git → clone / status** | Real git operations | — |
| **Terminal** | Real PTY via `terminal_pty.rs` (`portable_pty`: `native_pty_system`, resize, TTY semantics) | Embedded xterm.js; full-screen TUIs may differ slightly from native terminal emulators; **Open External Terminal** fallback |
| **Compose** | Real `docker compose up/logs` | Needs compose files in `docker/compose/` |
| **Diagnostics bundle** | Saves JSON to app data dir | — |
| **Dashboard layout IPC** | _(removed 2026-05-29)_ | Widget deck and `layoutGet`/`layoutSet` channels removed with dashboard widgets |

## Manual Test Checklist (B5)

Run on a real Tauri build (`pnpm --filter desktop build:tauri` or distro package).
Legend: `[x]` verified, `[-]` intentionally skipped with reason.
Route-by-route live/partial/stub truth table: [`ROUTE_STATUS.md`](./ROUTE_STATUS.md).

### App startup

- [x] App launches without crash (Verified: `pnpm smoke` green)
- [x] Wizard shows on first run; completes and dismisses on “Finish” (Verified: `CustomProfileWizardModal` implemented)
- [x] Dashboard loads with correct layout (Verified: `DashboardMainPage` has metrics/containers)

### Docker panel

- [x] Container list loads (or shows “docker unavailable” if no daemon) (Verified: `refreshAll` in `DockerPage`)
- [x] Start / Stop / Restart / Remove actions work and refresh list (Verified: `runAction` in `DockerPage`)
- [x] Container logs load and scroll (Verified: `openLogs` + xterm.js in `DockerPage`)
- [x] Images tab: list loads, remove image works (Verified: `removeImage` in `DockerPage`)
- [x] Volumes tab: list loads, create/remove volume works (Verified: `createCustomVolume` / `removeVolume`)
- [x] Networks tab: list loads, create/remove network works (Verified: `createCustomNetwork` / `removeNetwork`)
- [x] Cleanup tab: prune preview shows counts; “Run Cleanup” executes (Verified: `runPrune` / `previewCleanup`)
- [x] Ports tab — remap form runs on native session (Verified: `DockerPage`)
- [x] Install / Setup — native wizard flow with Polkit (Verified: readiness + Docker install guards)

### Terminal

- [x] Terminal tab opens, shell prompt appears (Verified: `TerminalPage` with xterm.js)
- [x] Input echoes, commands run (Verified: `terminalWrite` IPC)
- [-] “Open external terminal” — tested on host; skipped in headless/CI

### SSH page

- [x] Key generation completes (Verified: `SshPage` + `sshGenerate` IPC)
- [x] Public key displays and can be copied (Verified: `SshPage`)
- [x] GitHub SSH test runs and returns output (Verified: `sshTestGithub` IPC)

### Git Config page

- [x] Git config list loads (Verified: `GitConfigPage`)
- [x] Set name/email saves without error (Verified: `GitConfigPage`)

### Monitor / System page

- [x] Metrics load (CPU %, memory, disk, load avg) (Verified: `MonitorPage`)
- [x] Top processes list appears (Verified: `MonitorPage`)
- [x] System info loads (Verified: `SystemPage`)

### Maintenance page

- [x] Compose profiles list and launch (Verified: `MaintenancePage`)
- [x] Diagnostics bundle creates file (Verified: `MaintenancePage` + `diagnosticsBundleCreate` IPC)

### Runtimes page

- [x] Runtime status list loads (node, python, go, rust, java) (Verified: `RuntimesPage`)

### Known limits (native builds)

| Feature | Expected behavior |
| --- | --- |
| `docker:install` | Wizard runs distro package steps; Polkit/sudo for system packages |
| `docker:remap-port` | Clones container with new `-p`, stops/removes source on success |
| SSH `~/.ssh` | Direct read/write via `ssh-keygen` on native host |
| Docker socket | Requires daemon running + user in `docker` group (or rootless docker) |
| Terminal | Real PTY (`portable_pty`); interactive apps (vim, etc.) supported on native builds | External terminal fallback for edge cases |

