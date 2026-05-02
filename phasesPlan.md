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

## 🛡️ Phase 13 — Advanced CI & Environment Hardening (Prevent Distro-Surprises)

**Goal: Stop discovering environment bugs manually on Arch/Fedora/Ubuntu.**

- [ ] **Multi-distro Smoke CI:**
  - [ ] Add GitLab CI job to launch the built Flatpak inside an Arch Linux container (using `xvfb-run`).
  - [ ] Add GitLab CI job to launch on Fedora container.
- [ ] **Sandbox Permission Probes:**
  - [ ] Automated test to verify if the app can "see" the Docker socket inside the sandbox.
  - [ ] Verify PTY (Terminal) allocation succeeds in restricted environments.
- [ ] **Headless E2E (Packaging):**
  - [ ] Use Playwright/Webdriver to confirm the UI actually loads (no "Connection Refused") inside the Flatpak bundle.


---

## What is NOT Alpha scope (explicitly deprioritized)

- ❌ Drag-and-drop polish (basic HTML5 reorder already works — good enough)
- ❌ Theme surface rollout across all routes (Maintenance theme is pilot; others wait)
- ❌ Phase 8 Settings, Phase 10 Extensions, Phase 12 Cloud Git
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
- [x] **Minimal compose stub per preset** — each `docker/compose/<profile>/docker-compose.yml` is a small Alpine `sleep infinity` service with a unique Compose `name:`; `dh:compose:up` resolves checkout, `LUMINA_DEV_COMPOSE_ROOT`, or bundled `docker/compose` (see `compose_profiles.rs` + `tauri.conf.json` `bundle.resources`).
- [ ] **Full stack definitions** — replace stubs with profile-realistic services (nginx, Jupyter, Hugo, …) behind feature flags or separate overlays when ready.
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

- **SSH Bookmarks** — manage frequently used remote connections in a dedicated UI.
- **Hosts Editor** — `/etc/hosts` editor with root-access handling and strong safety warnings to avoid accidental destructive edits.
- **Environment Variables** — user session env file management vs **profile-scoped env** (safer); include diff preview before application.
- **Theme/Accent Picker** — pilot rollout of the design system across all routes with customizable accent colors.

---

## Phase 9 — Profiles ✅ DONE

- [x] **CRUD**: add / delete / duplicate / export / import
- [x] **setActive**: writes `active_profile` as the entry’s `baseTemplate` (`ComposeProfile`); clear via store delete.
- [x] **On-login automation** — optional post-start hooks: `composeUp` for `active_profile`, refresh dashboard layout via `layoutGet` / `layoutSet`; toggles + store key `on_login_automation`; runner in `AppShell` (after wizard).
- [x] **Preset alignment**: dashboard preset grid reads the same `active_profile` key as wizard / Profiles.

---

## Phase 10 — Extensions 📋 PLANNED (post-Alpha)

- **Extension model v0**: “plugins” = **extra widgets + optional IPC namespaces** loaded from a **signed/allowlisted** folder; no arbitrary binary download at first.
- **Developer API**: versioned API and lifecycle hooks for third-party widget development.
- **Marketplace**: browsable directory for community-contributed extensions (post-v0 stability).

---

## Phase 11 — First-run Wizard ✅ DONE

- [x] **7 steps**: Welcome → Environment → Docker check → Git setup → SSH keygen → **Pick starter profile** → All set
- [x] **Auto-shows** on first launch, skip on each step, "show again" checkbox
- [x] **Profile-pick step**: nine compose presets; writes `active_profile` when confirmed
- [x] **Re-entry**: sidebar **Setup Wizard** resets `wizard_state` + reload
- [x] **Resume logic**: `wizard_state.stepIndex` (0–6) persisted while incomplete; restored on next launch
- [x] **Rich resume**: `wizard_state` stores Git name/email draft, `gitTarget`, `sshPubKey` / `sshKeyGenerated` (refetch via `sshGetPub` when needed), and `pickedStarterProfile`; `WizardFlow` hydrates and persists with step.

---

## Phase 12 — Cloud Git (GitHub / GitLab) 📋 PLANNED (post-Alpha)

This phase turns the app into a true daily driver for software engineers managing repositories and cloud source control platforms.

- **Authentication**: Secure storage of Personal Access Tokens (PAT) or OAuth for both **GitHub** and **GitLab**.
- **Interactive Version Control**: Visual interface for `Commit`, `Push`, `Pull`, and `Sync` without needing a terminal. Branch management (checkout, create, merge).
- **Cloud Dashboards (API Integration)**: 
  - **Pull Requests / Merge Requests**: View open PRs/MRs, requested reviews, and merge status.
  - **Issues Tracking**: List open issues assigned to the user across repositories.
  - **CI/CD Pipelines**: Real-time status of GitHub Actions and GitLab CI/CD pipelines (Success, Failure, In Progress) for the active local repo.
  - **Releases & Tags**: Overview of the latest releases.
- **Repository Widgets**: A dedicated dashboard widget displaying a summary of all active local repositories (status, uncommitted changes, behind/ahead commits) and another widget for cloud notifications (Mentions, Failed Pipelines).

---

## Phase 13 — Theme Surface Rollout 📋 PLANNED (post-Alpha)

Generalize the "Maintenance Page" aesthetic (ambient gradients, hero typography, hover-lift tiles) across the app without a big-bang rewrite.

- **Principles**: Scope by page root classes, reuse CSS variables/tokens, and enhance hierarchy/spacing/motion.
- **Rollout Priority**: 
  1. **Monitor** — metrics + pills + health story.
  2. **Docker** — toolbar + card elevation + container tables.
  3. **Git Config** — hero + section rails to reduce noise.
  4. **Runtimes** — tiles + status panels + wizard steps.
  5. **Dashboard** — widget-wide consistency.
  6. **AppShell** — subtle chrome / nav alignment.
- **Checklist**: root class per page, Codicon verification, and focus-ring preservation.

---

## Phase 14 — Flatpak & Release Gate 📋 PLANNED

Full preparation for Flathub submission and official v1.0 stability.

- **Checklist**:
  - [ ] **AppStream Metadata**: `metainfo.xml` with license, summary, and screenshots.
  - [ ] **Desktop Entry**: original icon assets and trademark-clean metadata.
  - [ ] **Reproducible Build**: manifest builds successfully with `flatpak-builder` offline.
  - [ ] **Sandbox Hardening**: justify and document `finish-args` (Docker socket, host exec bridges).
  - [ ] **Cross-Distro Smoke**: verified on Fedora Silverblue (immutable) and traditional distros.
- **Maintenance**: regenerate Node sources after lockfile changes using `./flatpak/generate-node-sources.sh`.
- See Days 1–2 and Day 10 in sprint above for Alpha release gate criteria.

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
✅  SPRINT   — Flatpak + Tests + Audit + Cross-distro + v0.2.0-alpha (shipped)
🔄  Phase 1  — Dashboard (**full stack definitions** per preset; minimal Alpine stubs + resolver shipped)
✅  Phase 9  — Profiles (incl. on-login automation)
✅  Phase 11 — Wizard (step + rich field resume in `wizard_state`)
📋  Phase 8  — Settings (SSH Bookmarks, Hosts Editor, Env Vars)
📋  Phase 12 — Cloud Git (PRs/MRs, CI/CD Status, Interactive Sync)
📋  Phase 13 — Theme Rollout (System-wide pilot)
📋  Phase 10 — Extensions (Plugin model v0, Dev API)
📋  Phase 14 — Flatpak Release Gate
```
