# LuminaDev — Product Phases Plan

> Living document. Route truth table: [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md) | Release gate: [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md)

---

## 🎯 Immediate Sprint (from `thoghts.md`) — DO THIS NOW

**Critical paths only: Flatpak → Tests → Audit → Cross-distro → Release.**
Cosmetic work (theming, drag-drop polish) is blocked until after Day 10.

### Days 1–2 — Flatpak Setup + Build

- [x] `flatpak install flathub org.gnome.Platform//49 org.gnome.Sdk//49`
- [x] `flatpak install flathub org.freedesktop.Sdk.Extension.rust-stable` (pinned in CI as `//25.08`)
- [x] Manifest exists: `flatpak/io.github.karimodora.LinuxDevHome.tauri.yml` (GNOME Platform runtime + cargo module)
- [x] Local build: `flatpak-builder --user --install --force-clean flatpak-build-tauri flatpak/io.github.karimodora.LinuxDevHome.tauri.yml --install-deps-from=flathub`
- [x] Local run: `flatpak run io.github.karimodora.LinuxDevHome`
- [x] Record all errors: permissions, missing deps, cargo offline issues
- [x] Fix common issues:
  - Docker socket → `--socket=session-bus` + `docker.sock` custom permission
  - Host commands → `flatpak-spawn --host` in Rust (auto-wrapped host commands from Flatpak sessions)
  - Rust deps → run `flatpak-cargo-generator` → `generated-sources.json` (`flatpak/generated-sources.json` tracked + generator script committed)

Progress notes (2026-05-01):
- `corepack enable` failed in Flatpak build (`EROFS`); fixed by switching manifest build commands to `npx pnpm@9.14.2 ...`.
- `npx` fetch for `pnpm` initially failed with `EAI_AGAIN registry.npmjs.org`; fixed by adding module `build-args: --share=network` in `flatpak/io.github.karimodora.LinuxDevHome.tauri.yml`.
- Build now passes end-to-end; app installs as `io.github.karimodora.LinuxDevHome` and basic runtime sanity check passes.
- CI/runtime errors captured and addressed across sprint: `EROFS` (corepack write), `EAI_AGAIN` (network in Flatpak build), Flatpak system/user remote mismatch, extension ref ambiguity, Docker CLI/daemon availability in CI smoke tests, lint scope regressions, and GLib/pkg-config dependency gaps.

### Days 3–4 — Smoke Tests + Docker Integration Tests

- [x] Add Rust smoke tests in `src-tauri/tests/`:
  - [x] `docker info`, `docker ps --all`, `docker version`
  - [x] Prune dry-run (images, volumes, build cache)
  - [x] Error case: Docker daemon not running
- [ ] Integration tests:
  - [x] Job Runner with a long task (Rust-side command loop simulation)
  - [x] Streaming logs
  - [x] Cancellation
- [ ] Add CI workflows (only if better than existing CIs):
  - [x] `ci.yml` — now runs Rust smoke tests (`docker_smoke`) + Job Runner tests before frontend/Tauri build on every PR/push
  - [x] `smoke-tests.yml` — Rust tests + Docker smoke + job runner
  - [x] `flatpak.yml` — Flatpak build + bundle + basic run test

Progress notes (2026-05-01):
- Added `apps/desktop/src-tauri/tests/docker_smoke.rs` with 5 tests covering Docker version/info/ps, prune preview probes, and daemon-down error simulation.
- Test command: `cd apps/desktop/src-tauri && cargo test --test docker_smoke -- --nocapture` (passing locally).
- Added Job Runner tests in `apps/desktop/src-tauri/src/lib.rs` (`job_runner_*`): long task completion, streamed output capture, cancel transition on running jobs, and no-op cancel on non-running jobs.
- Test command: `cd apps/desktop/src-tauri && cargo test job_runner -- --nocapture` (passing locally).
- Updated `.github/workflows/ci.yml` `native-linux-build` job to execute:
  - `cargo test --test docker_smoke -- --nocapture`
  - `cargo test job_runner -- --nocapture`
- Expanded Rust unit coverage in `apps/desktop/src-tauri/src/lib.rs` for critical helpers:
  - size/disk parsers, Docker name sanitization, Docker install step shaping
  - distro package-manager mapping, Java package resolution
  - version/probe matching utilities and shell-noise filtering
  - package command builders, output truncation, repository-root discovery
- Full Rust test suite now passes locally: `cd apps/desktop/src-tauri && cargo test -- --nocapture`.
- Added a second dedicated test module file: `apps/desktop/src-tauri/src/runtime_prune_contract_tests.rs`
  - runtime version token edge-cases (`lumina_*` helpers)
  - Docker prune preview response contract shape/types via `docker_prune_preview_payload(...)`
