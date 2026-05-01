# LuminaDev — Product Phases Plan

> Living document. Update status markers when a phase ships or behavior changes.
> Route-level truth table: [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md)
> Release gate criteria: [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md)

---

## Thoughts / Priorities

1. **Days 1–5 (Stability):** Stick to `thoghts.md` exactly (Flatpak + Tests). Ensures foundation is solid.
2. **During Days 6–7 (Bug Fixing):** Prioritize **Known Bugs** below (Docker stats, `riskyOpenPorts`), not random churn.
3. **Ignore cosmetic features:** Drag-and-drop refinement and theming can remain partial through Alpha.

---

## Status Legend

| Badge | Meaning |
|-------|---------|
| ✅ | Implemented, IPC live, code verified |
| 🔄 | Core works; specific gaps listed |
| 🗂 | Scaffolded / placeholder; no real backend |
| 📋 | Not started |

---

## Core Principles

1. **Click-first UX** — Every flow has buttons, wizards, and status chips. Terminal is optional.
2. **Two trust levels** — Flatpak / user home (no root) vs host / system (needs sudo / PolicyKit). Always explicit.
3. **One IPC + schema layer** — `@linux-dev-home/shared` Zod schemas for every action. Main process owns policy checks, timeouts, allowlists.
4. **Profiles = data** — A profile is a JSON document: nav items, widget layout, compose stacks, env presets, post-actions.

---

## Quality Gate ✅ PASSED

All five stabilization checklist items verified `done` — commit discipline, IPC coverage, privilege boundary matrix, scope freeze, docs truthfulness. `pnpm smoke` green. See [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md).

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
- [x] 9 preset profile cards on grid: Web Dev, Mobile, Game Dev, Infra/K8s, and 5 more (PROFILE_01–09)
- [x] `CustomProfileWizardModal` — name → template → stacks → widgets → save to `custom_profiles` store
- [x] Widget drag-and-drop reorder wired up (`DashboardWidgetDeck.tsx` HTML5 drag + `reorderWidgets` in `DashboardWidgetsPage`)
- [x] Widget layout load/save via `layoutGet` / `layoutSet` IPC
- [x] `DashboardWidgetsPage`, `DashboardKernelsPage`, `DashboardLogsPage` all present and routed

### Verified missing
- [ ] Dashboard preset cards NOT linked to profile store — preset cards launch compose directly, custom profiles stored separately (two sources of truth)
- [ ] Real Alpine `sleep infinity` compose stubs per preset profile
- [ ] No `setActive` / on-login actions on profiles (verified: `ProfilesPage.tsx` has `duplicateAt` but no `setActive`)

---

## Phase 2 — Docker ✅ SHIPPED (`/docker` → `live`)

- [x] Container list (5s refresh) / start / stop / restart / remove / logs modal
- [x] Images: list / pull with tag picker / remove / prune
- [x] Volumes: list / create / remove ("in use by" guard)
- [x] Networks: list / create / remove
- [x] Cleanup: prune preview with reclaim estimate + selective run
- [x] Port remap: clone container with new `-p`, stop/remove original
- [x] Install wizard: native (distro steps with sudo) / Flatpak (warning + links)
- [x] Docker Hub search + tag picker (`dockerSearch` / `dockerGetTags`)
- [x] In-container terminal (`dockerTerminal` IPC)

**Known issue (verified):** `installedFeatures` initialized to all-false at mount and only refreshed on mount + certain tab changes — install wizard may show Docker missing on page re-open after install completes mid-session. Low severity.

---

## Phase 3 — SSH ✅ SHIPPED (`/ssh` → `partial`)

- [x] Key generation (ed25519), passphrase optional
- [x] Public key display + copy button + fingerprint field
- [x] GitHub SSH test (`ssh -T git@github.com`) with output
- [x] Remote key setup via `sshSetupRemoteKey` (sshpass, password in component state only, never persisted)
- [x] `sshListDir` for remote directory browsing
- [x] `sshEnableLocal` for local SSH daemon setup
- [x] SSH bookmarks save/load from store (`ssh_bookmarks` key)
- [x] Flatpak note: `~/.ssh` needs `--filesystem=home` override (documented in `PRIVILEGE_BOUNDARY_MATRIX.md`)

### Remaining
- [ ] OS keyring integration for passphrase (later polish)
- [ ] Advanced remote file transfer UX

---

## Phase 4 — Git Environment Manager ✅ SHIPPED (`/git-config` → `live`)

Sidebar-nav panel with 5 sections:

