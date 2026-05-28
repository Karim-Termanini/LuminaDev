# LuminaDev — Expert Forward Plan

**Date:** 2026-05-28  
**Branch at time of writing:** `docs/architectural-clarification` (35 commits, 112 files, 14 K+ insertions — pending merge)  
**Rust modules:** 39 source files · `lib.rs` 684 lines  
**Smoke gate:** ✅ clean (typecheck + vitest + cargo test + clippy)

---

## State of Play

| Area | Status | Detail |
|---|---|---|
| Phases 0–9, 12, 13, 15, 16, 16b | ✅ DONE | All verified against source |
| Phase 11 — First-run Wizard | ✅ DONE | Merged into Phase 16 (8-step unified installer) |
| Phase 10 — Extensions | 📋 NEXT | Only remaining major planned phase |
| UI/UX Debt — all 6 items | ✅ DONE | Completed 2026-05-28 (this branch) |
| Git Doctor | ✅ WIRED | `git_doctor.rs` (478 lines), dispatcher arm at `lib.rs:175` |
| SettingsExtension tab | ⚠️ STUB | 12-line "Coming Soon" |
| Per-container stats stream | ❌ MISSING | Phase 5 gap, never implemented |
| DashboardWidgets profile binding | ⚠️ HARDCODED | `layoutGet/Set` uses literal `'web-dev'`, ignores active profile |
| AppImage release pipeline | ❓ UNVERIFIED | Not confirmed working end-to-end on a clean machine |

---

## P0 — Merge Current Branch (Immediate)

35 commits of production-ready work on `docs/architectural-clarification`:

- Runtimes page: `dh:runtime:installed-versions` on-demand channel; 30s status cache → page loads in <10 s
- Dashboard-Main: `DashboardWidgetDeck` lifted to persistent hero section with empty-state CTA
- Dashboard-Widgets: full widget catalog + placement management (replaced 15-line stub)
- Dashboard-Kernels: `KERNEL_DEFS` with Jupyter/PHP-FPM; Start/Stop/Open/Link controls; 3 new Rust `host_exec` commands
- Dashboard-Logs: live Tauri event streaming (`runtime_logs.rs`, `AppState.streams`); replaced poll-and-clear
- Global Nav: Ctrl+K command palette with 30+ searchable entries (pages, settings tabs, git tabs, dashboard sub-pages, containers, runtimes)
- Smoke gate: clean

**Action:** Open PR → merge to `main`. Before merging, update `phasesPlan.md`:
- Mark all 6 UI/UX debt items as `[x]`
- Mark `DashboardWidgetsPage` stub line as `[x]`
- Add Phase 17 section (this plan)

---

## P1 — Small Gaps (Days 1–5)

### 1.1 Widget Profile Binding

`DashboardWidgetsPage.tsx` and the hero section in `DashboardMainPage.tsx` hardcode `profile: 'web-dev'` in `layoutGet`/`layoutSet`. The active profile ID must come from the store.

**Fix:**
```ts
// On mount in DashboardWidgetsPage, read active profile first:
const activeProfile = await window.dh.storeGet({ key: 'active_profile' })
const profileId = (activeProfile as { ok: boolean; data?: string }).data ?? 'web-dev'
const layout = await window.dh.layoutGet({ profile: profileId })
```

Thread `activeProfile` state (already present in `DashboardMainPage`) down to the hero `DashboardWidgetDeck` render so `onRemove`/`onReorder` call `layoutSet` with the real profile key.

**Files:** `DashboardMainPage.tsx`, `DashboardWidgetsPage.tsx`

---

### 1.2 Log Stream Cleanup on App Shutdown

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

Also add a `streams.len() > 20` guard in `handle_log_stream_start` — clear oldest entry if over the limit to prevent stale handle accumulation.

**Files:** `lib.rs`, `runtime_logs.rs`

---

### 1.3 Command Palette Runtime Cache Pre-warm

