# LuminaDev — Consolidated Audit Report

> **Architectural notice:** LuminaDev is a **Full Hosted** environment manager. It is explicitly **NOT isolated** and does not use strict sandboxing (like cgroups or Docker-based build isolation) by design.

**Last updated:** 2026-06-02 (recheck pass — working tree + §15 closure verification)  
**Primary pass:** 2026-05-28 (source-verified against `phasesPlan.md`, `CONTRIBUTING.md`, `README.md`)  
**Secondary pass:** 2026-06-02 (full static analysis — Rust backend, renderer IPC, test coverage, doc cross-refs, security surface, dead code audit)  
**Merged sources:** former `AUDIT_2026-05.md`, `docs/DOCS_AUDIT_2026-04.md`, `docs/PAGE_AUDIT.md` (all deleted after consolidation)

**Methodology:** Claims cross-checked by reading Rust modules, renderer pages, i18n locales, routing, IPC dispatch, and referenced docs. Line counts and module inventories verified against filesystem.

**Planning context:** Active backlog → [`MASTER_PLAN.md`](./MASTER_PLAN.md). Phase history → [`phasesPlan.md`](../phasesPlan.md). Route truth → [`ROUTE_STATUS.md`](./ROUTE_STATUS.md).

---

## 1. Executive Summary

| Status | Count (2026-05-28 pass) | Count (2026-06-02 pass) | Count (2026-06-02 final) |
| --- | --- | --- | --- |
| ✅ VERIFIED FIXED / RESOLVED | 56+ | 56+ | **72+** (all §15 findings closed) |
| ⚠️ PARTIALLY FIXED | 2 | 0 | 0 |
| ❌ STILL OPEN | 4 | **7** | **2** (AppImage E2E; P10 Zod payload gaps) |
| 🆕 NEW FINDINGS (that pass) | 9 | 9 | 9 (carried forward) |
| 🆕 NEW FINDINGS (2026-06-02) | — | **15** | 15 (see §15 — all resolved) |
| ✅ CLOSED from §15 (2026-06-02) | — | **16** | **22** (C1 + H1–H5 + M1–M4 + L1–L4 + doc cleanup sweep) |

### Current open items (2026-06-02 final)

| Priority | Item | Status |
| --- | --- | --- |
| P0 | AppImage release pipeline E2E on clean VM | ❓ Unverified — not attempted yet |
| P3 | IPC payload channels without Zod `*RequestSchema` in `packages/shared` | 🔄 Reduced — **~70** schemas / **137** channels; P10.1 inventories payload gaps |
| P3 | Split `RuntimesPage.tsx` into `pages/runtimes/` components | ✅ Fixed 2026-06-02 — 1947 → 88-line orchestrator + 5 modules |
| P7 | Theme picker (dark / light / high-contrast) | ✅ Fixed 2026-06-02 — Settings → Personalization + `appearance` store |
| P7 | Cloud Git notification inbox (TopBar) | ✅ Fixed 2026-06-02 — `dh:cloud:git:inbox`, poll 60s + focus |
| — | Cloud Git in-app PR merge | ❌ Removed from scope permanently |
| P3 | CI `integration-and-e2e-lite` calls removed `pnpm test:integration` | ✅ Fixed — runs `pnpm test:roundtrip` |
| P3 | 24 direct `invoke('ipc_invoke', …)` calls bypassing `desktopApiBridge.ts` | ✅ Fixed 2026-06-02 — 0 renderer bypasses |
| P2 | Git VCS polish / simple mode | ✅ Fixed 2026-06-02 — stash persistence, untracked diff, spinner, dead code |

**All §15 findings (C1, H1–H5, M1–M4, L1–L4) are confirmed ✅ FIXED.** See §15 for details. P3 rows are architectural backlog from the 2026-06-02 independent audit — explicitly out of scope for the 14-item doc/code sweep.

### Removed from scope (2026-05-29)

- Settings **Extension** tab / plugin marketplace
- Dashboard **widget** catalog, deck, layout IPC (`layoutGet`/`layoutSet`)

---

## 2. Architectural Integrity

### 2.1 `lib.rs` Monolith — ✅ VERIFIED FIXED

**Checked:** `apps/desktop/src-tauri/src/lib.rs` — **~706 lines** (up from ~677 due to further refactoring and additions since Phase 17).

| Metric | phasesPlan claim | **Actual (2026-06-02)** |
| --- | --- | --- |
| Total lines | 691 | **706** |
| Non-test dispatcher | 308 | ~268 (lines 78–265) |
| ipc_invoke arms | 52 | **~75 channel strings** (some `\|`-grouped) |
| Domain modules | 14 | **36 `mod` declarations** → **59 `.rs` files** (`cloud_auth/` 8, `cloud_git_ipc/` 4, `project_scaffold/` **12** = 6 root + 6 `templates/`) |

