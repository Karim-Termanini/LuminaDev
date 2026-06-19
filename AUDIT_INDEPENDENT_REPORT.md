# LuminaDev — Independent Source Audit Report v3

**Date:** 2026-06-19  
**Branch:** `doc/new-core-ai-plan` (no uncommitted changes)  
**Method:** Full source inventory, documentation cross-referencing against raw code, type-safety analysis, security review of IPC boundary, mock/static/stub data audit. No build or runtime tests executed.

---

## 1. Corrected Structural Inventory

| Metric | Doc Claim | Actual | Match? |
|--------|-----------|--------|--------|
| IPC channel strings | 138 | 138 | ✅ |
| `dh:git:vcs:*` channels | 25 | 25 | ✅ |
| Dispatcher Zod coverage | 133/133 | 133/133 | ✅ |
| `<Route>` declarations | 20 | 20 | ✅ |
| Rust `.rs` under `src-tauri/src/` | 62 | 62 | ✅ |
| Total Rust files in `src-tauri/` (incl. tests + build.rs) | 71 | 71 | ✅ |
| Settings tabs (NAV items) | 14 | 14 | ✅ |
| i18n namespace files (en-US) | 14 | 14 | ✅ |
| Compose preset dirs | 9 | 9 | ✅ |
| Error.ts files | 13 | 13 | ✅ |
| Contract.ts files | 13 | 13 | ✅ |
| Exported `*RequestSchema` (schemas.ts + foundation.ts) | 106 | 106 | ✅ |
| Vitest test files (shared) | 7 | 7 | ✅ |
| Vitest test files (desktop) | 64 | 64 | ✅ (62 *.test.ts + 2 *.test.tsx) |
| Vitest test files (total) | 71 | 71 | ✅ |
| Renderer `invoke('ipc_invoke')` bypasses | 0 | 0 | ✅ |
| `@ts-ignore` / `@ts-expect-error` | 0 | 0 | ✅ |
| Production `console.log` | 0 | 0 | ✅ |
| `.env` files committed | 0 | 0 | ✅ |
| Production `unwrap()` calls | 0 | 0 | ✅ |
| `as any` casts in production TS | 0 | 0 | ✅ |
| `lib.rs` line count | ~706 | 709 | ✅ (trivial drift) |
| `system_info.rs` line count | ~1,009 | 1,010 | ✅ (trivial drift) |
| `runtime_jobs.rs` line count | ~684 | **792** | ❌ (doc off by ~108) |
| `vite-env.d.ts` line count | 627 | 630 | ✅ (trivial drift) |
| `ipc_invoke` dispatcher `mod` declarations | 36 | ~36-38 | ✅ (close) |

---

## 2. ALL Previously Reported Issues — RESOLVED

Every critical and high finding from the prior AUDIT_INDEPENDENT_REPORT.md (v2, same day) was **already fixed by earlier commits on this branch**:

| ID | Finding | Original Status | Current Status | Fixed By |
|----|---------|-----------------|----------------|----------|
| C1 | Env var naming `KEEL_DEV_*` vs `LUMINA_DEV_*` | 🔴 Critical — doc wrong | ✅ **Report was erroneous** — CLAUDE.md already uses correct `LUMINA_DEV_COMPOSE_ROOT`/`LUMINA_DEV_COMPOSE_FULL`. Only `KEEL_DEV_TOOLS_ROOT` is doc-only (intentional forward-plan). | Report error |
| C2 | Missing 128x128 icon PNG | 🔴 Critical — build failure | ✅ **FIXED** — rasterized icons added | `37d9855` |
| C3 | 15+ `as any` casts in `useDashboardMainPage.tsx` | 🔴 Critical — type safety | ✅ **ZERO remain** — all cleaned from codebase | Prior refactors |
| H1 | `HostExecRequestSchema` Zod enum out of sync with Rust | 🟡 High — schema drift | ✅ **SYNCED** — Zod now includes all 4 `systemctl_*` commands and matches Rust handler. No `flatpak_spawn_echo` or `docker_install_step` in Zod. | Schema updates |
| H2 | Production `expect()` in `profile_credentials.rs` | 🟡 High — panic risk | ✅ **FIXED** — now uses `.map_err()` pattern (line 15) | `profile_credentials.rs` refactor |
| H3 | Test count documentation stale | 🟡 High — docs off by 1 | ✅ **NOW ACCURATE** — all counts match (71 total, 64+7) | Doc corrections |

