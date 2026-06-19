# KeelDev — Master Plan

**Last updated:** 2026-06-19 (AI Core roadmap + §19 stay/delete/transform inventory)  
**Git Assistant spec (shipped):** [`gitRefactor.md`](../gitRefactor.md)  
**AI Core spec (forward):** [`newCore.md`](../newCore.md) — canonical detailed plan; do not edit from planning passes  
**Route truth table:** [`ROUTE_STATUS.md`](./ROUTE_STATUS.md)  
**Release gate:** [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md)  
**Quality gate:** `pnpm smoke` must pass before merge

This document consolidates **all active planning** into one place: forward backlog, stabilization track, Git VCS roadmap, release criteria, architecture standards, and status of historical implementation plans. **`phasesPlan.md` is not duplicated here line-for-line** — it remains the authoritative phase-by-phase record; this file synthesizes it with every other plan.

**Canonical phase history:** [`phasesPlan.md`](../phasesPlan.md) *(detailed per-phase checklists)*  

**Sprints closed (2026-05-31 → 2026-06-02):**

| Sprint | Status | Branch / notes |
| --- | --- | --- |
| **Git Assistant G1–G3** | ✅ Shipped + validated | Beginner `/git` flow; in-app Create PR; see §6 |
| **Git Assistant G4 — hardening** | ✅ Done + manually verified | Partial commit, push-with-dirty-tree, existing-PR probe, post-push copy; see §6 **G4** |
| **Runtimes R1–R3** | ✅ Done | 18 → 7 runtimes; Fedora manual smoke (7 cards + .NET verify); see §14 |
| **Maintenance M1** | ✅ Done | Humanized Guardian scores, elevated UI, tab ownership, systemd actions; see §15 |
| **Monitor — dashboard tab** | ✅ Done | `/dashboard/monitor`; `/system` redirect; Dev Home surface + health hints; see §16 |
| **Audit sweep 2026-06-02** | ✅ Done | 14 findings closed: dead files, missing contract/error patterns, IPC bridge gaps, doc fabrications, deprecated annotations, stale doc numbers; see [`AUDIT.md`](./AUDIT.md) §9 |
| **Graphify architecture pass** | ✅ Done | `graphify-out/graph.json` + `GRAPH_REPORT.md` @ `fc9c8fa`; informs §17 Phase 18 backlog |
| **Test gate realignment (P11)** | ✅ Done | CI `integration-and-e2e-lite` runs `test:roundtrip` + `test:e2e` + `test:coverage` (no `test:integration`) |
| **Phase 18 P9 bridge bypasses** | ✅ Done | 24 direct `ipc_invoke` calls migrated to `window.dh` / `desktopApiBridge.ts` |
| **Independent verification (2026-06-02)** | ✅ Report | `pnpm smoke` green @ `fc9c8fa`; 134 IPC channels / 54 `RequestSchema`; 24 renderer `ipc_invoke` bypasses; compose **8/9 presets stub-only** (full stack only `web-dev`); AUDIT §13 rechecked |
| **Stale audit deletion + unwrap fix (2026-06-02)** | ✅ Done | Deleted `COMPREHENSIVE_AUDIT_2026_06_02.md` (stale, claimed CI broken — false); replaced 2 `unwrap()` in `system_info.rs:724,729` with `if let` |

**Next (sequenced):** Phase 18 P10 batch 2 (Zod payload gaps) → Tier 3 release (AppImage VM, cross-distro matrix, Tauri Stage 5 sign-off) → **AI Core AC0–AC7** ([`newCore.md`](../newCore.md) § Timeline).

---

## 1. Product principles

> From [`phasesPlan.md`](../phasesPlan.md) — apply to every feature and dialog.

- **Full Hosted:** KeelDev is an environment manager on the host. It is **not** a strict sandbox (no cgroup/Docker-isolated build isolation by design).
- **Design standard:** Technical efficiency, visual elegance, and premium UX aligned with **Microsoft Dev Home**.
- **Audience:** Absolute beginners **and** professional developers — one-click automation with deep logs and raw control when needed.

### Forward product thesis (AI Core — [`newCore.md`](../newCore.md))

KeelDev evolves from environment manager to **"The Unified AI Developer Control Plane for Linux"** — a lightweight orchestration layer between IDEs and AI models. **Core philosophy:** do not rewrite existing tools; call them via subprocess; orchestrate with **< 2,000 lines Rust + < 500 lines TypeScript** (see `newCore.md` § Total Code estimate).

| Problem | AI Core response | Builds on existing |
| --- | --- | --- |
| 4 IDE chaos, duplicate API keys/credits | OpenAI-compatible **AI Proxy** (`localhost:4317`, Bearer token in `~/.config/keel/token`) | Settings Connected accounts; `host_exec` subprocess spine |
| Heavy local AI / token waste | **Headroom** compression + hybrid local/cloud routing | — |
| Context fragmentation across IDEs | **Knowledge Graph** via **graphify** (PyPI) + `notify` watcher | Repo `graphify-out/` for dev planning; runtime graphs under `~/.keel/graphs/` |
| Git identity chaos | **Git Context Switcher** — path-based YAML rules | Git Assistant G1–G4; **not** the sibling `odysseus/` repo |
| Linux beginner hell (PATH, errors) | **PATH Manager** + **Error Diagnoser** | Sibling clones: `last30days-skill/`, optional `Agent-Reach/` under `~/Documents/GitHub/` |
| First-run overload | **3-question Install Wizard** (build goal / terminal experience / Git knowledge) | Phase 16 eight-step readiness (retained for probes; wizard UX narrows per `newCore.md` Component 5) |

**Explicit non-goals (AI Core):** own LLM, full IDE, LSP server, package manager rewrite, Dify workflow engine extraction, rewriting graphify/headroom/last30days in Rust. See `newCore.md` § What We're NOT Building.

---

## 2. Current state (2026-06-02)

| Area | Status | Notes |
| --- | --- | --- |
| Maintenance | ✅ M1 done | Guardian + humanized pressure labels; 5-tab layout; SSH/Nginx/UFW systemd row |
| Monitor | ✅ Dashboard tab | `/dashboard/monitor` (Main \| Kernels \| Logs \| Monitor); `/system` redirects |
| Runtimes | ✅ Simplified | 18 → 7 runtimes (R1–R3 complete); see §14 |
| Phases 0–9, 12, 13, 15, 16, 17 | ✅ DONE | Verified against source; see [`phasesPlan.md`](../phasesPlan.md) execution order |
| Phase 18 — IPC boundary hardening | 📋 OPEN | P9 bridge consolidation + P10 Zod parity; graph-informed; see §17 |
| **AI Core AC0–AC7** | 📋 PLANNED | Post Tier 3; spec in [`newCore.md`](../newCore.md); see §18 |
| Phase 11 — First-run Wizard | ✅ DONE | Merged into Phase 16 (8-step readiness installer); **AC5** will add 3-question first-run UX per `newCore.md` |
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
- Git VCS: **Git Assistant** G1–G4 on `/git` (partial snapshot commit + in-app PR validated 2026-05-31)
- Cloud Git: no in-app PR merge (open in browser); notification inbox in TopBar (P7 ✅); Cloud tab folds into Setup in G1

---

## 3. Phase execution summary

Full checklists, bug tables, and module standards: **[`phasesPlan.md`](../phasesPlan.md)**.

```text
✅  Phase 0  — Foundations
✅  Phase 1  — Dashboard (widget deck removed 2026-05-29)
✅  Phase 2  — Docker
✅  Phase 3  — SSH
✅  Phase 4  — Git Environment Manager
✅  Phase 5  — Monitor (`/dashboard/monitor`; per-container stats on Docker)
✅  Phase 6  — Runtimes (18 → 7; R1–R3 complete; see §14)
✅  Phase 7  — Maintenance / Guardian
✅  Phase 8  — Settings (14 tabs; Resources tab absent; Extension removed)
✅  Phase 9  — Profiles + scaffolding
❌  Phase 10 — Extensions (removed from scope 2026-05-29)
✅  Phase 11 — First-run Wizard (merged into Phase 16)
✅  Phase 12 — Cloud Git + legacy pro Git UI (Smart-Flow retired in G1; see §6)
✅  Phase 13 — Advanced CI & environment hardening
✅  Phase 15 — Theme surface rollout (elevated aesthetic)
✅  Phase 16 — System Readiness / Pre-requisites wizard
✅  Phase 17 — lib.rs monolith refactor (40 Rust source entries: 37 `.rs` files + 3 directory modules, ~706-line dispatcher)
✅  SPRINT   — Tests + audit + cross-distro + v0.2.0-alpha tag
✅  G1–G3    — Git Assistant (`gitRefactor.md`) — shipped 2026-05-31; see §6
✅  G4       — Git Assistant post-ship hardening — partial commit + push/PR UX; see §6
✅  R1–R3    — Runtimes Simplification — 18 → 7 runtimes; see §14
✅  M1        — Maintenance polish — humanized health + tab refactor; see §15
✅  Monitor   — Dashboard tab + elevated Dev Home surface; see §16
⬜  Phase 18  — IPC boundary hardening (P9 bridge + P10 Zod); see §17
⬜  AI Core   — AC0–AC7 unified AI control plane; see §18 + [`newCore.md`](../newCore.md)
```

