# LuminaDev — Expert Forward Plan

**Date:** 2026-05-28 (updated same day after audit fixes)  
**Branch at time of writing:** `main`  
**Rust modules:** 39 source files · `lib.rs` 684 lines  
**Smoke gate:** ✅ clean (typecheck + vitest + cargo test + clippy)

---

## State of Play

| Area | Status | Detail |
|---|---|---|
| Phases 0–9, 12, 13, 15, 16, 17 | ✅ DONE | All verified against source |
| Phase 11 — First-run Wizard | ✅ DONE | Merged into Phase 16 (8-step unified installer) |
| Phase 10 — Extensions | 📋 FUTURE | Deferred/post-release; disabled in UI |
| UI/UX Debt — all 6 items | ✅ DONE | Completed 2026-05-28 |
| Audit defects — all 7 issues | ✅ FIXED | Fixed 2026-05-28 (see §Audit Fixes below) |
| Smart Universal Search (fuzzy) | ✅ SHIPPED | Fuzzy-scored palette: pages, containers, runtimes, git repos |
| Git Doctor | ✅ WIRED | `git_doctor.rs` (478 lines), dispatcher arm at `lib.rs:175` |
| SettingsExtension tab | 🚫 DISABLED | Code preserved, navigation hidden |
| Per-container stats stream | ✅ DONE | Phase 5 gap closed (completed 2026-05-29) |
| DashboardWidgets profile binding | ✅ FIXED | 2026-05-28 — now reads `active_profile` from store |
| Status bar "Engine Connected" + version | ✅ FIXED | 2026-05-28 — live `appInfo()` IPC, dynamic health check |
| Sidebar nav `status: 'live'` badges | ✅ FIXED | 2026-05-28 — derived from engine health ping |
| Docs link | ✅ FIXED | 2026-05-28 — points to `docs.luminadev.app` |
| DashboardLogs search input | ✅ FIXED | 2026-05-28 — functional line-buffer filter on xterm.js |
| `link.workstation` widget dead route | ✅ FIXED | 2026-05-28 — routes to `/dashboard/logs` |
| AppImage release pipeline | ❓ UNVERIFIED | Not confirmed working end-to-end on clean machine |

---

## Audit Fixes (2026-05-28)

Post-merge audit surfaced 7 defects — all fixed:

| # | Severity | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| 1 | 🔴 | `DashboardLogsPage.tsx` | Search input non-functional | Line-buffer filter on xterm.js terminal |
| 2 | 🔴 | `DashboardWidgetDeck.tsx` | `link.workstation` → `/workstation` dead route | Changed to `/dashboard/logs` |
| 3 | 🟡 | `DashboardWidgetsPage.tsx` | Profile hardcoded `'web-dev'` | Fetches `active_profile` from store |
| 4 | 🟡 | `TopBar.tsx` | Runtime search reads stale localStorage | Live IPC via `dh:runtime:status` |
| 5 | 🟡 | `ActiveJobsStrip.tsx` | "Engine Connected" placebo + hardcoded version | Live `appInfo()` IPC, dynamic health check |
| 6 | 🟡 | `AppShell.tsx` | Sidebar `status: 'live'` badges decorative | Derived from `appInfo()` health ping |
| 7 | 🟡 | `AppShell.tsx` | Docs link → `github.com` | Changed to `docs.luminadev.app` |

**Bonus — Smart Universal Search:** Replaced substring matching with fuzzy scoring (character-order matching, consecutive/word-boundary/position bonuses). 4 search domains: pages, containers, runtimes, git repos. Results sorted by relevance.

**Bonus — Palette bugs:** Fixed overflow clipping (`overflow: visible`), focus/blur race (sync open + ref guard), and re-open on typing after Enter-navigate.

---

## P0 — Merge Complete ✅

Branch merged to `main`. Audit fixes + fuzzy search applied on top.

---

## P1 — Small Gaps

### 1.1 Widget Profile Binding ✅ DONE (2026-05-28)

`DashboardWidgetsPage.tsx` now fetches `active_profile` from `storeGet` on mount. `layoutGet`/`layoutSet` use real profile key. Fallback to `'web-dev'` if store empty.

**Files:** `DashboardWidgetsPage.tsx`

---

### 1.2 Log Stream Cleanup on App Shutdown ✅ DONE (2026-05-28)

`AppState.streams` (`HashMap<String, AbortHandle>`) has no cleanup on window close. Streams running at shutdown are orphaned.

**Fix:** In `lib.rs` Tauri app builder, add:
```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        let state = window.state::<AppState>();
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            let mut streams = state.streams.lock().await;
            for handle in streams.drain().map(|(_, h)| h) {
                handle.abort();
            }
        });
    }
})
```