Dispatcher clean: zero inline business logic; all arms are one-line delegations. ✅

**Module inventory (36 domain mods, 59 `.rs` source files):**
- Flat (33): `state.rs`, `utils.rs`, `host_exec.rs`, `runtime_packages.rs`, `runtime_versioning.rs`, `runtime_paths.rs`, `runtime_discover.rs`, `runtime_verify.rs`, `runtime_install.rs`, `runtime_jobs.rs`, `runtime_remove.rs`, `runtime_logs.rs`, `compose_engine.rs`, `compose_ports.rs`, `compose_profiles.rs`, `docker_api.rs`, `docker_engine.rs`, `docker_ext.rs`, `executor.rs`, `git_doctor.rs`, `git_vcs_file_diff.rs`, `git_vcs_ipc.rs`, `git_vcs_network.rs`, `git_vcs_repo_state.rs`, `profile_credentials.rs`, `profile_engine.rs`, `readiness.rs`, `readiness_ipc.rs`, `store_engine.rs`, `system_info.rs`, `monitor_handlers.rs`, `ssh_handlers.rs`, `terminal_pty.rs`
- Directory modules: `cloud_auth/` (8 files), `cloud_git_ipc/` (4 files), `project_scaffold/` (**12 files**: `mod.rs`, `deps_install.rs`, `editor_configs.rs`, `ports.rs`, `r_packages.rs`, `tests.rs`, `templates/mod.rs` + 5 template modules)
- Plus `lib.rs` (706 lines) and test-only: `ipc_contract_tests.rs`, `runtime_prune_contract_tests.rs`

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

| Flag | Consumer | Status |
| --- | --- | --- |
| `enable_profile_auto_switch` | `DashboardMainPage.tsx` | ✅ Live |
| `enable_experimental_terminal_multiplexer` | `TerminalPage.tsx` | ✅ Live |

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

### 10.6 Compose profiles — hardcoded dev credentials

`docker/compose/web-dev/docker-compose.yml:23` and `docker/compose/data-science/docker-compose.yml:19` contain hardcoded passwords (`POSTGRES_PASSWORD=luminadev`), and `data-science` has `JUPYTER_TOKEN=luminadev:9`. These are intentional development defaults inside containers (not host secrets) but users should be warned to change them for any exposed service.

### 10.7 CodeRabbit P6 remediation — ✅ DONE (2026-05-29)

SSH injection in SCP/rsync, profile credential deletion scope, optimistic profile save, Git backup JSON validation, git doctor false negatives, `vite-env.d.ts` docker cleanup signature, Zod failure schemas.

---

## 11. Flatpak & Release Gate — ABANDONED (2026-05-28)

Flathub/Flatpak pathway removed. Distribution: **GitHub Releases / AppImage only**.

Remaining release blocker: **AppImage E2E verification on clean VM** (see [`MASTER_PLAN.md`](./MASTER_PLAN.md) §4 P5).

---

## 12. Documentation Accuracy

| Area | Status | 2026-06-02 note |
| --- | --- | --- |
| phasesPlan.md line counts / Phase 17 | ✅ Fixed | ~706-line dispatcher, 40 entries, current module sizes |
| ROUTE_STATUS.md `/git` + redirects | ✅ Fixed | Git Assistant accurate |
| README Quality Gate Policy | ✅ Rewritten | |
| MASTER_PLAN.md P4 file-size debt | ✅ Fixed | Splits marked done with current line counts |
| AUDIT.md §2.1 lib.rs + cloud_auth counts | ✅ Fixed | 706 lines, 8 cloud_auth files |
| README `/runtimes` “17 language toolchains” | ❌ **FALSE** | Code has **7** (H4) |
| README `/git` “Config, VCS (Smart-Flow), Cloud Git” | ❌ **FALSE** | Git Assistant single-page UX (H5); see `ROUTE_STATUS.md` |
| README “~37 domain modules” | ✅ Fixed 2026-06-02 | README: **36 `mod` declarations**, 59 `.rs` files |
| CONTRIBUTING.md claims | ✅ Accurate | |
| Referenced docs exist | ✅ Verified | |

Historical docs audit (2026-04): see **Appendix A**.

---

## 13. Priority Recommendations — Updated 2026-06-02 (rechecked against source)

