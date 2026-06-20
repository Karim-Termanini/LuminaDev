# CORRECTED FINAL AUDIT REPORT — KeelDev

**Supersedes:** First-pass independent audit (`auditBig.md` narrative; partial counts in early P13 docs).  
**Date:** 2026-06-19 (re-verification pass)  
**Method:** Source read + `pnpm test` / `cargo test` guards (`ipcSchemaCoverage.test.ts`, `ipc_contract_tests.rs`, domain `*_smoke.rs`).

> **Note:** This report uses the **independent verification** ID scheme (C1–C3 critical, M1–M10 medium, L1–L5 low). The 2026-06-02 consolidated audit in [`AUDIT.md`](./AUDIT.md) §15 uses a **different** C1 (editor `sh -c` security) and different L1–L4 (dead files / credentials). Cross-reference both tables when triaging.

---

## Retracted findings

| Original finding | Status | Correction |
| --- | --- | --- |
| **C1:** 27% Zod schema gap (36/133 uncovered) | ❌ **RETRACTED** | Coverage is **100%**. `IPC_REQUEST_SCHEMAS` in [`ipcSchemaMap.ts`](../packages/shared/src/ipcSchemaMap.ts) maps all **133** dispatcher channels: **104** with dedicated payload schemas, **29** with `EmptyRequestSchema` (correct for no-payload list/status/check channels). Guard: [`ipcSchemaCoverage.test.ts`](../packages/shared/test/ipcSchemaCoverage.test.ts). |
| **M10:** Schema naming gaps (`gitVcsStatus`, `sessionInfo`, conflict hunks) | ❌ **RETRACTED** | `GitVcsStatusRequestSchema` exists in `schemas.ts`; `GitVcsConflictHunksRequestSchema` in `schemas.ts`; `SessionInfoRequestSchema` in `foundation.ts` (alias of `EmptyRequestSchema`). All wired in `ipcSchemaMap.ts`. |

**Why C1 was wrong:** Early manual counts tallied exported `*RequestSchema` names only — missing `ipcSchemaMap.ts`, alias schemas, `foundation.ts` job/session schemas, and `EmptyRequestSchema` for no-payload channels. See [`SCHEMA_COVERAGE_ANALYSIS.md`](./SCHEMA_COVERAGE_ANALYSIS.md) §Prior audit discrepancy.

---

## Confirmed findings (both passes)

### Critical

| ID | Finding | Status | Evidence / fix |
| --- | --- | --- | --- |
| **C2** | `blockedSharedDeps` hardcoded `[]` in runtime uninstall preview | ✅ **Fixed** | `runtime_remove.rs` calls `runtime_preview_blocked_shared_deps_for_runtime` when `removeMode === runtime_and_deps`; deps = installed runtime deps − autoremove candidates (`runtime_packages.rs`); UI warning in `RuntimeUninstallModal.tsx` |
| **C3** | Audit claimed **24** `ipc_invoke` bypasses | ✅ **Fixed + retracted** | **0** renderer bypasses today. P12 fixed **1** real bypass (`SettingsUpdate.tsx` → `window.dh.appUpdateCheck()`). The **24** figure miscounted `window.dh.*` (correct bridge) and `listen('dh:terminal:*')` (events). Canonical: [`IMPLEMENTATION_SUMMARY_P11_P13.md`](./IMPLEMENTATION_SUMMARY_P11_P13.md) §P12. Verify: `rg "invoke\\(['\\\"]ipc_invoke" apps/desktop/src/renderer` → no matches. |

### Medium

