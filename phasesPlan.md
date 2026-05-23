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
- [x] Integration tests:
  - [x] Job Runner with a long task (Rust-side command loop simulation)
  - [x] Streaming logs
  - [x] Cancellation
- [x] Add CI workflows (only if better than existing CIs):
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

- [x] Tag: `v0.2.0-alpha`
- [x] GitHub Release (draft): AppImage if easy, Flatpak bundle if successful
- [x] Clear install instructions + Known Issues list in release notes (draft: `docs/RELEASE_NOTES_v0.2.0-alpha.md`)

---

## 🛡️ Phase 13 — Advanced CI & Environment Hardening ✅ DONE

**Goal: Stop discovering environment bugs manually on Arch/Fedora/Ubuntu.**

- [x] **Multi-distro Smoke CI:**

  - [x] Added GitLab CI jobs for Arch Linux and Fedora containers.
  - [x] Integrated `xvfb-run` for headless UI testing.

- [x] **Sandbox Permission Probes:**

  - [x] Automated tests for Docker socket, PTY allocation, and FS access in `sandbox_permission_probes.rs`.

- [x] **Headless E2E (Packaging):**

  - [x] Verified UI load and IPC parity in headless environments via `headlessE2e.test.ts`.

- [x] **Static Analysis Quality Gate:**

  - [x] Enforced `clippy -D warnings` and `cargo-audit` in the `smoke` script.

---

## What is NOT Alpha scope (explicitly deprioritized)

- ❌ Drag-and-drop polish (basic HTML5 reorder already works — good enough)
- ❌ Theme surface rollout across all routes (Maintenance theme is pilot; others wait)
- ❌ Full-scope **Phase 10 Extensions** and **Phase 12 Cloud Git** (as originally scoped)
- Phase **8 Settings**: first **hub** shipped on `/settings` (accent, SSH overview, read-only hosts/env); **hosts editor** and **profile env files** remain future work
- ❌ Git Doctor, Policy Lock, Visual Change Preview

_(Profiles **on-login** automation is **Phase 9** backlog, not “never do.”)_

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

## 🏗️ Rust Backend Architecture Standards

**CRITICAL:** `apps/desktop/src-tauri/src/lib.rs` must remain a **thin Tauri entry point only**. All domain logic lives in dedicated modules. Current monolith (200KB+, 10K+ lines) will be refactored into modular structure.

### Module Organization Rules

**lib.rs responsibilities (ONLY):**

- `#[tauri::command]` handler declarations (1 line each)
- `pub async fn ipc_invoke()` dispatcher (match on channel name)
- `pub async fn ipc_send()` dispatcher (fire-and-forget)
- AppState struct definition
- Module declarations (`mod utils; mod docker_ext; ...`)

**Create a new module when:**

- Logic > 200 lines → extract into module
- Domain has 5+ related functions → create domain module (e.g., `docker_ext.rs` for all Docker ops)
- Testability requires isolation → `#[cfg(test)] mod tests { ... }` in module
- Reusability across multiple handlers → goes in `utils.rs` or domain module

**Module structure pattern:**

```rust
// module.rs
pub async fn handler_name(payload: Value, state: &AppState) -> Result<Value> { ... }
fn helper_private() { ... }  // Private helpers

#[cfg(test)]
mod tests { ... }
```

**Dependency flow (one-way, no cycles):**

```
lib.rs (dispatcher)
  ↓
[domain modules: docker_ext, terminal_pty, ssh_ext, git_parser, runtime_installer]
  ↓
utils.rs (generic file/system/process helpers)
```

**Imports in modules:**

- ✅ `use crate::utils::*;` — reference utils only
- ✅ `use serde_json::*;` — external crates
- ✅ `use std::*;` — stdlib
- ❌ NO circular imports (`docker_ext` ↔ `terminal_pty` forbidden; move shared logic to `utils.rs`)

**lib.rs dispatcher pattern (strict):**

```rust
pub async fn ipc_invoke(channel: &str, payload: Value, state: AppState) -> Result<Value> {
  match channel {
    IPC::DOCKER_CONTAINERS => docker_ext::list_containers(payload, &state).await,
    IPC::SSH_GENERATE => ssh_ext::generate_key(payload, &state).await,
    _ => Err(format!("Unknown channel: {}", channel)),
  }
}
```

→ **One line per handler.** Handler logic lives in module, not here.

