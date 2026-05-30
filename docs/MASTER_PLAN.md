# LuminaDev — Master Plan

**Last updated:** 2026-05-30  
**Canonical phase history:** [`phasesPlan.md`](../phasesPlan.md) *(unchanged — detailed per-phase checklists live there)*  
**Git Assistant sprint spec:** [`gitRefactor.md`](../gitRefactor.md) *(product + implementation plan for this sprint)*  
**Route truth table:** [`ROUTE_STATUS.md`](./ROUTE_STATUS.md)  
**Release gate:** [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md)  
**Quality gate:** `pnpm smoke` must pass before merge

This document consolidates **all active planning** into one place: forward backlog, stabilization track, Git VCS roadmap, release criteria, architecture standards, and status of historical implementation plans. **`phasesPlan.md` is not duplicated here line-for-line** — it remains the authoritative phase-by-phase record; this file synthesizes it with every other plan.

**Active sprint (2026-05-30):** Git Assistant — G1 + G3 polish shipped on `/git` per [`gitRefactor.md`](../gitRefactor.md). Next: **G2 validate** (5-user dogfood). **One Git UX only** — no advanced page, no pro toggle. Merge/rebase/PR/CI/stash → editor, terminal, or cloud host in the browser.

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
- Git VCS: **Git Assistant** on `/git` (G1 shipped); legacy tabbed hub removed (see §6)
- Cloud Git: no API-side merge from Lumina; no notification inbox; Cloud tab folds into Setup in G1

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
✅  Phase 12 — Cloud Git + legacy pro Git UI (Smart-Flow retired in G1; see §6)
✅  Phase 13 — Advanced CI & environment hardening
✅  Phase 15 — Theme surface rollout (elevated aesthetic)
✅  Phase 16 — System Readiness / Pre-requisites wizard
✅  Phase 17 — lib.rs monolith refactor (37 Rust modules, ~678-line dispatcher)
✅  SPRINT   — Tests + audit + cross-distro + v0.2.0-alpha tag
📋  G1–G3    — Git Assistant (`gitRefactor.md`) — active; see §6, §11
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
| ~~`GitConfigPage.tsx`~~ | removed G1.10 | Git Doctor → inline on Setup checklist |
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

## 6. Git — Git Assistant sprint (single UX; legacy UI removed)

**Product thesis (this sprint):** Lumina Git = *"Set up once, open your project, save your work, send it online — and get plain-language help when Git says no."* Not a Git client; enabling glue inside the dev environment. Full spec: [`gitRefactor.md`](../gitRefactor.md).

**Product rule:** There is **no** Lumina “advanced Git” mode — no second page, no beta flag, no header Pro toggle. Anything beyond setup / open / save / share / connect GitHub → **editor, terminal, or GitHub in the browser** (footer link states this once).

**Implementation constraint:** Renderer-only. **Do not delete Rust IPC** the new UI no longer calls. Reuse `computeGitAssistantNextAction`, `humanizeGitVcsError`, Git Doctor IPC, cloud auth, `gitVcsStage` / `gitVcsCommit` / `gitVcsPull` / `gitVcsPush`. **Legacy pro renderer surfaces deleted (G1.10).**

**Rust IPC policy (team decision):** Keep unused `dh:git:vcs:*` handlers and matching `IPC` channels for contract tests. Document with **JSDoc `@deprecated` on `IPC` consts** + `git_vcs_ipc.rs` module comment — **not** `#[deprecated]` on Rust fns (CI `deny(warnings)` risk). Renderer must not call pro-only channels. Delete only after zero-reference audit.

**UX policy (2026-05-30 reassessment):** GitHub optional for commit; dual labels (git term + beginner sub); progress rail = status not order; branch switch/create on page; editor from `dh:editor:list` + refresh on focus.

### Sprint phases (G1 → G3)

| Phase | Goal | Target | Exit criteria |
| --- | --- | --- | --- |
| **G1 — Ship** | Replace `/git` entirely | ~2 weeks | All G1 checkboxes below; legacy tabbed Git UI **deleted** from routes |
| **G2 — Validate** | Real user flows | After G1 merge | 5 users complete open → push without help; no "how do I stage/rebase" tickets |
| **G3 — Iterate** | Polish | After G2 metrics | Diff preview toggle, recents polish, post-push "Open in GitHub" |

#### G1 — Ship (work breakdown)