| ID | Finding | Status | Evidence / fix |
| --- | --- | --- | --- |
| **M1** | Terminal PTY documented as line-buffered | ✅ **Docs fixed** | Real `portable_pty` 0.8 in `terminal_pty.rs` (`native_pty_system`, `PtySize`, `MasterPty`, resize); xterm.js renderer. `STABILIZATION_CHECKLIST.md` L200, `README.md`, `INSTALL_TEST.md`, `ROUTE_STATUS.md` `/terminal` row |
| **M2** | Stale IPC count (134/137) | ✅ **Docs fixed** | **138** `dh:*` strings in `ipc.ts`; guard `ipcSchemaCoverage.test.ts`. Do not cite 134/137 — see `SCHEMA_COVERAGE_ANALYSIS.md` |
| **M3** | Route count / missing routes | ✅ **Docs fixed** | **20** `<Route>` in `App.tsx`; `/` redirect + `/system-readiness` in `ROUTE_STATUS.md` and `AUDIT.md` §7 |
| **M4** | Git VCS channel count (claimed 28) | ✅ **Docs fixed** | **25** `dh:git:vcs:*`; **16** UI-active (`window.dh.gitVcs*` in `pages/`); **9** legacy (Pro Git UI removed, contract tests) — `CLAUDE.md`, `SCHEMA_COVERAGE_ANALYSIS.md` |
| **M5** | Rust `.rs` file count | ✅ **Docs fixed** | **62** under `src-tauri/src` (59 Phase 17 + 3 test/support modules) |
| **M6** | Vitest file count | ✅ **Docs fixed** | **74** total — desktop **67** (**65** `*.test.ts` + **2** `*.test.tsx`) + **7** shared; `*.test.ts`-only count is **72** (undercounts) |
| **M7** | Mixed schema metrics in docs | ✅ **Docs fixed** | **`SCHEMA_COVERAGE_ANALYSIS.md` rewritten** — **133/133** authoritative; retired 54/70/137; export count **106** informational only |
| **M8** | Data-science scaffolding attributed to `/profiles` | ✅ **Docs fixed** | `dataScienceCreateWizard.ts` imported only by `CreateProjectModal.tsx` + `useDashboardMainPage.tsx` on `/dashboard`; `README.md`, `ROUTE_STATUS.md`, `MASTER_PLAN.md` |
| **M9** | First-call monitor disk/net metrics return `0.0` | ✅ **Fixed** | `METRICS_PRIME_MS` (300ms) baseline in `monitor_handlers.rs` for CPU/net/disk deltas; `metrics_tests`; `STABILIZATION_CHECKLIST.md` corrected (not “always 0”) |

### Low

| ID | Finding | Status | Evidence / fix |
| --- | --- | --- | --- |
| **L1** | Compose “8/9 stub-only” doc claim | ✅ **Docs fixed** | **7/9** real base stacks; **game-dev** partial (`redis` + stub `game-server`); **empty** `services: {}` — `MASTER_PLAN.md`, `phasesPlan.md`, `STATUS.md` |
| **L2** | `bash -c` / `bash -lc` host subprocess usage | ✅ **Verified** | **8+** `bash -c` sites: `host_exec.rs`, `executor.rs`, `ssh_handlers.rs`, `store_engine.rs`, `system_info.rs`, `monitor_handlers.rs`; `bash -lc` in `runtime_install.rs` + other `runtime_*` — inventory in `CLAUDE.md` |
| **L3** | Production `unwrap()` / `expect()` (3 calls) | ✅ **Verified** | 2× `serde_json::to_string_pretty` on hardcoded `json!()` in `web_dev.rs` / `mobile.rs`; `build().expect` in `lib.rs` — credential store path uses `map_err` |
| **L4** | No Rust integration tests for critical domains | ✅ **Fixed** | `tests/*_smoke.rs`: compose, git_vcs, monitor, ssh, terminal_pty, cloud_auth + `docker_smoke.rs`; wired in `ci.yml` + `smoke-tests.yml` |
| **L5** | `ComposeProfile` list duplicated | ✅ **Fixed** | Single source: `composeProfiles.ts` → `ComposeProfileSchema` |

---

## Authoritative metrics (2026-06-20)

| Metric | Value | Guard |
| --- | --- | --- |
| `IPC` channel strings | **138** | `ipc.ts`; `node -e "…matchAll(/'dh:[^']+'/g)…"` |
| Dispatcher channels | **133** | `ipc_invoke` + `ipc_send` |
| Zod map coverage | **133/133** (100%) | `ipcSchemaCoverage.test.ts` |
| Raw `invoke('ipc_invoke')` in renderer | **0** | grep / P12 |
| `<Route>` declarations | **20** | `rg -c '<Route ' apps/desktop/src/renderer/src/App.tsx` |
| `dh:git:vcs:*` channels | **25** (**16** UI-active, **9** legacy) | `ipc.ts`; `rg -o 'window\.dh\.gitVcs\w+' apps/desktop/src/renderer/src/pages` |
| Rust `.rs` files | **62** | `find apps/desktop/src-tauri/src -name '*.rs' \| wc -l` |
| Largest Rust modules | **709** / **1,099** / **834** | `wc -l apps/desktop/src-tauri/src/{lib.rs,system_info.rs,runtime_jobs.rs}` |
| Vitest files | **74** (**67** desktop + **7** shared) | `find apps/desktop packages/shared/test \( -name '*.test.ts' -o -name '*.test.tsx' \)` — not `*.test.ts` only (**72**) |
| Compose presets | **9** dirs; **7** real + partial + empty | `docker/compose/` |

