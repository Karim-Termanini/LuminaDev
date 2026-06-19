# CORRECTED FINAL AUDIT REPORT — LuminaDev

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
| **M6** | Vitest file count | ✅ **Docs fixed** | **68** total (**63** desktop + **5** shared) |
| **M7** | Mixed schema metrics in docs | ✅ **Docs fixed** | **`SCHEMA_COVERAGE_ANALYSIS.md` rewritten** — **133/133** authoritative; retired 54/70/137; export count **106** informational only |
| **M8** | Data-science scaffolding attributed to `/profiles` | ✅ **Docs fixed** | `dataScienceCreateWizard.ts` imported only by `CreateProjectModal.tsx` + `useDashboardMainPage.tsx` on `/dashboard`; `README.md`, `ROUTE_STATUS.md`, `MASTER_PLAN.md` |
| **M9** | First-call monitor disk/net metrics return `0.0` | ✅ **Fixed** | `METRICS_PRIME_MS` (300ms) baseline in `monitor_handlers.rs` for CPU/net/disk deltas; `metrics_tests`; `STABILIZATION_CHECKLIST.md` corrected (not “always 0”) |

### Low

| ID | Finding | Status | Evidence / fix |
| --- | --- | --- | --- |
| **L1** | Compose “8/9 stub-only” doc claim | ✅ **Docs fixed** | **7/9** real base stacks; **game-dev** partial (`redis` + stub `game-server`); **empty** `services: {}` — `MASTER_PLAN.md`, `phasesPlan.md`, `STATUS.md` |
| **L2** | Monitor security uses `bash -c` for two probes | ✅ **Verified** | `monitor_handlers.rs` — `sshd -T \| awk` and `journalctl \| grep \| wc -l` pipelines only; other probes use direct `Command`; `CLAUDE.md`, `AUDIT.md` §15.5 |
| **L3** | Production `unwrap()` / `expect()` (4 calls) | ✅ **Verified** | 2× `serde_json::to_string_pretty` on hardcoded `json!()` in `web_dev.rs` / `mobile.rs`; `build().expect` in `lib.rs`; `app_data_dir().expect` in `profile_credentials.rs` — all benign |
| **L4** | No Rust integration tests for critical domains | ✅ **Fixed** | `tests/*_smoke.rs`: compose, git_vcs, monitor, ssh, terminal_pty, cloud_auth + `docker_smoke.rs`; wired in `ci.yml` + `smoke-tests.yml` |
| **L5** | `ComposeProfile` list duplicated | ✅ **Fixed** | Single source: `composeProfiles.ts` → `ComposeProfileSchema` |

---

## Authoritative metrics (2026-06-19)

| Metric | Value | Guard |
| --- | --- | --- |
| `IPC` channel strings | **138** | `ipc.ts`; `node -e "…matchAll(/'dh:[^']+'/g)…"` |
| Dispatcher channels | **133** | `ipc_invoke` + `ipc_send` |
| Zod map coverage | **133/133** (100%) | `ipcSchemaCoverage.test.ts` |
| Raw `invoke('ipc_invoke')` in renderer | **0** | grep / P12 |
| `<Route>` declarations | **20** | `rg -c '<Route ' apps/desktop/src/renderer/src/App.tsx` |
| `dh:git:vcs:*` channels | **25** (**16** UI-active, **9** legacy) | `ipc.ts`; `rg -o 'window\.dh\.gitVcs\w+' apps/desktop/src/renderer/src/pages` |
| Rust `.rs` files | **62** | `find apps/desktop/src-tauri/src -name '*.rs' \| wc -l` |
| Vitest files | **68** (**63** + **5**) | `find` desktop + `packages/shared/test` |
| Compose presets | **9** dirs; **7** real + partial + empty | `docker/compose/` |

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
cd packages/shared && pnpm exec vitest run test/ipcSchemaCoverage.test.ts
cd apps/desktop/src-tauri && cargo test ipc_contract_tests -- --nocapture
cd apps/desktop/src-tauri && cargo test compose_smoke git_vcs_smoke monitor_smoke ssh_smoke terminal_pty_smoke cloud_auth_smoke -- --nocapture
pnpm smoke
```