Also add `streams.len() > 20` guard in `handle_log_stream_start` — clear oldest entry if over limit to prevent stale handle accumulation.

**Files:** `lib.rs`, `runtime_logs.rs`

---

### 1.3 Command Palette Runtime Data ✅ DONE (2026-05-28)

Replaced `localStorage` cache with live `dh:runtime:status` IPC call in `onPaletteOpen`. Runtimes fetched fresh each time palette opens — no cache pre-warm needed.

**Files:** `TopBar.tsx`

---

### 1.4 phasesPlan.md + AUDIT_2026-05.md Accuracy Pass ✅ DONE (2026-05-28)

- `phasesPlan.md` lines 580–586: marked all 6 UI/UX debt items as `[x]` DONE with date.
- `phasesPlan.md` line 280: `DashboardWidgetsPage` stub → marked `[x]` DONE.
- `AUDIT_2026-05.md` §13 priority table: updated P2/P3 items now complete (including verifying translation completeness and updating locale checks).
- Added Phase 17 entry in execution order to deduplicate Phase 16 monolith refactoring.

### 1.5 Sidebar Navigation Refactor (Persistent Collapsed State) ✅ DONE (2026-05-28)

**Requirement:** Main left sidebar navigation must remain collapsed/closed permanently. Hover-to-expand/click-to-expand behavior completely removed.
- Only navigation icons visible at all times.
- Hovering over any icon displays clean, styled Microsoft Dev Home style tooltip.
- All sidebar expansion toggle and open/close state logic in React component removed.

**Files:** `AppShell.tsx`, `AppShell.css`

---

## P2 — Missing Features (Weeks 1–3)

### 2.1 Per-Container Stats Stream

Only explicitly called-out Phase 5 gap. Every other Phase 5 item done.

**Architecture:**

Rust — new function in `docker_engine.rs`:
```rust
pub(crate) async fn handle_container_stats(body: &Value) -> Value {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
    // docker stats --no-stream --format "{{json .}}" <id>
    // Parse: CPUPerc, MemUsage, NetIO, BlockIO → return clean floats
}
```

New IPC channel: `dh:docker:container:stats { id }` → `{ cpuPct: number, memMb: number, memLimitMb: number, netRxMb: number, netTxMb: number }`

Frontend — `DockerPage.tsx` expanded container row:
- When container row expanded (or in details panel), poll `dh:docker:container:stats` every 3 s
- Render: CPU bar, memory bar, net I/O text — small sparkline-style display
- Stop polling on collapse/unmount

**Note:** Use polling (not streaming) — `docker stats` in follow mode is long-running process hard to clean up reliably. 3 s poll produces smooth-enough updates.

**Files:** `docker_engine.rs`, `lib.rs`, `ipc.ts`, `desktopApiBridge.ts`, `vite-env.d.ts`, `DockerPage.tsx`

---

### 2.2 SettingsExtension — Plugin Browser v0 [FUTURE - POST-RELEASE]

> [!NOTE]
> **Deferred:** Deferred to future post-release phase. Not part of current active scope.

12-line stub needs real surface communicating Phase 10 value and giving plugin developers path to install locally today, before runtime loader exists.

**UI layout:**
```
[icon] Extensions
Subtitle: Load local plugins from disk. Community marketplace coming soon.

[Installed Plugins]
  ┌─────────────────────────────────────────────┐
  │ plugin-name   v1.0.0   by author            │
  │ Description text                    [Remove] │
  └─────────────────────────────────────────────┘
  [No plugins installed] — empty state

[Install from Folder]   ← opens folder picker → copies to plugin dir
[Open Plugin Directory] ← opens file manager at plugin dir
```

**Backend — new `plugin_loader.rs`:**
```rust
pub(crate) async fn handle_plugin_list() -> Value {
    // Scan ~/.config/lumina/plugins/ (or app data dir)
    // For each subdir: read plugin.json manifest
    // Return array of { name, version, description, author, path }
}

pub(crate) async fn handle_plugin_install(body: &Value) -> Value {
    // body: { sourcePath: string }
    // Copy folder to plugin dir, validate plugin.json exists
    // Return { ok: true, name: string }
}

pub(crate) async fn handle_plugin_remove(body: &Value) -> Value {
    // body: { name: string }
    // Delete plugin dir, return { ok: true }
}
```

IPC channels: `dh:plugin:list`, `dh:plugin:install`, `dh:plugin:remove`