---

## Summary v3 — command-run verification (2026-06-19)

Re-ran gates on branch `doc/new-core-ai-plan` after schema/dist/compose fixes (`6d36da8`, `c0879d9`).

### BUILD / CI (was failing → green)

| Finding | Severity (v3) | Status | Evidence |
| --- | --- | --- | --- |
| `pnpm build` fails (17 shared type errors) | CRITICAL | ✅ **Fixed** | P10 `*RequestSchema` restored in `schemas.ts`; `pnpm build` green |
| `pnpm typecheck` fails (22 errors) | CRITICAL | ✅ **Fixed** | `pnpm typecheck` green (shared + desktop) |
| `pnpm lint` fails (2 errors) | HIGH | ✅ **Fixed** | 0 errors; 6 `react-hooks/exhaustive-deps` warnings remain (Git Assistant — LOW) |
| `dist/` stale vs source | CRITICAL | ✅ **Fixed** | Shared `test` runs `pnpm build` first; `ipcSchemaSourceDistParity.test.ts` |
| Desktop tests pass on stale dist | HIGH | ✅ **Fixed** | Desktop `test` builds shared first; parity guard |
| `cargo test` compose `PROJECT_DIR` | MEDIUM | ✅ **Fixed** | `compose_smoke.rs` sets `PROJECT_DIR` temp dir |

### SOURCE bugs (was failing → fixed)

| Bug | Severity (v3) | Status | Fix |
| --- | --- | --- | --- |
| `ProfileCredentialsIdRequestSchema` undefined at `schemas.ts:1069` | CRITICAL | ✅ **Fixed** | Defined at `schemas.ts:503`; alias at `:1150` |
| 21 nonexistent `ipcSchemaMap` imports | CRITICAL | ✅ **Fixed** | All payload schemas restored; map compiles against source |
| `BASE_TEMPLATES` undefined in profiles smoke | HIGH | ✅ **Fixed** | `COMPOSE_PROFILES` exported from `index.ts`; shared build before desktop vitest |
| Git Assistant ref-in-cleanup hooks | LOW | ⏸ **Open** | 4 warnings — intentional epoch guards; not release blockers |

### Documentation (v3 audit items)

| Doc error | Status |
| --- | --- |
| IPC 134/137 vs **138** | ✅ Fixed — `SCHEMA_COVERAGE_ANALYSIS.md`, `AUDIT.md` §15.5 |
| Terminal “line-buffered” vs real PTY | ✅ Fixed — `STABILIZATION_CHECKLIST.md` |
| Git VCS **28** vs **25** | ✅ Fixed — `CLAUDE.md`, `SCHEMA_COVERAGE_ANALYSIS.md` |
| Rust **59** vs **62** `.rs` | ✅ Fixed — historical 59 at Phase 17; **62** current (+3 test/support) |
| Vitest **62/66** vs **74** | ✅ Fixed — **67** desktop (**65** `.test.ts` + **2** `.test.tsx`) + **7** shared |
| Routes **19** vs **20** | ✅ Fixed — `/system-readiness` in `ROUTE_STATUS.md`, `AUDIT.md` §7 |
| “24 bypasses” vs **0** | ✅ Retracted — P12 fixed **1**; miscount documented in `MASTER_PLAN.md` |
| Data-science scaffold on Profiles | ✅ Fixed — `/dashboard` in `README.md`, `ROUTE_STATUS.md` |
| “8/9 compose stubs” | ✅ Fixed — **7/9** real + game-dev partial + empty |
| Schema counts 54/70/91 inconsistent | ✅ Retired — **133/133** authoritative in `SCHEMA_COVERAGE_ANALYSIS.md` |

