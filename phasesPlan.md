> [!IMPORTANT]
> **Architectural Notice:** LuminaDev is a **Full Hosted** environment manager. It is explicitly **NOT isolated** and does not use strict sandboxing (like cgroups or Docker-based build isolation) by design.
>
> **Design & Quality Standard:** Every modification, feature implementation, and user dialog/interaction must align with the technical efficiency, visual elegance, and premium user experience of **Microsoft Dev Home**.
>
> **Target Audience & UX Philosophy:** LuminaDev is designed for both **absolute beginners** and **advanced/professional developers**. All interfaces, layout sequences, warning dialogs, and setup flows must cater to both: providing clear, automated, one-click solutions and helpful context for beginners, while offering deep configuration, logs, and raw control options for power users.

# LuminaDev — Product Phases Plan

> Living document. Route truth table: [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md) | Unified plan: [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) | Audit: [`docs/AUDIT.md`](docs/AUDIT.md) | Release gate: [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md)

---

## 🎯 Immediate Sprint (from `docs/SMART_FLOW_VCS.md`) — DO THIS NOW

**Critical paths only: Tests → Audit → Cross-distro → Release. Distribution is exclusively via GitHub Releases.**
Cosmetic work (theming, drag-drop polish) blocked until after Day 10

### Days 1–2 — Release Setup

Distribution: GitHub Releases only (AppImage). No package manager distribution in scope.

### Days 3–4 — Smoke Tests + Docker Integration Tests

- [x] Add Rust smoke tests in `src-tauri/tests/`:
  - [x] `docker info`, `docker ps --all`, `docker version`
  - [x] Prune dry-run (images, volumes, build cache)
  - [x] Error case: Docker daemon not running
- [x] Integration tests:
  - [x] Job Runner with long task (Rust-side command loop simulation)
  - [x] Streaming logs
  - [x] Cancellation
- [x] Add CI workflows (only if better than existing CIs):
  - [x] `ci.yml` — now runs Rust smoke tests (`docker_smoke`) + Job Runner tests before frontend/Tauri build on every PR/push
  - [x] `smoke-tests.yml` — Rust tests + Docker smoke + job runner

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
- Added second dedicated test module file: `apps/desktop/src-tauri/src/runtime_prune_contract_tests.rs`
  - runtime version token edge-cases (`lumina_*` helpers)
  - Docker prune preview response contract shape/types via `docker_prune_preview_payload(...)`
- Added `.github/workflows/smoke-tests.yml` for dedicated Rust smoke/job-runner coverage.

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

Test native on: **Ubuntu/Pop!OS**, **Fedora**, **Arch Linux** (VM if needed).

Focus areas:

- [x] Docker socket (user-facing guidance hardened)
- [x] Runtime installation (especially Java on Fedora)
- [x] Monitor metrics (`/proc` access)
- [x] Terminal integration (fallback guidance hardened)

Bug fixes priority (see Known Bugs table below):

- [x] Bug #5 — `riskyOpenPorts?.length` crash → **FIXED**
- [x] Bug #7 — `uninstallPreview` fires on every mode toggle → **FIXED**
- [x] Bug #2 — `installedFeatures` refreshed post-install (Docker wizard)
- [x] Bug #4 — Docker Hub official-image links normalized (`library/*` + bare names)
Progress notes (2026-05-01, follow-up):
- Hardened Docker-socket guidance in renderer error contracts: `[DOCKER_UNAVAILABLE]` and `[DOCKER_PERMISSION_DENIED]` now append explicit troubleshooting instructions.
- Updated `EnvironmentBanner` Docker docs link to current LuminaDev repository path.
- Hardened terminal failure fallback copy to include PTY focus guidance alongside external terminal fallback.
- Runtime install validation hardened for Fedora Java: expanded tests for DNF major-version package selection (`8/11/17/latest`) and existing install-path checks.
- Monitor metrics hardened: `/proc` reads now fallback to host-side reads through wrapped host execution when sandbox reads are unavailable.

