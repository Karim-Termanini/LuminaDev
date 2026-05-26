# LuminaDev — Full Codebase Audit Report (Merged)

**Date:** 2026-05-26 | **Branch:** `feat/dashboard-fixes` | **Primary Auditor:** Claude Sonnet 4.6

---

1) Executive summary

LuminaDev is a well-structured, ambitious Tauri + React developer dashboard. The Tauri migration is functionally complete, the core Docker / Git / SSH / Monitor surfaces work end-to-end, and a credible CI gate exists. However, the audit surface uncovered a set of architectural, functional, documentation, and data-integrity issues that must be addressed before a wide public release.

Key findings (high-level):
- A large backend monolith in `apps/desktop/src-tauri/src/lib.rs` that violates the repository's modularization rules and harms testability.
- Multiple settings pages in the renderer persist values to the store but those values are not read by the Rust backend (write-only / phantom settings).
- Several places expose static or mock data in production paths (fabricated perf metrics, placeholder widgets, inaccurate AppStream metadata, misleading GPU detection).
- Documentation and phase planning files contain contradictions or stale artifacts that confuse contributors and reviewers.

This merged report consolidates the two audits and reproduces technical detail, proposed fixes, and prioritized remediation steps.

---

2) Architectural integrity

2.1 `lib.rs` monolith violation — CRITICAL

Finding: `lib.rs` is ~5,026 lines and contains ~48 handlers and substantial business logic. The project's own architecture guidance in `CLAUDE.md` and `CONTRIBUTING.md` requires a thin dispatcher (<<300 lines) with domain logic extracted into modules. That guideline has not been followed for the largest domains (notably Docker and profile switching).

Impact:
- Large single-file codebase increases merge conflicts and reduces reviewability.
- Unit and module-level tests are hard or impossible because logic is entangled with dispatcher / Tauri runtime.
- Several handlers contain 80–140+ lines of inline business logic (examples: `docker_install_invoke`, `docker_remap_port_invoke`, `dh:profile:switch`).

Partial remediation exists: a number of modules were extracted (e.g., `compose_profiles.rs`, `runtime_jobs.rs`, `git_vcs_*`, `cloud_auth.rs`, `readiness.rs`, `project_scaffold.rs`), but the largest domain (Docker) and associated profile switch code remain inline.

Recommendation (short-term):
- Immediately implement the Phase‑16 module refactor: extract `docker_ext.rs`, `terminal_pty.rs`, `ssh_ext.rs`, `git_parser.rs`, `runtime_installer.rs`, and `utils.rs`. Keep `lib.rs` as a thin dispatcher that forwards to domain modules.
- Add module-level unit tests before moving behavior to new locations to prevent regressions.

2.2 `removableDeps` hardcoded empty array

Finding: `runtime:uninstall:preview` currently returns `"removableDeps": []`. This is a known limitation but not surfaced to users.

Impact: UI controls that conditionally render a "Remove with dependencies" option will never appear. Users are given a false impression that dependency analysis exists.

Recommendation: Either implement a dependency graph or show an explicit "Not yet available" state in the UI. Do not return an empty array that implies nothing is removable.

---

3) Phantom settings contracts (HIGH severity)

Overview: Several settings pages persist structured settings into the Tauri store but the Rust backend does not consume those settings. The renderer therefore gives users the illusion of configuration; changes do not affect behavior.

Affected settings (non-exhaustive):
- `resources_settings` — CPU/RAM sliders saved but not enforced by the job runner.
- `app_engine_settings` — `ipcTimeoutMs`, `threadPoolSize`, `daemonAutoRestart` written to store but backend uses compile-time constants (e.g., `CMD_TIMEOUT_DEFAULT = 180s`).
- `update_settings` — `checkOnStartup`, `releaseChannel`, `lastChecked` saved but no updater or IPC channel exists.
- `notification_settings` — `globalMute`, `minSeverity` saved but React toasts/notifications do not consult this store.
- `shortcuts_settings` — keybindings recorded but no global listener wires them to actions.
- `language_settings` — UI offers locales but no i18n framework exists; the app is English-only.
- `beta_features_state` — toggles are saved but no gate reads them.