| Slice | Deliverable | Notes |
| --- | --- | --- |
| G1.1 | `GitAssistantPage` owns `/git` | Single route; no `?tab=config\|vcs\|cloud`; no feature flags for Git mode |
| G1.2 | One page, one lane + progress rail | Vertical scroll; rail **Setup → Project → Save → Share** reflects live status (see **Progress rail** below); sticky **Next** card |
| G1.3 | One primary button | `computeGitVcsNextAction` drives one prominent CTA; matrix in `gitRefactor.md` Part 3 |
| G1.4 | Beginner language | UI strings: Include in save, Save snapshot, Get latest, Send to GitHub*, etc.; backend channel names unchanged |
| G1.5 | `GitSetupChecklist` | 4 items (identity, credential helper, GitHub optional, default branch main); Git Doctor inline on failed items only |
| G1.6 | `GitProjectBar` | Folder picker open + clone (URL + picker, not raw path); recents chips |
| G1.7 | `GitChangesPanel` + `GitSaveShareBar` | Checkbox stage → save snapshot; Get latest / Send to GitHub when applicable |
| G1.8 | Help-me modals | Dirty checkout, behind-remote, conflicts → open external editor; no in-app merge IDE |
| G1.9 | Cloud folded into Setup | Connect GitHub card; post-connect recent repos + "Open in GitHub"; no PR wizard / CI / issues on `/git` |
| G1.10 | **Delete legacy Git UI** | Remove tab shell, `GitVcsPage` pro surface, integrate bar, conflict resolver UI, CI/pipelines panel, cloud activity tab, config inspector dashboard, `?tab=` redirects updated or dropped |
| G1.11 | External-tool footer | Canonical copy (see **Footer** below) |

**G1 ship checklist**

- [x] `/git` loads only Git Assistant (no tab switcher, no pro toggle)
- [x] Setup checklist shows 4 items with fix actions (+ Git Doctor on failed rows)
- [x] User can open/clone a repository (folder picker)
- [x] User can save snapshot (commit), get latest (pull), send to GitHub (push)
- [x] Next-action card shows correct primary button for all states in decision matrix
- [x] Humanized errors on failures (+ behind-remote modal on push block)
- [x] Conflicts route to external editor only
- [x] Legacy `GitVcsPage` / three-tab git routes unreachable (code deleted; redirects → `/git`)
- [x] Progress rail: Share incomplete when GitHub not connected; all four steps track real status
- [x] Footer uses canonical copy above
- [x] Pro-only IPC documented in shared JSDoc (channels kept; no Rust `#[deprecated]`)
- [x] G1.9: Open on GitHub when connected (+ post-push hint when `ahead === 0`)

**Removed from product (not relocated — gone from Lumina Git)**

| Former surface | Disposition |
| --- | --- |
| Three-tab hub (Config / VCS / Cloud) | Deleted; folded into single page where noted |
| Merge/rebase/continue/stash/cherry-pick/bisect UI | Deleted → editor/terminal |
| `GitVcsConflictResolver` / 3-way merge | Deleted → editor |
| CI pipelines panel on Git | Deleted → GitHub/GitLab web |
| PR/MR wizard on Git | Deleted → browser after push |
| Protected-branch bypass wizard | Deleted → terminal |
| Config inspector / health dashboard / preset matrix | Deleted → Settings identity only if needed |
| Multi-remote provider rail | Deleted |
| Copy raw IPC error on Git page | Deleted (Settings → Developer optional) |
| Smart-Flow integration bar | Deleted |

[`SMART_FLOW_VCS.md`](./SMART_FLOW_VCS.md) is **historical reference only** — not an active backlog.

#### Progress rail (G1.2 — must match real state)

Rail steps are **clickable**; each shows complete (●), incomplete (○), or active (current focus). Derive from IPC/status, not static labels.

| Step | Active when | Complete when | Incomplete examples |
| --- | --- | --- | --- |
| **Setup** | First visit or any setup checklist item failing | All four checklist items ✓ (identity, credential helper, GitHub, default branch) | Name/email missing |
| **Project** | No repo open or invalid repo | Folder selected and repo loads | No project path |
| **Save** | Uncommitted changes in working tree | No uncommitted changes (snapshot saved or clean tree) | Dirty files remain |
| **Share** | Ready to sync with remote but blocked, or user is on share journey | **GitHub (or push auth) connected** AND nothing left to push (`ahead === 0` or no unpushed commits) | **GitHub not connected** → Share stays **incomplete** even if local tree is clean; unpushed commits → incomplete |

**Share + GitHub rule:** Share stays **incomplete** when GitHub is not connected or unpushed commits exist — but **Connect GitHub is not the primary action** unless `ahead > 0`. Local commit always available via **git commit** when dirty.

Implement `computeGitProgressRail()` (or extend existing status hook) with unit tests for: no GitHub → Share incomplete; connected + ahead → incomplete; connected + pushed → complete.

#### Footer (G1.11 — canonical copy)

```text
Need more than save, send, and sync? Use VS Code, Cursor, your terminal, or GitHub directly for advanced Git operations.
```

#### G2 — Validate

**Gates before external testers (not optional for G2):**

- [x] `ar-SA` / `de-DE` `assistant.*` strings translated (English leftovers confuse quality perception)
- [x] Clone fix committed (`parent/repoName` + open existing repo on `[GIT_CLONE_EXISTS]`)

**G2 exit (5 real users):**

- [ ] Open → first push in < 2 minutes average
- [ ] Zero crashes on clone / pull / push in test pass
- [ ] No support load on staging/rebase terminology

#### G3 — Iterate

**Hardening (race-safety — treat as required for G3, not optional):**