### Days 8–9 — Polish + Documentation

- [x] Fix UI bugs found during cross-distro testing
- [x] Update `README.md`: "Current Status" + "Known Limitations" sections
- [x] Write basic `CONTRIBUTING.md`
- [x] Update this file to reflect reality

Progress notes (2026-05-01, docs pass):

- README now uses explicit `Current Status` and `Known Limitations` headings and documents `lib.rs` monolith as maintenance follow-up.
- Added root `CONTRIBUTING.md` with setup, quality-gate commands, commit/PR rules.
- Cross-distro/UI bug loop includes fixed Docker wizard refresh, Docker Hub official-link normalization, and fallback guidance hardening.

### Day 10 — Internal Release

- [x] Tag: `v0.2.0-alpha`
- [x] GitHub Release (draft): AppImage
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

  - [x] Enforced `clippy -D warnings` and `cargo-audit` in `smoke` script.

---

## What is NOT Alpha scope (explicitly deprioritized)

- ❌ Drag-and-drop polish (basic HTML5 reorder already works — good enough)
- ❌ Theme surface rollout across all routes (Maintenance theme is pilot; others wait)
- ❌ Full-scope **Phase 12 Cloud Git** (as originally scoped) — core shipped; legacy pro UI retired in Git Assistant sprint (G1); notification inbox still out
- Phase **8 Settings**: first **hub** shipped on `/settings`; **hosts editor** and **profile env files** remain future work
- ❌ **Extensions / plugin marketplace** — **removed from scope** (2026-05-29)
- ❌ **Dashboard widget catalog/deck** — **removed from scope** (2026-05-29)
- ❌ Policy Lock, Visual Change Preview
- ✅ **Git Doctor** — shipped: scan card in Git Config Overview + Diagnostics tab with health ring, severity-classified findings, and one-click fixes

_(Profiles **on-login** automation is **Phase 9** backlog, not "never do.")_

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

**CRITICAL:** `apps/desktop/src-tauri/src/lib.rs` must remain **thin Tauri entry point only**. All domain logic lives in dedicated modules. Current monolith (200KB+, 10K+ lines) refactored into modular structure.

### Module Organization Rules

**lib.rs responsibilities (ONLY):**

- `#[tauri::command]` handler declarations (1 line each)
- `pub async fn ipc_invoke()` dispatcher (match on channel name)
- `pub async fn ipc_send()` dispatcher (fire-and-forget)
- AppState struct definition
- Module declarations (`mod utils; mod docker_ext; ...`)

**Create new module when:**

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

### Modularization ✅ DONE (Phase 17)

6-module proposal superseded. Actual outcome: 30 top-level `.rs` files + `cloud_auth/` (7 sub-files) = 37 source files total. `lib.rs` is thin 678-line dispatcher with zero business logic inline. See Phase 17 results above.

---

## Phase 0 — Foundations ✅ SHIPPED

- [x] Widget registry + layout IPC — **removed 2026-05-29** (was Phase 0; infrastructure deleted)
- [x] Responsive dashboard grid + custom profile entry points (widget deck **removed** 2026-05-29)
- [x] Job runner (`jobStart` / `jobsList` / `jobCancel`) with footer progress strip
- [x] Session banner: native app banner + link to docs
- [x] Full Tauri migration (Stages 0–4): all IPC native Rust, Electron removed, CI green

---

## Phase 1 — Dashboard: Profiles + Custom Layout ✅ DONE

### Verified shipped

- [x] 9 preset profile cards on grid: Web Dev, Mobile, Game Dev, Infra/K8s, + 5 more (PROFILE_01–09)
- [x] `CustomProfileWizardModal` — name → template → stacks → save to `custom_profiles` store
- [x] Widget drag-and-drop reorder (HTML5, wired in dashboard — **widget deck removed 2026-05-29**)
- [x] Widget layout load/save via `layoutGet` / `layoutSet` IPC — **removed 2026-05-29** (channels, types, and store handlers deleted)
- [x] `DashboardKernelsPage`, `DashboardLogsPage` present and routed
- [x] ~~`DashboardWidgetsPage`~~ — **removed from scope** (2026-05-29); route deleted