Impact: User confusion and lowered trust; settings appear to work but do not. This leads to support noise and inconsistent behaviour across sessions.

Recommendation:
- Prioritize wiring the most user-facing settings first: backend timeouts (`ipcTimeoutMs`) and job-runner constraints, `globalMute`/`minSeverity`, and shortcut dispatch.
- For settings with no immediate backend (e.g., updater), surface an explicit "UI-only / backend missing" badge rather than a disabled control the user can interact with.

---

4) Static and mock data surfaced in production paths

Findings and examples:
- Perf snapshot fields are fabricated (`startupMs: 150`, `heapUsedMb: rssMb / 2`). Remove or mark as synthetic.
- `removableDeps` returns empty arrays (see §2.2).
- Many runtimes fallback to `["latest"]` rather than enumerating available releases for languages other than Node, Go, Python.
- OAuth client IDs are placeholders in `cloud_auth.rs`.
- Dashboard profile cards include four `status: 'planned'` presets where some scaffolds exist; the UI still disables those profiles.
- `custom.placeholder` widget remains registered and will render a placeholder in production if present in `dashboard-layout.json`.
- AppStream metadata file `data/io.github.karimodora.LinuxDevHome.metainfo.xml` contains factual errors (wrong release version, incorrect homepage URL, outdated Electron description, missing screenshots).
- GPU detection fallback code shows `'Intel Integrated Graphics'` when `nvidia-smi` fails — this is misleading for AMD or unknown systems.

Impact: Users see incorrect hardware data, incorrect app metadata on Flathub, and placeholders in production UI; this degrades trust and may block app publishing.

Recommendation:
- Replace fabricated metric values with accurate measurements or explicit "Unavailable" markers.
- Fix `metainfo.xml` (version, homepage, description) and add required screenshots for Flathub.
- Change GPU fallback to `Unknown` and improve detection logic (use `lspci` / DRM if available).

---

5) Incomplete Phase deliverables and routing issues

Notable items:
- Phase 8 (Settings) is marked as "MVP Complete" in `phasesPlan.md` but the phase promise that settings "immediately affect the app state" is unmet for many tabs.
- Phase 14 (Flatpak release gate) has incomplete AppStream metadata, reproducible build verification, and cross-distro smoke coverage.
- Duplicate Flatpak manifests exist (three variations: `*.yml`) with no canonical guidance on which is authoritative.
- `DashboardWidgetsPage.tsx` exists in the tree but is not routed; `/dashboard/widgets` is a stub.
- `on_login_automation` wiring (compose up at login) is partially present but not reliably executed at startup.

Recommendation: Decide and document canonical Flatpak manifest; route or remove orphan pages; make Phase completion flags authoritative and update `phasesPlan.md` to reflect reality.

---

6) Documentation gaps and contradictions

Findings:
- `README.md` contains outdated Electron references despite migration to Tauri.
- `PR_BODY.md` and `thoghts.md` are stale, referencing branches or paths that no longer match the repository layout.
- `phasesPlan.md` presents duplicated or conflicting status markers for phases (Phases 9 and 15 examples).
- `ROUTE_STATUS.md` incorrectly lists `/registry` as an active page when it is a redirect to `/git?tab=vcs`.

Impact: Onboarding churn, reviewer confusion, and inaccurate release gating.

Recommendation:
- Run a documentation sweep: align `README.md`, `phasesPlan.md`, and `walkthrough.md` to the current code; archive historical planning files with an explicit "archived" banner.
- Introduce a PR checklist item requiring docs updated when user-visible behavior changes.

---

7) Security surface observations