- [x] **Overview** — 4 health score cards (Identity / Security / Performance / Compatibility) + total score + smart suggestions with one-click fix
- [x] **Identity Center** — name, email, branch quick-picks (main/master/develop), editor quick-picks (VS Code/vim/nano/emacs/nvim), profile label (Personal / Work / Open Source)
- [x] **Security Center** — SECURE / ATTENTION / RISK rows: credential helper, commit signing, SSL verify, cookie file. Inline action buttons.
- [x] **Behavior Settings** — toggle switches: Rebase on Pull, Auto Prune, Auto Prune Tags, Index Preload, FS Cache, Auto Stash, Commit Signing, Line Ending Mode (3-way button)
- [x] **Preset Templates** — Beginner Safe / Developer Pro / Open Source Ready / High Security / Corporate Policy (apply curated key sets in one click)
- [x] **Config Inspector** — search + category filter (Identity/Security/Performance/Advanced) + sort + risk indicators + sensitive value masking with Show/Hide
- [x] Backend `dh:git:config:set-key` with allowlist of 20 safe writable keys
- [x] Toast notifications for all actions

### Planned (later polish)
- [ ] Git Doctor: "Scan Configuration" — detect misconfigs, deprecated settings, performance bottlenecks
- [ ] Policy Lock: enforce and lock keys for corporate environments
- [ ] Visual Change Preview: diff view before apply + undo
- [ ] Backup / Restore: export / import `.gitconfig` snapshot (lives in Maintenance)

---

## Phase 5 — Monitor 🔄 PARTIAL (`/system` → `partial`)

- [x] CPU %, memory, swap, disk, load average (2s refresh from `/proc`)
- [x] Real net Mbps + disk Mbps via two-pass `/proc/net/dev` + `/proc/diskstats` delta in `AppState`
- [x] Top N processes (`ps`, strict row cap)
- [x] Listening ports table (LISTEN state filter corrected)
- [x] Security snapshot: firewall, SELinux, SSH auth, failed logins 24h, risky ports
- [x] Security drilldown: failed auth samples, risky port process owners
- [x] System info: 14 fields (hostname, OS, kernel, arch, uptime, IP, distro, shell, DE, WM, GPU, memory, packages, resolution)
- [x] GitHub commits feed widget (public API, rate-limited)

### Verified missing / issues
- [ ] Per-container Docker stats stream not wired
- [ ] LAN host discovery deferred (privacy-sensitive, intentional)
- [ ] **Bug:** `security?.riskyOpenPorts.length` at lines 230, 236, 552 — if `security` is non-null but `riskyOpenPorts` is undefined (malformed IPC response), `.length` throws. Should be `security?.riskyOpenPorts?.length`. (Low probability, medium severity.)

---

## Phase 6 — Runtimes 🔄 PARTIAL (`/runtimes` → `partial`)

### Verified shipped (17 runtimes)
Node.js, Python, Go, Rust, Java (Temurin), Bun, Zig, Dart, Flutter, Julia, PHP, Ruby, Lua, .NET, C/C++ (gcc), Octave (MATLAB), SBCL (Lisp)

- [x] Local method per runtime: nvm, pyenv (3.10+ only), rustup, Temurin tarball, Go/Dart/Flutter/Bun/Zig SDK tarballs, juliaup, system packages (PHP/Ruby/Lua)
- [x] System method: dnf / apt / pacman per runtime
- [x] Real streaming progress bars (BufReader live stdout+stderr)
- [x] `check-deps` live tool probes
- [x] `uninstall-preview` distro-aware package list
- [x] `remove-version` for isolated installs (lumina dir, nvm, pyenv, rustup, mise)
- [x] `allVersions` detection for all runtimes: Rust (rustup toolchain list), Bun (`~/.bun`), Dart (`~/.dart/dart-sdk`), Flutter (reads version file, no binary spawn), Julia (juliaup list)
- [x] Python version list filters EOL releases (only maintained 3.10+ shown)
- [x] PHP local redirects to system packages (source compile is impractical/too slow)
- [x] 4-step install wizard inside RuntimesPage (select → deps → install → verify)

### Verified missing / issues
- [ ] `removableDeps` always empty — no real dep graph implemented
- [ ] Ruby source compile via mise is slow on Fedora (no prebuilt binary backend)
- [ ] **Bug:** `uninstallPreview` useEffect deps include `removeMode` — IPC fires on every mode toggle, not just on modal open. Should debounce or split the effect. (Verified: `[showUninstallModal, selectedId, removeMode, selectedRuntime?.installed]`)

---

## Phase 7 — Maintenance 🔄 PARTIAL (`/maintenance` → `partial`)

