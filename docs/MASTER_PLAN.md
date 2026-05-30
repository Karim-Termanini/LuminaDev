# LuminaDev — Master Plan

**Last updated:** 2026-05-30  
**Canonical phase history:** [`phasesPlan.md`](../phasesPlan.md) *(unchanged — detailed per-phase checklists live there)*  
**Route truth table:** [`ROUTE_STATUS.md`](./ROUTE_STATUS.md)  
**Release gate:** [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md)  
**Quality gate:** `pnpm smoke` must pass before merge

This document consolidates **all active planning** into one place: forward backlog, stabilization track, Git VCS roadmap, release criteria, architecture standards, and status of historical implementation plans. **`phasesPlan.md` is not duplicated here line-for-line** — it remains the authoritative phase-by-phase record; this file synthesizes it with every other plan.

---

## 1. Product principles

> From [`phasesPlan.md`](../phasesPlan.md) — apply to every feature and dialog.

- **Full Hosted:** LuminaDev is an environment manager on the host. It is **not** a strict sandbox (no cgroup/Docker-isolated build isolation by design).
- **Design standard:** Technical efficiency, visual elegance, and premium UX aligned with **Microsoft Dev Home**.
- **Audience:** Absolute beginners **and** professional developers — one-click automation with deep logs and raw control when needed.

---

## 2. Current state (2026-05-30)

| Area | Status | Notes |
| --- | --- | --- |
| Phases 0–9, 12, 13, 15, 16, 17 | ✅ DONE | Verified against source; see [`phasesPlan.md`](../phasesPlan.md) execution order |
| Phase 11 — First-run Wizard | ✅ DONE | Merged into Phase 16 (8-step readiness installer) |
| Phase 10 — Extensions | 🚫 REMOVED | Settings Extension tab, plugin marketplace, widget infrastructure deleted 2026-05-29 |
| Dashboard widgets | 🚫 REMOVED | Deck, `/dashboard/widgets`, `layoutGet`/`layoutSet`, `widgetRegistry` |
| UI/UX debt (6 items) | ✅ DONE | 2026-05-28 — runtimes cache, kernels grid, logs multiplex, nav polish |
| CodeRabbit / audit P6 | ✅ DONE | 2026-05-29 — SSH injection, profile save races, git doctor, schema fixes |
| Smart Universal Search | ✅ SHIPPED | Fuzzy palette: pages, containers, runtimes, git repos |
| Git Doctor | ✅ WIRED | `git_doctor.rs` + Git Config Diagnostics tab |
| Per-container Docker stats | ✅ DONE | 2026-05-29 — `dh:docker:container:stats` on Docker page |
| Tauri migration Stages 0–3 | ✅ DONE | Electron removed; all IPC native Rust |
| Tauri Stage 4 (packaging) | 🔄 IN PROGRESS | CI green; **AppImage E2E on clean VM unverified** |
| Tauri Stage 5 (release gate) | 📋 OPEN | Maintainer sign-off + manual checklist when product-ready |

**Partial surfaces** (see [`ROUTE_STATUS.md`](./ROUTE_STATUS.md)):

- Settings: hosts editor + `~/.profile` env editor live on **System** tab; GitHub/GitLab auth on **Connected accounts** (`settings_*` host exec + cloud auth IPC)
- Runtimes: install matrix hardened (distro ID_LIKE, verify gate, empty-package errors)
- Profiles ↔ dashboard: `active_profile` resolver + cross-page sync (2026-05-30)
- Git VCS: Smart-Flow phases 3–5 partially shipped (see §6)
- Cloud Git: no API-side merge from Lumina; no notification inbox

---

## 3. Phase execution summary

Full checklists, bug tables, and module standards: **[`phasesPlan.md`](../phasesPlan.md)**.

```text
✅  Phase 0  — Foundations
✅  Phase 1  — Dashboard (widget deck removed 2026-05-29)
✅  Phase 2  — Docker
✅  Phase 3  — SSH
✅  Phase 4  — Git Environment Manager
🔄  Phase 5  — Monitor (partial; per-container stats moved to Docker)
🔄  Phase 6  — Runtimes (17 languages; Fedora Ruby slow — known)
✅  Phase 7  — Maintenance / Guardian
✅  Phase 8  — Settings (14 tabs; Resources tab absent; Extension removed)
✅  Phase 9  — Profiles + scaffolding
❌  Phase 10 — Extensions (removed from scope 2026-05-29)
✅  Phase 11 — First-run Wizard (merged into Phase 16)
✅  Phase 12 — Cloud Git + Smart-Flow VCS (partial; see §6)
✅  Phase 13 — Advanced CI & environment hardening
✅  Phase 15 — Theme surface rollout (elevated aesthetic)
✅  Phase 16 — System Readiness / Pre-requisites wizard
✅  Phase 17 — lib.rs monolith refactor (37 Rust modules, ~678-line dispatcher)
✅  SPRINT   — Tests + audit + cross-distro + v0.2.0-alpha tag
```

