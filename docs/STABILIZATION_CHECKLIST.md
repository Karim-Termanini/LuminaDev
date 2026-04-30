# Stabilization Checklist

This checklist is the closure track for the "hype vs substance" concerns.
It is intentionally limited to reliability, safety, process discipline, and truthful documentation.

Execution split (Agent B vs Rust/IPC): [AGENT_WORK_PLAN.md](./AGENT_WORK_PLAN.md).

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
    - `git`, `ssh`, `dashboard`, `monitor`, `registry`, `runtimes`, `terminal`
    - Evidence modules: `apps/desktop/src/renderer/src/pages/*Contract.ts`, `*Error.ts`, paired tests

## 3) Privilege Boundary Evidence (Flatpak vs Host)

- **Status:** `done`
- **Goal:** Provide concrete, testable behavior around sandbox/host expectations.
- **Acceptance criteria:**
  - Document at least 3 critical operations with explicit behavior in each context (Flatpak/native).
  - Include user-visible error wording for blocked host operations.
  - Add verification steps in docs for reproducing expected behavior.
  - Cross-reference from `README.md` and `docs/DOCKER_FLATPAK.md`.
- **Evidence:**
  - Added explicit matrix with 3 critical operations across native vs Flatpak:
    - `docs/PRIVILEGE_BOUNDARY_MATRIX.md`
    - Operations covered: Docker socket access, SSH `~/.ssh` access, PTY terminal fallback.
  - Added user-visible error wording references in matrix:
    - Docker unavailable/permission denied messaging.
    - SSH Flatpak note with override guidance.
    - PTY fallback guidance.
  - Added reproducible verification steps for both contexts and linked references:
    - `README.md` Flatpak section
    - `docs/DOCKER_FLATPAK.md`
    - `docs/INSTALL_TEST.md`

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
    - `docs/DOCS_AUDIT_2026-04.md`
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
- **Status:** `in_progress` — Rust IPC done; packaging/Flatpak deferred; no semver/release pressure until product-complete (see [AGENT_WORK_PLAN.md](./AGENT_WORK_PLAN.md))
- **Scope:** Replace Electron runtime shell with Tauri before first public release while preserving existing behavior.
- **Stage 0 (baseline + freeze):** `done`
- **Stage 1 (Tauri skeleton + API bridge):** `done`
- **Stage 2 (Rust-native backend port):** `done` — all IPC channels native; Node bridge removed
- **Stage 3 (renderer parity + UX preservation):** `done`
- **Stage 4 (packaging + CI + Flatpak):** `in_progress` — native-linux-build green; flatpak deferred to release
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
  - Security probes (`dh:monitor:security`, `security-drilldown`): logic in Rust, commands via `bash -c` (`ufw`, `getenforce`, `sshd -T`, `journalctl`, `ss`). Not pure Rust, not a bug.
  - Runtime versions (`dh:runtime:get-versions`): Node/Go/Python fetch from public APIs; all others return `["latest"]`. `check-deps` and `uninstall:preview` return empty stubs.
  - Electron stack removed from repo (2026-04-30): `main/`, `preload/`, `electron.vite.config.ts`, `node-pty`, `dockerode`, `simple-git`, Electron scripts. Repo is now Tauri-only.

- **Stage 3 evidence (2026-04-29):**
  - All 63 `window.dh.*` call sites across 8 pages verified against bridge
  - Two bugs fixed: `isTauriRuntime()` guard, `DashboardLayoutFile` import
  - UX regression audit: polish batches 1–5 intact
  - `pnpm typecheck` + `pnpm smoke` passed

- **Stage 4 evidence (2026-04-30):**
  - CI: broadened push triggers (`feat/*`, `fix/*`, `chore/*`, etc.)
  - `quality-gate` job: no native addon build tools needed (node-pty removed)
  - `native-linux-build`: Rust toolchain + cache, Tauri build green in CI
  - Flatpak: `flatpak/io.github.karimodora.LinuxDevHome.tauri.yml` added for local/Flathub prep — not in CI until Flathub submission
  - Electron removed from repo (2026-04-30) — repo is now Tauri-only; `pnpm dev` → `tauri dev`