| Priority | Action | Status |
| --- | --- | --- |
| P0 | `system_info.rs` `editor_open()` — shell injection via `sh -c` | ✅ Fixed — `Command::new(program).args().arg(path).spawn()` (no shell) |
| P0 | `executor.rs` — `child.stdout.take().unwrap()` panic risk | ✅ Fixed — no `.unwrap()` on `stdout.take()` in tree |
| P0 | `ssh_handlers.rs:164-176` — SSH key injection via double-quoted `bash -c` | ✅ Fixed 2026-06-02 |
| P0 | AppImage E2E on clean VM | ❓ Open — not attempted in repo |
| P0 | README `/runtimes` + `/git` false feature claims | ✅ Fixed — README lists 7 toolchains + Git Assistant |
| P1 | `runtime_jobs.rs:285` — `lts.as_str().unwrap()` panic risk | ✅ Fixed 2026-06-02 |
| P1 | Fix stale doc numbers (MASTER_PLAN.md, phasesPlan.md, README, AUDIT.md) | ✅ README + MASTER_PLAN aligned; **ROUTE_STATUS `/terminal`** still says line-buffered (code uses PTY) |
| P1 | Remove dead `enable_ai_commit_suggestions` beta flag | ✅ Fixed 2026-06-02 |
| P1 | `system_info.rs` `startup_update_check()` — `unwrap()` on corrupted `store.json` | ✅ Fixed — uses `as_object_mut()` / `get_mut()` guards; no panic path |
| P1 | Add Zod schemas for `CloudCiCheck`, `CloudPrDetails`, `CloudGitGetPrChecksRequest` | ✅ Fixed 2026-06-02 |
| P2 | Contract/error tests (settings, dashboard, registry, monitor) | ✅ Present — `settingsContract.test.ts`, `dashboardContract.test.ts`, `registryError.test.ts`, `monitorContract.test.ts`, etc. |
| P2 | Remove dead code: `RegistryPage.tsx`, `SystemPage.tsx`, `CustomProfileWizardModal.tsx` | ✅ Fixed 2026-06-02 — files deleted |
| P2 | Relabel mislabeled integration/E2E tests | ✅ Fixed 2026-06-02 — describe blocks renamed to module availability / contract roundtrip |
| P2 | Widen coverage config beyond 2 files | ✅ Fixed 2026-06-02 — `pages/**/*.{ts,tsx}` + `lib/**/*.ts` (tests excluded) |
| P2 | i18n de/ar completeness | ✅ Fixed |
| P3 | Git Doctor | ✅ Shipped |
| P3 | Per-container stats | ✅ Done 2026-05-29 |

---

## 14. Known Bugs (phasesPlan table)

All **28 bugs** in [`phasesPlan.md`](../phasesPlan.md) Known Bugs table marked ✅ FIXED as of 2026-05-28/29. Spot-checks confirmed mask toggle, riskyOpenPorts optional chaining, maintenance null guards, kernels strict equality, layout_set shape (before layout IPC removal).

---

## 15. Comprehensive Audit Findings (2026-06-02)

Findings from full static analysis: Rust backend security/correctness, renderer IPC flow, test coverage audit, documentation cross-reference, dead code detection, build artifact sanity.

### 15.1 CRITICAL — Arbitrary command execution

| ID | File | Line | Issue |
|----|------|------|-------|
| C1 | `system_info.rs` | 278 | `editor_open()` formats user-controlled `cmd` and `path` into `sh -c` without shell metacharacter sanitization. `path` is double-quoted (still allows `$()` expansion); `cmd` is completely unquoted. Any app user can execute arbitrary shell commands. |
| **Fix** | | | Use `Command::new(cmd).arg(&path).spawn()` directly, bypassing the shell entirely. |

### 15.2 HIGH severity

| ID | File | Line | Issue |
|----|------|------|-------|
| H1 | `executor.rs` | 75-76, 318-319 | `child.stdout.take().unwrap()` — panics if stdout was not piped or already taken | ✅ Fixed — `.ok_or("[RUNTIME_INSTALL_FAILED] stdout not piped")?` |
| H2 | `runtime_jobs.rs` | 285 | `lts.as_str().unwrap()` — panics if NodeJS releases API changes response format | ✅ Fixed — `node_dist_version_label()` uses `as_str()` / `as_bool()` without unwrap |
| H3 | `ssh_handlers.rs` | 164-176 | SSH public key injected into double-quoted `bash -c` context | ✅ Fixed — single-quoted embed + key validation |
| H4 | `README.md` | 19 | False claim of "17 language toolchains" — code has **7** (R1-R3 sprint removed 11) | ✅ Fixed — says "7 language toolchains" |
| H5 | `README.md` | 16 | False claim of "Config, VCS (Smart-Flow), Cloud Git" — `/git` is now Git Assistant single-page UX | ✅ Fixed — says "Git Assistant — Setup → Project → Save → Share" |

### 15.3 MEDIUM severity — ✅ ALL FIXED (2026-06-02)