### Explicitly out of scope

- Extensions / plugin marketplace / Settings Extension tab
- Dashboard widget catalog, deck, layout IPC
- Drag-and-drop polish beyond existing HTML5
- Full theme rollout to every secondary route (Maintenance pilot done)
- Policy Lock, Visual Change Preview
- Package-manager distribution (GitHub Releases / AppImage only)

---

## 4. Priority backlog

### P0 — Merge / integration ✅

Main integration track complete. Feature branches merge via PR + `pnpm smoke`.

### P1 — Small gaps ✅ (2026-05-28)

| Item | Status |
| --- | --- |
| Log stream cleanup on window close | ✅ `CloseRequested` aborts `AppState.streams` |
| Command palette live runtime data | ✅ `dh:runtime:status` on palette open |
| phasesPlan + AUDIT accuracy pass | ✅ |
| Sidebar collapsed + tooltip alignment | ✅ |
| Docs link → `docs.luminadev.app` | ✅ |
| DashboardLogs search filter | ✅ |
| Engine health + version in status bar | ✅ |

### P2 — Feature gaps ✅ (2026-05-29)

| Item | Status |
| --- | --- |
| Per-container stats on Docker page | ✅ |
| Docker volume `usedBy` + profile orchestration | ✅ |

### P3 — Phase 10 Extensions 🚫 REMOVED

Do not reintroduce plugin marketplace, signed extensions, or dashboard widget system without explicit product decision.

### P4 — File size debt (ongoing)

Extract when next touching these files:

| File | Lines | Target split |
| --- | --- | --- |
| `DockerPage.tsx` | ~3,664 | `DockerContainersTab`, `DockerImagesTab`, `DockerVolumesTab`, `DockerNetworksTab` |
| `GitConfigPage.tsx` | ~2,835 | `GitDoctorPanel`, `GitConfigInspector` |
| `ProfilesPage.tsx` | ~2,704 | `ProfileWizardModal`, `ProfileScaffoldModal` |

### P5 — Release gate (post-stabilization)

1. **AppImage verification** — clone on clean VM, build, verify probes + Docker wizard inside AppImage.
2. **Cross-distro matrix** — Ubuntu 24.04, Fedora 40, Arch: docker group, Java runtime, `git_doctor`, monitor `/proc`.

### P6 — CodeRabbit audit remediation ✅ (2026-05-29)

SSH command injection, profile credential unlink vs global delete, optimistic save races, backup JSON validation, git doctor whitespace/SSH probe, Zod failure schemas — all resolved. Details: [`AUDIT.md`](./AUDIT.md).

### P7 — Theme enhancements (post-maintenance)

Phase 15 elevated theme shipped on primary routes. Future (post-Alpha):

- Theme picker (light/dark/high-contrast) without reload
- Dynamic token swapping
- Semantic color tokens

~~P7 rollout item “dashboard widgets”~~ — removed with widget purge.

---

## 5. Stabilization & release track

Source: [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md), [`STATUS.md`](./STATUS.md).

### Stabilization gate ✅ PASSED

| # | Item | Status |
| --- | --- | --- |
| 1 | Commit quality + PR discipline | ✅ `COMMIT_QUALITY_RULES.md`, PR template |
| 2 | IPC reliability coverage | ✅ Contract tests: ssh, git, runtime, docker, … |
| 3 | Privilege boundary evidence | ✅ Stabilization checklist §3 (native host; Flatpak abandoned) |
| 4 | Scope freeze enforcement | ✅ |
| 5 | Documentation truthfulness | ✅ [`AUDIT.md`](./AUDIT.md) Appendix A |

Exit rule: items 1–3 + 5 done, item 4 enforced, `pnpm smoke` green.

### Tauri migration stages

| Stage | Scope | Status |
| --- | --- | --- |
| 0 | Baseline + freeze | ✅ |
| 1 | Tauri skeleton + API bridge | ✅ |
| 2 | Rust-native backend (all IPC) | ✅ |
| 3 | Renderer parity | ✅ |
| 4 | Packaging + CI | 🔄 AppImage E2E unverified |
| 5 | Release gate | 📋 Open — no tag until maintainer declares product-ready |