- [x] Cancel in-flight IPC on unmount / `repoPath` change (status, remotes, doctor scan, diff preview) so late responses cannot overwrite state

**Product polish:**

- [x] Remote-aware or generic Share copy (GitHub/GitLab from `origin` host)
- [x] Diff preview toggle per file
- [x] Recents list polish
- [x] Post-push “Open on host” one-liner (GitHub/GitLab from remote URL)

**Intentional ceiling (no backlog):** dirty-checkout **stash** stays terminal + modal; no in-app stash IDE (correct for beginner scope).

### Explicit non-goals (Git — permanent)

- Second Git UI, advanced page, or `enable_advanced_git` / pro toggle
- In-app conflict merge studio or visual 3-way resolver
- Smart-Flow vertical slices (rebase UI, cherry-pick, bisect, PR wizard in-app)
- libgit2 replacement of all CLI
- Server-side merge resolution
- Notifications inbox / mentions on `/git`
- Deleting unused `dh:git:vcs:*` IPC in G1 (deprecate only; see **Rust IPC policy**)

### Agent checklist (Git sprint work)

- [x] `pnpm smoke` or narrowest gate from `CLAUDE.md`
- [x] Humanized errors for any new `[GIT_VCS_*]` / `[CLOUD_*]` codes
- [x] Update [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) when `/git` default UX changes
- [x] Contract tests for beginner page state machine / next-action matrix / **progress rail**
- [x] Pro-only IPC not called from renderer (documented in shared package)
- [x] Cancel network calls on unmount / remote change (status, cloud auth, remotes, doctor, diff)

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
| P2 | Git VCS — Git Assistant (G1–G3) | ✅ G1 shipped; G2 validate / G3 iterate — see §6 |
| — | Resources settings tab | Removed (no Rust enforcement) |

---

## 10. Historical implementation plans (removed)

Task-level plans under `docs/superpowers/plans/` and matching specs under `docs/superpowers/specs/` were **deleted 2026-05-30** after consolidation into this file. `docs/FORWARD_PLAN_2026-05-28.md` and `phasesPlan.original.md` were removed the same day.

| Former plan | Topic | Final status |
| --- | --- | --- |
| `2026-05-02-cloud-git-auth.md` | Cloud Git OAuth/PAT | ✅ Shipped |
| `2026-05-02-git-vcs.md` | Git VCS IPC + pro page | ✅ IPC shipped; **pro UI retired in G1** (§6) |
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

## 11. Sprint priority tiers (daily driver → release)

Supersedes the closed **v0.2.0-alpha** immediate sprint in [`phasesPlan.md`](../phasesPlan.md). Order work by what blocks *your* workstation use; public release docs still list AppImage as P0 — treat as **P-last** until Tier 1 is good enough.

### Tier 1 — Daily-driver gaps

Finish **one** before opening the next.

| Gap | Status (2026-05-30) | Notes |
| --- | --- | --- |
| Settings hosts + profile env editing | ✅ | System tab: `/etc/hosts` + `~/.profile` via `hostExec` |
| Runtimes install matrix | ✅ | Distro ID_LIKE, verify gate (2026-05-30) |
| Profiles ↔ dashboard alignment | ✅ | `active_profile` + cross-page sync (2026-05-30) |
| **Git VCS — Git Assistant G1** | ✅ **Shipped** | G2/G3: [`gitRefactor.md`](../gitRefactor.md) §12 |

### Tier 2 — Opportunistic cleanup

- P4 file splits (`DockerPage`, `GitConfigPage`, `ProfilesPage`) when already editing those files
- P7 theme picker after core flows
- Cloud Git inbox / API merge only if needed

### Tier 3 — Release (end)

1. AppImage build on clean VM (§5 P5)
2. Cross-distro smoke (Ubuntu, Fedora, Arch)
3. Tauri Stage 5 sign-off + tag

### Git Assistant sprint timeline (G1)

Suggested slice order inside G1 (can parallelize G1.4 strings with G1.2 layout):

```text
Week 1   G1.1 route shell → G1.2 layout/rail → G1.3 next-action card → G1.5 checklist
Week 2   G1.6 project bar → G1.7 changes/save-share → G1.8 modals → G1.9 cloud card → G1.10 delete legacy UI → G1.11 footer → smoke + ROUTE_STATUS
Post-G1  G2 validate → G3 iterate
```

**Ignore:** Extension tab, dashboard widgets, Flatpak, Resources tab, cosmetic theme beyond need, chasing all routes `live` in `ROUTE_STATUS.md` for marketing.

---

## 12. Document map

| Document | Role |
| --- | --- |
| **`phasesPlan.md`** | Canonical phase history + bug table + architecture rules |
| **`docs/MASTER_PLAN.md`** (this file) | Unified active plan + backlog + release gate |
| **`gitRefactor.md`** | Git Assistant product + G1/G2/G3 spec (active sprint) |
| `docs/SMART_FLOW_VCS.md` | Historical Smart-Flow blueprint (superseded by §6; do not extend) |
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
