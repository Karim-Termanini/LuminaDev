# Independent Audit Report — LuminaDev

**Date:** 2026-06-19
**Method:** Full source code review, cross-referencing all documentation claims against actual files. No build or runtime tests executed.
**Branch audited:** `doc/new-core-ai-plan` (dirty-check: clean)

---

## 1. Executive Summary

The project is broadly sound. The majority of documented claims are accurate. However, **3 issues** require immediate attention (1 HIGH, 2 MEDIUM), and several documentation counts are stale.

---

## 2. Verified Claims (True)

| Claim | Evidence |
|-------|----------|
| **138** IPC channel strings in `IPC` const | `grep 'dh:' ipc.ts | wc -l` = 138 |
| **25** `dh:git:vcs:*` channels | `grep 'dh:git:vcs:' ipc.ts | wc -l` = 25 |
| **133/133** dispatcher Zod coverage (100%) | `NO_PAYLOAD` = 28 + `PAYLOAD` = 105 = 133 mapped channels |
| **20** `<Route>` declarations in `App.tsx` | Manual count = 20 |
| **62** Rust `.rs` files under `src-tauri/src/` | `find src-tauri/src -name '*.rs' | wc -l` = 62 |
| **14** Settings tabs | `NAV` array in `SettingsShell.tsx` has 14 entries |
| **14** i18n namespaces in `en-US` | 14 JSON files in `locales/en-US/` |
| **9** compose preset dirs | 9 directories in `docker/compose/` |
| **13** Error.ts + **13** Contract.ts files | Both sets found in `pages/` |
| **0** renderer `invoke('ipc_invoke')` bypasses | `grep -rn "invoke('ipc_invoke"` → no matches |
| **0** `@ts-ignore` / `@ts-expect-error` | `grep -rn` across all TS → no matches |
| **0** production `unwrap()` calls (benign expect only) | All unwrap() in `#[cfg(test)]` blocks |
| All 28 Known Bugs marked ✅ FIXED | `phasesPlan.md` §Known Bugs |
| Real `portable_pty` (not line-buffered) | `terminal_pty.rs` uses `native_pty_system` |
| Data-science scaffold on `/dashboard` (not `/profiles`) | `dataScienceCreateWizard.ts` imported by `DashboardMainPage` |
| `lib.rs` thin dispatcher (~706 lines) | Verified |
| Features removed: Extensions, dashboard widgets, widgetRegistry | No routes, no IPC, no imports found |
| Every IPC channel has a Rust handler | Cross-check of all 138 keys against `lib.rs` | 0 unmapped |

---

## 3. Issues Found

### 🔴 HIGH: Missing build-time icon file

**File:** `apps/desktop/src-tauri/tauri.conf.json`
**Line:** icon references `../../data/icons/hicolor/128x128/apps/io.github.karimodora.LinuxDevHome.png`

**Reality:** Only `data/icons/hicolor/scalable/apps/io.github.karimodora.LinuxDevHome.svg` exists. The PNG at the 128x128 path does **not exist**:
```
data/icons/
└── hicolor/
    └── scalable/
        └── apps/
            └── io.github.karimodora.LinuxDevHome.svg
```

**Risk:** `pnpm build` / `pnpm build:tauri` will fail or produce an app with a broken/missing icon.

**Fix:** Either generate the 128×128 PNG from the SVG, or change `tauri.conf.json` to reference the SVG path (if Tauri supports it), or add `icns`/`ico` format if targeting other platforms.

---

### 🟡 MEDIUM: Test file count mismatch in documentation — ✅ RETRACTED (2026-06-19)

**Earlier claim:** 67 files (61 desktop + 6 shared) vs docs at 69.

**Resolution:** **69** is correct when counting all Vitest files (`*.test.ts` **and** `*.test.tsx`). Desktop is **63** = **61** `*.test.ts` + **2** `*.test.tsx` (`settings/settings.test.tsx`, `profiles/profilesPage.smoke.test.tsx`). Counting only `*.test.ts` undercounts by 2. Use parenthesized `find` in [`SCHEMA_COVERAGE_ANALYSIS.md`](docs/SCHEMA_COVERAGE_ANALYSIS.md).

---

### 🟡 MEDIUM: 627-line manual `Window.dh` type declaration

**File:** `apps/desktop/src/renderer/src/vite-env.d.ts` (627 lines)