### Manual test checklist (B5)

Run on real Tauri build. Legend: verified in stabilization pass unless noted.

- **Startup:** launch, readiness wizard, dashboard load
- **Docker:** list/actions/logs/images/volumes/networks/cleanup/remap/install guards
- **Terminal:** xterm prompt + input; external terminal optional
- **SSH:** generate, copy pubkey, GitHub test
- **Git Config:** list + set identity
- **Monitor:** metrics, processes, system info
- **Maintenance:** compose launch, diagnostics bundle
- **Runtimes:** status list

Known limits on **native** builds: terminal is line-buffered (no full PTY for vim); Docker requires socket access and often docker group membership.

---

## 6. Git VCS — Smart-Flow roadmap (“Zero Terminal”)

Full blueprint: [`SMART_FLOW_VCS.md`](./SMART_FLOW_VCS.md). Integration bar reference: `docs/images/smart-flow-vcs-integration-bar.png`.

**North star:** Banners + focused modals; one obvious next step; all errors humanized via `[GIT_VCS_*]` / `humanizeGitVcsError`.

### Shipped

| Capability | Location |
| --- | --- |
| Merge / rebase / continue / abort / skip / stash pop | `gitVcsIntegrateBar.tsx`, `GitVcsPage.tsx`, `dh:git:vcs:*` |
| Fetch / pull / push | `GitVcsPage.tsx` + Rust dispatch |
| Smart Push prefetch gate | Silent fetch; block push when `behind > 0`; `[GIT_VCS_INTEGRATION_REQUIRED]` |
| Protected branch handling | `[GIT_VCS_PROTECTED_BRANCH]` + bypass branch + PR/MR wizard |
| Conflict file highlighting | Porcelain `C` status, sorted list, hint banner |
| Conflict resolver (partial) | `GitVcsConflictResolver` — combined/ours diffs via existing IPC |
| Cloud PR/MR wizard | Post-push create flow with token auth |
| CI pipelines panel | GitHub Actions + GitLab CI, 30s poll |
| Copy raw error | Git op panel |

### Active backlog (vertical slices)

| # | Slice | Done when |
| --- | --- | --- |
| 1 | Git state machine + banners | Cherry-pick/bisect in `gitOperation`; tests on status payload |
| 2 | Smart Push polish | Slow-fetch “Checking remote…” subtext; upstream-missing policy |
| 3 | Conflict staging loop | Continue enabled only when conflicts cleared + staged; diff fallback validated |
| 4 | Visual 3-way resolver | Dedicated `:1/:2/:3` IPC optional; side-by-side hunk UI |
| 5 | Cloud PR bridge hardening | Robust remote → owner/repo / project id for self-hosted |
| 6 | Integration bar a11y | Keyboard focus + screen reader on ref picker |

### Explicit non-goals

- libgit2 replacement of all CLI
- Server-side merge resolution
- Notifications inbox / mentions (separate Cloud Git scope)

### Agent checklist (Git work)

- [ ] `pnpm smoke` or narrowest gate from `CLAUDE.md`
- [ ] Humanized errors for new `[GIT_VCS_*]` / `[CLOUD_*]` codes
- [ ] Update [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) if `/git` behavior changes
- [ ] Cancel network calls on unmount / remote change

---

## 7. Rust backend architecture standards

From [`phasesPlan.md`](../phasesPlan.md) § Rust Backend Architecture — enforce on every backend change.

**`lib.rs` is thin only:** command declarations, `ipc_invoke` / `ipc_send` dispatch, `AppState`, module declarations.

**Extract a module when:**

- Logic > 200 lines
- Domain has 5+ related functions
- Tests need isolation
- Logic reused across handlers → `utils.rs` or domain module

**Dependency flow (one-way):**

```text
lib.rs → domain modules (docker_ext, terminal_pty, …) → utils.rs
```

**Red flags:** handler > 50 lines in `lib.rs`; circular imports; duplicate logic across arms.

**Current outcome (Phase 17):** ~37 source files; `lib.rs` ~678 lines; largest modules `runtime_jobs.rs`, `system_info.rs`.

---

## 8. Known bugs

All 28 tracked bugs in [`phasesPlan.md`](../phasesPlan.md) Known Bugs table are **✅ FIXED** as of 2026-05-28/29.

Page-level manual checks live in [`AUDIT.md`](./AUDIT.md) Appendix B. Route maturity: [`ROUTE_STATUS.md`](./ROUTE_STATUS.md).

---

## 9. Open audit items

From [`AUDIT.md`](./AUDIT.md) §1 (condensed):