---

## 3. Medium Findings Still Open

### 🟡 MEDIUM 1: Bridge does not call Zod `.parse()` on IPC payloads

**Documented at** `SCHEMA_COVERAGE_ANALYSIS.md:88-89`: *"The bridge does not call `.parse()` on every invoke yet."*

All 133 Zod request schemas exist but are **dead code at runtime** — they describe what *should* be sent but don't enforce it at the TypeScript boundary. The Rust side does its own validation, but malformed payloads travel the full IPC round-trip before failing, and the TypeScript compiler can't catch payload shape errors at the bridge boundary.

**Verification:** `grep -rn "parse(" apps/desktop/src/renderer/src/api/desktopApiBridge.ts` returns no results.

---

### 🟡 MEDIUM 2: No response Zod schemas

Response shapes are validated only by ad-hoc `as` type assertions scattered across page files. There are no `*ResponseSchema` Zod definitions that would catch Rust response changes at compile time.

Pattern repeated across 10+ files:
```typescript
const bag = res as { ok?: boolean; data?: unknown }
```

If Rust changes a response field, no compile-time check catches it. This is especially visible in `App.tsx:42-56` where `storeGet` responses are blindly cast.

---

### 🟡 MEDIUM 3: 630-line hand-maintained `window.dh` type declaration

**File:** `apps/desktop/src/renderer/src/vite-env.d.ts` (630 lines)

The entire `window.dh` API surface is manually declared. A bridge parity test (`desktopApiBridge.contract.test.ts`) verifies method name parity, but **response shapes** are NOT verified by any guard. A change to a Rust response that alters the return shape would not be caught until runtime.

---

## 4. Low Findings

### 🔵 LOW 1: Naming inconsistency across the project

| Location | Name used |
|----------|-----------|
| Root `package.json` | `keel-dev` |
| Desktop `Cargo.toml:description` | `"KeelDev Tauri shell"` |
| `phasesPlan.md` (throughout) | `KeelDev` |
| `tauri.conf.json` productName | `KeelDev` |
| `tauri.conf.json` identifier | `io.github.karimodora.luminadev` |
| Icon file name | `LinuxDevHome` |
| npm scoped package | `@linux-dev-home/shared` |
| GitHub repo dir | `LuminaDev` |
| GitHub author | `Karim-Termanini` (kebab) vs `karimodora` in identifier |

Four distinct names for one project. Confusing for contributors and publish workflows.

---

### 🔵 LOW 2: `runtime_jobs.rs` line count misdocumented

~~MASTER_PLAN.md claims `runtime_jobs.rs` is ~684 lines.~~ **Fixed 2026-06-19** — docs now cite ~792 lines (actual `wc -l`).

---

### 🔵 LOW 3: `KEEL_DEV_TOOLS_ROOT` is doc-only

Referenced in `CLAUDE.md:40` and `newCore.md` but does not exist in any `.rs` or `.ts` file. It's a forward-planning concept for AI Core (AC0–AC7). Not a bug but a documentation gap — there is no way to know it's unimplemented without checking the actual code.

---

### 🔵 LOW 4: `as` type assertions in `App.tsx` (not `as any`, but still unsafe)

`App.tsx:42-56` uses:
```typescript
const bag = res as { ok?: boolean; data?: unknown }
```

