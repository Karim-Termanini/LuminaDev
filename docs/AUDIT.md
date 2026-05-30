# LuminaDev — Consolidated Audit Report

> **Architectural notice:** LuminaDev is a **Full Hosted** environment manager. It is explicitly **NOT isolated** and does not use strict sandboxing (like cgroups or Docker-based build isolation) by design.

**Last updated:** 2026-05-30  
**Primary pass:** 2026-05-28 (source-verified against `phasesPlan.md`, `CONTRIBUTING.md`, `README.md`)  
**Merged sources:** former `AUDIT_2026-05.md`, `docs/DOCS_AUDIT_2026-04.md`, `docs/PAGE_AUDIT.md` (all deleted after consolidation)

**Methodology:** Claims cross-checked by reading Rust modules, renderer pages, i18n locales, routing, IPC dispatch, and referenced docs. Line counts and module inventories verified against filesystem.

**Planning context:** Active backlog → [`MASTER_PLAN.md`](./MASTER_PLAN.md). Phase history → [`phasesPlan.md`](../phasesPlan.md). Route truth → [`ROUTE_STATUS.md`](./ROUTE_STATUS.md).

---

## 1. Executive Summary

| Status | Count (2026-05-28 pass) |
| --- | --- |
| ✅ VERIFIED FIXED / RESOLVED | 56+ |
| ⚠️ PARTIALLY FIXED | 2 |
| ❌ STILL OPEN | 4 → mostly closed by 2026-05-30 |
| 🆕 NEW FINDINGS (that pass) | 9 |

### Current open items (2026-05-30)

| Priority | Item | Status |
| --- | --- | --- |
| P0 | AppImage release pipeline E2E on clean VM | ❓ Unverified |
| P2 | Settings hosts/env file editing | ✅ Done (System tab: pkexec hosts write, ~/.profile editor) |
| P2 | Runtimes install matrix hardening | 📋 Planned |
| P2 | Git VCS polish / simple mode | 📋 Planned |

### Removed from scope (2026-05-29)

- Settings **Extension** tab / plugin marketplace
- Dashboard **widget** catalog, deck, layout IPC (`layoutGet`/`layoutSet`)

---

## 2. Architectural Integrity

### 2.1 `lib.rs` Monolith — ✅ VERIFIED FIXED

**Checked:** `apps/desktop/src-tauri/src/lib.rs` — **~677 lines** (phasesPlan claims vary ±1–14 lines; within refactor goal).

| Metric | phasesPlan claim | **Actual (2026-05-28)** |
| --- | --- | --- |
| Total lines | 691 | **677** |
| Non-test dispatcher | 308 | ~282 (lines 68–242) |
| ipc_invoke arms | 52 | **~65 channel strings** (some `\|`-grouped) |
| Domain modules | 14 | **30 `.rs` files** (incl. `cloud_auth/` subdir with 7) |

Dispatcher clean: zero inline business logic; all arms are one-line delegations. ✅

**Module inventory:** `cloud_auth/{mod,github,gitlab,helpers,remotes,store,types}.rs`, `cloud_git_ipc.rs`, `compose_engine.rs`, `compose_profiles.rs`, `docker_engine.rs`, `docker_ext.rs`, `executor.rs`, `git_vcs_file_diff.rs`, `git_vcs_ipc.rs`, `git_vcs_network.rs`, `git_vcs_repo_state.rs`, `host_exec.rs`, `ipc_contract_tests.rs`, `profile_credentials.rs`, `profile_engine.rs`, `project_scaffold.rs`, `readiness.rs`, `readiness_ipc.rs`, `runtime_jobs.rs`, `runtime_packages.rs`, `runtime_paths.rs`, `runtime_prune_contract_tests.rs`, `runtime_verify.rs`, `runtime_versioning.rs`, `state.rs`, `store_engine.rs`, `system_info.rs`, `terminal_pty.rs`, `utils.rs`.

### 2.2 `removableDeps` — ✅ VERIFIED FIXED

**Checked:** `runtime_packages.rs` — `runtime_preview_removable_deps()` runs real dry-runs (`apt-get -s`, `dnf --assumeno`, `pacman -Rns`, `zypper --dry-run`). Empty-array stub behavior gone. ✅