**Plugin manifest schema (`plugin.json`):**
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What it does",
  "author": "Your name",
  "api": "v1",
  "widgets": [
    { "typeId": "myplugin.widget-name", "title": "Widget Title", "entry": "widgets/MyWidget.js" }
  ]
}
```

Add `PluginManifest` Zod schema to `packages/shared/src/schemas.ts`.

**Files:** New `plugin_loader.rs`, `lib.rs`, `schemas.ts`, `ipc.ts`, `desktopApiBridge.ts`, `vite-env.d.ts`, `SettingsExtension.tsx`

---

## P3 — Phase 10 Extensions [FUTURE - POST-RELEASE]

> [!NOTE]
> **Deferred:** Deferred to future post-release phase. Not part of current active scope.

Only remaining planned phase from `phasesPlan.md`. Broken into three sub-phases:

### 10a — Plugin Discovery & Management (Week 4)

- `plugin_loader.rs` from P2.2 is foundation
- Add plugin validation: check manifest `api: "v1"`, check no `..` path traversal in widget entries
- Add basic trust model: sha256 hash of `plugin.json` stored in `~/.config/lumina/plugin-trust.json` on install; verified on load
- `SettingsExtension.tsx` shows hash fingerprint for each plugin ("trusted" badge if hash matches)

### 10b — Widget Loading (Weeks 5–6)

Dynamic widget typeId registration at runtime from installed plugins:

```ts
// On app startup, after plugin list is fetched:
const plugins = await window.dh.pluginList()
plugins.forEach(plugin => {
  plugin.widgets.forEach(w => {
    DYNAMIC_WIDGET_REGISTRY.set(w.typeId, {
      typeId: w.typeId,
      title: w.title,
      description: w.description,
      entryPath: w.entry,
    })
  })
})
```

`DashboardWidgetDeck` renders plugin widgets via `<PluginWidgetRenderer>` component:
- Loads widget's `.js` bundle via dynamic `import()` from Tauri asset URL
- Passes `{ dh: window.dh }` as props (limited API surface)
- Wraps in error boundary so broken plugin doesn't crash dashboard

### 10c — Developer API (Weeks 7–8)

- `packages/plugin-api/` workspace package: TypeScript types for plugin manifest + widget component interface
- `docs/PLUGIN_DEVELOPMENT.md`: how to build, test, install plugin
- Example plugin in `docs/examples/sample-plugin/`: minimal widget displaying system uptime

---

## P4 — File Size Debt (Ongoing, Alongside P3)

Extract when next touching each file — don't refactor speculatively.

| File | Lines | Extract When | Target Modules |
|---|---|---|---|
| `DockerPage.tsx` | 3,664 | Adding per-container stats (P2.1) | `DockerContainersTab.tsx`, `DockerImagesTab.tsx`, `DockerVolumesTab.tsx`, `DockerNetworksTab.tsx` |
| `GitConfigPage.tsx` | 2,835 | Next Git feature | `GitDoctorPanel.tsx`, `GitConfigInspector.tsx` |
| `ProfilesPage.tsx` | 2,704 | Next Profiles feature | `ProfileWizardModal.tsx`, `ProfileScaffoldModal.tsx` |

Rule: if adding >100 lines to one of these files, extract first.

---

## P5 — Release Gate (After P1–P2 Complete)

### AppImage Build Verification

On clean Ubuntu 24.04 VM with only Rust + Node + system deps installed (no LuminaDev toolchain):
1. Clone repo, `pnpm install`, `pnpm build`
2. Tauri bundle → `.AppImage`
3. Run AppImage on that machine — verify readiness wizard launches, system probes work
4. Install Docker through wizard (one-click install path), verify it works
5. Verify `dh:app:update:check` returns correct built version string (not hardcoded)

### Cross-Distro Regression

| Distro | Focus Areas |
|---|---|
| Ubuntu 24.04 | nvm install (node runtime), docker group detection, git doctor scan |
| Fedora 40 | DNF package manager detection, Java runtime (major version), PHP |
| Arch Linux | pacman integration, systemd unit names for kernels page |

### Release Tag

`v0.3.0-beta` after:
- [x] P1 complete (profile binding, stream cleanup, cache pre-warm, sidebar refactor)
- [x] P2.1 complete (per-container stats)
- [ ] AppImage verified on clean Ubuntu + Fedora
- [ ] `pnpm smoke` green on all three test configs

---

### 1.6 Sidebar and Topbar Hover Tooltip Blur Issue ✅ DONE (2026-05-28)
- **Issue:** Dynamic width tooltips with `translate3d(-50%, 0, 0)` render at fractional pixel positions when width in pixels is odd (determined by dynamic text length). Makes all hovered tooltips on sidebar and topbar icons appear blurry.
- **Solution:** Applied individual fixed even-width styles (e.g., `120px`, `160px`, `240px`) and integer-based negative margins (e.g., `margin-left: -60px`, `-80px`, `-120px`) with `transform: none` to all sidebar and topbar buttons for perfect whole-pixel snapping.

---

## Technical Debt Register

| Item | Risk | Mitigation |
|---|---|---|
| `lib.rs` at 684 lines (target: <678) | Medium — will grow with P2 channels | Extract `app_state.rs` if >700 |
| `AppState.streams` no size cap | Low — dev use only currently | Add `len() > 20` guard in P1.2 |
| `DashboardWidgetDeck` HTML5 drag on Wayland | Low — Wayland WebView drag flaky | Add mouse-event fallback if reports come in |
| `runDiagnostics` in `GitConfigPage` never called | Low — suppressed with eslint comment | Wire to "Quick Scan" button in GitDoctor panel, or remove in P4 file extraction |
| `docker stats` per-container polling at 3s | Low — one docker subprocess per open container | Add AbortSignal on component unmount |

---

## Execution Order

```text
✅  IMMEDIATE → Merge branch + audit fixes + fuzzy search → main (DONE)
✅  Week 1  → P1.1 Widget profile binding (DONE)
✅  Week 1  → P1.3 Command palette runtime data (DONE — live IPC)
✅  Week 1  → P1.2 Log stream shutdown cleanup (DONE — 2026-05-28)
✅  Week 1  → P1.4 phasesPlan.md + AUDIT accuracy pass (DONE — 2026-05-28)
✅  Week 1  → P1.5 Sidebar navigation refactor (collapsed state + tooltips) (DONE — 2026-05-28)
✅  Week 1  → P1.6 Sidebar & Topbar tooltip blur fix (DONE — 2026-05-28)
✅  Week 2  → P2.1 Per-container stats stream (DONE — 2026-05-29)
✅  Week 2  → P2.2 Docker Volume `usedBy` mapping & Profile Orchestration stabilization (DONE — 2026-05-29)
Parallel   → P4 File extraction when touching each large file
End of P2  → P5 Release gate → v0.3.0-beta tag
📋  FUTURE   → P2.2 SettingsExtension plugin browser v0 (Post-Release/Deferred)
📋  FUTURE   → P3/Phase 10 Extensions (Discovery, Loading, Developer API) (Post-Release/Deferred)
```

---

## P6 — CodeRabbit Audit Remediation

The CodeRabbit review (recorded in [codeRabbit.md](file:///home/karimodora/Documents/GitHub/LuminaDev/codeRabbit.md)) has highlighted several security risks, logical bugs, and design inconsistencies. These have been prioritized into the following backlog:

### 6.1 Critical Security Remediation
- [x] **SshPage shell command injection** in scp/rsync (lines 370–375, 517–543). Escape user inputs (remote paths, ports, hosts) using custom shell quoting or avoid `bash -c` execution.

### 6.2 Major Logic & Feature Remediation
- [x] **ProfilesPage global credential deletion bug** (lines 2295–2301, 2411–2415). Ensure unlinking a credential from a profile does not delete it globally from store.
- [x] **ProfilesPage optimistic credential save** (lines 2240–2248, 2452–2459). Await and validate `profileCredentialsStore` response before updating the UI state.
- [x] **GitConfigPage backup file shape validation** (lines 2569–2574). Validate keys and types in JSON parser during `handleImport`.
- [x] **GitConfigPage gitDoctorScan response check** (lines 715–723). Check for `!res.ok` and handle the error shape correctly.
- [x] **RuntimesPage cache invalidation** (lines 152–165, 189–222). Clear or force-reload version cache when runtime versions are added or switched.
- [x] **FirstRunWizardPage route standard** (lines 6–227). Colocate contract/error helpers and add route test coverage.
- [x] **FirstRunWizardPage copy localization** (lines 118–120). Localize text copy and fix conditional completion summary.

### 6.3 Minor Cleanups & Edge Cases
- [x] **executor.rs resource limits** (lines 11–18). Remove unused `_app` param or restore `store.json` lookup.
- [x] **git_doctor.rs whitespace check** (line 235). Trim config values before comparing (e.g. `v.trim() != "true"`).
- [x] **runtime_logs.rs stream limit** (line 78). Fix off-by-one check to enforce a strict limit of 20 concurrent streams (`>= 20`).
- [x] **runtime_jobs.rs single-quote escape** (lines 921–961). Prevent command breakages in `PROJECT_DIR` paths by escaping single quotes.

