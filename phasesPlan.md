# LuminaDev — Product Phases Plan

> Living document. Update status markers when a phase ships or behavior changes.
> Route-level truth table: [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md)
> Release gate criteria: [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md)

---

## Status Legend

| Badge | Meaning |
|-------|---------|
| ✅ **SHIPPED** | Implemented, IPC live, tests passing |
| 🔄 **PARTIAL** | Core works; gaps documented |
| 🗂 **STUB** | Scaffolded / placeholder; no real backend |
| 📋 **PLANNED** | Not started |

---

## Core Principles

1. **Click-first UX** — Every flow has buttons, wizards, and status chips. Terminal is optional (advanced / "show command").
2. **Two trust levels** — Inside Flatpak / user home (no root: `rustup`, `nvm`, user pip) vs host / system (needs PolicyKit / sudo). Make this explicit so users are never surprised.
3. **One IPC + schema layer** — Extend `@linux-dev-home/shared` Zod schemas for every new action. Main process does policy checks, timeouts, and allowlists.
4. **Profiles = data, not only compose** — A profile is a JSON document: enabled nav items, dashboard widget layout, compose stacks to start, env presets, optional post-actions.

---

## Quality Gate (passed ✅)

All five stabilization checklist items are `done`:
1. Commit quality and PR discipline
2. IPC reliability coverage (ssh, git, runtimes)
3. Privilege boundary evidence (Flatpak vs host matrix)
4. Scope freeze enforcement
5. Documentation truthfulness audit

`pnpm smoke` (typecheck + vitest + eslint) is green. See [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md).

---

## Phase 0 — Foundations ✅ SHIPPED

- Widget registry + `dashboard-layout.json` persisted in app data dir
- Responsive dashboard grid + "Add widget" / "Custom profile" entry points
- Job runner abstraction (`jobStart` / `jobsList` / `jobCancel`) with footer progress strip
- Session banner (Flatpak vs native) + link to `docs/DOCKER_FLATPAK.md`
- Tauri migration complete (Stages 0–4): all IPC native Rust, Electron removed, CI green

---

## Phase 1 — Dashboard: Profiles + Custom Layout 🔄 PARTIAL

### Shipped
- Preset profile cards on dashboard grid (Docker Dev, Web Dev, etc.)
- Custom profile wizard modal (`CustomProfileWizardModal`) — name → template → stacks → widgets → save
- Widget layout load/save via `layoutGet` / `layoutSet` IPC
- `DashboardWidgetsPage`, `DashboardKernelsPage`, `DashboardLogsPage` all present

### Remaining
- Full drag-and-drop widget reorder (currently placeholder)
- 9+ preset cards covering: Mobile, Game dev, Infra/K8s, Desktop Qt, Docs/Writing, Empty minimal
- Real compose stubs per preset (Alpine `sleep infinity` until stack definitions ship)
- Link Dashboard preset cards to the same profile store as `/profiles` (one source of truth)

---

## Phase 2 — Docker ✅ SHIPPED (`/docker` → `live`)

Full click-first Docker surface:
- Container list (5s refresh) / start / stop / restart / remove / logs modal
- Images: list / pull with tag picker / remove / prune
- Volumes: list / create / remove (with "in use by" guard)
- Networks: list / create / remove
- Cleanup: prune preview with reclaim estimate + selective run
- Port remap: clone container with new `-p`, stop/remove original
- Install wizard: native (distro steps with sudo) / Flatpak (warning + links)
- Docker Hub search + tag picker

Known limit: `installedFeatures` check in install wizard always re-runs on open (does not cache per session) — cosmetic.

---

## Phase 3 — SSH 🔄 PARTIAL (`/ssh`)

### Shipped
- Key generation (ed25519 default), passphrase optional
- Public key display + copy button + fingerprint field
- GitHub SSH test (`ssh -T git@github.com`) with output display
- Remote key setup (sshpass-based, password in component state only, never persisted)
- SSH bookmarks save/load from store
- Flatpak note: `~/.ssh` needs `--filesystem=home` override (documented in `PRIVILEGE_BOUNDARY_MATRIX.md`)

### Remaining
- Advanced remote transfer UX
- OS keyring integration for passphrase (later polish)

---

## Phase 4 — Git Environment Manager ✅ SHIPPED (`/git-config` → `live`)