`getCachedRuntimes()` in `TopBar.tsx` reads from `dh:runtimes:status-cache:v1` (written by `RuntimesPage` on first visit). If the user opens the palette before visiting `/runtimes`, the runtimes section is empty.

**Fix:** In `AppShell.tsx`, on mount, fire a background `window.dh.runtimeStatus()` call and write the cache — same logic as `RuntimesPage`'s background refresh path. One call, ~4 s, completely background.

```ts
useEffect(() => {
  void window.dh.runtimeStatus().then((res) => {
    const r = res as { ok: boolean; runtimes: unknown[] }
    if (r.ok) {
      try { localStorage.setItem('dh:runtimes:status-cache:v1', JSON.stringify({ ts: Date.now(), runtimes: r.runtimes })) }
      catch { /* ignore */ }
    }
  })
}, [])
```

**Files:** `AppShell.tsx`

---

### 1.4 phasesPlan.md + AUDIT_2026-05.md Accuracy Pass

- `phasesPlan.md` lines 580–586: mark all 6 UI/UX debt items as `[x]` DONE with date
- `phasesPlan.md` line 280: `DashboardWidgetsPage` stub → mark `[x]` DONE
- `AUDIT_2026-05.md` §13 priority table: update P2/P3 items now complete
- Add Phase 17 entry in execution order

---

## P2 — Missing Features (Weeks 1–3)

### 2.1 Per-Container Stats Stream

The only explicitly called-out Phase 5 gap. Every other Phase 5 item is done.

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
- When a container row is expanded (or in a details panel), poll `dh:docker:container:stats` every 3 s
- Render: CPU bar, memory bar, net I/O text — small sparkline-style display
- Stop polling on collapse/unmount

**Note:** Use polling (not streaming) — `docker stats` in follow mode is a long-running process that is hard to clean up reliably. A 3 s poll produces smooth-enough updates.

**Files:** `docker_engine.rs`, `lib.rs`, `ipc.ts`, `desktopApiBridge.ts`, `vite-env.d.ts`, `DockerPage.tsx`

---

### 2.2 SettingsExtension — Plugin Browser v0

The 12-line stub needs a real surface that communicates Phase 10 value and gives plugin developers a path to install locally today, before the runtime loader exists.

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

### 2.3 Terminal Multiplexer (Beta Flag → Real Implementation)

`enable_experimental_terminal_multiplexer` is read by `TerminalPage.tsx:27` as `enableMultiplexer` but does nothing with it. The flag has been on the Beta Features settings screen and shown to users for multiple releases.

`AppState.terminals` is already a `HashMap<String, TerminalSession>` — multiple sessions are architecturally supported.

**Minimum viable multiplexer:**
- When `enableMultiplexer` is true, render a tab bar above the xterm canvas
- "+" button creates a new `dh:terminal:create` session, adds a tab
- Click tab → switch active session (only one xterm shown at a time, others kept alive in state)
- "×" on tab → `dh:terminal:close` that session, remove tab

**State shape:**
```ts
const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([])
const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
```

**Files:** `TerminalPage.tsx`, `TerminalPage.css`

---

## P3 — Phase 10 Extensions (Weeks 4–8)

This is the only remaining planned phase from `phasesPlan.md`. Broken into three sub-phases:

### 10a — Plugin Discovery & Management (Week 4)

- `plugin_loader.rs` from P2.2 is the foundation
- Add plugin validation: check manifest `api: "v1"`, check no `..` path traversal in widget entries
- Add a basic trust model: sha256 hash of `plugin.json` stored in `~/.config/lumina/plugin-trust.json` on install; verified on load
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

`DashboardWidgetDeck` renders plugin widgets via a `<PluginWidgetRenderer>` component:
- Loads the widget's `.js` bundle via dynamic `import()` from a Tauri asset URL
- Passes `{ dh: window.dh }` as props (limited API surface for now)
- Wraps in an error boundary so a broken plugin doesn't crash the dashboard

### 10c — Developer API (Weeks 7–8)