### Verified missing (not Alpha scope)

- [x] **Minimal compose stub per preset** — each `docker/compose/<profile>/docker-compose.yml` is small Alpine `sleep infinity` service; project name set via `-p` CLI flag (no `name:` field in YAML); `dh:compose:up` resolves checkout, `LUMINA_DEV_COMPOSE_ROOT`, or bundled `docker/compose` (see `compose_profiles.rs` + `tauri.conf.json` `bundle.resources`).
- [x] **Full stack definitions** — all 9 presets have `docker-compose.full.yml`: web-dev (nginx), infra (Traefik+Portainer+Prometheus), ai-ml (Jupyter+Ollama), data-science (Jupyter+Postgres), mobile (Appium+json-server), game-dev (Redis+game-server), docs (MkDocs), desktop-gui (Xpra), empty (Alpine workspace).
- [x] Preset ↔ store: `active_profile` is `ComposeProfile` id; dashboard + wizard + Profiles **Set Active** stay aligned

_On-login automation lives under **Phase 9** (not Phase 1)._

---

## Phase 2 — Docker ✅ SHIPPED (`/docker` → `live`)

- [x] Container list / start / stop / restart / remove / logs modal
- [x] Images: list / pull with tag picker / remove / prune
- [x] Volumes: list / create / remove (with "in use by" guard)
- [x] Networks: list / create / remove
- [x] Cleanup: prune preview + selective run
- [x] Port remap: clone container with new `-p`, stop/remove original
- [x] Install wizard: native (distro steps with sudo)
- [x] Docker Hub search + tag picker
- [x] In-container terminal (`dockerTerminal` IPC)

Known issue addressed: install wizard now refreshes `installedFeatures` on open and after successful install, so mid-session installs reflected without reload.

---

## Phase 3 — SSH ✅ SHIPPED (`/ssh` → `partial`)

- [x] Key generation (ed25519), passphrase optional
- [x] Public key display + copy + fingerprint
- [x] GitHub SSH test with output
- [x] Remote key setup (`sshSetupRemoteKey`, password in component state only)
- [x] `sshListDir` for remote directory browsing
- [x] `sshEnableLocal` for local SSH daemon
- [x] SSH bookmarks save/load from store
- [x] SSH note in UI (`~/.ssh` needs filesystem access)

---

## Phase 4 — Git Environment Manager ✅ SHIPPED (`/git?tab=config`)

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

Missing: LAN discovery (intentional). **Per-container stats stream:** ✅ shipped on Docker page (2026-05-29).

---

## Phase 6 — Runtimes 📋 SIMPLIFYING (`/runtimes` → `partial`)

~~17 runtimes: Node, Python, Go, Rust, Java, Bun, Zig, Dart, Flutter, Julia, PHP, Ruby, Lua, .NET, C/C++, Octave, SBCL~~

**R1–R3 sprint (2026-05-31):** Simplifying from 18 runtimes to 7. See [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) §14.

**Keeping (7):** Node.js, Python, Java, Go, Rust, PHP, .NET/C#

**Removing (11):** Ruby, Bun, Zig, C/C++, MATLAB/Octave, Dart, Flutter, Julia, Lua, Lisp (SBCL), R

- [x] Local + system install methods per runtime
- [x] Real streaming progress (BufReader live)
- [x] `check-deps`, `uninstall-preview`, `remove-version`
- [x] `allVersions` detection for all runtimes
- [x] Python filters EOL, PHP uses system packages
- [x] Real dep graph (`removableDeps`) — `runtime_preview_removable_deps()`. ✅ FIXED

Remaining: Ruby install slow on Fedora (removed — Ruby no longer in scope).

---

## Phase 7 — Maintenance 🔄 ✅ DONE

**Goal:** Process actual, real-time data for entire program (no mocks).

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