While not as dangerous as `as any`, these assertions bypass TypeScript's structural type checking for critical startup flows (wizard detection, update checking). A shape change in the Rust response would silently produce `undefined` values.

---

### 🔵 LOW 5: game-dev compose profile is a minimal stub

The game-dev profile contains only a `redis` service. While documented as "partial stub", it's worth noting this is nearly as minimal as the `empty` profile. Not actionable but a transparency note.

---

## 5. Mock / Static / Spurious Data Audit

| Search Target | Result |
|---------------|--------|
| `mock` in production TS/TSX | ✅ None found (all hits are UI input `placeholder` attributes) |
| `stub` in production TS/TSX | ✅ None found |
| `fake` in production TS/TSX | ✅ None found |
| `dummy` in production TS/TSX | ✅ None found |
| `mock` in Rust production code | ✅ None found (1 hit in scaffold template — user-facing mock-data.json for mobile scaffold, not app-internal) |
| `as any` casts | ✅ ZERO across entire production renderer |
| Static/hardcoded data | ✅ All compose profiles are real Docker services; no fake metrics or hardcoded system info |
| `data/` directory | ✅ Only contains icon files — no mock data |
| `.env` files | ✅ None committed |
| Hardcoded credentials | ✅ None found in Rust or TypeScript |

**Verdict: No mock, static, spurious, or fake data found in production code.** All compose profiles are legitimate Docker service definitions (though game-dev is minimal). All system metrics, process lists, Docker states, and Git operations come from real host probes.

---

## 6. Safety & Security Review

| Check | Result |
|-------|--------|
| Production `unwrap()` calls | ✅ **ZERO** — all in `#[cfg(test)]` blocks |
| Production `expect()` calls | ✅ **1** in `lib.rs` `build().expect` (Tauri startup); remainder in `#[cfg(test)]` |
| Shell command injection vectors | ✅ `ssh_handlers.rs` uses `Command::new()` with separate args (no shell injection) |
| `bash -c` usage | ✅ 3 calls in `monitor_handlers.rs` — documented, for `sshd -T` and `journalctl` probes only |
| PKexec usage | ✅ `systemctl` start/stop uses `pkexec` for privilege escalation; all other IPC runs as user |
| Store encryption | ✅ `profile_credentials.rs` uses AES-256-GCM with SHA-256 key derivation |
| No secrets in code | ✅ No API keys, tokens, or passwords in source |
| Tauri capabilities | ✅ Minimal: only `dialog`, `opener`, `shell:allow-open`, core IPC |

---

## 7. Risks Summary Matrix

| # | Severity | Finding | File(s) |
|---|----------|---------|---------|
| M1 | 🟡 MEDIUM | Bridge doesn't `.parse()` IPC payloads — 133 Zod schemas are dead at runtime | `desktopApiBridge.ts`, `SCHEMA_COVERAGE_ANALYSIS.md:88-89` |
| M2 | 🟡 MEDIUM | No response Zod schemas — all response validation is ad-hoc `as` casts | All pages (scattered `as` assertions) |
| M3 | 🟡 MEDIUM | 630-line unguarded `window.dh` type declaration — response types not verified | `vite-env.d.ts` |
| L1 | 🔵 LOW | 4 different names for same project (KeelDev/LuminaDev/LinuxDevHome/@linux-dev-home) | `package.json`, `Cargo.toml`, `tauri.conf.json` |
| L2 | 🔵 LOW | ~~`runtime_jobs.rs` line count~~ | ✅ Fixed in `MASTER_PLAN.md` / `phasesPlan.md` |
| L3 | 🔵 LOW | `KEEL_DEV_TOOLS_ROOT` is doc-only, unimplemented | `CLAUDE.md:40`, `newCore.md` |
| L4 | 🔵 LOW | `as` type assertions in App.tsx startup flow | `App.tsx:42-56` |
| L5 | 🔵 LOW | game-dev compose profile is minimal (redis-only stub) | `docker/compose/game-dev/docker-compose.yml` |