- `packages/plugin-api/` workspace package: TypeScript types for plugin manifest + widget component interface
- `docs/PLUGIN_DEVELOPMENT.md`: how to build, test, and install a plugin
- Example plugin in `docs/examples/sample-plugin/`: minimal widget that displays system uptime

---

## P4 — File Size Debt (Ongoing, Alongside P3)

Extract when next touching each file — don't refactor speculatively.

| File | Lines | Extract When | Target Modules |
|---|---|---|---|
| `DockerPage.tsx` | 3,664 | Adding per-container stats (P2.1) | `DockerContainersTab.tsx`, `DockerImagesTab.tsx`, `DockerVolumesTab.tsx`, `DockerNetworksTab.tsx` |
| `GitConfigPage.tsx` | 2,835 | Next Git feature | `GitDoctorPanel.tsx`, `GitConfigInspector.tsx` |
| `ProfilesPage.tsx` | 2,704 | Next Profiles feature | `ProfileWizardModal.tsx`, `ProfileScaffoldModal.tsx` |

Rule: if you're adding >100 lines to one of these files, extract first.

---

## P5 — Release Gate (After P1–P2 Complete)

### AppImage Build Verification

On a clean Ubuntu 24.04 VM with only Rust + Node + system deps installed (no LuminaDev toolchain):
1. Clone repo, `pnpm install`, `pnpm build`
2. Tauri bundle → `.AppImage`
3. Run AppImage on that machine — verify readiness wizard launches, system probes work
4. Install Docker through the wizard (one-click install path), verify it works
5. Verify `dh:app:update:check` returns the correct built version string (not hardcoded)

### Cross-Distro Regression

| Distro | Focus Areas |
|---|---|
| Ubuntu 24.04 | nvm install (node runtime), docker group detection, git doctor scan |
| Fedora 40 | DNF package manager detection, Java runtime (major version), PHP |
| Arch Linux | pacman integration, systemd unit names for kernels page |

### Release Tag

`v0.3.0-beta` after:
- [ ] P1 complete (profile binding, stream cleanup, cache pre-warm)
- [ ] P2.1 complete (per-container stats)
- [ ] P2.2 complete (SettingsExtension plugin browser)
- [ ] AppImage verified on clean Ubuntu + Fedora
- [ ] `pnpm smoke` green on all three test configs

---

## Execution Order

```text
IMMEDIATE  → Open PR · merge docs/architectural-clarification → main
Week 1     → P1.1 Widget profile binding
Week 1     → P1.2 Log stream shutdown cleanup
Week 1     → P1.3 Command palette runtime cache pre-warm
Week 1     → P1.4 phasesPlan.md + AUDIT accuracy pass
Week 2     → P2.1 Per-container stats stream
Week 2     → P2.2 SettingsExtension plugin browser v0
Week 3     → P2.3 Terminal multiplexer (beta flag → real tabs)
Week 4     → P3/10a Plugin discovery + trust model
Week 5–6   → P3/10b Widget dynamic loading
Week 7–8   → P3/10c Developer API + example plugin
Parallel   → P4 File extraction when touching each large file
End of P3  → P5 Release gate → v0.3.0-beta tag
```

---

## Technical Debt Register

| Item | Risk | Mitigation |
|---|---|---|
| `lib.rs` at 684 lines (target: <678) | Medium — will grow with P2 channels | Extract `app_state.rs` if >700 |
| `AppState.streams` no size cap | Low — dev use only currently | Add `len() > 20` guard in P1.2 |
| Widget `layoutGet` hardcoded profile | High — breaks multi-profile UX | Fix in P1.1 (top priority) |
| `DashboardWidgetDeck` HTML5 drag on Wayland | Low — Wayland WebView drag is flaky | Add mouse-event fallback if reports come in |
| `runDiagnostics` in `GitConfigPage` never called | Low — suppressed with eslint comment | Wire to a "Quick Scan" button in GitDoctor panel, or remove in P4 file extraction |
| `docker stats` per-container polling at 3s | Low — one docker subprocess per open container | Add AbortSignal on component unmount |