## Phase 8 — Settings ✅ DONE (14 tabs shipped; Resources tab absent; Extension removed)

**`/settings` shell** — `SettingsShell.tsx` with category rail, `?tab=` URL param, and per-tab routed components. **14 tabs** implemented:

- [x] **Personalization** — accent colour, theme tokens; `applyAppearanceAccent` / `syncAppearanceFromStore`
- [x] **Remote** — SSH overview, terminal defaults
- [x] **System** — host diagnostics, `/proc` info cards (`SettingsSystem.tsx` 598 lines)
- [x] **Accounts** — Cloud Git linked accounts (GitHub / GitLab)
- [x] **General** — startup behaviour, window size, telemetry toggles, projects home dir (`SettingsGeneral.tsx` 124 lines)
- [x] **Update** — release channel (Stable/Alpha), check-on-startup toggle
- [x] **Notification** — global mute, severity filters, OS notification toggles
- [x] **Shortcuts** — keybinding interceptor UI, custom action mapping
- [x] **Help & About** — dynamic version from Tauri config
- [x] **Date & Time** — 12h/24h toggle, timezone override
- [x] **Languages** — i18next language switcher (live, no reload)
- [x] **App Engine** _(beta)_ — IPC timeout, thread pool, daemon auto-restart
- [x] **Builder** _(beta)_ — toolchain paths (Cargo, Node, Python), registry mirrors
- [x] **Beta Features** _(beta)_ — experimental flags via `beta_features_state` store
- [ ] **Resources** — CPU/RAM limit sliders tab **not present** (not in nav, no component); deferred post-Alpha
- [x] ~~**Extension**~~ — **removed from scope** (2026-05-29); no plugin tab in settings

---

## Phase 9 — Profiles ✅ DONE (`/profiles` engine room)

**Goal:** Implement real profile management page with real accounts and ability to seamlessly switch between profiles. Complete removal of static placeholder profiles.

- [x] **Data Structure:** Profiles are robust JSON with `name`, `baseTemplate`, `description`, `tags`, `composeVariant`, `envVars`, `sshKeyId`, `credentialIds`. Stored encrypted; UI has full CRUD wizard with chip tags and stack toggle.
- [x] **Authentication:** Profile switching = user context switching. Credentials stored AES-256-GCM encrypted in `profile_credentials.enc`. No separate login flow needed.
- [x] **Switching Engine:** Context-switching engine safely tears down one profile's state and spins up another's instantly from UI (`profileSwitch` IPC).
- [x] **Workspace Context Binding:** Fluent Design UI modal to create/link projects and dynamically bind `${PROJECT_DIR}` to containers on restart.
- [x] **Project Scaffolding Engine:** Advanced `npm`/`pip` dependency installer, dynamic `package.json`/`requirements.txt` generation, and real-time terminal UI progress streaming. Web-Dev and Data-Science fully functional.
- [x] **Expanded Environments:** Mobile scaffold (React Native + Flutter sub-templates via `scaffold_mobile_react_native` / `scaffold_mobile_flutter`) and AI/ML scaffold (`scaffold_ai_ml`: venv, Jupyter, Ollama, LangChain skeleton) fully implemented in `project_scaffold.rs`. DashboardMainPage create-project modal wired with mobile sub-template picker and `dh:project:scaffold` IPC calls for both mobile and ai-ml templates.
- [x] **IDE Integration:** Dynamic editor detection and `ipc_invoke` routing for launching VS Code, Cursor, Neovim directly into active container workspace.

---

## Phase 10 — Extensions ❌ REMOVED FROM SCOPE (2026-05-29)

Plugin marketplace, signed extensions, and Settings Extension tab are **not part of this project**. Do not reintroduce without explicit product decision.

---

## Phase 11 — First-run Wizard ✅ DONE