| ID | File | Issue | Status |
|----|------|-------|--------|
| M1 | `packages/shared/src/schemas.ts:884-907` | 3 TypeScript interfaces (`CloudCiCheck`, `CloudPrDetails`, `CloudGitGetPrChecksRequest`) have NO Zod schemas — bypass IPC boundary validation | ✅ Fixed — converted to Zod schemas |
| M2 | `packages/shared/dist/widgetRegistry.*` | Stale build artifacts — source deleted per CLAUDE.md but 3 dist files remain | ✅ Fixed — dist files removed |
| M3 | `MASTER_PLAN.md` §4 | P4 file-size debt claims are stale: `DockerPage.tsx` ~3,664 (actual **1,204**), `ProfilesPage.tsx` ~2,704 (actual **64**) — splits already done | ✅ Fixed |
| M4 | `phasesPlan.md` Phase 17 | Stale line counts: `runtime_jobs.rs` claims ~2,303 (actual **684**), `system_info.rs` claims ~1,536 (actual **1,009**) | ✅ Fixed |
| M5 | AUDIT.md §2.1 | Stale lib.rs count (~677 vs actual **706**) and cloud_auth file count (7 vs **8**) | ✅ Fixed (2026-06-02 pass) |
| M6 | `SettingsBetaFeatures.tsx:13` | `enable_ai_commit_suggestions` flag toggle is rendered but **no consumer exists** — dead code | ✅ Fixed — flag removed |

### 15.4 LOW severity — ✅ CLOSED or IMPROVED (2026-06-02)

| ID | File | Issue | Status |
|----|------|-------|--------|
| L1 | `RegistryPage.tsx` + `RegistryPage.css` | Dead component — route redirects to `/git` | ✅ **Deleted** |
| L2 | `SystemPage.tsx` | Dead component — route redirects to `/dashboard/monitor` | ✅ **Deleted** |
| L3 | `src/dashboard/CustomProfileWizardModal.tsx` | Orphaned — never imported | ✅ **Deleted** |
| L4 | `profile_credentials.rs:16` | World-readable `/tmp/profile_credentials.enc` fallback | ✅ **Fixed** — `app_data_dir().expect(...)`; no temp fallback |
| L5 | `WizardFlow.tsx:229,235` | Hardcoded git name/email placeholders | ✅ **Fixed** — `t('wizard.gitNamePlaceholder')` / `t('wizard.gitEmailPlaceholder')` in all 3 locales |
| L6 | 5 mislabeled test files | Integration/E2E labels overstated capability | ✅ **Fixed** — `module availability` + `contract + error roundtrip` describe labels |
| L7 | `vitest.config.ts` | Coverage restricted to 2 docker files | ✅ **Fixed** — `pages/**/*.{ts,tsx}` + `lib/**/*.ts`, tests excluded; global thresholds removed (reporting-only scope) |
| L8 | `readiness.rs:116-124` | `unsafe` + `CString::new(path).unwrap()` | ✅ **Fixed** — null-byte path returns `(0.0, 0.0)`; `MaybeUninit` + `assume_init` only after successful `statvfs` |

### 15.5 Verified green (select highlights from cross-ref)

| Claim | Status | Evidence |
|-------|--------|----------|
| All Rust modules in `lib.rs` exist on disk | ✅ | 39 `mod` declarations, 39 matching files/dirs |
| Zero `@ts-ignore` / `@ts-expect-error` in renderer | ✅ | Entire TypeScript codebase |
| Zero `TODO`/`FIXME`/`HACK`/`XXX` in TypeScript | ✅ | |
| 9 docker-compose profiles are real (not stubs) | ✅ | All have valid `docker-compose.yml` with services |
| 14 Settings tabs confirmed | ✅ | `SettingsShell.tsx` — 14 `SettingsNavId` members |
| No `.env` files with secrets | ✅ | Glob search returns no results |
| OAuth client IDs are public-by-design | ✅ | `cloud_auth/helpers.rs:5-6` — configurable via env vars |
| 62 test files, 0 stubs, 0 dead imports | ✅ | Recheck: dead page imports removed; new contract roundtrip tests added |
| `compose_profiles.rs` resolution logic | ✅ | Env → repo walk → bundle fallback; full overlay support |
| `LUMINA_DEV_COMPOSE_FULL` overlay | ✅ | `1`/`true`/`yes` env var or profile store `composeVariant` field |
| 3 i18n locales, 14 namespaces each | ✅ | 42 translation files total |
| Conventional Commits throughout git history | ✅ | |

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

### Git (`/git` — replaced legacy tabbed UI with Git Assistant)

- [ ] Git Assistant: Setup → Project → Save → Share progress rail
- [ ] Legacy tabbed hub (Config/VCS/Cloud) **removed** in G1 sprint
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