| Priority | Item | Status |
| --- | --- | --- |
| P0 | AppImage release pipeline E2E | ❓ Unverified |
| P2 | Settings hosts/env editing + Connected accounts auth | ✅ Done |
| P2 | Runtimes install matrix hardening | ✅ Done (2026-05-30) |
| P2 | Git VCS polish / simple mode | 🟡 Partial (simple default: compact hints + contextual sync toolbar; Pro via beta flag) |
| — | Resources settings tab | Removed (no Rust enforcement) |

---

## 10. Historical implementation plans (removed)

Task-level plans under `docs/superpowers/plans/` and matching specs under `docs/superpowers/specs/` were **deleted 2026-05-30** after consolidation into this file. `docs/FORWARD_PLAN_2026-05-28.md` and `phasesPlan.original.md` were removed the same day.

| Former plan | Topic | Final status |
| --- | --- | --- |
| `2026-05-02-cloud-git-auth.md` | Cloud Git OAuth/PAT | ✅ Shipped |
| `2026-05-02-git-vcs.md` | Git VCS IPC + page | ✅ Shipped; Smart-Flow in §6 |
| `2026-05-11-docker-management-ui.md` | Docker page tabs | ✅ Shipped |
| `2026-05-25-phase8-settings.md` | Settings tabs | ✅ Shipped (Extension removed) |
| `2026-05-26-phase9-completion.md` | Profiles engine | ✅ Shipped |
| `2026-05-27-phase16-refactor.md` | Readiness wizard + refactor | ✅ Shipped |
| `2026-05-27-i18n-implementation.md` | i18n rollout | ✅ Shipped |
| `2026-05-28-dashboard-kernels.md` | Kernels page grid | ✅ Shipped |
| `2026-05-28-dashboard-logs-streaming.md` | Logs xterm multiplex | ✅ Shipped |
| `2026-05-28-dashboard-main-widgets.md` | Widget hero | 🚫 Removed 2026-05-29 |
| `2026-05-28-dashboard-widgets-page.md` | Widget management page | 🚫 Removed 2026-05-29 |
| `2026-05-28-global-nav-command-palette.md` | Fuzzy command palette | ✅ Shipped |
| `2026-05-28-runtimes-perf.md` | Runtimes lazy-load/cache | ✅ Shipped |

---

## 11. Immediate sprint (release-critical path)

From [`phasesPlan.md`](../phasesPlan.md) Immediate Sprint — **cosmetic work blocked until release criteria met**.

| Window | Focus | Status |
| --- | --- | --- |
| Days 1–2 | GitHub Releases / AppImage distribution | ✅ Scope set |
| Days 3–4 | Rust smoke + Docker integration tests + CI | ✅ |
| Day 5 | Deep audit: shell commands, timeouts, capabilities | ✅ |
| Days 6–7 | Cross-distro testing (Ubuntu, Fedora, Arch) | ✅ |
| Days 8–9 | Polish + README + CONTRIBUTING | ✅ |
| Day 10 | Internal release `v0.2.0-alpha` | ✅ tagged |

**Remaining from sprint spirit:** Stage 4 AppImage verification on clean VM (§5 P5).

---

## 12. Document map

| Document | Role |
| --- | --- |
| **`phasesPlan.md`** | Canonical phase history + bug table + architecture rules |
| **`docs/MASTER_PLAN.md`** (this file) | Unified active plan + backlog + release gate |
| `docs/SMART_FLOW_VCS.md` | Git VCS blueprint (detail beyond §6) |
| `docs/STABILIZATION_CHECKLIST.md` | Stabilization evidence + B5 manual checklist |
| `docs/ROUTE_STATUS.md` | Route live/partial/stub matrix |
| `docs/STATUS.md` | High-level product status |
| `docs/AUDIT.md` | Consolidated audit (codebase + docs + page QA) |

---

## 13. Agent workflow

1. Read **`phasesPlan.md`** for phase context and architectural rules.
2. Read **this file** for current backlog priority and what is removed.
3. Check **`ROUTE_STATUS.md`** before changing route behavior.
4. Implement contract-first: `packages/shared` → Rust handlers → renderer.
5. Run **`pnpm smoke`** before claiming done.
6. Update **`ROUTE_STATUS.md`** / **`STATUS.md`** if user-visible maturity changes.
7. **Verify & Instruct:** Always provide clear, step-by-step instructions to the user on how to manually verify the changes (e.g., what to click, try, or test) at the end of the task.

---

*When this file and `phasesPlan.md` disagree on historical phase completion, trust `phasesPlan.md` for phase detail and this file for forward priority and removal decisions.*