- [x] `maintenanceGuardian.ts` — five deductive layers: Compute, Memory, Disk, Fleet (Docker), Security
- [x] `evaluateGuardian()` shared between `/maintenance` page and `GuardianSummaryWidget` (dashboard parity confirmed)
- [x] Overview: aggregate health score + per-layer tiles with accent colors
- [x] Active jobs banner pinned to footer
- [x] Diagnostics bundle: JSON export (metrics + security + job log + optional sensitive data)
- [x] Docker resource cleanup: prune containers/images/volumes with preview
- [x] Compose profile health + launch + logs
- [x] Integrity: dismissible status, in-app host probes (docker df/ps, journalctl, cache du) via whitelisted `hostExec` — no clipboard-to-terminal runbook

### Verified missing
- [ ] User-defined maintenance task checklist with cron hint display
- [ ] Backup / Restore for git config snapshot
- [ ] Extra signals on layer tiles (per-layer I/O, network throughput)

---

## Phase 8 — Settings 📋 PLANNED

- [ ] SSH Hosts / App Bookmarks — user-managed connection bookmarks (no root)
- [ ] `/etc/hosts` editor — root needed, strong warnings, "edit in terminal" fallback
- [ ] Environment variables — session env file or profile-scoped; diff preview before apply
- [ ] Theme / appearance — dark/light toggle, accent color picker (CSS variable system already in place)

---

## Phase 9 — Profiles (product-level) 🔄 PARTIAL (`/profiles` → `stub`)

### Verified shipped
- [x] Profiles load from store (`custom_profiles` key)
- [x] Add / delete / export (JSON copy) / import
- [x] `duplicateAt` — duplicate a profile
- [x] Template list (local, user-defined)

### Verified missing
- [ ] `setActive` — no active profile concept implemented
- [ ] On-login actions (start compose stacks, open dashboard layout)
- [ ] Link Dashboard preset cards to this same store (two sources of truth currently)
- [ ] Per-profile runtime set
- [ ] Per-profile environment variable overrides

---

## Phase 10 — Extensions 📋 PLANNED

- [ ] Extension model v0: extra widgets + optional IPC namespaces from signed/allowlisted folder
- [ ] No arbitrary binary download at v0
- [ ] Versioned API + marketplace — after v0 stable

---

## Phase 11 — First-run Wizard 🔄 PARTIAL (mostly shipped)

### Verified shipped (6 steps, all implemented)
- [x] Step 0: Welcome
- [x] Step 1: Environment Check (Flatpak vs native detection, dual-strategy explanation)
- [x] Step 2: Docker Connectivity check + Retry button
- [x] Step 3: Git Setup (name / email / sandbox-vs-host target)
- [x] Step 4: SSH Key Generation (ed25519, shows pubkey for GitHub)
- [x] Step 5: Finish — "Show again next launch" checkbox, stores `wizard_state`
- [x] Wizard auto-shows on first launch (`App.tsx` checks `wizard_state`)
- [x] Each step has Skip option

### Verified missing
- [ ] "Pick starter profile" step not in wizard (jumps from SSH → Finish)
- [ ] No Help menu entry to re-open wizard (AppShell has no `showWizard` wiring)

---

## Phase 12 — Advanced Source Control (GitHub & GitLab) 📋 PLANNED

- [ ] Auth: secure PAT / OAuth storage for GitHub and GitLab
- [ ] Interactive VC: visual commit / push / pull / sync + branch management
- [ ] Cloud dashboards: PRs/MRs, Issues, CI/CD pipeline status, Releases & Tags
- [ ] Repository widgets: local repo summary + cloud notifications (mentions, failed pipelines)

---

## Phase 13 — Theme Surface Rollout 📋 PLANNED

Generalize Maintenance's visual language. One route per PR, page root class + `*Page.css`.

Priority order (from `docs/THEME_ROLLOUT_PLAN.md`):

| Priority | Route | Rationale |
|----------|-------|-----------|
| 1 | `/system` | Same health story as Maintenance; metric pills fit naturally |
| 2 | `/docker` | High traffic; tables + toolbar + card elevation |
| 3 | `/git-config` | Feature-rich; hero + section rails reduce visual noise |
| 4 | `/runtimes` | Tiles + status panels match the new language |
| 5 | `/dashboard` | Do after patterns stabilize |
| 6 | AppShell | Optional — only after per-page patterns proven |

Reusable blocks extracted from Maintenance pilot: Hero, Tab rail, elevated `hp-card`, KPI pill chips, accent-bordered grid tiles, toolbar row, dark inset log panel.

---

## Phase 14 — Flatpak & Release Gate 📋 PLANNED

From [`docs/FLATHUB_CHECKLIST.md`](docs/FLATHUB_CHECKLIST.md):