- Added `.github/workflows/smoke-tests.yml` for dedicated Rust smoke/job-runner coverage.
- Added `.github/workflows/flatpak.yml` for GNOME 49 Flatpak build + install + non-GUI runtime smoke.

### Day 5 — Deep Audit: Critical Paths

Manually review:
- [x] All `tauri::command` handlers that use `shell::Command` or exec
- [x] Timeouts and error handling in Job Runner
- [x] Capabilities in `tauri.conf.json` (every command explicitly allowed)
- [x] Docker integration in Rust (socket connection + error messages)
- [x] Maintenance Guardian logic (health scoring, aggregate metrics)

Progress notes (2026-05-01):
- Audited host command execution paths (`exec_output_limit`, `exec_result_limit`, Docker/SSH/curl command entry points) and timeout bounds (`CMD_TIMEOUT_SHORT/DEFAULT/LONG/INSTALL_STEP`) in `apps/desktop/src-tauri/src/lib.rs`.
- Fixed Job Runner cancellation race: cancelled jobs could be overwritten to `completed` at finalization. Added cancellation-precedence final-state resolution (`effective_runtime_job_final_state`) and tests.
- Capability audit: command surface remains constrained to `ipc_invoke` + `ipc_send` handlers; capability file `apps/desktop/src-tauri/capabilities/default.json` grants `core:default`, `dialog:default`, `opener:default` only.
- Docker integration audit: reviewed all `dh:docker:*` channels in Rust dispatcher for prefixed error contracts (`[DOCKER_*]`) and timeout-bounded command execution.
- Maintenance Guardian audit/fix: clamped RAM/disk derived percentages to `0..100` in `evaluateGuardian(...)` and expanded tests for high-pressure + impossible-metric edge cases.

### Days 6–7 — Cross-Distro Testing + Bug Fixing

Test native + Flatpak on: **Ubuntu/Pop!OS**, **Fedora**, **Arch Linux** (VM if needed).

Focus areas:
- [x] Docker socket inside Flatpak (user-facing guidance hardened)
- [x] Runtime installation (especially Java on Fedora)
- [x] Monitor metrics (`/proc` access in Flatpak)
- [x] Terminal integration (fallback guidance hardened for Flatpak)

Bug fixes priority (see Known Bugs table below):
- [x] Bug #5 — `riskyOpenPorts?.length` crash → **FIXED**
- [x] Bug #7 — `uninstallPreview` fires on every mode toggle → **FIXED**
- [x] Bug #2 — `installedFeatures` refreshed post-install (Docker wizard)
- [x] Bug #4 — Docker Hub official-image links normalized (`library/*` + bare names)

Progress notes (2026-05-01, follow-up):
- Hardened Flatpak Docker-socket guidance in renderer error contracts: `[DOCKER_UNAVAILABLE]` and `[DOCKER_PERMISSION_DENIED]` now append explicit `flatpak override` instructions for `/var/run/docker.sock` + `session-bus`.
- Updated `EnvironmentBanner` Docker/Flatpak docs link to the current LuminaDev repository path.
- Hardened terminal failure fallback copy to include Flatpak PTY focus guidance alongside external terminal fallback.
- Runtime install validation hardened for Fedora Java: expanded tests for DNF major-version package selection (`8/11/17/latest`) and existing install-path checks.
- Monitor metrics hardened for Flatpak sessions: `/proc` reads now fallback to host-side reads through wrapped host execution when sandbox reads are unavailable.

### Days 8–9 — Polish + Documentation

- [x] Fix UI bugs found during cross-distro testing
- [x] Update `README.md`: "Current Status" + "Known Limitations" sections
- [x] Write basic `CONTRIBUTING.md`
- [x] Update this file to reflect reality

Progress notes (2026-05-01, docs pass):
- README now uses explicit `Current Status` and `Known Limitations` headings and documents the `lib.rs` monolith as a maintenance follow-up.
- Added root `CONTRIBUTING.md` with setup, quality-gate commands, commit/PR rules, and Flatpak boundary references.
- Cross-distro/UI bug loop includes fixed Docker wizard refresh, Docker Hub official-link normalization, and Flatpak-specific fallback guidance hardening.

### Day 10 — Internal Release

- [ ] Tag: `v0.2.0-alpha`
- [ ] GitHub Release (draft): AppImage if easy, Flatpak bundle if successful
- [ ] Clear install instructions + Known Issues list in release notes