- [x] **Flow Control:** `App.tsx` chains two wizards sequentially: `readiness_wizard_complete` → `first_run_wizard_complete`. Readiness wizard runs first (full 8-step system check + onboarding). First-run wizard only fires if readiness was completed but first-run wasn't.
- [x] **Content Scope:** 3-step lightweight wizard — theme picker (dark/light preview cards) → Git identity (name + email, both optional) → completion. Both steps skippable via "Skip for now" link.
- [x] **Zero Duplication:** ReadinessWizardPage (Phase 16) remains comprehensive path — 8 steps including system probes with auto-fix, theme, git, SSH, and profile picker. FirstRunWizardPage is _sequential fallback_ for when readiness done but app onboarding wasn't finalized.

**Goal:** Must execute strictly after Phase 16 (System Readiness/Installer) is 100% satisfied. Must be fully functional and avoid duplicated setup steps.

---

## Phase 12 — Cloud Git (GitHub / GitLab) ✅ DONE

Turns app into true daily driver for software engineers managing repositories and cloud source control platforms.

- **Authentication** ✅: Encrypted store for tokens; device flow + PAT; optional OAuth client IDs via **Settings → Connected accounts** / env / compile-time. Device-flow failure maps to `[CLOUD_AUTH_DEVICE_POLL_REJECTED]` with actionable guidance.
- **Interactive Version Control (Smart Workflow)** ✅:
  - **Smart Push/Sync**: Fetch-before-push; `behind > 0` blocks push with notice; protected-branch failures → `[GIT_VCS_PROTECTED_BRANCH]` + Cloud Git link.
  - **Integrate Bar**: Guided UI for Merge, Rebase, and Stash (fast-forward defaults).
  - **Conflict Resolution Studio**: 3-way merge view (Local / Incoming / Result) with Accept Current, Accept Incoming, Accept Both.
  - **State Management**: Automatic handling of `MERGING` / `REBASING` states with Continue or Abort actions.
- **Cloud Dashboards (API Integration)** ✅:
  - **PR/MR Wizard**: Create PRs/MRs directly from app. Auto-fills title from branch name, visual branch picker, opens after protected-branch bypass flow.
  - **CI/CD Pipelines**: `GitVcsCiChecks` + `gitVcsRepoPipelines` — real-time status (GitHub Actions + GitLab CI) with 30s polling.
  - **Issues Tracking**: Open issues across repos via `CloudGitActivityPanel`.
  - **Releases & Tags**: Latest releases per provider via `CloudGitActivityPanel`.
- **Dashboard Widgets** — **removed** (2026-05-29). Use `/git` recents and Cloud Git activity instead.

> **Git Assistant replaces legacy pro UI (2026-05-31):** The pro Git surface (tabbed hub, integrate bar, conflict studio, CI panel, config dashboard) was deleted in the Git Assistant sprint (G1). All VCS/cloud IPC channels kept for contract tests. Single-page beginner UX on `/git` covers setup → open → save → share. See [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) §6.

---

## Phase 15 — Theme Surface Rollout ✅ DONE

**Goal:** Convert all pages to elevated product aesthetic (ambient gradients, elevated cards, hero sections).

- [x] **Elevated Theme Utilities:** `theme-elevated.css` with reusable classes (hero, card, tabs, tiles, grids, etc.)
- [x] **Full Page Coverage:** All primary pages + modals converted to elevated theme (DockerPage, GitConfigPage, SettingsPage, RuntimesPage, TerminalPage, RegistryPage, ProfilesPage, DashboardKernelsPage, DashboardLogsPage, GitVcsDirtyCheckoutModal)
- [x] **CSS Architecture:** Per-page CSS files importing shared theme, no inline styles for layout/theming

**Future Enhancement (Post-Phase 15):**

- Theme Picker UI in settings for light/dark/high-contrast switching
- Dynamic theme token swapping without reload
- Extended token system for semantic colors

---

## ✅ Phase 16 — System Readiness & Pre-Requisites Wizard (Installer) ✅ DONE

**Goal:** Implement strict blocking "WinBoat" setup wizard philosophy. First window user sees on app launch. Main app shell **does not load** until all critical requirements pass.

### Pre-flight Flow (The "Installer" Window)