### 2.3 phasesPlan.md Phase 16 duplicate — ✅ FIXED (2026-05-28)

Second duplicate execution-order entry renamed to **Phase 17 — lib.rs Monolith Refactoring**, marked completed.

---

## 3. Settings Architecture — ✅ VERIFIED

`SettingsPage.tsx` re-exports `settings/SettingsShell.tsx`. **14 tabs** shipped (Resources and Extension removed).

| Tab | Verdict |
| --- | --- |
| Personalization, Remote, System, Accounts, General, Update | ✅ Live |
| App Engine, Builder, Beta Features, Notification, Shortcuts | ✅ Live |
| Help & About, Date/Time, Languages | ✅ Live |
| Resources | ❌ REMOVED — no Rust enforcement for sliders |
| Extension | 🚫 REMOVED 2026-05-29 |

---

## 4. CPU Resource Limit Enforcement — ❌ RESOLVED (tab removed)

`SettingsResources` tab removed. `cpuLimitPercent` / `ramLimitMb` had no general runtime effect. `executor.rs` uses hardcoded defaults for install-step env vars (`CARGO_BUILD_JOBS`, `GOMEMLIMIT`, etc.). Meaningful concurrency control remains in **App Engine → thread pool size**.

---

## 5. IPC Dispatcher Completeness — ✅ VERIFIED

All `ipc_invoke` arms delegate to domain modules. Zero business logic inline. Key checks:

- `dh:perf:snapshot` — real elapsed time, not hardcoded 150ms ✅
- `dh:app:update:check` — real GitHub API ✅
- `dh:store:set` — accepts `value` and `data` ✅
- `app_engine_settings` — immediate atomic updates for timeout/pool/daemon ✅

---

## 6. Static / Mock Data Audit

| Item | Verified status |
| --- | --- |
| `dh:perf:snapshot` startupMs | ✅ Real elapsed time |
| `dh:app:info` version | ✅ `CARGO_PKG_VERSION` + build date |
| GPU fallback hardcoded Intel | ✅ Returns unavailable |
| Dashboard 9 preset cards | ✅ Confirmed |
| Dashboard widgets page | 🚫 REMOVED 2026-05-29 |
| `removableDeps` empty stub | ✅ Real dry-run |
| OAuth client ID placeholders | ✅ Configurable via store |
| Per-container stats | ✅ Shipped Docker page 2026-05-29 |

---

## 7. Routing — ✅ VERIFIED

19 routes in `App.tsx`. Legacy `/git-config`, `/git-vcs`, `/cloud-git`, `/registry` redirect to `/git?tab=*`. `/dashboard/widgets` route **deleted** 2026-05-29.

`ROUTE_STATUS.md` updated: `/git` primary; old git routes marked `redirect`.

---

## 8. i18n Coverage — ✅ VERIFIED

- Locales: `en-US`, `de-DE`, `ar-SA`
- **14 namespace files** per locale (not 15 as phasesPlan once claimed)
- All `/pages/` TSX use `useTranslation()` except bootstrap wizard
- de-DE / ar-SA key parity with en-US verified 2026-05-28

---

## 9. Beta Features — ✅ VERIFIED

| Flag | Consumer |
| --- | --- |
| `enable_profile_auto_switch` | `DashboardMainPage.tsx` |
| `enable_ai_commit_suggestions` | `GitVcsPage.tsx` → commit bar |
| `enable_experimental_terminal_multiplexer` | `TerminalPage.tsx` |

---

## 10. Security Surface

### 10.1 Profiles — compose project detection — ✅ FIXED

- Removed `name: lumina-*` from compose YAML; `-p` flag is sole project name source
- `handle_profile_running_status` uses `docker compose ls --format json` exact match
- Multi-profile simultaneous run supported; empty profile fallback on last stop

### 10.2 sshpass — ✅ FIXED

`exec_sshpass_ssh` uses `sshpass -e` + `SSHPASS` env — not `-p` in argv.

### 10.3 Runtime / Docker sudo — ✅ FIXED

No `sudo_password` over IPC; Polkit (`pkexec`) for privilege escalation.

### 10.4 `/etc/hosts` writes — ✅ FIXED