### Explicitly out of scope

Full stay / delete / transform inventory for the AI Core transition: **§19**.

- Extensions / plugin marketplace / Settings Extension tab
- Dashboard widget catalog, deck, layout IPC
- Drag-and-drop polish beyond existing HTML5
- Full theme rollout to every secondary route (Maintenance pilot done)
- Policy Lock, Visual Change Preview
- Package-manager distribution (GitHub Releases / AppImage only)
- Full IDE, LSP server, own LLM, Dify workflow engine, in-app cloud PR merge (see §19 **Never**)

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
| Docs link → `docs.keeldev.app` | ✅ |
| DashboardLogs search filter | ✅ |
| Engine health + version in status bar | ✅ |

### P2 — Feature gaps ✅ (2026-05-29)

| Item | Status |
| --- | --- |
| Per-container stats on Docker page | ✅ |
| Docker volume `usedBy` + profile orchestration | ✅ |

### P3 — Phase 10 Extensions 🚫 REMOVED

Do not reintroduce plugin marketplace, signed extensions, or dashboard widget system without explicit product decision.

### P4 — File size debt ✅ Largely resolved (2026-06-02)

Prior splits landed; remaining sizes are maintainable:

| File | Lines (2026-06-02) | Status |
| --- | --- | --- |
| `DockerPage.tsx` | ~1,204 | ✅ Tab components extracted under `pages/docker/` |
| ~~`GitConfigPage.tsx`~~ | removed G1.10 | Git Doctor → inline on Setup checklist |
| `ProfilesPage.tsx` | ~64 | ✅ Wizard/scaffold extracted to dedicated modules |

### P5 — Release gate (post-stabilization)

1. **AppImage verification** — clone on clean VM, build, verify probes + Docker wizard inside AppImage.
2. **Cross-distro matrix** — Ubuntu 24.04, Fedora 40, Arch: docker group, Java runtime, `git_doctor`, monitor `/proc`.

### P6 — CodeRabbit audit remediation ✅ (2026-05-29)

SSH command injection, profile credential unlink vs global delete, optimistic save races, backup JSON validation, git doctor whitespace/SSH probe, Zod failure schemas — all resolved. Details: [`AUDIT.md`](./AUDIT.md).

### P8 — Runtimes Simplification ✅ DONE (2026-05-31)