- [x] **First-Run Detection:** On app launch, check `readiness_wizard_complete` in store. If missing/false, show full-screen blocker before AppShell loads.
- [x] **Modal/Window:** Dedicated installer window (like Windows Boot Camp setup). Cannot be skipped or closed (X button disabled).
- [x] **Modern UI:** Premium, centered layout with hero header, requirement cards with status indicators, action buttons, and disabled "Next" button until all critical ✓.

### Comprehensive Probe Matrix

Probe for **everything** required to run app. No shortcuts.

**Hardware/System:**

- [x] RAM ≥ 4GB (warn if <4GB)
- [x] CPU Cores ≥ 2 (warn if <2)
- [x] Virtualization (KVM/VT-x/AMD-V enabled — critical for containers)
- [x] Architecture: x86_64 required

**Core Tools (Critical):**

- [x] Docker installed + version ≥ 20.10
- [x] Docker Compose v2 (via `docker compose` command, not `docker-compose`)
- [x] Git installed
- [x] SSH available (local daemon running or `ssh` command available)
- [x] Curl, Tar, Unzip in PATH

**System State:**

- [x] Docker daemon running (not just installed)
- [x] User in `docker` group (can run `docker ps` without sudo)
- [x] `/var/run/docker.sock` readable

### Active "Fix It" Buttons (Not Just "How?")

**Philosophy:** Direct action, not documentation.

- [x] **One-Click Install:** Each missing dependency has "Install" button (not "How?").
- [x] **Command Execution:** Button triggers native OS package manager (apt, dnf, pacman, etc.) detection.
- [x] **Privilege Escalation:** Uses `pkexec` (Polkit) to prompt for password securely. No forced terminal or manual CLI.
- [x] **Special Cases:**
  - Docker group: `usermod -aG docker $USER` + advise user to log out/in or `newgrp docker`.
  - Docker daemon: `systemctl start docker` (user-privileged).
  - SSH daemon: `systemctl start ssh` or `systemctl start sshd` (distro-dependent).

### Premium "Installation in Progress" UI

When user clicks "Install" / "Fix":

- [x] **Progress Screen:** Transition to modern progress modal (not terminal output).
- [x] **Live Status:** Clear text: "Installing Docker..." → "Adding user to docker group..." → "Starting Docker daemon...".
- [x] **Smooth Progress Bar:** Animated bar for each step (or spinner if no ETA).
- [x] **Non-Blocking Output:** Show brief, human-readable logs (not raw terminal noise).
- [x] **Auto-Recheck:** After install completes, re-probe that dependency. Update status card in real-time (✓ or ✘).

### Strict Blocking: Disabled "Next" Button

- [x] **"Next" Button Logic:** Disabled (grayed out, no hover, `cursor: not-allowed`) if ANY critical requirement shows red ✘.
- [x] **No Bypass:** User cannot:
  - Skip the screen.
  - Close the window (X disabled).
  - Proceed without all critical ✓.
- [x] **Visual Feedback:** Disabled state obvious. Hover shows tooltip: "Install missing requirements to continue."

### Success Criteria

- [x] All critical probes show ✓ (green checkmarks).
- [x] "Next" button enabled + clickable.
- [x] User clicks "Next" → `readiness_wizard_complete = true` saved to store.
- [x] Main app shell (AppShell + Dashboard) loads.
- [x] Subsequent app launches skip readiness screen (go straight to dashboard or Wizard).

### Recovery & Re-Entry

- [x] **Reset Option:** Settings → "Run Setup Wizard Again" button clears `readiness_wizard_complete`, forces re-entry on next launch.
- [x] **Manual Probe:** If user manually fixes deps (e.g., `sudo apt install docker.io`), "Recheck" button in UI re-runs probes without restart.
- [x] **Projects Home Directory:** Step 4 lets user configure where all projects are scaffolded. Editable anytime in Settings → General.

---

## Known Bugs