`tempfile::NamedTempFile` instead of predictable `/tmp` paths.

### 10.5 Docker install password in IPC — ✅ FIXED

`docker_engine.rs` has no password field; readiness uses `pkexec`.

### 10.6 CodeRabbit P6 remediation — ✅ DONE (2026-05-29)

SSH injection in SCP/rsync, profile credential deletion scope, optimistic profile save, Git backup JSON validation, git doctor false negatives, `vite-env.d.ts` docker cleanup signature, Zod failure schemas.

---

## 11. Flatpak & Release Gate — ABANDONED (2026-05-28)

Flathub/Flatpak pathway removed. Distribution: **GitHub Releases / AppImage only**.

Remaining release blocker: **AppImage E2E verification on clean VM** (see [`MASTER_PLAN.md`](./MASTER_PLAN.md) §4 P5).

---

## 12. Documentation Accuracy (2026-05-28 pass)

| Area | Status |
| --- | --- |
| phasesPlan.md line counts / duplicate phases | ✅ Mostly fixed 2026-05-28 |
| ROUTE_STATUS.md `/git` + redirects | ✅ Fixed |
| README Quality Gate Policy (Docker-only legacy) | ✅ Rewritten |
| README "30 domain modules" | ✅ Corrected to ~33 |
| CONTRIBUTING.md claims | ✅ Accurate |
| Referenced docs exist | ✅ Verified |

Historical docs audit (2026-04): see **Appendix A**.

---

## 13. Priority Recommendations — Final Status

| Priority | Action | Status |
| --- | --- | --- |
| P0 | sshpass / sudo / hosts security | ✅ Fixed |
| P0 | AppImage E2E | ❓ Open |
| P1 | ROUTE_STATUS, README, phasesPlan doc fixes | ✅ Fixed |
| P1 | Tooltip blurriness (sidebar/topbar/dashboard tabs) | ✅ Fixed |
| P2 | Extension tab | 🚫 Removed |
| P2 | Dashboard widgets | 🚫 Removed |
| P2 | Resources settings tab | ✅ Removed |
| P2 | i18n de/ar completeness | ✅ Fixed |
| P3 | Git Doctor | ✅ Shipped |
| P3 | Per-container stats | ✅ Done 2026-05-29 |

---

## 14. Known Bugs (phasesPlan table)

All **28 bugs** in [`phasesPlan.md`](../phasesPlan.md) Known Bugs table marked ✅ FIXED as of 2026-05-28/29. Spot-checks confirmed mask toggle, riskyOpenPorts optional chaining, maintenance null guards, kernels strict equality, layout_set shape (before layout IPC removal).

---

## Appendix A — Documentation Audit (2026-04)

**Scope:** Truthfulness pass over `docs/` during stabilization gate closure.

**Files reviewed (2026-04):** `APP_CREATION_PLAYBOOK.md`, `BRANCHING.md`, `COMMIT_QUALITY_RULES.md`, `INSTALL_TEST.md`, `STABILIZATION_CHECKLIST.md`.

**Removed since audit:** `DOCKER_FLATPAK.md`, `FLATHUB_CHECKLIST.md`, `PRIVILEGE_BOUNDARY_MATRIX.md` (Flatpak abandoned 2026-05-28).

**Findings and actions:**

1. **Truthfulness framing** — `README.md` uses Implemented / Partial / Planned; no marketing overclaims added.
2. **Historical vs sign-off** — Historical docs are implementation references, not release approval; stabilization checklist is active closure tracker with evidence.
3. **Placeholder content** — `INSTALL_TEST.md` repo path placeholder replaced with generic command.
4. **Process enforceability** — Added `COMMIT_QUALITY_RULES.md` and `.github/pull_request_template.md`.

**Result:** Stabilization tracker, privilege-boundary matrix, commit/PR hygiene rules, and reduced path ambiguity. **Status: complete.**

**Stabilization gate item 5 evidence:** this appendix satisfies documentation truthfulness audit requirement in [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md).

---

## Appendix B — Page Manual Verification Checklist

Use during manual QA on a real Tauri build. Legend: `[x]` verified, `[!]` was broken (see resolution), `[-]` intentionally static.