---

## What is NOT Alpha scope (explicitly deprioritized)

- ❌ Drag-and-drop polish (basic HTML5 reorder already works — good enough)
- ❌ Theme surface rollout across all routes (Maintenance theme is pilot; others wait)
- ❌ Phase 8 Settings, Phase 10 Extensions, Phase 12 Cloud Git
- ❌ Profiles `setActive` / on-login actions
- ❌ Git Doctor, Policy Lock, Visual Change Preview

---

## Status Legend

| Badge | Meaning |
|-------|---------|
| ✅ | Implemented, IPC live, code verified |
| 🔄 | Core works; specific gaps listed |
| 🗂 | Scaffolded / placeholder; no real backend |
| 📋 | Not started |

---

## Quality Gate ✅ PASSED

All five stabilization checklist items `done`. `pnpm smoke` green. See [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md).

---

## Phase 0 — Foundations ✅ SHIPPED

- [x] Widget registry + `dashboard-layout.json` persisted in app data dir
- [x] Responsive dashboard grid + "Add widget" + "Custom profile" entry points
- [x] Job runner (`jobStart` / `jobsList` / `jobCancel`) with footer progress strip
- [x] Session banner: Flatpak vs native + link to `docs/DOCKER_FLATPAK.md`
- [x] Full Tauri migration (Stages 0–4): all IPC native Rust, Electron removed, CI green

---

## Phase 1 — Dashboard: Profiles + Custom Layout 🔄 PARTIAL

### Verified shipped
- [x] 9 preset profile cards on grid: Web Dev, Mobile, Game Dev, Infra/K8s, + 5 more (PROFILE_01–09)
- [x] `CustomProfileWizardModal` — name → template → stacks → widgets → save to `custom_profiles` store
- [x] Widget drag-and-drop reorder (HTML5, wired end-to-end in `DashboardWidgetDeck` + `DashboardWidgetsPage`)
- [x] Widget layout load/save via `layoutGet` / `layoutSet` IPC
- [x] `DashboardWidgetsPage`, `DashboardKernelsPage`, `DashboardLogsPage` present and routed

### Verified missing (not Alpha scope)
- [ ] Preset cards not linked to profile store — two sources of truth
- [ ] Alpine `sleep infinity` compose stubs per preset
- [ ] No `setActive` / on-login actions

---

## Phase 2 — Docker ✅ SHIPPED (`/docker` → `live`)

- [x] Container list / start / stop / restart / remove / logs modal
- [x] Images: list / pull with tag picker / remove / prune
- [x] Volumes: list / create / remove (with "in use by" guard)
- [x] Networks: list / create / remove
- [x] Cleanup: prune preview + selective run
- [x] Port remap: clone container with new `-p`, stop/remove original
- [x] Install wizard: native (distro steps with sudo) / Flatpak (warning + links)
- [x] Docker Hub search + tag picker
- [x] In-container terminal (`dockerTerminal` IPC)

Known issue addressed: install wizard now refreshes `installedFeatures` on open and after successful install, so mid-session installs are reflected without reload.

---

## Phase 3 — SSH ✅ SHIPPED (`/ssh` → `partial`)

- [x] Key generation (ed25519), passphrase optional
- [x] Public key display + copy + fingerprint
- [x] GitHub SSH test with output
- [x] Remote key setup (`sshSetupRemoteKey`, password in component state only)
- [x] `sshListDir` for remote directory browsing
- [x] `sshEnableLocal` for local SSH daemon
- [x] SSH bookmarks save/load from store
- [x] Flatpak note in UI (`~/.ssh` needs `--filesystem=home`)

---

## Phase 4 — Git Environment Manager ✅ SHIPPED (`/git-config` → `live`)

- [x] Overview: 4 health score cards + total score + smart suggestions with one-click fix
- [x] Identity Center: name, email, branch quick-picks, editor quick-picks, profile label
- [x] Security Center: SECURE/ATTENTION/RISK rows with inline action buttons
- [x] Behavior Settings: toggle switches for 7 git behaviors + 3-way line ending
- [x] Preset Templates: 5 curated presets applied in one click
- [x] Config Inspector: search + category filter + sort + risk indicators + sensitive masking
- [x] Backend `dh:git:config:set-key` with 20-key allowlist
- [x] Toast notifications

---

## Phase 5 — Monitor 🔄 PARTIAL (`/system` → `partial`)

- [x] CPU %, memory, swap, disk, load avg (2s refresh)
- [x] Real net/disk Mbps via two-pass `/proc` delta
- [x] Top N processes, listening ports, security snapshot + drilldown
- [x] System info: 14 fields
- [x] GitHub commits feed widget

