# LuminaDev — Unified Forward Plan

**Date:** 2026-05-30  
**Branch:** `main`  
**Rust modules:** 39 source files · `lib.rs` 684 lines  
**Smoke gate:** ✅ clean (typecheck + vitest + cargo test + clippy)

---

## State of Play

| Area | Status | Detail |
|---|---|---|
| Phases 0–9, 12, 13, 15, 16, 17 | ✅ DONE | All verified against source |
| Phase 11 — First-run Wizard | ✅ DONE | Merged into Phase 16 (8-step unified installer) |
| Phase 10 — Extensions | 🚫 REMOVED | Out of scope 2026-05-29; UI and infrastructure deleted |
| UI/UX Debt — all 6 items | ✅ DONE | Completed 2026-05-28 |
| Audit defects — all 7 issues | ✅ FIXED | Fixed 2026-05-28 |
| Smart Universal Search (fuzzy) | ✅ SHIPPED | Fuzzy-scored palette: pages, containers, runtimes, git repos |
| Git Doctor | ✅ WIRED | `git_doctor.rs` (478 lines), dispatcher arm at `lib.rs:175` |
| SettingsExtension tab | 🚫 REMOVED | Out of scope 2026-05-29 |
| Dashboard widgets | 🚫 REMOVED | Deck, layout IPC, and `/dashboard/widgets` route deleted 2026-05-29 |
| Status bar "Engine Connected" + version | ✅ FIXED | 2026-05-28 — live `appInfo()` IPC, dynamic health check |
| Sidebar nav `status: 'live'` badges | ✅ FIXED | 2026-05-28 — derived from engine health ping |
| Docs link | ✅ FIXED | 2026-05-28 — points to `docs.luminadev.app` |
| DashboardLogs search input | ✅ FIXED | 2026-05-28 — functional line-buffer filter on xterm.js |
| `link.workstation` widget dead route | ✅ FIXED | 2026-05-28 — routes to `/dashboard/logs` |
| AppImage release pipeline | ❓ UNVERIFIED | Not confirmed working end-to-end on clean machine |

---

## P0 — Merge Complete ✅

Branch merged to `main`. Audit fixes + fuzzy search applied on top.

---

## P1 — Small Gaps

### 1.1 Log Stream Cleanup on App Shutdown ✅ DONE (2026-05-28)
`AppState.streams` (`HashMap<String, AbortHandle>`) has no cleanup on window close. Streams running at shutdown are orphaned.
**Fix:** In `lib.rs` Tauri app builder, added `WindowEvent::CloseRequested` listener to abort all active streams on window close, and added a `streams.len() > 20` cap check.

### 1.3 Command Palette Runtime Data ✅ DONE (2026-05-28)
Replaced `localStorage` cache with live `dh:runtime:status` IPC call in `onPaletteOpen`. Runtimes fetched fresh each time palette opens.

### 1.4 phasesPlan.md + AUDIT_2026-05.md Accuracy Pass ✅ DONE (2026-05-28)
Updated status checklists to reflect actual codebase state.

### 1.5 Sidebar Navigation Refactor (Persistent Collapsed State) ✅ DONE (2026-05-28)
Main left sidebar navigation remains collapsed permanently. Hovering over icons displays clean Microsoft Dev Home-style tooltips.

### 1.6 Sidebar and Topbar Hover Tooltip Blur Issue ✅ DONE (2026-05-28)
Applied fixed even-width styles and integer-based negative margins with `transform: none` to all sidebar and topbar buttons for pixel-perfect alignment.

---

## P2 — Missing Features (Completed)

### 2.1 Per-Container Stats Stream ✅ DONE (2026-05-29)
Wired `dh:docker:container:stats` to poll statistics (`docker stats --no-stream`) for active containers and display resource metrics inside `DockerPage.tsx`.

### 2.2 Docker Volume `usedBy` mapping & Profile Orchestration stabilization ✅ DONE (2026-05-29)
Stabilized container volume status matching and updated translations.

---

## P3 — Phase 10 Extensions 🚫 REMOVED (2026-05-29)

Plugin marketplace, signed extensions, Settings Extension tab, and dashboard widget infrastructure are **not part of this project**. Do not reintroduce without an explicit product decision.

---

## P4 — Addressing File Size Debt (Ongoing)

Extract helper utilities and modular sub-panels from large monolithic files when next touched:

| File | Lines | Extract When | Target Modules |
|---|---|---|---|
| `DockerPage.tsx` | 3,664 | Next Docker feature | `DockerContainersTab.tsx`, `DockerImagesTab.tsx`, `DockerVolumesTab.tsx`, `DockerNetworksTab.tsx` |
| `GitConfigPage.tsx` | 2,835 | Next Git feature | `GitDoctorPanel.tsx`, `GitConfigInspector.tsx` |
| `ProfilesPage.tsx` | 2,704 | Next Profiles feature | `ProfileWizardModal.tsx`, `ProfileScaffoldModal.tsx` |

---

## P5 — Release Gate (Post-Stabilization)

### AppImage Build Verification
1. Clone repo on clean VM, build via `pnpm build` and Tauri CLI.
2. Verify system probes and one-click Docker setup launch correctly inside the AppImage.

### Cross-Distro Regression Matrix
- **Ubuntu 24.04**: `nvm`, `docker` group check, `git_doctor` scan.
- **Fedora 40**: DNF package-manager mapping, Java runtime, PHP.
- **Arch Linux**: `pacman` hooks, systemd unit names.

---

## P6 — CodeRabbit Audit Remediation ✅ DONE (2026-05-29)

Resolved all security and logical audit defects found during reviews:
- **SSH shell command injection** in SCP/Rsync functions resolved by escaping inputs and using safe quoting.
- **ProfilesPage global credential deletion bug** resolved by only unlinking credentials from profiles.
- **ProfilesPage optimistic saving bug** resolved by awaiting responses before updating UI state.
- **GitConfigPage backup importing** now validates schema using JSON validation.
- **FirstRunWizardPage copy localizations** translated properly.
- **git_doctor.rs whitespace trimming** resolved false negatives.
- **vite-env.d.ts dockerCleanupRun signature** updated to match real backend responses.
- **git_doctor.rs SSH directory probe** rewritten to use standard `std::fs::read_dir` instead of subshell `sh -c ls`.
- **zod schemas** extended to support failure responses for Git Doctor scans.

---

## P7 — Theme & Surface Rollout Plan (Post-Maintenance Pilot)

The visual design system uses ambient gradients, elevated cards, diagnostics rows, and terminal-style panels. This plan outlines generalizing this modern aesthetic across routes:

### Principles
1. **Scope by page** — Apply route-specific classes (e.g. `.docker-page`) and separate stylesheet. Avoid global CSS bloat.
2. **Reuse tokens** — Utilize existing CSS variables (`--accent`, `--bg-widget`, `--border`).
3. **Progressive enhancement** — Elevate styling without changing existing IPC routing or layouts.

### Rollout Order
1. **`/system` (Monitor)**: Metrics cards and status chips.
2. **`/docker`**: Elevate container lists, toolbars, and forms.
3. **`/git-config`**: Hero styling and categorized config lists.
4. **`/runtimes`**: Elevate runtime installer wizard cards.
5. **`/dashboard` main**: Overhaul widgets to match.


