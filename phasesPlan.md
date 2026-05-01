# LuminaDev — Product Phases Plan

> Living document. Route truth table: [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md) | Release gate: [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md)

---

## 🎯 Immediate Sprint (from `thoghts.md`) — DO THIS NOW

**Critical paths only: Flatpak → Tests → Audit → Cross-distro → Release.**
Cosmetic work (theming, drag-drop polish) is blocked until after Day 10.

### Days 1–2 — Flatpak Setup + Build

- [ ] `flatpak install flathub org.gnome.Platform//48 org.gnome.Sdk//48`
- [ ] `flatpak install flathub org.freedesktop.Sdk.Extension.rust-stable`
- [ ] Create `packaging/flatpak/com.luminadev.LuminaDev.yml` manifest (GNOME Platform runtime, cargo module)
- [ ] Local build: `flatpak-builder --force-clean build-dir com.luminadev.LuminaDev.yml`
- [ ] Local run: `flatpak-builder --run build-dir com.luminadev.LuminaDev.yml lumina-dev`
- [ ] Record all errors: permissions, missing deps, cargo offline issues
- [ ] Fix common issues:
  - Docker socket → `--socket=session-bus` + `docker.sock` custom permission
  - Host commands → `flatpak-spawn --host` in Rust or `--allow=devel`
  - Rust deps → run `flatpak-cargo-generator` → `generated-sources.json`

### Days 3–4 — Smoke Tests + Docker Integration Tests

- [ ] Add Rust smoke tests in `src-tauri/tests/`:
  - `docker info`, `docker ps --all`, `docker version`
  - Prune dry-run (images, volumes, build cache)
  - Error case: Docker daemon not running
- [ ] Integration tests:
  - Job Runner with a long task (e.g. small `docker pull`)
  - Streaming logs
  - Cancellation
- [ ] Add CI workflows (only if better than existing CIs):
  - `ci.yml` — typecheck + lint + build + tauri build on every PR/push to main
  - `smoke-tests.yml` — Rust tests + Docker smoke + job runner
  - `flatpak.yml` — Flatpak build + bundle + basic run test

### Day 5 — Deep Audit: Critical Paths

Manually review:
- [ ] All `tauri::command` handlers that use `shell::Command` or exec
- [ ] Timeouts and error handling in Job Runner
- [ ] Capabilities in `tauri.conf.json` (every command explicitly allowed)
- [ ] Docker integration in Rust (socket connection + error messages)
- [ ] Maintenance Guardian logic (health scoring, aggregate metrics)

### Days 6–7 — Cross-Distro Testing + Bug Fixing

Test native + Flatpak on: **Ubuntu/Pop!OS**, **Fedora**, **Arch Linux** (VM if needed).

Focus areas:
- [ ] Docker socket inside Flatpak
- [ ] Runtime installation (especially Java on Fedora)
- [ ] Monitor metrics (`/proc` access in Flatpak)
- [ ] Terminal integration

Bug fixes priority (see Known Bugs table below):
- [x] Bug #5 — `riskyOpenPorts?.length` crash → **FIXED**
- [x] Bug #7 — `uninstallPreview` fires on every mode toggle → **FIXED**
- [ ] Bug #2 — `installedFeatures` not refreshed post-install (Docker wizard)
- [ ] Bug #4 — Docker Hub link broken for official images (needs manual verify)

### Days 8–9 — Polish + Documentation

- [ ] Fix UI bugs found during cross-distro testing
- [ ] Update `README.md`: "Current Status" + "Known Limitations" sections
- [ ] Write basic `CONTRIBUTING.md`
- [ ] Update this file to reflect reality

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

Known issue: `installedFeatures` only refreshed on mount — wizard may show Docker missing on re-open after mid-session install. (Bug #2, medium priority.)

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
| 2 | DockerPage | `installedFeatures` not refreshed post-install | ⚠ OPEN — medium, fix Days 6–7 |
| 3 | RegistryPage | `octocat/Hello-World` placeholder | ✅ FIXED |
| 4 | RegistryPage | Docker Hub link broken for official images | ❓ Needs manual check |
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