Full Git environment management panel with sidebar navigation:

### Sections
- **Overview** — 4 health score cards (Identity / Security / Performance / Compatibility), total score, smart suggestions with one-click fix actions
- **Identity Center** — Name, email, branch quick-picks (main/master/develop), editor quick-picks (VS Code/vim/nano/emacs/nvim), profile label (Personal / Work / Open Source)
- **Security Center** — SECURE/ATTENTION/RISK rows: credential helper safety, commit signing, SSL verification, cookie file exposure. Inline action buttons.
- **Behavior Settings** — Toggle switches: Rebase on Pull, Auto Prune, Auto Prune Tags, Performance Index Preload, FS Cache, Auto Stash on Rebase, Commit Signing, Line Ending Mode (3-way)
- **Preset Templates** — Beginner Safe / Developer Pro / Open Source Ready / High Security / Corporate Policy (apply curated key sets in one click)
- **Config Inspector** — Search + category filter (Identity/Security/Performance/Advanced) + sort + risk indicators + sensitive value masking with Show/Hide

### Backend
- `dh:git:config:set-key` with allowlist of safe writable keys
- Toast notifications for all actions
- All presets apply multiple keys atomically from frontend

### Planned (later polish)
- Git Doctor: "Scan Configuration" button — detect misconfigurations, deprecated settings, performance bottlenecks
- Policy Lock: lock certain keys for corporate enforcement
- Visual Change Preview: highlight modified settings + undo capability
- Backup / Restore: export / import `.gitconfig` snapshot (lives in Maintenance)

---

## Phase 5 — Monitor 🔄 PARTIAL (`/system`)

### Shipped
- CPU %, memory, swap, disk, load average (2s refresh from `/proc`)
- Real net Mbps + disk Mbps via two-pass `/proc/net/dev` + `/proc/diskstats` delta (AppState prev samples)
- Top N processes (`ps` with strict caps)
- Listening ports table (with "LISTEN" state filter fix)
- Security snapshot: firewall, SELinux, SSH auth, failed logins 24h, risky ports
- Security drilldown: failed auth samples, risky port process owners
- System info: hostname, OS, kernel, arch, uptime, IP, distro, shell, DE, WM, GPU, memory, packages, resolution (14 fields)
- GitHub commits feed widget (rate-limited public API)