> **Git Assistant G2 audit (2026-05-31):** 12 engineering fixes verified in full audit pass (63 files, 40+ tests). Zero known blockers remain on `/git`. Remaining code-quality items (6 missing IPC constants, dead code, schema gaps) documented in [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) §6.

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
| 10 | DashboardKernelsPage | HTTP OPEN LINK shown for all TCP ports (ssh/22, postgres/5432, etc.) | ✅ FIXED |
| 11 | DashboardKernelsPage | GPU fallback hardcoded to 'Intel Integrated Graphics' when nvidia-smi fails | ✅ FIXED |
| 12 | DashboardKernelsPage | Empty runtimes shows 'Loading…' permanently after fetch completes | ✅ FIXED |
| 13 | DashboardLogsPage | `val.split(':')` breaks on IDs containing colons | ✅ FIXED |
| 14 | DashboardLogsPage | `j.logTail.length` crashes when logTail is undefined | ✅ FIXED |
| 15 | TopBar / ActiveJobsStrip | `j.progress` not clamped — can exceed 100% or render NaN | ✅ FIXED |
| 16 | lib.rs layout_set | Default-profile branch stored entire body instead of layout value | ✅ FIXED |
| 17 | lib.rs runtime:status | Join error silently drops probe entries | ✅ FIXED |
| 18 | DashboardLogsPage | Search input rendered but non-functional | ✅ FIXED (2026-05-28) |
| 19 | DashboardWidgetDeck | `link.workstation` routed to dead `/workstation` path | ✅ FIXED (2026-05-28) |
| 20 | DashboardWidgetsPage | Profile hardcoded `'web-dev'` in `layoutGet`/`layoutSet` | ✅ FIXED (2026-05-28) |
| 21 | TopBar | Runtime palette search used stale localStorage cache | ✅ FIXED (2026-05-28) |
| 22 | ActiveJobsStrip | "Engine Connected" placebo text + hardcoded version | ✅ FIXED (2026-05-28) |
| 23 | AppShell | Sidebar `status: 'live'` badges decorative (no health check) | ✅ FIXED (2026-05-28) |
| 24 | AppShell | Docs link pointed to `github.com` instead of docs | ✅ FIXED (2026-05-28) |
| 25 | TopBar | Palette hidden on non-dashboard pages (overflow clipping) | ✅ FIXED (2026-05-28) |
| 26 | TopBar | Palette wouldn't reopen after Enter-navigate (stale focus) | ✅ FIXED (2026-05-28) |
| 27 | TopBar | Dashboard sub-nav tabs tooltip blurriness (Logs) due to subpixel transform offsets | ✅ FIXED (2026-05-28) |
| 28 | AppShell / TopBar | Sidebar & Topbar icon tooltip blurriness due to dynamic-width fractional offsets | ✅ FIXED (2026-05-28) |

---

## 🚨 UI/UX & Performance Debt ✅ DONE (2026-05-28)

- [x] **Runtimes Page Optimization:** Profile Tauri invoke calls causing >1 min load time. Implement lazy loading, caching of local package lists, or async background fetching. ✅ DONE (2026-05-28) — 30s status cache, adaptive polling (800ms active, 3s idle), background refresh.
- [x] **Dashboard - Main:** Profile-driven dashboard preset grid (widget deck **removed** 2026-05-29).
- [x] **Dashboard - Widgets:** Removed from product scope (2026-05-29).
- [x] **Dashboard - Kernels:** Build configuration grid for starting, stopping, linking local development kernels (e.g., Jupyter, PHP-FPM). ✅ DONE (2026-05-28) — `KERNEL_DEFS` with Start/Stop/Open/Link via `hostExec`.
- [x] **Dashboard - Logs:** Implement unified log viewer using `xterm.js` multiplexing stdout/stderr streams from all active background jobs and containers into single searchable buffer. ✅ DONE (2026-05-28) — real xterm.js with multiplexed streams, functional line-buffer search filter.
- [x] **Global Navigation (Chrome) Fixes:** Define specific Tauri commands (e.g., `open_terminal`, `show_notifications_panel`) bound to Top Bar buttons (Search, Notification, Terminal, Settings) and Left Sidebar buttons (Docs, Setup Wizard, Local User). ✅ DONE (2026-05-28) — Search uses fuzzy-scored palette (pages/containers/runtimes/git repos via live IPC), Notifications poll `jobsList()`, Terminal/Settings navigate, Docs link fixed, Setup Wizard wired, Profile name from store, nav badges from engine health ping.
- [x] **Bottom Bar:** Completely rip out "Phase 0 task runner" and replace with clean, minimized status bar or remove entirely if replacement unnecessary. ✅ FIXED (2026-05-28) — zero Phase 0/task runner references; `ActiveJobsStrip` shows real job data; status bar shows live `appInfo()` version and dynamic engine health indicator.