Highlights:
- `docker_install_invoke` accepts the sudo password in the IPC payload (`body.get("password")`); while Tauri IPC is local, passing passwords in JSON kept in memory increases exposure.
- Use of `sshpass` and passing secrets through environment variables or command args is risky; env vars can be read by same-user processes.
- `dh:store:set` lacks a write allowlist and permits arbitrary keys to be written to `store.json` via IPC.
- Several code paths still use `bash -c` and shell interpolation; sanitize inputs and prefer exec-with-args to avoid injection risk.

Recommendation:
- Use `pkexec` or Polkit where possible for privilege escalation instead of passwords in IPC payloads.
- Replace `sshpass` flows with safer user prompts and ephemeral credential handling.
- Introduce an allowlist for `dh:store:set` or validate keys and shapes before persisting.

---

8) Missing features presented as configurable

Examples:
- OS native notifications toggle rendered but permanently disabled (Phase 10 dependency).
- App update check shown in Settings, but no updater plugin or IPC exists.
- Git Doctor and per-container stats stream listed in docs but not implemented in code.

Recommendation: Hide or explicitly mark UI-only controls until backend wiring is present.

---

9) Performance and UX concerns

Observed issues:
- `RuntimesPage.tsx` can take >60s to load because it queries many runtimes synchronously (each invoking shell checks).
- `DashboardMainPage.tsx` polls 6 IPC endpoints every 4 seconds; `DashboardLogsPage` polls every 2 seconds. Reduce polling frequency, add caching, or switch to event-driven updates.
- `DashboardMainPage.tsx` itself is very large (~1,562 lines) and should be split.

Recommendation:
- Add caching and lazy loading for runtime probes; introduce a controlled concurrency limit for shell probes.
- Replace frequent polling with server-side or Tauri push updates where feasible.

---

10) Minor polish and lint issues

Selected items from the automated review (CodeRabbit):
- Protect against ID strings containing `:` when splitting log identifiers.
- Guard against undefined `logTail` in the logs UI.
- Use theme-aware terminal background variables instead of hardcoded color.
- Clamp progress values used in progress bars to `0..100`.
- Improve accessibility attributes for the notifications dropdown.
- Avoid generating HTTP links for arbitrary TCP ports — restrict to known HTTP ports or surface copy‑to‑clipboard.
- Fix a critical default-profile write bug that corrupts the stored layout if `profile` is omitted.

Recommendation: Triage the CodeRabbit findings and add fixes for the critical and major items immediately.

---

11) Priority recommendations (summary)

Critical (P0):
- Fix `metainfo.xml` (version, homepage, description) and add screenshots for Flathub.
- Remove or refactor `lib.rs` monolith — extract Docker domain first.
- Wire backend to respect critical settings (`ipcTimeoutMs`, job-runner resource limits), or mark them UI-only.

High (P1):
- Label or hide phantom settings in UI; implement shortcut dispatch loop; fix GPU fallback.
- Reduce dashboard and logs polling; profile runtime probes.

Medium / Low (P2+):
- Decide canonical Flatpak manifest, route or remove orphan pages, update stale docs, add i18n plan, and improve tests.

---

12) Summary counts

Categorized totals (conservative):
- Architectural violations: 2 (high)
- Phantom store contracts (settings never enforced): 7 (high)
- Static / fabricated UI data: 4 (medium)
- Incomplete deliverables misrepresented as done: 5 (medium)
- Documentation contradictions: 6 (low–medium)
- Security observations: 3 (low–medium)
- Missing features presented as configurable: 4 (medium)
- Minor polish and orphan debt: 6 (low)
- Total distinct issues enumerated: 37

---

13) Closing remarks

LuminaDev has strong foundations (typed IPC contracts, Zod schemas, CI, smoke tests), but there is a gap between UI polish and backend wiring in several areas. Addressing the top three items (monolith refactor, settings wiring, removal of fabricated data) will significantly raise the codebase quality and readiness for a broader release or Flathub submission.

If you want, I can start the first remediation steps now (create a feature branch to extract the Docker handlers from `lib.rs`, wire `ipcTimeoutMs` in the backend, and create tests). Tell me which item to start on and I will proceed.

---