**Red flags (DON'T DO THIS):**

- ❌ Handler > 50 lines in lib.rs → extract to domain module
- ❌ Module A calls Module B calls Module A → move shared code to utils.rs
- ❌ Utility function at bottom of lib.rs → goes in utils.rs
- ❌ Duplicate similar logic in two handlers → factor into utils or domain helper

**Testing:**

- Unit tests: module `#[cfg(test)]` block; run `cargo test --lib <module_name>`
- Integration tests: `tests/` dir (IPC E2E)
- Never test lib.rs dispatcher directly; test module functions

**lib.rs Size Limits:**

- < 300 lines: OK for thin dispatcher + AppState
- 300–500 lines: Extract AppState helpers to `app_state.rs`
- ≥ 500 lines: Audit for missed module boundaries

### Proposed 6-Module Refactoring (Phase 16 follow-up)

Current monolith → Extract into:

- `utils.rs` — generic file/system/process utilities (no state)
- `docker_ext.rs` — Docker + Compose orchestration
- `terminal_pty.rs` — embedded terminal + PTY logic
- `ssh_ext.rs` — SSH helpers + key generation
- `git_parser.rs` — Git porcelain parsers (stateless)
- `runtime_installer.rs` — OS package manager + privilege escalation

**Refactoring order:** Extract in dependency order (utils → git_parser → docker_ext → terminal_pty → ssh_ext → runtime_installer). Per-step: `cargo check` + `cargo test --lib` + smoke-ci gate.

**Verification after refactor:**

- `cargo check` — compiles cleanly
- `cargo test --lib` — all tests pass
- `pnpm smoke` — full CI gate passes
- All IPC contracts unchanged (no Zod schema changes)

---

## Phase 0 — Foundations ✅ SHIPPED

- [x] Widget registry + `dashboard-layout.json` persisted in app data dir
- [x] Responsive dashboard grid + "Add widget" + "Custom profile" entry points
- [x] Job runner (`jobStart` / `jobsList` / `jobCancel`) with footer progress strip
- [x] Session banner: Flatpak vs native + link to `docs/DOCKER_FLATPAK.md`
- [x] Full Tauri migration (Stages 0–4): all IPC native Rust, Electron removed, CI green

---

## Phase 1 — Dashboard: Profiles + Custom Layout ✅ DONE

### Verified shipped

- [x] 9 preset profile cards on grid: Web Dev, Mobile, Game Dev, Infra/K8s, + 5 more (PROFILE_01–09)
- [x] `CustomProfileWizardModal` — name → template → stacks → widgets → save to `custom_profiles` store
- [x] Widget drag-and-drop reorder (HTML5, wired end-to-end in `DashboardWidgetDeck` + `DashboardWidgetsPage`)
- [x] Widget layout load/save via `layoutGet` / `layoutSet` IPC
- [x] `DashboardWidgetsPage`, `DashboardKernelsPage`, `DashboardLogsPage` present and routed

### Verified missing (not Alpha scope)

- [x] **Minimal compose stub per preset** — each `docker/compose/<profile>/docker-compose.yml` is a small Alpine `sleep infinity` service with a unique Compose `name:`; `dh:compose:up` resolves checkout, `LUMINA_DEV_COMPOSE_ROOT`, or bundled `docker/compose` (see `compose_profiles.rs` + `tauri.conf.json` `bundle.resources`).
- [x] **Full stack definitions** — all 9 presets have `docker-compose.full.yml`: web-dev (nginx), infra (Traefik+Portainer+Prometheus), ai-ml (Jupyter+Ollama), data-science (Jupyter+Postgres), mobile (Appium+json-server), game-dev (Redis+game-server), docs (MkDocs), desktop-gui (Xpra), empty (Alpine workspace).
- [x] Preset ↔ store: `active_profile` is a `ComposeProfile` id; dashboard + wizard + Profiles **Set Active** stay aligned

_On-login automation lives under **Phase 9** (not Phase 1)._

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

## Phase 7 — Maintenance 🔄 ✅ DONE

**Goal:** Process actual, real-time data for the entire program (no mocks).

- [x] **Backend Probes:** Real-time `/proc` queries: CPU %, memory, swap, disk, I/O, network, load, uptime. No hardcoded values.
- [x] **Fleet Scanning:** Docker daemon (containers + systemd) + process list via `ps`. Real container/process health.
- [x] **Diagnostics Bundle:** Exports real logs and system metrics to JSON.
- [x] **Data Authenticity:** Complete removal of mock data. Guardian evaluates:
  - Host compute (CPU usage)
  - Memory pressure (RAM %)
  - Storage pressure (disk %)
  - Container fleet (running/total)
  - **Process health** (runaway CPU/memory detection)
  - Host security (firewall + SSH config)

---

## Phase 8 — Settings 📋 PLANNED

**Goal:** Must implement a fully functional settings architecture with the exact specified tabs. All settings must persist correctly to the file system and immediately affect the app state.

- [ ] **General:** UI for default startup behavior, window sizes, and telemetry toggles bound to a `settings.json` config store.
- [ ] **Resources:** Sliders and inputs for defining strict CPU limits and RAM allocations that the engine respects during job execution.
- [ ] **App Engine:** Advanced settings for configuring IPC timeouts, thread pool sizes, and daemon behaviors.
- [ ] **Builder:** Paths to local toolchains (Cargo, Node, Python) and default registry mirrors.
- [ ] **Extension:** A grid UI to enable/disable extensions, with real-time plugin loading/unloading capabilities.
- [ ] **Update:** Toggles for checking for updates on startup, switching release channels (Stable/Alpha).
- [ ] **Beta Features:** A dedicated panel for toggling experimental flags stored in `beta_features_state`.
- [ ] **Notification:** Global muting, severity filters, and OS-native notification toggles.
- [ ] **Shortcuts:** A full keybinding interceptor UI allowing custom shortcut mapping for all major app actions.
- [ ] **Help & About:** Real dynamic version injection from `package.json`/Tauri config.
- [ ] **Date and Time:** Dropdowns for 12h/24h formats and timezone overrides affecting all logs.
- [ ] **Languages:** Real i18n integration supporting real-time language switching.

---

## Phase 9 — Profiles 📋 PLANNED

**Goal:** Implement a real profile management page with real accounts and the ability to seamlessly switch between profiles. Complete removal of static placeholder profiles.

- [ ] **Data Structure:** Move away from static frontend templates. Profiles must be defined as robust JSON structures containing user credentials, SSH keys, active Compose configurations, and customized environment variables.
- [ ] **Authentication:** Implementation of local user accounts with secure credential storage.
- [ ] **Switching Engine:** A context-switching engine that can safely tear down one profile's state (containers, env vars) and spin up another's instantly from the UI.

---

## Phase 10 — Extensions 📋 PLANNED (post-Alpha)

- **Extension model v0**: “plugins” = **extra widgets + optional IPC namespaces** loaded from a **signed/allowlisted** folder; no arbitrary binary download at first.
- **Developer API**: versioned API and lifecycle hooks for third-party widget development.
- **Marketplace**: browsable directory for community-contributed extensions (post-v0 stability).

---

## Phase 11 — First-run Wizard 📋 PLANNED

**Goal:** Must execute strictly after Phase 16 (System Readiness/Installer) is 100% satisfied. Must be fully functional and avoid any duplicated setup steps.

- [ ] **Flow Control:** Logic to check if Readiness is complete. If yes, proceed to First-run Wizard. 
- [ ] **Content Scope:** Strictly limited to application-specific onboarding (choosing an initial theme, setting up a Git identity).
- [ ] **Zero Duplication:** Must not ask for or duplicate any setup steps already handled by the Readiness installer.

---

## Phase 12 — Cloud Git (GitHub / GitLab) ✅ DONE

This phase turns the app into a true daily driver for software engineers managing repositories and cloud source control platforms.

- **Authentication** ✅: Encrypted store for tokens; device flow + PAT; optional OAuth client IDs via **Cloud Git → Advanced** / env / compile-time; dashboard **Cloud Git** link widget (`link.cloud-git`). Device-flow failure now maps to `[CLOUD_AUTH_DEVICE_POLL_REJECTED]` with actionable guidance.
- **Interactive Version Control (Smart Workflow)** ✅:
    - **Smart Push/Sync**: Fetch-before-push; `behind > 0` blocks push with notice; protected-branch failures → `[GIT_VCS_PROTECTED_BRANCH]` + Cloud Git link; **Copy raw error** on panel.
    - **Branch rename after protected-branch push**: Suggests a new branch name, creates + pushes it, then opens PR/MR wizard automatically.
    - **Integrate Bar**: Guided UI for Merge, Rebase, and Stash (fast-forward defaults).
    - **Conflict Resolution Studio**: 3-way merge view (Local / Incoming / Result) with Accept Current, Accept Incoming, Accept Both. No manual text editing required.
    - **State Management**: Automatic handling of `MERGING` / `REBASING` states with Continue or Abort actions.
- **Cloud Dashboards (API Integration)** ✅:
  - **PR/MR Wizard**: Create PRs/MRs directly from the app. Auto-fills title from branch name, visual branch picker, opens after protected-branch bypass flow. GitLab merge button removed from CI panel (policy always blocks it); "View on GitLab" link used instead.
  - **CI/CD Pipelines**: `GitVcsCiChecks` + `gitVcsRepoPipelines` — real-time status (GitHub Actions + GitLab CI) with 30s polling. GitHub-only server-side merge button.
  - **Issues Tracking**: Open issues across repos via `CloudGitActivityPanel`.
  - **Releases & Tags**: Latest releases per provider via `CloudGitActivityPanel`.
- **Dashboard Widgets** ✅:
  - `live.git-recents`: Recent local repos — branch, dirty files, ahead/behind counts.
  - `live.cloud-notifications` *(new)*: Failed pipelines + open issues from all connected GitHub/GitLab accounts. Registered in widget registry + `DashboardWidgetDeck`.

---

## Phase 15 — Theme Surface Rollout ✅ DONE

**Goal:** Convert all pages to elevated product aesthetic (ambient gradients, elevated cards, hero sections).

- [x] **Elevated Theme Utilities:** `theme-elevated.css` with reusable classes (hero, card, tabs, tiles, grids, etc.)
- [x] **Full Page Coverage:** All 11 pages + 1 modal converted to use elevated theme system (DockerPage, GitConfigPage, SettingsPage, RuntimesPage, DashboardWidgetsPage, TerminalPage, RegistryPage, ProfilesPage, DashboardKernelsPage, DashboardLogsPage, GitVcsDirtyCheckoutModal)
- [x] **CSS Architecture:** Per-page CSS files importing shared theme, no inline styles for layout/theming

**Future Enhancement (Post-Phase 15):**

- Theme Picker UI in settings for light/dark/high-contrast switching
- Dynamic theme token swapping without reload
- Extended token system for semantic colors

---

## Phase 14 — Flatpak Release Gate 🔄 IN PROGRESS

Flatpak runs with **full host permissions** — no sandbox isolation. Docker socket, SSH, PTY, and `/proc` all work without any `flatpak override` workarounds.

- **Checklist**:
  - [x] **Full host permissions**: `--filesystem=host`, `--device=all`, `--socket=session-bus`, `--socket=system-bus`, `--talk-name=org.freedesktop.Flatpak` in all three manifests.
  - [ ] **AppStream Metadata**: `metainfo.xml` with license, summary, and screenshots.
  - [ ] **Desktop Entry**: original icon assets and trademark-clean metadata.
  - [ ] **Reproducible Build**: manifest builds successfully with `flatpak-builder` offline.
  - [ ] **Cross-Distro Smoke**: verified on Fedora Silverblue and traditional distros.
- **Maintenance**: regenerate Node sources after lockfile changes using `./flatpak/generate-node-sources.sh`.

---

## 🏗️ Phase 16 — System Readiness & Pre-Requisites Wizard (Installer) 📋 PLANNED

**Goal:** Implement strict blocking "WinBoat" setup wizard philosophy. First window user sees on app launch. Main app shell **does not load** until all critical requirements pass.

### Pre-flight Flow (The "Installer" Window)

- [ ] **First-Run Detection:** On app launch, check `readiness_wizard_complete` in store. If missing/false, show full-screen blocker before AppShell loads.
- [ ] **Modal/Window:** Dedicated installer window (like Windows Boot Camp setup). Cannot be skipped or closed (X button disabled).
- [ ] **Modern UI:** Premium, centered layout with hero header, requirement cards with status indicators, action buttons, and disabled "Next" button until all critical ✓.

### Comprehensive Probe Matrix

Probe for **everything** required to run app. No shortcuts.

**Hardware/System:**
- [ ] RAM ≥ 4GB (warn if <4GB)
- [ ] CPU Cores ≥ 2 (warn if <2)
- [ ] Virtualization (KVM/VT-x/AMD-V enabled — critical for containers)
- [ ] Architecture: x86_64 required

**Core Tools (Critical):**
- [ ] Docker installed + version ≥ 20.10
- [ ] Docker Compose v2 (via `docker compose` command, not `docker-compose`)
- [ ] Git installed
- [ ] SSH available (local daemon running or `ssh` command available)
- [ ] Curl, Tar, Unzip in PATH

**System State:**
- [ ] Docker daemon running (not just installed)
- [ ] User in `docker` group (can run `docker ps` without sudo)
- [ ] `/var/run/docker.sock` readable
- [ ] Flatpak sandbox overrides (if running in Flatpak): `/var/run/docker.sock` accessible, session-bus available

### Active "Fix It" Buttons (Not Just "How?")

**Philosophy:** Direct action, not documentation.

- [ ] **One-Click Install:** Each missing dependency has an "Install" button (not "How?").
- [ ] **Command Execution:** Button triggers native OS package manager (apt, dnf, pacman, etc.) detection.
- [ ] **Privilege Escalation:** Uses `pkexec` (Polkit) to prompt for password securely. No forced terminal or manual CLI.
- [ ] **Special Cases:**
  - Docker group: `usermod -aG docker $USER` + advise user to log out/in or `newgrp docker`.
  - Docker daemon: `systemctl start docker` (user-privileged).
  - SSH daemon: `systemctl start ssh` or `systemctl start sshd` (distro-dependent).

### Premium "Installation in Progress" UI

When user clicks "Install" / "Fix":

- [ ] **Progress Screen:** Transition to modern progress modal (not terminal output).
- [ ] **Live Status:** Clear text: "Installing Docker..." → "Adding user to docker group..." → "Starting Docker daemon...".
- [ ] **Smooth Progress Bar:** Animated bar for each step (or spinner if no ETA).
- [ ] **Non-Blocking Output:** Show brief, human-readable logs (not raw terminal noise).
- [ ] **Auto-Recheck:** After install completes, re-probe that dependency. Update status card in real-time (✓ or ✘).

### Strict Blocking: Disabled "Next" Button

- [ ] **"Next" Button Logic:** Disabled (grayed out, no hover, `cursor: not-allowed`) if ANY critical requirement shows red ✘.
- [ ] **No Bypass:** User cannot:
  - Skip the screen.
  - Close the window (X disabled).
  - Proceed without all critical ✓.
- [ ] **Visual Feedback:** Disabled state obvious. Hover shows tooltip: "Install missing requirements to continue."

### Success Criteria

- [x] All critical probes show ✓ (green checkmarks).
- [x] "Next" button enabled + clickable.
- [x] User clicks "Next" → `readiness_wizard_complete = true` saved to store.
- [x] Main app shell (AppShell + Dashboard) loads.
- [x] Subsequent app launches skip readiness screen (go straight to dashboard or Wizard).

### Recovery & Re-Entry

- [ ] **Reset Option:** Settings → "Run Setup Wizard Again" button clears `readiness_wizard_complete`, forces re-entry on next launch.
- [ ] **Manual Probe:** If user manually fixes deps (e.g., `sudo apt install docker.io`), "Recheck" button in UI re-runs probes without restart.

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

## 🚨 UI/UX & Performance Debt 📋 PLANNED

- [ ] **Runtimes Page Optimization:** Profile the Tauri invoke calls causing the >1 minute load time. Implement lazy loading, caching of local package lists, or asynchronous background fetching.
- [ ] **Dashboard - Main:** Wire up dynamic widget injection based on the user's active Profile layout configuration so it actually makes sense.
- [ ] **Dashboard - Widgets:** Remove all mocked JSON files. Tie widgets directly to live system event emitters.
- [ ] **Dashboard - Kernels:** Build a configuration grid that allows starting, stopping, and linking local development kernels (e.g., Jupyter, PHP-FPM).
- [ ] **Dashboard - Logs:** Implement a unified log viewer using `xterm.js` that multiplexes stdout/stderr streams from all active background jobs and containers into a single searchable buffer.
- [ ] **Global Navigation (Chrome) Fixes:** Define the specific Tauri commands (e.g., `open_terminal`, `show_notifications_panel`) that must be bound to the Top Bar buttons (Search, Notification, Terminal, Settings) and Left Sidebar buttons (Docs, Setup Wizard, Local User).
- [ ] **Bottom Bar:** Completely rip out the "Phase 0 task runner" and replace it with a clean, minimized status bar or remove it entirely if a replacement is unnecessary.

---

---

## 📋 Future Phases — Scope & Dependencies

Based on current app state (Phase 16 + Phase 7 complete), here's what remaining phases need:

### Phase 8 — Settings

**Depends on:** Phase 15 (theme system must be complete first)

**Scope:** Full settings persistence architecture with tabs:
- General: startup behavior, window size, telemetry
- Resources: CPU/RAM limits, job execution tuning
- App Engine: IPC timeouts, thread pools, daemon config
- Builder: toolchain paths (Cargo, Node, Python), registry mirrors
- Extension: enable/disable plugins, real-time loading
- Update: release channel (Stable/Alpha), check-on-startup
- Beta Features: experimental flags toggle
- Notification: global mute, severity filters, OS notifications
- Shortcuts: keybinding UI, custom action mapping
- Help & About: dynamic version from package.json
- Date/Time: 12h/24h, timezone
- Languages: i18n real-time switching

**Implementation:** New `/settings` page (or refactor existing), store in `settings.json`, IPC contract for `dh:settings:*` handlers.

### Phase 15 — Theme Rollout (Prerequisite for Phase 8)

**Current state:** Maintenance + MonitorPage have elevated theme; others inline-only.

**Scope:** Convert 11 remaining pages to elevated theme system:
- Create `theme-elevated.css` shared utilities
- Per-page CSS files with imports + class overrides
- Light/Dark/HighContrast token system
- Dynamic theme swapping without reload

**Pages to convert:** Docker, GitConfig, Settings, Runtimes, Dashboard, Terminal, Registry, Profiles, Kernels, Logs, Modals.

**Note:** Use new code-in-separate-files rule — no more monolithic refactoring.

### Phase 14 — Flatpak Release Gate

**Current state:** Full host permissions; local build works.

**Scope:**
- AppStream metadata (`metainfo.xml`): license, summary, screenshots
- Desktop entry: icon assets, trademark-clean metadata
- Reproducible build: manifest builds offline consistently
- Cross-distro smoke: verified on Fedora Silverblue + traditional distros

**Blocker:** Phase 15 (theme) should be done for polished release appearance.

### Phase 9 — Profiles

**Depends on:** Phase 8 (Settings must exist for profile env var storage)

**Scope:** Real profile management (currently static templates only).
- Data structure: robust JSON with creds, SSH keys, Compose config, env vars
- Authentication: local user accounts, secure credential storage
- Switching engine: tear-down + spin-up profile state atomically
- Per-profile environment variables + Docker/service isolation

**Note:** Profiles feed into Phase 16 installer (compose profile selection). Tight coupling.

### Phase 11 — First-run Wizard (Merged into Phase 16)

**Status:** ✅ Merged into 8-step unified installer (Phase 16). No separate implementation needed.

### Phase 10 — Extensions (Post-Alpha)

**Scope:** Plugin model v0 (signed/allowlisted widgets + optional IPC namespaces).
- Developer API: versioned, lifecycle hooks
- Marketplace: browsable community directory (post-v0)

**Dependency:** Stable Phase 0–7 + Phase 15 (theme must be locked) before plugin stability.

### UI/UX & Performance (Ongoing)

**Runtimes page:** >1 minute load time — profile Tauri invokes, implement lazy loading + caching.
**Dashboard widgets:** Remove mocked JSON, tie to live event emitters.
**Kernel management:** Config grid for start/stop/link local kernels.
**Log viewer:** xterm.js multiplexing stdout/stderr from jobs + containers.
**Navigation polish:** Wire `dh:terminal:openExternal`, notifications, search.

---

## Execution Order

```text
✅  Phase 0  — Foundations
✅  Phase 2  — Docker
✅  Phase 3  — SSH
✅  Phase 4  — Git Environment Manager
✅  Phase 5  — Monitor
✅  Phase 6  — Runtimes (17 languages)
✅  Phase 1  — Dashboard
✅  SPRINT   — Flatpak + Tests + Audit + Cross-distro + v0.2.0-alpha (shipped)
✅  Phase 13 — Advanced CI & Environment Hardening
✅  Phase 12 — Cloud Git
✅  Phase 7  — Maintenance / Guardian
✅  Phase 16 — System Readiness & Pre-Requisites Wizard (Installer)
✅  Phase 15 — Theme Rollout (Elevated aesthetic)
📋  Phase 8  — Settings
📋  Phase 9  — Profiles
📋  Phase 11 — First-run Wizard (Merged into Phase 16)
📋  UI/UX & Performance Debt
📋  Phase 10 — Extensions (Plugin model v0, Dev API)
🔄  Phase 14 — Flatpak Release Gate
```