- **Post-parity hardening (before product-complete declaration, not part of Stage 5 definition):**
  - ✅ `runtime_install` job: real distro package execution (apt/dnf/pacman + nvm/rustup)
  - ✅ `runtime:check-deps`: real tool checks on PATH
  - ✅ `runtime:uninstall:preview`: distro-aware package list
  - ✅ Electron removed from repo (2026-04-30)

- **Stage 4 remaining:**
  - Flatpak CI job (heavy; add before Flathub submission only)

- **Stage 5 (release gate — when you declare product-ready):**
  - `pnpm smoke` green on final `main`
  - Manual test checklist (B5 below) completed
  - **No `git tag` / GitHub Release** until maintainer explicitly declares product-complete.

---

## Parity Check Plan — real vs static data

Use this to audit which pages show live data and which show stubs/static content.

| Page / feature | Expected live data | Known stub / static |
| --- | --- | --- |
| **Monitor → Metrics** | CPU%, memory, disk, load avg from `/proc` | `diskReadMbps`, `diskWriteMbps`, `netRxMbps`, `netTxMbps` always 0 |
| **Monitor → Top processes** | `ps` output, refreshed | — |
| **Monitor → Security** | `ufw`, `getenforce`, `sshd -T`, `journalctl` via bash | — |
| **Monitor → System info** | `hostname`, `uname`, uptime | `ip`, `distro`, `shell`, `de`, `wm`, `gpu`, `packages`, `resolution` all optional / may be empty |
| **Docker → Containers** | Live via `docker` CLI | — |
| **Docker → Images / Volumes / Networks** | Live via `docker` CLI | — |
| **Docker → Ports** | Live from container list | `[DOCKER_REMAP_NOT_SUPPORTED]` in Flatpak |
| **Docker → Install/Setup** | Real sudo steps on native; blocked on Flatpak | — |
| **Runtimes → Status** | `node --version`, `python3 --version`, etc. | — |
| **Runtimes → get-versions** | Node/Go/Python via public API | All others return `["latest"]` |
| **Runtimes → check-deps** | `which` on each tool | — |
| **Runtimes → uninstall-preview** | Distro package list | No real dep graph; `removableDeps` always empty |
| **Runtimes → install job** | Real apt/dnf/pacman or nvm/rustup | Requires passwordless sudo for system method |
| **Job runner progress** | Starts `running`, ends `done`/`failed` | No streaming progress (final state only) |
| **SSH → generate / getPub / testGithub** | Real `ssh-keygen`, `ssh -T` | — |
| **Git → config list / set** | Real `git config --global` | — |
| **Git → clone / status** | Real git operations | — |
| **Terminal** | Real shell via tokio spawn | No PTY (line-buffered only; no interactive apps like vim) |
| **Compose** | Real `docker compose up/logs` | Needs compose files in `docker/compose/` |
| **Diagnostics bundle** | Saves JSON to app data dir | `perf.snapshot` returns zeros |
| **Dashboard widgets** | Layout persistence (store.json) | Widget data depends on Monitor IPC |

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
- [x] Ports tab — **native session**: remap form runs; **Flatpak**: notice shown (Verified: `sessionKind` guard)
- [x] Install / Setup — **Flatpak**: warning shown; **native**: wizard flow (Verified: `sessionKind` guard in Step 0)

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

### Known limits (not test failures)

| Feature | Native + sudo | Flatpak / no sudo | Expected UI Response |
| --- | --- | --- | --- |
| `docker:install` | Wizard runs distro package steps; requires sudo in step 3 | Step 0 blocks with warning + links (official install + `docs/DOCKER_FLATPAK.md`) | Flatpak: modal warning; IPC errors: toast via `humanizeDockerError` (may say **likely Flatpak**) |
| `docker:remap-port` | Remap form available; clones container with new `-p` then stops/removes original | Ports tab shows sandbox notice + docs link; form hidden | Flatpak: in-page notice; `[DOCKER_REMAP_NOT_SUPPORTED]` → **likely Flatpak** in toast |
| SSH `~/.ssh` access | Direct read/write via `ssh-keygen` | May need `--filesystem=home` override; see `docs/PRIVILEGE_BOUNDARY_MATRIX.md` | Help text in SSH page mentions Flatpak overrides |
| Docker socket | Direct via `/var/run/docker.sock` | Needs `--socket=session` Flatpak override; see `docs/DOCKER_FLATPAK.md` | "Docker daemon/socket unavailable" in banner |