- [ ] Application ID: `io.github.karimodora.LinuxDevHome`
- [ ] AppStream metadata: license, summary, screenshots
- [ ] Desktop entry + original icon (no Microsoft / VS Code trademarks)
- [ ] Flatpak manifest reproducible with `flatpak-builder`
- [ ] All `finish-args` documented (Docker socket, host exec bridges)
- [ ] OARS / content rating in AppStream
- [ ] Offline variant: regenerate `flatpak/generated-sources.json` after `pnpm-lock.yaml` changes
- [ ] Smoke-tested on Fedora Silverblue (immutable) + one traditional distro
- [ ] Flatpak CI job in GitHub Actions (add before Flathub submission)
- [ ] `pnpm smoke` green on final `main`
- [ ] Manual B5 test checklist completed (`STABILIZATION_CHECKLIST.md`)
- [ ] **No `git tag` / GitHub Release** until maintainer explicitly declares product-complete

---

## Known Bugs (verified against actual code)

| # | Page | Bug | Status | Severity |
|---|------|-----|--------|----------|
| 1 | GitConfigPage | Mask toggle inverted (PAGE_AUDIT) | ✅ FIXED — new implementation is correct | — |
| 2 | DockerPage | `installedFeatures` never refreshed post-install | 🔄 PARTIAL — called on mount + tab change, not on install completion | Medium |
| 3 | RegistryPage | Placeholder `octocat/Hello-World` in prod | ✅ FIXED — string not found in current code | — |
| 4 | RegistryPage | Docker Hub link broken for official images | ❓ UNVERIFIED — needs manual check | Low |
| 5 | MonitorPage | `security?.riskyOpenPorts.length` crashes if riskyOpenPorts undefined | ⚠ REAL — should be `security?.riskyOpenPorts?.length` at lines 230, 236, 552 | Medium |
| 6 | MaintenancePage | `memPct`/`diskPct` from null `m` | ✅ FIXED — variable not found in current code | — |
| 7 | RuntimesPage | `uninstallPreview` IPC fires on every `removeMode` toggle | ⚠ REAL — confirmed by deps `[showUninstallModal, selectedId, removeMode, ...]` | Low |
| 8 | SystemPage | `setInterval` not stored → cleanup leak | ✅ FIXED — `const t = setInterval(...)` + `return () => clearInterval(t)` present | — |
| 9 | DashboardKernelsPage | `colorFor()` uses `==` not `===` | ✅ FIXED — function uses `===` in current code | — |

**Real bugs to fix: #5 (MonitorPage) and #7 (RuntimesPage).**

---

## Navigation Structure

Current: Dashboard, Monitor, Docker, SSH, Git Config, Terminal, Runtimes, Registry, Profiles, Maintenance

Planned grouping when nav grows:

```
▸ Develop   → /runtimes, /git-config, /ssh, /registry, /terminal
▸ Operate   → /docker, /maintenance, /profiles
▸ System    → /dashboard, /system
▸ Settings  → /settings, /extensions, /wizard
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Flatpak can't run `sudo` / package managers | Honest UI + "open in host terminal" as last resort. `PRIVILEGE_BOUNDARY_MATRIX.md`. |
| Security: host exec | Rust allowlists + timeouts + user confirmation for destructive ops. |
| Scope explosion | Vertical slices; one route per PR for theme rollout. |
| PHP/Ruby source compile fragility | PHP redirects to system packages. Ruby on Fedora is slow (no prebuilt mise backend). |
| Flutter startup lock | Reads `$FLUTTER_ROOT/version` file — never spawns `flutter` binary for status. |

---

## Execution Order (updated)

```
✅  Phase 0  — Foundations
✅  Phase 2  — Docker (live)
✅  Phase 3  — SSH (core)
✅  Phase 4  — Git Environment Manager (live)
✅  Phase 5  — Monitor (partial)
✅  Phase 6  — Runtimes — 17 languages (partial)
✅  Phase 7  — Maintenance / Guardian (partial)
🔄  Phase 11 — First-run Wizard (5/6 steps done; missing profile-pick step + Help entry)
🔄  Phase 1  — Dashboard (9 cards done; missing store link + compose stubs)
🔄  Phase 9  — Profiles (CRUD done; missing setActive, on-login, store unification)
📋  Phase 8  — Settings
📋  Phase 12 — Cloud Git (GitHub / GitLab)
📋  Phase 13 — Theme surface rollout (Monitor → Docker → Git → Runtimes → Dashboard)
📋  Phase 10 — Extensions
📋  Phase 14 — Flatpak + Release Gate
```
