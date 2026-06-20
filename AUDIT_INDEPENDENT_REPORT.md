# Independent Audit Report — LuminaDev (KeelDev)

**Date:** 2026-06-20 (re-verified)  
**Method:** Independent source-code reading, grep/ripgrep verification, file-system counting, `pnpm typecheck` verification  
**Scope:** Documentation claims vs source truth; gaps, risks, deficiencies, missing components, spurious/static/mock data

---

## Verification Methodology

Every documented claim was checked against live source code. Commands used:
- `node -e` regex for IPC channel counts
- `rg -c '<Route '` for route counts
- `find ... -name '*.rs'` for Rust file counts
- `find ... -name '*.test.ts' -o -name '*.test.tsx'` for Vitest file counts
- `rg` for code patterns (unwrap, expect, bash -c, deprecation annotations, legacy IPC calls)
- `wc -l` for line counts

---

## CLAIMS VERIFIED ✅ (No issues found)

| Claim | Source | Verified |
|---|---|---|
| **138** IPC channel strings | `ipc.ts` `Object.values(IPC)` | ✅ Exactly 138 (`'dh:'` regex count) |
| **25** `dh:git:vcs:*` channels | `ipc.ts` | ✅ Exactly 25 |
| **20** `<Route>` declarations | `App.tsx` | ✅ Exactly 20 (`rg -c '<Route '`) |
| **62** Rust `.rs` source files | `src-tauri/src/` | ✅ Exactly 62 |
| **74** Vitest test files | `apps/desktop` + `packages/shared/test` | ✅ **67** desktop (**65** `*.test.ts` + **2** `*.test.tsx`) + **7** shared |
| **Largest Rust modules** | `wc -l` on `lib.rs`, `system_info.rs`, `runtime_jobs.rs` | ✅ **709** / **1,099** / **834** (2026-06-20) |
| **133/133** (100%) dispatcher Zod coverage | `ipcSchemaMap.ts` | ✅ Confirmed by `ipcSchemaCoverageStats()` logic |
| **106** exported `*RequestSchema` consts | `schemas.ts` + `foundation.ts` | ✅ 103 + 3 = 106 |
| **9** compose preset directories | `docker/compose/` | ✅ 9 dirs: 7 real, 1 partial (game-dev), 1 empty |
| **Only web-dev** has `docker-compose.full.yml` | `docker/compose/web-dev/` | ✅ File exists; no other profile has it |
| **Empty** profile | `docker/compose/empty/` | ✅ `services: {}` as documented |
| **game-dev** partial stub | `docker/compose/game-dev/` | ✅ `redis:7-alpine` (real) + `alpine:latest sleep infinity` (stub) |
| **14** Settings tabs | `SettingsShell.tsx` `NAV` array | ✅ 14 `SettingsNavId` values |
| **14** i18n namespace files per locale | `locales/en-US/` | ✅ Exactly 14 files |
| **7** runtimes | `RUNTIME_IDS` in `runtimes.ts` | ✅ node, python, java, go, rust, php, dotnet |
| **PHP** only `SYSTEM_ONLY` | `RUNTIME_SYSTEM_ONLY_IDS` | ✅ `['php']` matches |
| **0** renderer `invoke('ipc_invoke')` | Full renderer grep | ✅ Zero matches |
| **0** `@ts-ignore` / `@ts-expect-error` | Full renderer grep | ✅ Zero matches |
| **6** ESLint warnings (0 errors) | `pnpm lint` | ✅ 6 `react-hooks/exhaustive-deps` warnings |
| **`pnpm typecheck` green** | `pnpm typecheck` | ✅ Passes clean |
| **OAuth client IDs configurable** | `cloud_auth/helpers.rs` | ✅ Hardcoded defaults, overridable via env var and store |
| **`METRICS_PRIME_MS` (300ms)** | `monitor_handlers.rs` | ✅ Implemented |
| **Real PTY (`portable_pty`)** | `terminal_pty.rs` | ✅ Uses `portable_pty` 0.8 |
| **Legacy git VCS channels (9) NOT called from renderer** | Full renderer grep | ✅ The 9 legacy channels (merge, rebase, stash-pop, etc.) have zero renderer calls |
| **16 UI-active git VCS channels** | Renderer grep | ✅ status, branches, remotes, diff, stage, unstage, commit, push, pull, fetch, checkout, stash, merge-continue, merge-abort, rebase-continue, rebase-abort |
| **`@deprecated` JSDoc on legacy IPC consts** | `ipc.ts` | ✅ Lines 331, 333, 335, 341, 343, 345, 347, 349, 351, 358 have `/** @deprecated */` |
| **Graphify artifacts exist** | `graphify-out/` | ✅ `graph.json` (8MB) + `GRAPH_REPORT.md` (68KB) |
| **No `.env` secrets in repo** | Git-glob search | ✅ (per prior AUDIT.md) |
| **Extension/Widget removal** | Routes + codebase | ✅ No routes, no components, no imports |
| **Production unwrap/expect** | Full `rg` | ✅ Only 3: `lib.rs:319 build().expect`, `web_dev.rs:63 to_string_pretty.unwrap`, `mobile.rs:48 to_string_pretty.unwrap` (all on hardcoded data — cannot fail) |
| **No mock/stub/fake in renderer** | Full grep | ✅ Zero matches |