Missing: per-container stats stream, LAN discovery (intentional).

---

## Phase 6 — Runtimes 🔄 PARTIAL (`/runtimes` → `partial`)

17 runtimes: Node, Python, Go, Rust, Java, Bun, Zig, Dart, Flutter, Julia, PHP, Ruby, Lua, .NET, C/C++, Octave, SBCL

- [x] Local + system install methods per runtime
- [x] Real streaming progress (BufReader live)
- [x] `check-deps`, `uninstall-preview`, `remove-version`
- [x] `allVersions` detection for all runtimes
- [x] Python filters EOL, PHP uses system packages

Missing: real dep graph (`removableDeps` always empty), Ruby slow on Fedora.

---

## Phase 7 — Maintenance 🔄 PARTIAL (`/maintenance` → `partial`)

- [x] `maintenanceGuardian.ts` — 5 layers (Compute/Memory/Disk/Fleet/Security)
- [x] `evaluateGuardian()` shared with `GuardianSummaryWidget` (dashboard parity)
- [x] Health overview + layer tiles + active jobs footer
- [x] Diagnostics bundle export
- [x] Docker cleanup + compose health
- [x] Integrity: in-app host probes via whitelisted `hostExec`

Missing: user-defined task checklist, git config backup/restore.

---

## Phase 8 — Settings 📋 PLANNED (post-Alpha)

SSH bookmarks, `/etc/hosts` editor, env var manager, theme/accent picker.

---

## Phase 9 — Profiles 🗂 STUB (`/profiles` → `stub`)

- [x] CRUD: add / delete / duplicate / export / import
- [ ] `setActive`, on-login actions, store unification with dashboard presets (post-Alpha)

---

## Phase 10 — Extensions 📋 PLANNED (post-Alpha)

---

## Phase 11 — First-run Wizard 🔄 PARTIAL

- [x] 6 steps: Welcome → Environment → Docker check → Git setup → SSH keygen → Finish
- [x] Auto-shows on first launch, skip on each step, "show again" checkbox
- [ ] Missing: profile-pick step, Help menu re-entry point

---

## Phase 12 — Cloud Git (GitHub / GitLab) 📋 PLANNED (post-Alpha)

---

## Phase 13 — Theme Surface Rollout 📋 PLANNED (post-Alpha)

Priority when reached: Monitor → Docker → Git → Runtimes → Dashboard → AppShell. One route per PR.

---

## Phase 14 — Flatpak & Release Gate 📋 PLANNED

See Days 1–2 and Day 10 in sprint above. Full checklist in [`docs/FLATHUB_CHECKLIST.md`](docs/FLATHUB_CHECKLIST.md).

---

## Known Bugs

| # | Page | Bug | Status |
|---|------|-----|--------|
| 1 | GitConfigPage | Mask toggle inverted | ✅ FIXED |
| 2 | DockerPage | `installedFeatures` not refreshed post-install | ✅ FIXED |
| 3 | RegistryPage | `octocat/Hello-World` placeholder | ✅ FIXED |
| 4 | RegistryPage | Docker Hub link broken for official images | ✅ FIXED |
| 5 | MonitorPage | `riskyOpenPorts?.length` crash | ✅ FIXED |
| 6 | MaintenancePage | `memPct`/`diskPct` from null `m` | ✅ FIXED |
| 7 | RuntimesPage | `uninstallPreview` fires on every mode toggle | ✅ FIXED |
| 8 | SystemPage | `setInterval` cleanup leak | ✅ FIXED |
| 9 | DashboardKernelsPage | `colorFor()` uses `==` not `===` | ✅ FIXED |

---

## Execution Order

```
✅  Phase 0  — Foundations
✅  Phase 2  — Docker
✅  Phase 3  — SSH
✅  Phase 4  — Git Environment Manager
✅  Phase 5  — Monitor
✅  Phase 6  — Runtimes (17 languages)
✅  Phase 7  — Maintenance / Guardian
🎯  SPRINT   — Flatpak + Tests + Audit + Cross-distro + v0.2.0-alpha (NOW)
🔄  Phase 11 — Wizard (missing: profile-pick step + Help entry)
🔄  Phase 1  — Dashboard (missing: store link + compose stubs)
🔄  Phase 9  — Profiles (missing: setActive, on-login, store unification)
📋  Phase 8  — Settings
📋  Phase 12 — Cloud Git
📋  Phase 13 — Theme rollout
📋  Phase 10 — Extensions
📋  Phase 14 — Flatpak full release gate
```