**Problem:** The entire `window.dh` API is manually declared as a TypeScript interface. Every schema change, channel addition, or response shape modification requires **manual** updates to this file. It is not derived from Zod schemas or the IPC const.

**Risk:** The manually declared types can drift from the actual implementations in `desktopApiBridge.ts`, `schemas.ts`, or Rust handlers. There is no guard test that verifies `vite-env.d.ts` ↔ `desktopApiBridge.ts` parity.

**Note:** The `satisfies DhApi` in `desktopApiBridge.ts` uses `DhApi = Window['dh']`, so at least the bridge and the declaration are cross-checked by TypeScript. But the declaration itself is unguarded against schema changes.

---

### 🔵 LOW: Naming inconsistency across the project

The project uses three different names for itself:

| Location | Name Used |
|----------|-----------|
| Root `package.json` name | `keel-dev` |
| `tauri.conf.json` productName | `LuminaDev` |
| `tauri.conf.json` identifier | `io.github.karimodora.luminadev` |
| Icon file name | `LinuxDevHome` |
| Icon path inside tauri.conf | `io.github.karimodora.LinuxDevHome.png` |
| `phasesPlan.md` | `KeelDev` (throughout) |
| `CORRECTED_AUDIT_REPORT.md` | `LuminaDev` |
| Desktop `package.json` homepage | `https://github.com/Karim-Termanini/LuminaDev` |
| GitHub repo directory name | `LuminaDev` |

This is cosmetic but causes confusion, especially for new contributors. The icon path references `LinuxDevHome` while everything else says `LuminaDev`.

---

### 🔵 LOW: Bridge does not `.parse()` IPC payloads

**File:** `SCHEMA_COVERAGE_ANALYSIS.md:88-89` explicitly documents this: *"The bridge does **not** call `.parse()` on every invoke yet; Rust still validates ad hoc."*

**Risk:** TypeScript-side payload validation exists (Zod schemas) but is not wired into the transport layer. Errors from malformed payloads are caught only at the Rust boundary rather than before the IPC call.

**Priority:** Phase 18 tracked item.

---

### 🔵 LOW: No response Zod schemas

Response shapes are validated only by TypeScript type assertions (`as` casts) in pages. There are no `*ResponseSchema` Zod definitions. The doc says this is "out of P10 scope."

**Risk:** Rust could return a malformed response and the renderer would not catch it until runtime, potentially causing crashes or undefined behavior.

---

### 🔵 LOW: Production `expect()` call

**File:** `apps/desktop/src-tauri/src/profile_credentials.rs:15`
```rust
.app_data_dir()
.expect("app data dir must be resolvable")
```

This is a legitimate panic point. If the app data directory is unavailable for any reason, the credential store will panic and crash the app. The CORRECTED_AUDIT acknowledges this as a pre-existing known item.

---

### 🔵 LOW: Phase 18 (IPC boundary hardening) still `⬜ Open`

The `phasesPlan.md` lists Phase 18 as the next active engineering track. P10 (Zod schemas) is complete but P9 bridge wiring is still in progress.

---

## 4. Documentation Claims Not Verified (Out of Scope)

The following claims could not be independently verified from source review alone:

| Claim | Why not verified |
|-------|------------------|
| `pnpm build` green | Not executed |
| `pnpm typecheck` green | Not executed |
| `pnpm lint` green | Not executed |
| `pnpm smoke` green | Not executed |
| `cargo check` green | Not executed |
| Real GitHub API update check | Code exists (`system_info.rs`) but not tested |
| `/proc` metrics live | Code exists (`monitor_handlers.rs`) but not tested |
| Git Doctor 9 parallel checks | Code exists but not executed |
| Game-dev partial compose | Only 1 docker-compose.yml exists — status not verified |
| `Runtime check-deps` probes host | Code path exists but not executed |

---

## 5. Summary

| Severity | Count | Key Items |
|----------|-------|-----------|
| 🔴 HIGH | 1 | Missing build icon file |
| 🟡 MEDIUM | 2 | Test count doc stale by 2; 627-line unguarded type declaration |
| 🔵 LOW | 5 | Naming inconsistency; missing bridge `.parse()`; no response schemas; production expect(); Phase 18 open |

**Overall assessment:** The codebase is well-structured, the documented claims are mostly accurate, and the audit/remediation process is thorough. The HIGH issue (missing icon) will block a Tauri build. The MEDIUM issues are maintenance liabilities. The LOW items are acknowledged in the project's own documentation.