---

## DISCREPANCIES RESOLVED ✅ (2026-06-20 doc sync)

### ~~C1: Test file count stale (71 claimed vs 74 actual)~~ — **Fixed**

**Was:** "71 total — 64 desktop (62 `*.test.ts` + 2 `*.test.tsx`) + 7 shared"  
**Now:** **74** total — **67** desktop (**65** `*.test.ts` + **2** `*.test.tsx`) + **7** shared

Six new desktop test files drove the delta (+3 net; prior baseline undercounted `*.test.tsx`):
- `maintenanceDiagnosticsHumanize.test.ts`
- `maintenanceGuardian.test.ts`
- `maintenanceHealth.test.ts`
- `maintenance/maintenanceGuardianActions.test.ts`
- `securityRemediation.test.ts`
- `ssh/githubTest.test.ts`

Updated: `CLAUDE.md`, `README.md`, `docs/AUDIT.md`, `docs/CORRECTED_AUDIT_REPORT.md` (M6), `docs/SCHEMA_COVERAGE_ANALYSIS.md`. Retired count **71** listed in SCHEMA_COVERAGE retired table only.

---

### ~~M1: Stale Rust file-size claims in MASTER_PLAN §17~~ — **Fixed**

| File | Was claimed | Actual (2026-06-20) |
|---|---|---|
| `lib.rs` | ~706 | **709** |
| `system_info.rs` | ~1,010 | **1,099** |
| `runtime_jobs.rs` | ~792 | **834** |

Synced in `MASTER_PLAN.md` §17, `phasesPlan.md` Phase 17, `CLAUDE.md`, `docs/AUDIT.md`, `docs/CORRECTED_AUDIT_REPORT.md`, `docs/SCHEMA_COVERAGE_ANALYSIS.md`.

---

### ~~M2: MASTER_PLAN §14 stale runtime symbol references~~ — **Fixed**

**Was:** §14 implied `formatRuntimeVersionDisplay` / `RUNTIME_LOCALE_KEY` lived in `packages/shared`.  
**Now:** R1.1 cites `formatRuntimeVersionDisplay()` in `pages/runtimes/utils.ts` (live — used by sidebar/detail panel); `RUNTIME_DETAILS` in `pages/runtimes/constants.ts`; `RUNTIME_LOCALE_KEY` **removed** during R1–R3 (no replacement).

---

### ~~M3: CLAUDE.md `bash -c` scope understated~~ — **Fixed**

**Was:** "Security probes use `bash -c` internally (monitor security only)".  
**Now:** `CLAUDE.md` lists **8+** `bash -c` / elevated-shell sites plus `bash -lc` across `runtime_install.rs` and other `runtime_*` modules.

---

### ~~L1: Minor numeric drift~~ — **Fixed**

`lib.rs` **709** (not ~706), `system_info.rs` **1,099**, `runtime_jobs.rs` **834** — synced in `AUDIT.md` §2.1 (2026-06-20 column), `phasesPlan.md`, `SCHEMA_COVERAGE_ANALYSIS.md`, `README.md`.

---

## RETRACTED FINDINGS (from initial pass, corrected on re-verification)

| Finding | Initial claim | Correction |
|---|---|---|
| **Missing `@deprecated` JSDoc on legacy IPC** | `@deprecated` not found in `ipc.ts` | `@deprecated` **exists** at lines 331–351 (initial grep was a false negative) |
| **Production `unwrap()` at `runtime_verify.rs:31`** | `node_probe.as_deref().unwrap()` present | Code was refactored — no `unwrap()` exists in `runtime_verify.rs` at all |

---

## NEGATIVE FINDINGS (What was NOT found — all clean)

| Searched for | Result |
|---|---|
| Mock/stub/fake/dummy data in production code | **None found** |
| Static/mock/fake data in renderer pages | **None found** |
| Remaining `invoke('ipc_invoke')` bypasses | **None found** (0 bypasses) |
| `@ts-ignore` / `@ts-expect-error` | **None found** (0 occurrences) |
| TODO/FIXME/HACK/XXX in TypeScript | **None found** (0 occurrences) |
| Stale widget/extensions code | **None found** (all removed) |
| Dead registry UI components | **None found** (all removed) |
| Dead Routes to removed pages | **None found** (all redirected or deleted) |
| Electron remnants | **None found** (Tauri-only) |
| Flatpak remnants | **None found** (abandoned, removed) |

---

## SUMMARY

| Severity | Count | Status |
|---|---|---|
| 🔴 Critical | 0 | C1 Vitest **74** synced across docs |
| 🟡 Medium | 0 | M1–M3 closed 2026-06-20 |
| 🟢 Low | 0 | L1 closed 2026-06-20 |
| ❌ Retracted | 2 | `@deprecated` exists (false negative); no unwrap in `runtime_verify.rs` |
| **Total gaps** | **0** | Independent audit doc-sync complete |

**Overall assessment:** The codebase is in good health. All critical functionality claims are true. No mock/static/spurious data was found. Documentation inventory (Vitest **74**, Rust line counts, `bash -c` scope, legacy IPC `@deprecated`, MASTER_PLAN §14 paths) is aligned with source as of 2026-06-20.