**Note:** Most `[!]` items below were **fixed before 2026-05-28** and confirmed in §14. Re-run checks after major refactors. For route maturity use [`ROUTE_STATUS.md`](./ROUTE_STATUS.md).

### Dashboard (`/dashboard`)

**DashboardMainPage**
- [ ] Docker container pills update every ~4s
- [ ] CPU/RAM/DISK metrics show real numbers
- [ ] Custom profiles load from store
- [ ] Compose profile buttons call `composeUp()` (needs Docker)
- [!→✅] "planned" profile cards disabled — intentional
- [-] Update notification card static until release channel wired

**DashboardKernelsPage**
- [ ] GPU label real or "unavailable"
- [ ] Service states (docker/ssh/nginx)
- [ ] Security snapshot
- [!→✅] `colorFor()` loose `==` — fixed (#9)

**DashboardLogsPage**
- [ ] Jobs poll ~2s; compose logs on demand
- [-] Profile selector hardcoded — intentional

**DashboardWidgetsPage** — 🚫 **REMOVED** (route + IPC deleted 2026-05-29)

### Monitor (`/system`)

- [ ] CPU/RAM/SWAP/DISK 2s refresh
- [ ] Top processes, listening ports, security snapshot
- [ ] GitHub commits feed (may rate-limit)
- [!→✅] `riskyOpenPorts` crash — fixed (#5)
- [!→✅] SystemPage `setInterval` leak — fixed (#8)

### Docker (`/docker`)

- [ ] List/actions/logs/images/volumes/networks/cleanup
- [!→✅] `installedFeatures` not refreshed — fixed (#2)

### SSH (`/ssh`)

- [ ] Generate, pubkey, GitHub test, terminal, remote setup, bookmarks
- [-] Password in component state only — intentional

### Git (`/git` — was `/git-config`, `/git-vcs`)

- [ ] Config list/set, VCS operations, Cloud Git tabs
- [!→✅] Mask toggle inverted — fixed (#1)

### Registry (redirects to `/git?tab=vcs`)

- [!→✅] Placeholder `octocat/Hello-World` — fixed (#3)
- [!→✅] Docker Hub official image links — fixed (#4)

### Profiles (`/profiles`)

- [ ] CRUD, export/import, compose up/down, multi-profile run

### Terminal (`/terminal`)

- [ ] Shell prompt, input, resize
- [-] Line-buffered (no full PTY for vim) — known limit

### Runtimes (`/runtimes`)

- [ ] Status, versions, deps, install/uninstall preview
- [!→✅] `uninstallPreview` on every toggle — fixed (#7)
- [!→✅] `removableDeps` always empty — fixed (real dry-run)

### Maintenance (`/maintenance`)

- [ ] Guardian score, systemd snapshot, prune, compose, diagnostics
- [!→✅] `memPct`/`diskPct` null — fixed (#6)

### Page audit bug summary (all resolved)

| # | Page | Bug | Resolution |
| --- | --- | --- | --- |
| 1 | GitConfigPage | Mask toggle inverted | ✅ Fixed |
| 2 | DockerPage | `installedFeatures` stale | ✅ Fixed |
| 3 | RegistryPage | Placeholder URL | ✅ Fixed |
| 4 | RegistryPage | Docker Hub link | ✅ Fixed |
| 5 | MonitorPage | riskyOpenPorts crash | ✅ Fixed |
| 6 | MaintenancePage | null metrics | ✅ Fixed |
| 7 | RuntimesPage | uninstall preview spam | ✅ Fixed |
| 8 | SystemPage | setInterval leak | ✅ Fixed |
| 9 | DashboardKernelsPage | `==` vs `===` | ✅ Fixed |

---

## Appendix C — Audit Source History

| Former file | Merged | Deleted |
| --- | --- | --- |
| `AUDIT_2026-05.md` | §1–§14 | 2026-05-30 |
| `docs/DOCS_AUDIT_2026-04.md` | Appendix A | 2026-05-30 |
| `docs/PAGE_AUDIT.md` | Appendix B | 2026-05-30 |

---

*For forward work priority, use [`MASTER_PLAN.md`](./MASTER_PLAN.md). For phase completion detail, use [`phasesPlan.md`](../phasesPlan.md).*