### Verified true (unchanged)

| Claim | Status |
| --- | --- |
| `cargo check` clean | ✅ 0 errors, 0 warnings |
| Real PTY (`portable-pty` 0.8) | ✅ `terminal_pty.rs` |
| Real GitHub API update check | ✅ `reqwest` in update flow |
| `/proc` metrics live | ✅ `monitor_handlers.rs` + `METRICS_PRIME_MS` |
| Runtime check-deps probes host | ✅ `runtime_packages.rs` |
| Git Doctor 9 parallel checks | ✅ `git_doctor.rs` |
| 0 `@ts-ignore` / `@ts-expect-error` | ✅ grep |
| 0 `TODO`/`FIXME`/`HACK`/`XXX` in TS | ✅ grep |
| 0 renderer `invoke('ipc_invoke')` | ✅ grep |
| **14** Settings tabs | ✅ `SettingsShell.tsx` `NAV` array |
| **14** i18n namespaces | ✅ `locales/en-US/` |
| **9** compose presets in schema | ✅ `composeProfiles.ts` |
| Extensions/widgets removed | ✅ no routes |
| `lib.rs` thin dispatcher (~709 lines, 2026-06-20) | ✅ |
| Largest Rust modules | ✅ `system_info.rs` **1,099**, `runtime_jobs.rs` **834** (`wc -l` 2026-06-20) |

### Gate commands (all green @ 2026-06-19)

```bash
pnpm typecheck && pnpm build && pnpm lint && pnpm test
cd apps/desktop/src-tauri && cargo check && cargo test
```

| 8 ESLint hook warnings (Git Assistant) | ⏸ **Open** | `react-hooks/exhaustive-deps` on epoch refs — non-blocking |

### Closure vs `main` (PR #138)

These items were **unfixed on `main`** at audit time and are **fixed on `doc/new-core-ai-plan`**:

| Item | On `main` | On branch |
| --- | --- | --- |
| IPC **134/137** vs **138** | Stale in several docs | ✅ `SCHEMA_COVERAGE_ANALYSIS.md`, `CLAUDE.md`, `AUDIT.md` |
| Routes **19** vs **20** | Missing `/system-readiness` | ✅ `ROUTE_STATUS.md`, `README.md` |
| Git VCS **28** vs **25** | Stale | ✅ `SCHEMA_COVERAGE_ANALYSIS.md`, `CLAUDE.md` |
| Rust **59** vs **62** `.rs` | Stale (59 = Phase 17 baseline) | ✅ Historical 59 noted; **62** current |
| Vitest **62/66** vs **74** | Stale | ✅ **67** desktop (**65** `.test.ts` + **2** `.test.tsx`) + **7** shared |
| Terminal “line-buffered” | `STABILIZATION_CHECKLIST.md` | ✅ Real `portable_pty` documented |
| “**24** bypasses” | Miscount in early audits | ✅ Retracted; **0** bypasses; `MASTER_PLAN.md` L26 explains |
| README scaffold on Profiles | Wrong route | ✅ Dashboard row; Profiles says “no scaffolding” |
| `blockedSharedDeps: []` hardcoded | Was empty stub | ✅ `runtime_remove.rs` calls `runtime_preview_blocked_shared_deps_for_runtime` |
| First-call disk/net **0.0** | No prime sample | ✅ `METRICS_PRIME_MS` (300ms) in `monitor_handlers.rs` |
| `pnpm build` / source–dist drift | Broken | ✅ P10 schemas restored + parity test |

---

## Deferred (not bugs)

| Item | Notes |
| --- | --- |
| Bridge `.parse()` on every `desktopApiBridge` invoke | Post-P10 follow-up; schemas exist |
| Response `*ResponseSchema` Zod | Out of P10 scope |
| `game-dev` `game-server` stub service | Doc-correct only; optional product work |
| AppImage E2E on clean VM | Release gate (Tier 3) |

---

## Verification commands

```bash
cd packages/shared && pnpm test   # build + ipcSchemaCoverage + source/dist parity
cd apps/desktop/src-tauri && cargo test ipc_contract_tests -- --nocapture
cd apps/desktop/src-tauri && bash ../../../scripts/rust-domain-smoke.sh
pnpm smoke
```