### Known limits
- Per-container Docker stats stream (throttled) — not yet wired
- LAN host discovery deferred (privacy-sensitive)
- `security?.riskyOpenPorts.join()` potential crash if undefined (PAGE_AUDIT bug #5)

---

## Phase 6 — Runtimes 🔄 PARTIAL (`/runtimes`)

### Shipped (17 runtimes)
Node.js, Python, Go, Rust, Java (Temurin), Bun, Zig, Dart, Flutter, Julia, PHP, Ruby, Lua, .NET, C/C++ (gcc), Octave (MATLAB), SBCL (Lisp)

- Local method: nvm (Node), pyenv (Python 3.10+), rustup (Rust), Temurin tarball (Java), official SDK/tarball (Go, Dart, Flutter, Bun, Zig), juliaup (Julia), system packages (PHP, Ruby, Lua)
- System method: dnf / apt / pacman per runtime
- Real streaming progress bars (BufReader live stdout+stderr)
- `check-deps` live tool probes
- `uninstall-preview` distro-aware package list
- `remove-version` for isolated installs (lumina dir, nvm, pyenv, rustup, mise paths)
- `allVersions` detection for all runtimes including Rust (rustup toolchain list), Bun, Dart, Flutter (reads version file, no binary spawn), Julia (juliaup list)
- Python version list filters EOL versions (only 3.10+ shown)
- PHP local redirects to system packages (source compile is impractical)

### Known limits
- `removableDeps` always empty (no real dep graph)
- Ruby source compile via mise is slow on some distros
- Flatpak: local user installs work; system (`sudo`) method blocked with warning

---

## Phase 7 — Maintenance 🔄 PARTIAL (`/maintenance`)

### Shipped
- `maintenanceGuardian.ts` — five deductive layers: Compute, Memory, Disk, Fleet (Docker), Security
- `evaluateGuardian()` shared between `/maintenance` and `GuardianSummaryWidget` (dashboard parity)
- Overview dashboard: aggregate health score + per-layer tiles with accent colors + hover lift
- Active jobs banner pinned to footer (running jobs from any page)
- Diagnostics bundle: JSON export with metrics + security snapshot + job log + optional sensitive data
- Docker resource cleanup (prune containers/images/volumes with preview)
- Compose profile health + launch/logs
- Integrity: dismissible/auto-clearing status, in-app host probes (Docker df/ps, journalctl, cache du) via whitelisted `hostExec` — no clipboard-to-terminal runbook

### Remaining
- User-defined maintenance task checklist with cron hint display
- Backup / Restore for git config (export `.gitconfig` snapshot)
- Extra metric signals on layer tiles (network/disk I/O per layer)

---

## Phase 8 — Settings 📋 PLANNED

- **SSH Hosts / App Bookmarks** — user-managed SSH connection bookmarks (no root needed). Separate from `/etc/hosts`.
- **Hosts editor** (`/etc/hosts`) — needs root + strong warnings + confirmation dialog. Explicit "edit in host terminal" fallback.
- **Environment variables** — user session env file vs profile-scoped env (safer). Show diff preview before apply.
- **Theme / appearance** — dark/light toggle, accent color picker (already has CSS variable system).

---

## Phase 9 — Profiles (product-level) 🗂 STUB (`/profiles`)

### Scaffolded
- Profiles load from store, add/delete/export/import JSON
- Template list (local, user-defined)

### Remaining
- Profile manager: duplicate, set active, on-login actions (start compose stacks, open dashboard layout)
- Link Dashboard preset cards to the same profile store (eliminate two sources of truth)
- Per-profile runtime set (which runtimes are active in this environment)
- Per-profile environment variable overrides

---

## Phase 10 — Extensions 📋 PLANNED

- Extension model v0: "plugins" = extra widgets + optional IPC namespaces, loaded from signed/allowlisted folder. No arbitrary binary download.
- Versioned API, marketplace — only after v0 is stable.

---

## Phase 11 — First-run Wizard 🔄 PARTIAL

### Shipped
- `CustomProfileWizardModal` for profile creation
- `onboardingCompleted` flag in store

### Remaining
- Full onboarding sequence: Welcome → Environment (Flatpak vs native) → Docker check → Git identity → SSH key (optional) → Pick starter profile → Finish
- Every step skippable; resume if closed mid-way
- Entry point from Help menu too

---

## Phase 12 — Advanced Source Control (GitHub & GitLab) 📋 PLANNED

- **Auth**: Secure PAT / OAuth storage for GitHub and GitLab
- **Interactive VC**: Visual commit / push / pull / sync + branch management (checkout, create, merge)
- **Cloud dashboards**:
  - Pull Requests / Merge Requests: open PRs, review requests, merge status
  - Issues: assigned issues across repos
  - CI/CD Pipelines: GitHub Actions + GitLab CI real-time status
  - Releases & Tags: latest release overview
- **Repository widgets**: local repo summary (status, uncommitted, ahead/behind) + cloud notifications (mentions, failed pipelines)

---

## Phase 13 — Theme Surface Rollout 📋 PLANNED

Generalize Maintenance's visual language across the app. Each route gets a root class + co-located `*Page.css`. No big-bang rewrite — one route per PR.

**Priority order** (from `docs/THEME_ROLLOUT_PLAN.md`):

| Priority | Route | Rationale |
|----------|-------|-----------|
| 1 | `/system` (Monitor) | Same health story as Maintenance; metric pills fit naturally |
| 2 | `/docker` | High traffic; tables + actions benefit from toolbar + card elevation |
| 3 | `/git-config` | Feature-rich; hero + section rails reduce visual noise |
| 4 | `/runtimes` | Wizard-like steps; tiles + status panels match the new language |
| 5 | `/dashboard` main | Touches many widgets; do after patterns stabilize |
| 6 | AppShell | Optional subtle app-wide background — only after per-page patterns are proven |

**Reusable building blocks** (extracted from Maintenance pilot):
- Hero (eyebrow + gradient title + subcopy)
- Tab/section rail with icons
- Elevated `hp-card` under page root class
- KPI/metric pill chips
- Grid tiles with left accent + hover lift
- Toolbar row (primary + secondary + toggles)
- Output/log panel (`pre` in dark inset)

**Engineering checklist per PR**: page root class + dedicated CSS file, no new colors outside CSS vars, codicon names verified, contrast + focus rings preserved, smoke passing.

---

## Phase 14 — Flatpak & Release Gate 📋 PLANNED

Based on [`docs/FLATHUB_CHECKLIST.md`](docs/FLATHUB_CHECKLIST.md) and [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md):

- [ ] Unique application ID: `io.github.karimodora.LinuxDevHome`
- [ ] AppStream metadata (`metainfo.xml`): license, summary, screenshots
- [ ] Desktop entry + original icon assets (no Microsoft/VS Code trademarks)
- [ ] Flatpak manifest builds reproducibly with `flatpak-builder`
- [ ] All `finish-args` documented and justified (Docker socket, host exec bridges)
- [ ] OARS / content rating block in AppStream
- [ ] Offline variant: regenerate `flatpak/generated-sources.json` after `pnpm-lock.yaml` changes
- [ ] Smoke-tested on Fedora Silverblue (immutable) + one traditional distro via Flatpak only
- [ ] Flatpak CI job in GitHub Actions (add before Flathub submission)
- [ ] `pnpm smoke` green on final `main`
- [ ] Manual B5 test checklist completed (see `STABILIZATION_CHECKLIST.md`)
- [ ] **No `git tag` / GitHub Release** until maintainer explicitly declares product-complete

---

## Known Bugs to Fix (from `docs/PAGE_AUDIT.md`)

| # | Page | Bug | Severity |
|---|------|-----|----------|
| 1 | GitConfigPage | Mask toggle logic may be inverted (verify after Phase 4 rewrite) | Medium |
| 2 | DockerPage | `installedFeatures` never refreshed — install wizard always shows Docker missing | Medium |
| 3 | RegistryPage | Placeholder URL `octocat/Hello-World` showing in prod | Low |
| 4 | RegistryPage | Docker Hub link broken for official images | Low |
| 5 | MonitorPage | `security?.riskyOpenPorts.join()` crashes if undefined | Medium |
| 6 | MaintenancePage | `memPct`/`diskPct` derived from potentially null `m` | Medium |
| 7 | RuntimesPage | `uninstallPreview` IPC fires on every checkbox change (debounce needed) | Low |
| 8 | SystemPage | `setInterval` result not stored in ref → potential cleanup leak | Low |
| 9 | DashboardKernelsPage | `colorFor()` uses `==` instead of `===` | Low |

---

## Navigation Structure (current + planned)

Current nav items: Dashboard, Monitor, Docker, SSH, Git Config, Terminal, Runtimes, Registry, Profiles, Maintenance

Planned grouping when nav grows:

```
▸ Develop     → /runtimes, /git-config, /ssh, /registry, /terminal
▸ Operate     → /docker, /maintenance, /profiles
▸ System      → /dashboard, /system
▸ Settings    → /settings, /extensions, /wizard
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Flatpak can't run `sudo` / package managers | Honest UI + "open in host terminal" as last resort. Document in `PRIVILEGE_BOUNDARY_MATRIX.md`. |
| Security (host exec) | Allowlists in Rust, timeouts, user confirmation for destructive ops. |
| Scope explosion | Vertical slices per phase; one route per PR for theme rollout. |
| PHP/Ruby source compile fragility | Redirect to system packages on all distros (already done for PHP). |
| Flutter startup lock | Read `$FLUTTER_ROOT/version` file instead of running `flutter --version` binary. |

---

## Execution Order (updated)

1. ✅ Phase 0 — Foundations
2. ✅ Phase 2 — Docker
3. ✅ Phase 3 — SSH (core)
4. ✅ Phase 4 — Git Environment Manager
5. ✅ Phase 5 — Monitor
6. ✅ Phase 6 — Runtimes (17 languages)
7. ✅ Phase 7 — Maintenance (Guardian)
8. 🔄 Phase 1 — Dashboard profiles (complete preset cards + drag-drop)
9. 🔄 Phase 11 — First-run wizard (complete full onboarding sequence)
10. 📋 Phase 9 — Profiles productization
11. 📋 Phase 8 — Settings
12. 📋 Phase 13 — Theme surface rollout (Monitor → Docker → Git → Runtimes → Dashboard)
13. 📋 Phase 12 — Cloud Git integrations (GitHub/GitLab)
14. 📋 Phase 10 — Extensions
15. 📋 Phase 14 — Flatpak + Release Gate