---

### Phase 17 — lib.rs Monolith Refactoring

**Status:** ✅ DONE (2026-05-28)
**Scope:** Decomposed 3,963-line `lib.rs` into 37 Rust source files (33 domain modules, 678-line dispatcher).

**Results:**

- `lib.rs`: 3,963 → 678 (82.9% reduction), 308 non-test dispatcher lines
- ipc_invoke: 106 match-arm lines covering ~65 distinct channels (some arms use `|` multi-pattern), zero business logic inline
- 37 Rust source files (`cloud_auth/` crate with 7 files; 2,303-line `runtime_jobs.rs` the largest module)
- `executor.rs` (17 KB) actively used; exports `runtime_bash_user_step`, `sudo_bash_install_step`
- Key large modules: `runtime_jobs.rs` (2,270 lines), `system_info.rs` (1,536 lines)
- cargo check: zero warnings, clippy: zero errors; Rust unit test count not re-verified post-refactor

---

## 📋 Future Phases — Scope & Dependencies

Based on current app state (Phase 16 + Phase 7 complete), here's what remaining phases need:

### Phase 8 — Settings ✅ DONE

15 tabs shipped → **14 tabs** (Extension removed). See Phase 8 section. Remaining gaps: Resources tab absent.

### Phase 10 — Extensions ❌ REMOVED

Out of scope. See Phase 10 section above.

### Phase 15 — Theme Rollout ✅ DONE

`theme-elevated.css` created; primary routes converted. Dynamic theme swapping without reload is post-Alpha enhancement.

### Phase 9 — Profiles ✅ DONE

~~**Depends on:** Phase 8 (Settings must exist for profile env var storage)~~ — **shipped without Phase 8**; profile env vars stored in `store.json` directly.

**Note:** Profiles feed into Phase 16 installer (compose profile selection). Tight coupling.

### Phase 11 — First-run Wizard (Merged into Phase 16)

**Status:** ✅ Merged into 8-step unified installer (Phase 16). No separate implementation needed.

### UI/UX & Performance — ✅ DONE (2026-05-28)

Runtimes lazy-load/caching, kernel grid, log multiplexing, and navigation polish shipped. Dashboard widgets **removed** 2026-05-29.

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
✅  SPRINT   — Tests + Audit + Cross-distro + v0.2.0-alpha (shipped)
✅  Phase 13 — Advanced CI & Environment Hardening
✅  Phase 12 — Cloud Git
✅  Phase 7  — Maintenance / Guardian
✅  Phase 16 — System Readiness & Pre-Requisites Wizard (Installer)
✅  Phase 15 — Theme Rollout (Elevated aesthetic)
✅  Phase 8  — Settings (14 tabs; Resources absent; Extension removed)
✅  Phase 9  — Profiles
✅  Phase 11 — First-run Wizard (Merged into Phase 16)
✅  UI/UX & Performance Debt (all 7 items, 2026-05-28)
✅  Audit Fixes (9 defects squashed, fuzzy search shipped, 2026-05-28)
❌  Phase 10 — Extensions (removed from scope 2026-05-29)
✅  Phase 17  — lib.rs Monolith Refactoring (37 source files, 678-line dispatcher)
```