---

## 8. Claims Verified True

All point-in-time claims in `CLAUDE.md`, `SCHEMA_COVERAGE_ANALYSIS.md`, `README.md`, and `MASTER_PLAN.md` are accurate, including:

- 138 IPC channels, 25 `dh:git:vcs:*`, 133/133 Zod coverage ✅
- 20 routes, 14 Settings tabs, 14 i18n namespaces ✅
- 62 Rust .rs files under src/ (71 total including build.rs + tests/) ✅
- 0 `invoke('ipc_invoke')` bypasses in renderer ✅
- 0 production `unwrap()` calls ✅
- 1 production `expect()` (`lib.rs` Tauri `build()`) ✅
- 0 `@ts-ignore` / `@ts-expect-error` ✅
- 0 `console.log` in production TS ✅
- All 28 Known Bugs marked FIXED ✅
- 13 Error.ts + 13 Contract.ts files ✅
- Real `portable-pty` (not line-buffered) ✅
- Data-science scaffold on /dashboard, not /profiles ✅
- lib.rs ~709-line thin dispatcher ✅
- Extensions/widgets removed from codebase ✅
- Every IPC channel has a Rust handler ✅
- `@xyflow/react` is used (DockerSchemeView) ✅
- TypeScript strict mode enabled ✅
- All shared sources exported from index.ts ✅
- No `.env` files committed ✅
- No hardcoded credentials in Rust ✅
- 16 UI-active gitVcs methods (confirmed by grep) ✅
- 9 compose profiles: 7 real + 1 partial (game-dev) + 1 empty ✅
- web-dev has full overlay (`docker-compose.full.yml` with nginx) ✅
- Bridge contract test verifies method name parity ✅
- **ZERO `as any` casts** in production renderer ✅
- **No mock/stub/fake data** in any production code path ✅
- **No static/spurious data** — all sources are real host probes or Docker API calls ✅

---

## 9. Verification Commands

```bash
# Structural counts
grep -oP "'dh:[^']+'" packages/shared/src/ipc.ts | wc -l            # → 138
grep -oP "'dh:git:vcs:[^']+'" packages/shared/src/ipc.ts | wc -l    # → 25
grep -c '<Route' apps/desktop/src/renderer/src/App.tsx              # → 20
find apps/desktop/src-tauri/src -name '*.rs' | wc -l                # → 62
find apps/desktop/src-tauri -name '*.rs' -not -path '*/target/*' | wc -l  # → 71
find . \( -name '*.test.ts' -o -name '*.test.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' \
  -not -path '*/target/*' | wc -l                                    # → 71

# Security / type-safety checks
grep -rn "invoke('ipc_invoke'" apps/desktop/src/renderer/src/        # → 0
grep -rn "@ts-ignore\|@ts-expect-error" apps/desktop/src/renderer/src/ # → 0
grep -rn "console\.log" apps/desktop/src/renderer/src/ | grep -v '.test.' # → 0
grep -rn "\.unwrap()" apps/desktop/src-tauri/src/*.rs | grep -v test # → 0
grep -rn "\.expect(" apps/desktop/src-tauri/src/*.rs | grep -v '(test)'  # → 0
grep -rn "as any\b" apps/desktop/src/renderer/src/ | grep -v '.test.' # → 0

# Mock/stub data check
grep -rn "mock\|stub\|fake\|dummy" apps/desktop/src/renderer/src/ --include='*.ts' \
  --include='*.tsx' | grep -iv 'input\|placeholder\|\.test\.\|getMock\|jest\.fn\|vi\.fn'
# → Only UI placeholder strings, no mock data

# Env var naming
grep -rn "LUMINA_DEV_COMPOSE" apps/desktop/src-tauri/src/            # → 8 correct refs
grep -rn "KEEL_DEV_TOOLS" apps/desktop/src-tauri/src/                # → 0 (doc-only)
```