Reduced from 18 runtimes to 7 (Node.js, Python, Java, Go, Rust, PHP, .NET/C#). Removed 11 runtimes from shared types, renderer, and all 4 Rust modules. Cache keys bumped to v2. `pnpm smoke` green. See §14.

### P7 — Theme picker ✅ DONE (2026-06-02)

Settings → Personalization: **dark** (default), **light**, **high-contrast** via `data-theme` CSS variables; persisted in `store.json` `appearance`. Theme switches apply immediately without reload.

Remaining post-Alpha (optional):

- Dynamic token swapping beyond the three presets
- Broader semantic color token rollout

~~P7 rollout item “dashboard widgets”~~ — removed with widget purge.

### P9 — IPC boundary hardening (Phase 18 — graphify-informed)

**Graph evidence:** Community **59** (`ipc_invoke` dispatcher) is thin and clean; Community **57** (`ipc.ts` ↔ `schemas.ts`) is the contract hub — **137** `dh:*` channels, **~70** `*RequestSchema` exports after P13 batch 1 (many channels are no-payload list/status). Community **132** (`ipc_contract_tests.rs`) guards TS↔Rust channel drift. Renderer **0** direct `invoke('ipc_invoke', …)` bypasses (P12 ✅).

| Slice | Target | Graph / code hub | Status |
| --- | --- | --- | --- |
| P9.1 | Dashboard IPC → bridge | `useDashboardMainPage.tsx` | ✅ Done |
| P9.2 | Profiles IPC → bridge | `useProfilesPage.ts`, `ProfilesBuilderTab.tsx`, `ports.ts`, `ProfilesBackupTab.tsx` | ✅ Done |
| P9.3 | Git + scaffold IPC → bridge | `GitAssistantPage.tsx`, `projectBackgroundSetup.ts`, `profileSwitchProgress.ts` | ✅ Done |
| P9.4 | Bridge API gaps | `desktopApiBridge.ts` + `vite-env.d.ts` | ✅ Done |

**Rule:** New renderer IPC must go through `desktopApiBridge.ts` + `packages/shared` schemas; no new direct `invoke('ipc_invoke')`.

### P10 — Zod request-schema parity (Phase 18)

**Graph evidence:** Community **57** exports payload types (`DockerActionPayload`, cloud/git payloads, host types) that are not all backed by `schemas.ts` request schemas. **P10.1** inventories invoke channels that accept JSON payloads without a matching `*RequestSchema` (target ~30–40 high-traffic gaps, not all 80 nominal channel/schema delta). Rust validates ad hoc today; extend Zod at the TypeScript boundary only.

| Slice | Deliverable | Status |
| --- | --- | --- |
| P10.1 | Inventory: IPC channels in `IPC` const vs `*RequestSchema` in shared | 🔄 Ongoing — `ipc_contract_tests.rs` guards names; ~70 schemas / 137 channels |
| P10.2 | Priority batch: docker actions, compose, profile switch, terminal, editor, cloud-git PR flows | ✅ Batch 1 (2026-06-02) — see `packages/shared/src/schemas.ts` |
| P10.3 | Colocated roundtrip tests for new schemas | 🔄 Batch 1 covered in `packages/shared/test/schemas.test.ts`; renderer roundtrips unchanged |

**Non-goal:** Rewriting Rust validation to consume Zod at runtime (TypeScript boundary only for now).

### P11 — Test gate & CI alignment ✅ DONE (2026-06-02)

**Graph evidence:** Community **112** / **113** tie Vitest to `apps/desktop/package.json`; contract modules cluster in Communities **69**, **116**, **128** (`pages/*Contract.ts`). IPC integration tests are **gone** from the tree; `pnpm test:e2e` now runs **`criticalScenarios.unit.test.ts`** + **`moduleAvailability.test.ts`** (error humanization + import smoke — not browser/Tauri E2E).

| Slice | Deliverable | Status |
| --- | --- | --- |
| P11.1 | CI job renamed `integration-and-e2e-lite` → `unit-roundtrip-contracts`; step labels corrected | ✅ Done |
| P11.2 | Dead `registryContract.ts` / `registryError.ts` — already removed (zero imports anywhere) | ✅ Done |

**Default local commands:**

| Script | Scope |
| --- | --- |
| `pnpm test` | Shared Zod tests + full desktop Vitest (all `*.contract.test.ts`, `*.error.test.ts`, pages) |
| `pnpm test:roundtrip` | docker / profile / scaffold `*ContractErrorRoundtrip.test.ts` only |
| `pnpm test:e2e` | `criticalScenarios.unit` + `moduleAvailability` (Vitest, no Docker daemon) |
| `pnpm smoke` | typecheck + `pnpm test` + `cargo test` + clippy + lint — **does not** run `test:e2e` / `test:roundtrip` |

**Contract domains (renderer):** docker, profile, scaffold, git, gitVcs, ssh, terminal, runtime, monitor, dashboard, settings, cloudAuth, firstRunWizard — each with `*Contract.ts` / `*Error.ts` and colocated tests where applicable (`/registry` redirects to `/git`; no `registry*` modules).

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

**Product thesis (this sprint):** Keel Git = *"Set up once, open your project, save your work, send it online — and get plain-language help when Git says no."* Not a Git client; enabling glue inside the dev environment. Full spec: [`gitRefactor.md`](../gitRefactor.md).

**Product rule:** There is **no** Keel “advanced Git” mode — no second page, no beta flag, no header Pro toggle. Anything beyond setup / open / save / share / connect GitHub → **editor, terminal, or GitHub in the browser** (footer link states this once).

**Implementation constraint:** Renderer-only. **Do not delete Rust IPC** the new UI no longer calls. Reuse `computeGitAssistantNextAction`, `humanizeGitVcsError`, Git Doctor IPC, cloud auth, `gitVcsStage` / `gitVcsCommit` / `gitVcsPull` / `gitVcsPush`. **Legacy pro renderer surfaces deleted (G1.10).**

**Rust IPC policy (team decision):** Keep unused `dh:git:vcs:*` handlers and matching `IPC` channels for contract tests. Document with **JSDoc `@deprecated` on `IPC` consts** + `git_vcs_ipc.rs` module comment — **not** `#[deprecated]` on Rust fns (CI `deny(warnings)` risk). Renderer must not call pro-only channels. Delete only after zero-reference audit.

**UX policy (2026-05-30 reassessment):** GitHub optional for commit; dual labels (git term + beginner sub); progress rail = status not order; branch switch/create on page; editor from `dh:editor:list` + refresh on focus.

### Sprint phases (G1 → G3)

| Phase | Goal | Target | Exit criteria |
| --- | --- | --- | --- |
| **G1 — Ship** | Replace `/git` entirely | ~2 weeks | All G1 checkboxes below; legacy tabbed Git UI **deleted** from routes |
| **G2 — Validate** | Real user flows | After G1 merge | 5 users complete open → push without help; no "how do I stage/rebase" tickets |
| **G3 — Iterate** | Polish | After G2 metrics | Diff preview, recents, post-push link, **create PR / open compare** on Share step |

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

**Removed from product (not relocated — gone from Keel Git)**

| Former surface | Disposition |
| --- | --- |
| Three-tab hub (Config / VCS / Cloud) | Deleted; folded into single page where noted |
| Merge/rebase/continue/stash/cherry-pick/bisect UI | Deleted → editor/terminal |
| `GitVcsConflictResolver` / 3-way merge | Deleted → editor |
| CI pipelines panel on Git | Deleted → GitHub/GitLab web |
| PR/MR wizard on Git | Retired full wizard; **G3 Create PR** in Share step (API + compare fallback) |
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

- [x] Open → first push in < 2 minutes average
- [x] Zero crashes on clone / pull / push in test pass
- [x] No support load on staging/rebase terminology

**G2 engineering fixes (2026-05-31) — verified in audit pass:**

- [x] `git_is_inside_work_tree` + `git_has_commits` → zero-commit repos return `unborn: true` (no false “not a repository”)
- [x] `[GIT_VCS_NO_REMOTE]` error code: empty/missing origin detected before push; classifier catches “no such remote”; humanized message guides user to `git remote add`
- [x] File changes split into two groups: **Ready to save** (staged) vs **Still changing** (unstaged) with visible badges
- [x] Per-branch exclusion map (`excludedByBranchRef`) — deselected files survive all status refreshes and branch switches
- [x] “Talking to Git…” spinner with animated icon during commit/pull/push operations
- [x] Primary button label: **Save snapshot** (sub: commit selected files) — terminology aligned across page
- [x] `guessDefaultBaseBranch` detects `main` / `master` from local branches (no longer hardcoded)
- [x] `shouldShowGitPush` allows push without upstream (first-push flow unblocked)
- [x] Auto-fetch on open + focus: `fetchOriginQuiet` runs on every page focus; yellow “Updates on the remote” banner when behind
- [x] Per-branch PR publish check (`branchNeedsPublishBeforePr`) — blocks PR creation when ahead or no upstream
- [x] Provider mismatch detection in PR panel — warns when remote host ≠ connected cloud account
- [x] `dh:preferred_editor_cmd` added to `ALLOWED_KEYS` in Rust store allowlist (editor preference now persists)

#### G3 — Iterate

**Hardening (race-safety — treat as required for G3, not optional):**

- [x] Cancel in-flight IPC on unmount / `repoPath` change (status, remotes, doctor scan, diff preview) so late responses cannot overwrite state

**Product polish:**

- [x] Remote-aware or generic Share copy (GitHub/GitLab from `origin` host)
- [x] Diff preview toggle per file
- [x] Recents list polish
- [x] Post-push “Open on host” one-liner (GitHub/GitLab from remote URL)
- [x] **Create pull request in Share step** — `cloudGitCreatePr` when connected; compare-page fallback; title/body fields; blocks when `ahead > 0`; warns when behind `main`
- [x] **Silent `git fetch origin` on project open and window focus** — updates `behind` before edit; **Get latest** banner + next-action when remote is ahead (no standalone Fetch button)

**Intentional ceiling (no backlog):** dirty-checkout **stash** stays terminal + modal; no in-app stash IDE (correct for beginner scope).

#### G4 — Post-ship hardening (2026-05-31)

Follow-up on `feat/runtimes-r1-r2` after manual dogfooding on KeelDev repo. All items verified in UI + git log.

| Fix | Status | Notes |
| --- | --- | --- |
| Existing open PR/MR probe | ✅ | `dh:cloud:git:find-pr`; disables Create PR + **Open existing PR** when branch already has one |
| Partial snapshot commit | ✅ | Unstage deselected indexed files; `resolveSnapshotCommitPaths` uses **fresh** `git status` + exclusion ref (not stale React `included`) |
| Push with dirty tree | ✅ | `shouldShowGitPush` no longer requires clean working tree when `ahead > 0` |
| Push vs Save disabled state | ✅ | `saveDisabled` applies to commit only; Push/Pull disable on `busy` only |
| Ahead/behind tracking branch | ✅ | `git_ahead_behind` tries `branch.*.remote`, then origin/upstream/other remotes |
| Post-push PR copy | ✅ | Banner + Share hint point to **Create PR** in-panel; **View branch on host** is browse-only |

**G4 manual evidence (2026-05-31):** 3-of-4 files committed with `test.ts` excluded; push succeeded with 1 local file remaining; Create PR distinct from Open on GitHub.

**G4 agent checklist**

- [x] Unit tests: `stagedPathsToUnstageBeforeCommit`, `resolveSnapshotCommitPaths`, `shouldShowGitPush`
- [x] `pnpm smoke` green on branch
- [x] Merge `feat/runtimes-r1-r2` to main via PR ([#127](https://github.com/Karim-Termanini/KeelDev/pull/127))

### Explicit non-goals (Git — permanent)

- Second Git UI, advanced page, or `enable_advanced_git` / pro toggle
- In-app conflict merge studio or visual 3-way resolver
- Smart-Flow vertical slices (rebase UI, cherry-pick, bisect, **full** PR review/merge studio in-app — simple create-PR in Git Assistant is in scope for G3)
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

**Current outcome (Phase 17):** 36 `mod` declarations → 59 `.rs` files (33 flat + `cloud_auth/` 8 + `cloud_git_ipc/` 4 + `project_scaffold/` 12); `lib.rs` ~706 lines; largest modules `system_info.rs` (~1,009 lines), `runtime_jobs.rs` (~684 lines).

---

## 8. Known bugs

All 28 tracked bugs in [`phasesPlan.md`](../phasesPlan.md) Known Bugs table are **✅ FIXED** as of 2026-05-28/29.

Page-level manual checks live in [`AUDIT.md`](./AUDIT.md) Appendix B. Route maturity: [`ROUTE_STATUS.md`](./ROUTE_STATUS.md).

---

## 9. Audit status

Comprehensive 5-pass audit completed 2026-06-02 (see [`AUDIT.md`](./AUDIT.md) §15). All 9 original findings + 15 new findings from deep pass resolved:

| Severity | Count | Status |
| --- | --- | --- |
| CRITICAL (C1) | 1 | ✅ Fixed 2026-06-02 — `sh -c` replaced with `Command::new()` in `system_info.rs` |
| HIGH (H1) | 1 | ✅ Fixed 2026-06-02 — `stdout.take().unwrap()` replaced with `.ok_or(…)?` in `executor.rs` |
| HIGH (H2–H5) | 4 | ✅ Already resolved — SSH key injection, README false claims, dead beta flag, stale doc numbers |
| MEDIUM (M1–M6) | 6 | ✅ Resolved — missing Zod schemas documented, stale build artifacts noted, doc line counts corrected, dead components catalogued |
| LOW (L1–L8) | 8 | ✅ Resolved — dead files/redirects, deprecations cleaned, bridge gaps closed, test labeling corrected, `profile_credentials.rs` fallback noted |

**Remaining open:**

| Priority | Item | Status |
| --- | --- | --- |
| P0 | AppImage release pipeline E2E on clean VM | ❓ Unverified — not attempted yet |
| P2 | Git VCS polish / simple mode | ✅ Fixed 2026-06-02 — 6 polish items (stash persistence, untracked diff, spinner, dead code) |
| P2 | Missing contract/error tests (`settingsContract`, `settingsError`, `dashboardError`) | ✅ Fixed 2026-06-02 — 23 new assertions across 3 test files |
| P3 | Direct `invoke('ipc_invoke', …)` bypassing `desktopApiBridge.ts` | ✅ Fixed 2026-06-02 — 0 renderer bypasses remain |
| P3 | IPC payload channels without Zod `*RequestSchema` | 🔄 Reduced — ~70 schemas / 137 channels; P10.1 inventories payload gaps |
| P3 | Split `RuntimesPage.tsx` (1947 lines) | ✅ Fixed 2026-06-02 — `pages/runtimes/` (hook + 5 components; page 88 lines) |

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
| **Git VCS — Git Assistant G1–G4** | ✅ **Shipped** | PR [#127](https://github.com/Karim-Termanini/KeelDev/pull/127) |

### Tier 2 — Architecture hardening (graphify-informed)

Finish **one slice** before opening the next (same discipline as Tier 1).

| Gap | Status (2026-06-02) | Graph / module hub |
| --- | --- | --- |
| **P9 — Renderer IPC → bridge only** | ✅ Done | **0** `invoke('ipc_invoke')` bypasses; all renderer IPC via `window.dh` / `desktopApiBridge.ts` |
| **P10 — Zod request-schema parity** | 🔄 In progress | Community **57** + **132**; **~70/137** `RequestSchema`; P10.2 batch 1 ✅; P10.1 inventory + P10.3 roundtrips open |
| P4 residual page cleanup | ✅ Done | `DockerPage` ~1,204 lines; tabs under `pages/docker/`; `RuntimesPage` → `pages/runtimes/` (88-line orchestrator) |
| **P7 — Theme picker** | ✅ Done | Settings → Personalization: dark / light / high-contrast; persisted in `store.json` `appearance` |
| **Cloud Git inbox** | ✅ Done | TopBar bell → `dh:cloud:git:inbox`; poll 60s + on focus; GitHub/GitLab PAT |
| **Cloud Git API merge (in-app)** | ❌ Removed | Permanently out of scope — merge on GitHub/GitLab in browser only |

**Coupling hubs to respect while editing (god nodes / communities):**

- `host_exec.rs` — `exec_output_limit()`, `cmd_timeout_short()` (subprocess spine for runtimes, docker, git)
- `profile_engine.rs` + Community **53** — profile switch, background scaffold, compose orchestration
- `system_info.rs` — editor open, diagnostics, ports suggest (Community **55**)
- `git_vcs_ipc.rs` + Community **48** — Git Assistant save/share/editor flow
- `packages/shared` Community **57** — single source for channel names + request shapes

### Tier 3 — Release (end)

1. AppImage build on clean VM (§5 P5)
2. Cross-distro smoke (Ubuntu, Fedora, Arch)
3. Tauri Stage 5 sign-off + tag

### Tier 4 — AI Core integration (post Tier 3)

**Canonical spec:** [`newCore.md`](../newCore.md). **Phase IDs AC0–AC7** avoid collision with historical product Phases 0–18.

Finish **one AC slice** before opening the next (same discipline as Tier 1–2). Estimated **14 weeks** per `newCore.md` § Timeline.

| AC | Weeks | Deliverable | Rust modules (new) | Subprocess deps |
| --- | --- | --- | --- | --- |
| **AC0** | 1–2 | OpenAI-compatible proxy (`/v1/chat/completions`), local Bearer auth, usage logging, Tauri integration | `ai_proxy.rs` (~400 lines) | Ollama + cloud APIs (HTTP forward) |
| **AC1** | 3–4 | Knowledge graph: `graphify` wrapper, `notify` watcher, `petgraph` in-memory store, query API for context injection | `knowledge_graph.rs` (~200 lines) | `graphify update/query` (PyPI `graphifyy`; see §18 toolchain) |
| **AC2** | 5 | Headroom pipeline: daemon wrapper + Rust fallback compression before proxy forward | `context_compress.rs` (~150 lines) | `headroom` CLI from [`../headroom/`](../headroom/) clone |
| **AC3** | 6–7 | Git identity switcher (YAML path rules) + PATH scanner/fixer + shell config parser | `git_context.rs`, `path_manager.rs` (~250 lines) | `git`, distro PM via `pkexec` — **built in KeelDev**, not `odysseus/` repo |
| **AC4** | 8 | Error diagnoser: log collector, `last30days-skill` search, solution executor + cache | `error_diagnose.rs` (~200 lines) | [`../last30days-skill/`](../last30days-skill/) + optional [`../Agent-Reach/`](../Agent-Reach/) |
| **AC5** | 9–10 | 3-question install wizard, starter project scaffold, initial graphify run | wizard logic (~150 lines Rust) | existing scaffold IPC + graphify |
| **AC6** | 11–12 | Dashboard UI: chat panel, Git identity indicator, PATH notifications, error panel, API key / model settings | ~400 lines TS | — |
| **AC7** | 13–14 | Cross-distro testing, performance, docs, beta release | — | — |

**Success metrics (from `newCore.md`):** token savings 60–95% via Headroom; IDE support = any OpenAI-compatible client; wizard completion < 5 min; PATH fix > 95%; proxy RAM < 512MB (excluding LLM).

**Coupling with shipped work:**

- **AC0** settings surface → extend Settings (API keys already on Connected accounts; add proxy token + model routing prefs).
- **AC1** graph persistence → `~/.keel/graphs/<project_hash>.json` (distinct from dev-repo `graphify-out/` used for architecture planning).
- **AC3** Git switcher → complements Git Assistant manual identity setup; does not replace G1–G4 save/share flow.
- **AC5** wizard → narrows Phase 16 readiness for repeat users; blocking probes remain for Docker/Git critical path.

**Explicit non-goals (Tier 4):** see `newCore.md` § What We're NOT Building and § Risks & Mitigations.

### Git Assistant sprint timeline (G1)

Suggested slice order inside G1 (can parallelize G1.4 strings with G1.2 layout):

```text
Week 1   G1.1 route shell → G1.2 layout/rail → G1.3 next-action card → G1.5 checklist
Week 2   G1.6 project bar → G1.7 changes/save-share → G1.8 modals → G1.9 cloud card → G1.10 delete legacy UI → G1.11 footer → smoke + ROUTE_STATUS
Post-G1  G2 validate → G3 iterate
```

**Ignore:** Extension tab, dashboard widgets, Flatpak, Resources tab, cosmetic theme beyond need, chasing all routes `live` in `ROUTE_STATUS.md` for marketing.

---

## 14. Runtimes Simplification — Sprint (R1–R3)

**Product thesis:** 18 runtimes is too many to maintain. Each has OS-specific package managers, version detection quirks, and installation edge cases. Reduce to the 7 languages that 90% of developers use daily.

### Runtimes to keep (7)

| # | Runtime | Rationale | Usage |
| --- | --- | --- | --- |
| 1 | **Node.js** | Essential for web dev, 80% of projects | Very High |
| 2 | **Python** | Data science, scripting, backend | Very High |
| 3 | **Java** | Enterprise, Android, backend | High |
| 4 | **Go** | Cloud native, CLI tools, backend | Medium-High |
| 5 | **Rust** | Systems programming, performance | Medium |
| 6 | **PHP** | Legacy web, WordPress, Laravel | Medium |
| 7 | **.NET/C#** | Enterprise, game dev (Unity) | Medium |

### Runtimes to remove (11)

| Runtime | Reason |
| --- | --- |
| Ruby | Low usage; most Ruby devs use rbenv/rvm directly |
| Bun | Niche runtime; Node.js covers JS ecosystem |
| Zig | Low adoption; most Zig devs manage toolchain manually |
| C/C++ | System package manager (`gcc`, `clang`) covers this; no version manager needed |
| MATLAB/Octave | Extreme niche in dev environment tooling |
| Dart | Flutter SDK bundles Dart; standalone Dart is rare |
| Flutter | Large SDK; better installed via `flutter doctor` directly |
| Julia | Niche scientific computing; most users install via official installer |
| Lua | Extremely niche outside game scripting |
| Lisp (SBCL) | Near-zero usage in modern web/cloud workflows |
| R | Niche statistical computing; most users use CRAN directly |

### Sprint phases

| Phase | Goal | Target | Exit criteria |
| --- | --- | --- | --- |
| **R1 — Strip** | Remove 11 runtimes from renderer + discovery | ✅ Done | Runtimes page shows only 7; no references to removed runtimes in UI |
| **R2 — Clean** | Remove Rust handlers + shared types for removed runtimes | ✅ Done | `runtime_discover.rs`, `runtime_jobs.rs`, `runtime_packages.rs`, `runtime_verify.rs` all pruned; `RUNTIME_SYSTEM_ONLY_IDS` → `['php']`; `RUNTIME_DETAILS` trimmed to 7; cache keys bumped to v2; `pnpm smoke` green |
| **R3 — Harden** | Audit + test remaining 7 runtimes end-to-end | ✅ Done | 7 cards on Fedora; .NET system install + VERIFY OK; `ROUTE_STATUS.md` updated; full Ubuntu/Arch matrix deferred to Tier 3 §5 P5 |

#### R1 — Strip (work breakdown)

| Slice | Deliverable | Notes |
| --- | --- | --- |
| R1.1 | `RUNTIME_DETAILS` trimmed to 7 entries | Remove Ruby, Bun, Zig, C/C++, MATLAB, Dart, Flutter, Julia, Lua, Lisp, R |
| R1.2 | `RUNTIME_LOCALE_KEY` trimmed | Remove locale overrides for removed runtimes |
| R1.3 | `formatRuntimeVersionDisplay` switch pruned | Remove version-formatting cases for removed runtimes |
| R1.4 | UI test: page renders without errors | Open `/runtimes` — only 7 cards shown; no blank or broken entries |

#### R2 — Clean (work breakdown)

| Slice | Deliverable | Notes |
| --- | --- | --- |
| R2.1 | `status_probe_script` match arms removed | Remove Ruby, Bun, Zig, Dart, Flutter, Julia, Lua, Lisp, R, C/C++, MATLAB probes |
| R2.2 | `active_binary_script` match arms removed | Remove resolution scripts for removed runtimes |
| R2.3 | `list_installed_versions_script` pruned | Remove version-listing scripts for removed runtimes |
| R2.4 | `runtime_jobs.rs` install blocks removed | Remove `runtime_id == "ruby"`, `== "bun"`, `== "zig"`, `== "dart"`, `== "flutter"` install branches |
| R2.5 | `RUNTIME_SYSTEM_ONLY_IDS` updated | `['lisp', 'c_cpp', 'matlab', 'php']` → `['php']` (PHP is only system-only now) |
| R2.6 | `runtime_jobs.rs` `SYSTEM_ONLY_RUNTIMES` updated | Match TypeScript constant |
| R2.7 | Stale store cache keys invalidated | Version/status cache entries for removed runtimes cleared or ignored on load |

#### R3 — Harden (work breakdown)

| Slice | Deliverable | Notes |
| --- | --- | --- |
| R3.1 | Install flow verified for all 7 | Node (nvm/fnm), Python (pyenv), Java (apt/dnf/sdkman), Go (goenv/gvm), Rust (rustup), PHP (system only), .NET (dotnet-install.sh) — all methods confirmed working |
| R3.2 | Probe + set-active on all 7 | Status detects installation; version switching changes active binary; no stale path references |
| R3.3 | Cross-distro smoke | Ubuntu 24.04, Fedora 40, Arch: all 7 install + probe + set-active — **Fedora validated manually (2026-05-31); Ubuntu/Arch → Tier 3 P5** |
| R3.4 | Error messages clear | When runtime binary not found, message says "Install [Runtime] to get started" — never a raw probe error |
| R3.5 | Cache invalidation | No stale version cache for removed runtimes; opening Runtimes page after upgrade shows only 7 |

### Explicit non-goals (Runtimes sprint)

- Adding new runtimes to the 7 (not in scope)
- Improving install UX beyond existing wizard (not a UX sprint)
- Adding mise/asdf support for runtimes that don't already have it
- Removing Docker-based runtime support (unrelated)
- Changing the `/runtimes` page layout or adding new features

### Agent checklist (Runtimes sprint)

- [x] `pnpm typecheck` passes after all TypeScript removals
- [x] `pnpm smoke` green before declaring R2 done
- [x] No stale import references to removed runtime types
- [x] `RUNTIME_DETAILS` keys match `status_probe_script` match arms exactly (7 items)
- [x] `SYSTEM_ONLY_RUNTIMES` (Rust) matches `RUNTIME_SYSTEM_ONLY_IDS` (TypeScript)
- [x] Version cache storage (`dh:runtimes:versions-cache:v2`) invalidated or keyed by runtime ID
- [x] Update [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) when `/runtimes` UX changes

---

## 15. Maintenance Polish — Sprint (M1) ✅ DONE (2026-05-31)

**Product thesis:** Guardian scoring is real (`/proc` + Docker + systemd). M1 adds beginner-readable pressure labels and actionable UX without changing the scoring algorithm.

### Shipped

| Item | Notes |
| --- | --- |
| M1.1 — Status labels | Color-coded Excellent / Healthy / Moderate / Critical via `maintenanceHealth.ts` |
| M1.2 — Plain-language detail | Layer tooltips + humanized diagnostic rows (`maintenanceDiagnosticsHumanize.ts`) |
| M1.3 — Action suggestions | Diagnostic rows link to Docker, Settings, SSH, etc. |
| Elevated Dev Home layout | Full-bleed hero, tab strip, overview nav cards |
| Tab ownership | Overview = Guardian + nav only; Cleanup / Data / Logs / Schedule own their content |
| Systemd row | SSH, Nginx, UFW — Start when inactive; **NOT INSTALLED** when unit missing (Docker removed from row) |
| Docker cleanup | Quick maintenance on Cleanup tab; detailed prune on `/docker` |

### Agent checklist (M1)

- [x] `maintenanceHealth.test.ts`, `maintenanceDiagnosticsHumanize.test.ts`, `maintenanceSystemdServices.test.ts`
- [x] `pnpm smoke` green
- [x] [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) unchanged for `/maintenance` (still `partial`)

### What NOT to change (unchanged)

- Guardian scoring algorithm (`evaluateGuardian`)
- Real data sources — no mocks
- Diagnostics bundle export

---

## 16. Monitor — Dashboard integration ✅ DONE (2026-05-31)

**Product thesis:** Host metrics belong with Dashboard (Main \| Kernels \| Logs \| Monitor), not as a standalone sidebar destination.

### Shipped

| Item | Notes |
| --- | --- |
| Route | `/dashboard/monitor`; `/system` → redirect |
| Nav | Fourth dashboard tab; sidebar Monitor entry removed; Alt+2 → monitor tab |
| UI | Dev Home hero, spotlight strip, segmented tabs, collapsible Details |
| Health hints | `monitorHealth.ts` — color-coded CPU/RAM/Disk with plain descriptions |
| i18n | `topbar.monitor` + tooltip (en/de/ar) |

### Agent checklist

- [x] `monitorHealth.test.ts`
- [x] [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) — `/dashboard/monitor` live; `/system` redirect
- [x] `pnpm smoke` green

### Explicit non-goals

- LAN discovery
- Per-container stats (stay on Docker page)

---

## 17. Architecture map & Phase 18 backlog (graphify 2026-06-02)

**Source:** [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md) + [`graphify-out/graph.json`](../graphify-out/graph.json) built at commit **`fc9c8fa`** (matches `HEAD`; re-run `graphify update .` after Phase 18 slices or large WIP lands).

**Agent rule:** For architecture questions, prefer `graphify query "<question>"` / `graphify path A B` over raw repo grep; read this § for hubs. See [`.cursor/rules/graphify.mdc`](../.cursor/rules/graphify.mdc).

### Graph summary

| Metric | Value |
| --- | --- |
| Corpus | 409 files · ~370k words |
| Nodes / edges | **10,270 / 12,577** |
| Communities | **273** (226 in report; 0–26 mostly i18n locale-key duplicates; 47 thin omitted) |
| Extraction | 97% EXTRACTED · 3% INFERRED (390 inferred edges — verify when touching god nodes) |
| Isolated nodes | 8,438 weakly connected (mostly i18n keys — planning noise) |

### Layer map (high-cohesion communities)

| Layer | Community | Anchor symbols / files |
| --- | --- | --- |
| Planning docs | **98** | `MASTER_PLAN`, `phasesPlan`, `AUDIT`, `ROUTE_STATUS` |
| IPC dispatcher | **59** | `ipc_invoke()`, `ipc_send()` — ~706-line `lib.rs` router ✅ |
| Channel drift tests | **132** | `ipc_contract_tests.rs` — every `ipc.ts` channel → `lib.rs` arm |
| Shared contracts | **57** | `IPC` const + payload types in `ipc.ts` |
| Zod (partial) | **70** | `*RequestSchema` in `schemas.ts` (54 exports) |
| Renderer bridge | **78** | `desktopApiBridge.ts`, `DhApi`, `ensureDesktopApi()` |
| Renderer contracts | **69**, **116**, **128** | `assert*Ok`, `humanize*Error`, domain `*Contract.ts` |
| Subprocess spine | **38**, **54** | `exec_output_limit()`, `cmd_timeout_short()`, `host_exec.rs` |
| Runtime jobs | **54**, **72**, **90** | `runtime_job_execute()`, `runtime_discover.rs` |
| Profiles / compose | **53**, **64**, **99**, **107** | `profileSwitchProgress`, `compose_profiles`, port blocks |
| Git Assistant | **48**, **63**, **122** | `GitAssistantPage`, `computeGitAssistantNextAction` |
| Docker UI + API | **66–68**, **71**, **88**, **91–92** | `DockerPage`, `docker_*` handlers |
| Monitor / host | **55**, **95** | `system_info.rs`, `monitor_handlers.rs` |
| Scaffold | **76**, **108**, **134–136** | `project_scaffold/`, `CreateProjectModal` |
| Cloud Git / auth | **39**, **81**, **84**, **123–124** | `cloud_auth/`, `cloud_git_ipc/` |
| CI / packaging | **109**, **144** | `.github/workflows/ci.yml`, AppImage (Flatpak abandoned) |

### Coupling hubs (edit carefully)

| Hub | Location | Role |
| --- | --- | --- |
| `exec_output_limit()` | `host_exec.rs` | God node (**82** edges) — subprocess output cap spine |
| `cmd_timeout_short()` | `host_exec.rs` | God node (**79** edges) — shared short timeouts |
| `runtime_job_execute()` | `runtime_jobs.rs` | God node (**27** edges) — runtime install/uninstall jobs |
| `parse_porcelain_v1()` | `utils.rs` | Git status parsing (**22** edges; `lib.rs` + VCS tests) |
| `ipc_invoke()` | `lib.rs` | Thin dispatcher (Community **59**) — ✅ no business logic inline |
| `IPC` + schemas | `packages/shared` | **134** channels · **54** `RequestSchema` — P10 closes payload gaps |
| Profile switch flow | Community **53** | `profileSwitchProgress`, `projectBackgroundSetup`, `useProfilesPage` |
| Git Assistant UX | Community **48** | Editor resolve, clone, progress rail helpers |
| Docker UI | `DockerPage.tsx` + `pages/docker/*` | Largest renderer orchestrator (~1,204 lines; tabs split) |
| Rust size | `system_info.rs` (~1,009), `runtime_jobs.rs` (~684) | Largest domain modules post–Phase 17 |
| `cloud_auth/` self-import cycles | GRAPH_REPORT import-cycles | Cosmetic module `use` cycles — not Phase 18 scope |

### Test architecture (graph-aligned)

| Tier | What | Graph / repo anchor |
| --- | --- | --- |
| Rust IPC parity | `cargo test` in `ipc_contract_tests.rs` | Community **132** — channel names in `ipc.ts` ⊆ `lib.rs` |
| Shared Zod | `packages/shared/test/schemas.test.ts` | Community **70** — payload validation at TS boundary |
| Renderer contracts | `*Contract.ts` + `assert*Ok` + `*.contract.test.ts` | Communities **69**, **116**, **128**; **14** domain pairs under `pages/` |
| Error humanization | `*Error.ts` + `humanize*Error` + `*.error.test.ts` | Includes `dashboardError`, `monitorError`, `registryError`, `settingsError` |
| Roundtrip | `pnpm test:roundtrip` — 3 files | docker / profile / scaffold `*ContractErrorRoundtrip.test.ts` |
| E2E-lite | `pnpm test:e2e` — 2 files | `criticalScenarios.unit.test.ts`, `moduleAvailability.test.ts` (not Playwright/Tauri) |
| Vitest scope | `vitest.config.ts` — `pages/**` coverage visibility | Visibility only; `pnpm smoke` does not invoke `test:e2e` |
| Removed | `*Ipc.integration.test.ts`, `headlessE2e.test.ts` | Do not restore without maintainer decision; see **P11** |
| CI | `unit-roundtrip-contracts` job | ✅ `test:roundtrip` + `test:e2e` + `test:coverage` (P11.1) |

Do not reintroduce broad IPC integration tests without a maintainer decision; extend the contract layer instead.

### Phase 18 — IPC boundary hardening (planned)

**Depends on:** Audit sweep ✅, Git Assistant G1–G4 ✅, Phase 17 refactor ✅.

**Goal:** Align runtime architecture with documented flow: Renderer → `desktopApiBridge.ts` → `ipc_invoke` → `lib.rs` → domain module, with shared Zod schemas at the TypeScript boundary.

```text
Done (2026-06-02):
  P11.1 CI → unit-roundtrip-contracts (test:roundtrip)
  P11.2 registryContract/registryError removed (route → /git)
  P9/P12  0 renderer ipc_invoke bypasses
  P10.2 batch 1 Zod schemas (compose/profile/docker/terminal/editor/cloud PR/project)

Next:
  P10.2 batch 2 — remaining payload channels (ssh list-dir, log streams, docker inspect, …)
  Tier 3 — AppImage clean VM (after maintainer sign-off on pre-release checklist)
```

**Explicit non-goals (Phase 18):**

- Rewriting `host_exec` god-node pattern (working as designed)
- Splitting `system_info.rs` further unless editing for another reason
- Full compose `docker-compose.full.yml` stacks for 8/9 presets (product decision, not IPC)
- i18n community deduplication (cosmetic graph noise)

### Release track (unchanged — Tier 3)

1. AppImage E2E on clean VM ([`INSTALL_TEST.md`](./INSTALL_TEST.md))
2. Cross-distro matrix (Ubuntu 24.04, Fedora 40, Arch)
3. Tauri Stage 5 maintainer sign-off + tag

---

## 18. AI Core Integration — AC0–AC7 (graphify-informed forward track)

**Canonical spec:** [`newCore.md`](../newCore.md) — **read-only reference**; planning updates go in this file and `phasesPlan.md`, not in `newCore.md`.

**Depends on:** Phase 18 P10 (recommended) ✅ or in parallel after P9; Tier 3 release gate optional but preferred before AC6 UI polish.

**Architecture (from `newCore.md`):**

```text
IDEs (Cursor, VSCode, Zed, …)
        ↓ OpenAI API → localhost:4317 (Bearer ~/.config/keel/token)
KeelDev AI Proxy
        ├→ Knowledge Graph (graphify + notify + petgraph)
        ├→ Context Compressor (headroom daemon + Rust fallback)
        └→ System/Git Autopilot (PATH, git identity, error diagnoser)
        ↓
LLM Backend (Ollama + cloud APIs)
Background File Watcher → incremental graph + git identity triggers
```

### Sibling toolchain — local dev layout

Maintainer machine layout (Karim): all repos under **`~/Documents/GitHub/`**. KeelDev resolves subprocess tools the same way compose resolves profiles: **PATH first**, then **`KEEL_DEV_TOOLS_ROOT`**, then bundled resources (AC0+ packaging TBD).

```text
~/Documents/GitHub/
├── LuminaDev/          ← KeelDev (this repo)
├── headroom/           ← AC2 context compression
├── last30days-skill/   ← AC4 error/solution search
├── Agent-Reach/        ← AC4 optional deep web scrape
├── codegraph/          ← optional code-intelligence eval (not graphify)
├── oh-my-pi/           ← optional agent surface (post-AC7 eval)
├── odysseus/           ← separate self-hosted workspace (:7000) — NOT an AC subprocess
└── dify/               ← out of scope (newCore § NOT Building)
```

**Env var (proposed, mirrors `KEEL_DEV_COMPOSE_ROOT`):**

| Variable | Default (dev) | Purpose |
| --- | --- | --- |
| `KEEL_DEV_TOOLS_ROOT` | `~/Documents/GitHub` | Parent dir for sibling clone paths when CLI not on PATH |

**Resolution order per tool:** (1) executable on `PATH` → (2) `$KEEL_DEV_TOOLS_ROOT/<repo>/…` dev entrypoint → (3) Tauri `resource_dir()` bundle (production).

### Tool registry (subprocess contracts)

| Tool | AC | Local clone | Dev install | KeelDev invokes |
| --- | --- | --- | --- | --- |
| **graphify** | AC1 | *(PyPI only — not a sibling repo)* | `uv tool install graphifyy` → `~/.local/bin/graphify` | `graphify update <dir>`, `graphify query "<q>"` — output JSON under `graphify-out/` or `~/.keel/graphs/<hash>.json` |
| **headroom** | AC2 | `headroom/` | `cd headroom && pip install -e ".[proxy]"` or `uv pip install -e .` | `headroom proxy --port <port>` (daemon) or `headroom compress` / library via stdin/stdout wrapper per `newCore.md` |
| **last30days-skill** | AC4 | `last30days-skill/` | `node` + repo scripts on PATH | `python3 skills/last30days/scripts/last30days.py "<query>"` (cwd = repo root) |
| **Agent-Reach** | AC4 (opt) | `Agent-Reach/` | `cd Agent-Reach && pip install -e .` | `agent-reach doctor`; platform read/search subcommands when last30days insufficient |
| **codegraph** | — (eval) | `codegraph/` | `npm i -g @colbymchenry/codegraph` or clone + install script | `codegraph update`, `codegraph query` — **not** wired in AC1 v1; graphify remains canonical per `newCore.md` |
| **oh-my-pi** | post-AC7 | `oh-my-pi/` | `bun install -g @oh-my-pi/pi-coding-agent` or `omp.sh` installer | `omp` — listed in `newCore.md` success metrics; integration TBD after AC7 |
| **odysseus** | ❌ | `odysseus/` | Docker `:7000` | **Do not subprocess.** newCore diagram label "Odysseus" = Keel-built **System/Git Autopilot** (AC3 Rust), not the `odysseus-ai` workspace repo |
| **dify** | ❌ | `dify/` | — | **Out of scope** — newCore forbids extracting Dify workflow engine |

**graphify vs codegraph:** LuminaDev planning already uses **graphify** (`graphify-out/`, agent `graphify query`). **codegraph** is a sibling clone for optional semantic-intelligence experiments; do not conflate the two in IPC or docs.

**headroom note:** Upstream is Rust + Python (`headroom-ai` on PyPI, maturin `_core` extension). AC2 daemon should wrap the **`headroom` CLI**, not a hand-rolled Python-only script.

### Component map

| # | Component | Status | Notes |
| --- | --- | --- | --- |
| 1 | AI Proxy | 📋 AC0 | `/v1/chat/completions`; model routing local-first; usage dashboard |
| 2 | Knowledge Graph Engine | 📋 AC1 | **graphify** (PyPI `graphifyy`); see §18 tool registry |
| 3 | Context Compressor (Headroom) | 📋 AC2 | **`~/Documents/GitHub/headroom/`** or PyPI `headroom-ai`; CLI daemon + Rust fallback |
| 4A | Git Context Switcher | 📋 AC3 | KeelDev Rust — **not** the sibling `odysseus/` repo (codename only in `newCore.md`) |
| 4B | PATH & Environment Manager | 📋 AC3 | Extends runtime discovery + System tab profile exports |
| 4C | Error Diagnoser | 📋 AC4 | **`last30days-skill/`** + optional **`Agent-Reach/`** clones |
| 5 | Installation Wizard (3 questions) | 📋 AC5 | Replaces lightweight first-run UX; integrates Phase 16 probes |
| 6 | Background File Watcher | 📋 AC1 + AC3 | `notify` + 500ms debounce; graph + git identity triggers |

### IPC / contract expectations (preliminary)

New domains will follow existing pattern: `packages/shared` (`IPC` + Zod) → Rust module → renderer via `desktopApiBridge.ts`. Anticipated channel families (names TBD at AC0 kickoff):

- `dh:ai:proxy:*` — status, usage stats, model list
- `dh:ai:graph:*` — query, rebuild, watch status
- `dh:ai:compress:*` — preview ratio, toggle
- `dh:git:context:*` — rules CRUD, active identity
- `dh:path:*` — scan, fix, install missing runtime
- `dh:diagnose:*` — capture error, search, execute fix

Each domain gets `*Contract.ts`, `*Error.ts`, and colocated tests per CLAUDE.md conventions.

### Agent checklist (AI Core slices)

- [ ] Read [`newCore.md`](../newCore.md) component section before starting an AC slice
- [ ] Confirm sibling clones under `~/Documents/GitHub/` (or set `KEEL_DEV_TOOLS_ROOT`) before subprocess integration work
- [ ] Subprocess calls via existing `host_exec` / `exec_output_limit` patterns — no new god nodes in `lib.rs`
- [ ] `pnpm smoke` green before declaring slice done
- [ ] New IPC: shared schema → Rust handler → bridge only
- [ ] `graphify update .` after structural changes
- [ ] Update [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) when user-visible surfaces ship (AC6)

---

## 19. Product inventory — stay, delete, transform

**Purpose:** Single truth table for what remains in KeelDev through the AI Core transition ([`newCore.md`](../newCore.md)). KeelDev stays an **environment manager + orchestration layer**, not an IDE.

### A. Already deleted — do not restore

| Area | What was removed | When |
| --- | --- | --- |
| **Extensions** | Settings Extension tab, plugin marketplace, signed extensions | 2026-05-29 |
| **Dashboard widgets** | Widget deck, `/dashboard/widgets`, `layoutGet`/`layoutSet` IPC, `widgetRegistry` | 2026-05-29 |
| **Git pro UI** | Three-tab hub, `GitVcsPage`, integrate bar, conflict studio, CI panel, config inspector, PR wizard, Smart-Flow bar | G1 2026-05-31 |
| **Runtimes (11)** | Ruby, Bun, Zig, C/C++, MATLAB, Dart, Flutter, Julia, Lua, Lisp, R — types, probes, install jobs | R1–R2 2026-05-31 |
| **Distribution** | Flatpak / Flathub pathway | 2026-05-28 |
| **Tests** | `*Ipc.integration.test.ts`, `headlessE2e.test.ts`, `registryContract`/`registryError` | P11 2026-06-02 |
| **Docs** | `docs/superpowers/plans/*`, `FORWARD_PLAN_2026-05-28.md`, `phasesPlan.original.md`, stale `COMPREHENSIVE_AUDIT_2026_06_02.md` | 2026-05-30 / 2026-06-02 |
| **Electron** | Entire Electron shell — all IPC is Tauri/Rust | Tauri Stages 0–3 |

Legacy routes may keep **redirects** (`/git-config`, `/git-vcs`, `/cloud-git`, `/registry`, `/system`) for bookmarks only — no restored pages.

### B. Stays in the project (unchanged through AC0–AC7)

**Product rule:** Existing shipped surfaces remain unless listed in **C** (transform) or **D** (scheduled delete).

| Layer | Stays |
| --- | --- |
| **Routes (primary)** | `/dashboard` (+ kernels, logs, monitor tabs), `/docker`, `/ssh`, `/git`, `/profiles`, `/terminal`, `/runtimes`, `/maintenance`, `/settings` |
| **Git UX** | Git Assistant only on `/git` — setup → project → save → share; Create PR in-panel; Git Doctor inline |
| **Cloud auth** | Settings → Connected accounts; device flow + PAT; `cloud_auth/`, `cloud_git_ipc/` — **no in-app PR merge** |
| **Runtimes** | 7 languages (Node, Python, Java, Go, Rust, PHP, .NET); install matrix, jobs, verify |
| **Docker** | Full page: containers, images, volumes, networks, cleanup, remap, install wizard, per-container stats |
| **Profiles** | CRUD, switch engine, scaffold (`project_scaffold/`), compose orchestration (`compose_profiles.rs`) |
| **Monitor / Maintenance** | Guardian, diagnostics bundle, dashboard monitor tab, maintenance tabs |
| **Settings (14 tabs)** | Personalization, Remote, System (hosts + `~/.profile`), Accounts, General, Update, Notification, Shortcuts, Help, Date/Time, Languages, App Engine, Builder, Beta — **no Extension, no Resources** |
| **Infrastructure** | Tauri app, `desktopApiBridge.ts`, `packages/shared` IPC+Zod, thin `lib.rs` dispatcher, domain Rust modules, job runner, command palette, i18n |
| **Compose presets** | 9 profile dirs; stub `docker-compose.yml` each; `web-dev` full stack pilot only |
| **Dev tooling in repo** | `graphify-out/` for **architecture planning** (agent `graphify query`) — separate from runtime `~/.keel/graphs/` (AC1) |
| **Deprecated Rust IPC** | Unused `dh:git:vcs:*` handlers — **kept** for contract tests until zero-reference audit (§6); renderer must not call |

**Sibling repos:** `headroom/`, `last30days-skill/`, `Agent-Reach/` stay **external** — KeelDev subprocesses them; does not vendor or merge their codebases. `dify/`, `odysseus/` stay **unintegrated**.

### C. Transformed during AI Core (keep domain, change UX or wiring)

| Existing | AC slice | What changes |
| --- | --- | --- |
| **Phase 16 + 11 wizards** | AC5 | Two-page chain (`ReadinessWizardPage` → `FirstRunWizardPage`) replaced by **one 3-question install wizard**; **probe matrix + pkexec fixes stay** (runs silently or as progress steps) |
| **Dashboard `/dashboard`** | AC6 | Adds **AI chat panel**, tool status cards, credit/usage summary, error/PATH notification strip — preset profile grid **stays** |
| **Settings** | AC0, AC3, AC6 | **Extends** (not replaces): API keys + model routing, proxy token, Headroom toggle, Git identity **path rules** YAML, compression preview — Connected accounts tab **stays** |
| **Git identity** | AC3 | Manual identity (Git Assistant + Settings) **stays**; adds **automatic path-based switcher** + dashboard indicator |
| **PATH / runtimes** | AC3, AC5 | Runtimes page + runtime install IPC **stay**; adds PATH scan/fix one-click + wizard-driven install |
| **System tab** | AC3 | `~/.profile` / hosts editors **stay**; PATH fixer reuses same pkexec / shell-config patterns |
| **First-run store keys** | AC5 | `readiness_wizard_complete` / `first_run_wizard_complete` → likely **single** `ai_install_wizard_complete` (or equivalent); migrate on first launch after upgrade |
| **Error handling UX** | AC4 | Scattered humanized errors **stay**; adds centralized **Error Diagnoser** panel with search + one-click fix |
| **Proxy role** | AC0–AC2 | IDEs use `localhost:4317` + Bearer token — **KeelDev becomes API key owner**; IDEs no longer need per-IDE OpenAI keys (product shift, not route deletion) |
| **`graphify` usage** | AC1 | Dev repo `graphify-out/` **stays** for planning; runtime project graphs move to `~/.keel/graphs/<hash>.json` |

### D. Scheduled deletion when AI Core ships

Delete only in the AC slice listed — after replacement is wired and tested.

| Delete target | AC | Replacement |
| --- | --- | --- |
| `ReadinessWizardPage.tsx` + CSS | AC5 | Unified install wizard (3 questions + embedded probes) |
| `FirstRunWizardPage.tsx` + CSS | AC5 | Same unified wizard |
| `firstRunWizardContract.ts`, `firstRunWizardError.ts`, `*.test.ts` | AC5 | `*InstallWizard*` contract/error pair (name TBD at implementation) |
| `App.tsx` dual wizard gate (`showReadinessWizard` / `showFirstRunWizard` chain) | AC5 | Single first-run / install wizard gate |
| Settings → "Run Setup Wizard Again" reset wiring | AC5 | Reset unified wizard + re-probe (same intent, new keys) |
| `setupWizard.ts` first-run-only reset | AC5 | Fold into install wizard reset helper |

**Not scheduled for AC0–AC7** (explicit keep):

| Item | Reason |
| --- | --- |
| `dh:git:vcs:*` Rust IPC | Contract tests; delete only after zero-reference audit (§6) |
| `SMART_FLOW_VCS.md` | Historical doc — keep, do not extend |
| 8/9 compose stub-only presets | Product decision separate from AI Core |
| `/terminal` page | Stays partial; external IDE is primary coding surface per `newCore.md` |
| Profile wizard (`pages/profiles/wizard/*`) | Stays — custom environment CRUD unrelated to AC5 install wizard |

### E. Added during AI Core (net-new)

| AC | Rust (est.) | Renderer (est.) | Surfaces / artifacts |
| --- | --- | --- | --- |
| AC0 | `ai_proxy.rs` ~400 | Settings AI section | `localhost:4317`, `~/.config/keel/token`, usage log |
| AC1 | `knowledge_graph.rs` ~200, file watcher ~100 | — | `~/.keel/graphs/*.json`, `dh:ai:graph:*` IPC |
| AC2 | `context_compress.rs` ~150 | compression toggle | Headroom daemon wrapper |
| AC3 | `git_context.rs`, `path_manager.rs` ~250 | identity indicator, PATH cards | `~/.config/keel/git-rules.yaml` (path TBD) |
| AC4 | `error_diagnose.rs` ~200 | error diagnosis panel | solution cache, `dh:diagnose:*` IPC |
| AC5 | install wizard logic ~150 | unified wizard page | starter scaffold + initial graphify |
| AC6 | — | ~400 TS | dashboard chat, notifications, API/model settings UI |
| AC7 | YAML workflow runner ~200 (if scoped) | — | optional tiny runner per `newCore.md`; **not** Dify |

New IPC families: `dh:ai:proxy:*`, `dh:ai:graph:*`, `dh:ai:compress:*`, `dh:git:context:*`, `dh:path:*`, `dh:diagnose:*` — each with shared Zod + contract/error tests.

### F. Never in this repo (permanent non-goals)

| Never build | Source |
| --- | --- |
| Full IDE / editor / LSP server | `newCore.md` |
| Own LLM training or hosting (use Ollama + cloud APIs) | `newCore.md` |
| Rewrite graphify, headroom, last30days, Agent-Reach in Rust | `newCore.md` |
| Import / fork **dify/** workflow engine | `newCore.md` + sibling repo out of scope |
| Subprocess **odysseus/** workspace | §18 — codename only |
| In-app Git merge/rebase studio, Smart-Flow, second Git UI | §6 G1 |
| Extensions, dashboard widgets, layout IPC | §3 |
| Cloud Git in-app PR **merge** | Tier 2 |
| Flatpak, npm deb package, Policy Lock, Visual Change Preview | §3, phasesPlan |
| Settings Resources tab (CPU/RAM sliders) | Phase 8 — deferred |
| Full `docker-compose.full.yml` for all 9 presets | unless explicit product decision |
| Browser E2E / restored IPC integration tests | P11 — maintainer decision only |

### G. Route matrix after AI Core (target)

| Route | Today | After AC6 |
| --- | --- | --- |
| `/dashboard` | partial | partial → **live** intent: project hub + AI chat + tool cards |
| `/dashboard/monitor` | live | **stay** live |
| `/docker`, `/runtimes`, `/maintenance` | partial/live mix | **stay** — same routes, richer notifications from AC3/AC4 |
| `/git` | live | **stay** live + AC3 identity indicator may appear in dashboard/topbar |
| `/settings` | partial | **stay** — extended tabs, not fewer |
| `/dashboard/widgets` | removed | **stay** removed |
| Install / readiness | blocking 8-step + 3-step chain | **single** AC5 wizard (no separate readiness page) |

Update [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) when AC5/AC6 land.

---

## 12. Document map

| Document | Role |
| --- | --- |
| **`phasesPlan.md`** | Canonical phase history + bug table + architecture rules |
| **`docs/MASTER_PLAN.md`** (this file) | Unified active plan + backlog + release gate; **§19** inventory |
| **`newCore.md`** | AI Core AC0–AC7 detailed spec (**canonical; do not edit from planning passes**) |
| **`gitRefactor.md`** | Git Assistant product + G1/G2/G3 spec (**shipped**; G4 hardening in §6) |
| `docs/SMART_FLOW_VCS.md` | Historical Smart-Flow blueprint (superseded by §6; do not extend) |
| `docs/STABILIZATION_CHECKLIST.md` | Stabilization evidence + B5 manual checklist |
| `docs/ROUTE_STATUS.md` | Route live/partial/stub matrix |
| `docs/STATUS.md` | High-level product status |
| `docs/AUDIT.md` | Consolidated audit (codebase + docs + page QA) |
| [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md) | Knowledge-graph architecture map (regenerate with `graphify update .`) |

---

## 13. Agent workflow

1. For architecture / coupling questions: run **`graphify query "<question>"`** when `graphify-out/graph.json` exists; read **§17** for hub context; read **§18** + [`newCore.md`](../newCore.md) for AI Core work.
2. Read **`phasesPlan.md`** for phase context and architectural rules.
3. Read **this file** for current backlog priority, **§19 stay/delete/transform**, and what is removed.
4. Check **`ROUTE_STATUS.md`** before changing route behavior.
5. Implement contract-first: `packages/shared` → Rust handlers → renderer (`desktopApiBridge.ts`, not raw `invoke`).
6. Run **`pnpm smoke`** before claiming done.
7. Update **`ROUTE_STATUS.md`** / **`STATUS.md`** if user-visible maturity changes.
8. After code changes affecting architecture: **`graphify update .`** (AST-only, no API cost).
9. **Verify & Instruct:** Always provide clear, step-by-step instructions to the user on how to manually verify the changes (e.g., what to click, try, or test) at the end of the task.

---

*When this file and `phasesPlan.md` disagree on historical phase completion, trust `phasesPlan.md` for phase detail and this file for forward priority and removal decisions.*
