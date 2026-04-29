# Stabilization Checklist

This checklist is the closure track for the "hype vs substance" concerns.
It is intentionally limited to reliability, safety, process discipline, and truthful documentation.

Execution split (Agent B vs Rust/IPC): [AGENT_WORK_PLAN.md](./AGENT_WORK_PLAN.md).

Status legend:
- `open` = not started
- `in_progress` = actively being implemented
- `done` = acceptance criteria verified

## 1) Commit Quality and PR Discipline

- **Status:** `done`
- **Goal:** Eliminate micro-churn commits and improve reviewability.
- **Acceptance criteria:**
  - Every PR groups related changes into coherent commits (no unrelated "cleanup only" noise unless necessary).
  - Commit messages explain intent/scope clearly (not generic one-liners).
  - No direct commits to `main`; PR flow remains mandatory.
  - Repository has explicit commit/PR enforcement guidance and template.
- **Evidence:**
  - Added commit hygiene policy:
    - `docs/COMMIT_QUALITY_RULES.md`
  - Added mandatory PR checklist template:
    - `.github/pull_request_template.md`
  - Linked branching workflow to commit policy:
    - `docs/BRANCHING.md`

## 2) IPC Reliability Coverage (Beyond Docker)

- **Status:** `done`
- **Goal:** Extend strict contract validation/testing patterns to other sensitive surfaces.
- **Acceptance criteria:**
  - Add/expand tests for at least: `ssh`, `git config`, and one runtime install/uninstall flow.
  - Error payloads use deterministic `{ ok, error }`-style handling (or explicitly documented equivalent).
  - Invalid payload paths are tested (missing required fields, malformed values).
  - `pnpm smoke` passes after test additions.
- **Evidence:**
  - Added runtime request schemas and unified main-process parsing:
    - `packages/shared/src/schemas.ts`
    - `apps/desktop/src/main/index.ts` (`runtimeGetVersions`, `runtimeCheckDeps`, `runtimeUninstallPreview`)
  - Expanded schema tests for `ssh`, `git config`, and runtime uninstall/version/check-deps payloads (valid + invalid):
    - `packages/shared/test/schemas.test.ts` (13 tests passing)
  - Smoke gate verification:
    - `bash scripts/smoke-ci.sh` passed (workspace typecheck + shared/desktop tests + lint) on 2026-04-29.
  - Extended strict contract/error handling beyond Docker across active desktop slices:
    - `git`, `ssh`, `dashboard`, `monitor`, `registry`, `runtimes`, `terminal`
    - Evidence modules: `apps/desktop/src/renderer/src/pages/*Contract.ts`, `*Error.ts`, paired tests

## 3) Privilege Boundary Evidence (Flatpak vs Host)

- **Status:** `done`
- **Goal:** Provide concrete, testable behavior around sandbox/host expectations.
- **Acceptance criteria:**
  - Document at least 3 critical operations with explicit behavior in each context (Flatpak/native).
  - Include user-visible error wording for blocked host operations.
  - Add verification steps in docs for reproducing expected behavior.
  - Cross-reference from `README.md` and `docs/DOCKER_FLATPAK.md`.
- **Evidence:**
  - Added explicit matrix with 3 critical operations across native vs Flatpak:
    - `docs/PRIVILEGE_BOUNDARY_MATRIX.md`
    - Operations covered: Docker socket access, SSH `~/.ssh` access, PTY terminal fallback.
  - Added user-visible error wording references in matrix:
    - Docker unavailable/permission denied messaging.
    - SSH Flatpak note with override guidance.
    - PTY fallback guidance.
  - Added reproducible verification steps for both contexts and linked references:
    - `README.md` Flatpak section
    - `docs/DOCKER_FLATPAK.md`
    - `docs/INSTALL_TEST.md`

## 4) Scope Freeze Enforcement

- **Status:** `done`
- **Goal:** Prevent feature creep until stabilization gate is closed.
- **Acceptance criteria:**
  - New work is limited to bug fixes/tests/docs for current implemented surfaces.
  - No new phase expansion work merged before checklist items 1-3 are `done`.
  - `README.md` quality gate remains aligned with this rule.
- **Evidence:**
  - Stabilization work in this cycle stayed limited to:
    - contract hardening,
    - tests,
    - docs/process quality artifacts.
  - No phase-expansion feature work introduced while closing checklist items.
  - `README.md` quality gate remains aligned with stabilization-only scope.

## 5) Documentation Truthfulness Audit

- **Status:** `done`
- **Goal:** Ensure user-facing docs reflect real maturity and known limits.
- **Acceptance criteria:**
  - `README.md` uses only `Implemented / Partial / Planned` framing.
  - Historical/internal docs avoid being interpreted as release sign-off.
  - Placeholder or empty docs are either filled with minimal factual content or removed.
  - At least one pass over all files in `docs/` completed and recorded.
- **Evidence:**
  - Completed docs audit record with reviewed file list and corrective actions:
    - `docs/DOCS_AUDIT_2026-04.md`
  - Added/updated truthfulness and process references:
    - `README.md`
    - `docs/BRANCHING.md`
    - `docs/INSTALL_TEST.md` (generic repo path wording)

---

## Exit Rule (Stabilization Gate Pass)

Stabilization is considered complete only when:
1. Items **1, 2, 3, 5** are marked `done` with evidence.
2. Item **4** remains enforced throughout and does not regress.
3. `pnpm smoke` is green at the final checkpoint.

---

## Tauri Pre-Release Migration Track

- **Status:** `in_progress` — Rust IPC done; packaging/Flatpak deferred; no semver/release pressure until product-complete (see [AGENT_WORK_PLAN.md](./AGENT_WORK_PLAN.md))
- **Scope:** Replace Electron runtime shell with Tauri before first public release while preserving existing behavior.
- **Stage 0 (baseline + freeze):** `done`
- **Stage 1 (Tauri skeleton + API bridge):** `done`
- **Stage 2 (Rust-native backend port):** `done` — all IPC channels native; Node bridge removed
- **Stage 3 (renderer parity + UX preservation):** `done`
- **Stage 4 (packaging + CI + Flatpak):** `in_progress` — native-linux-build green; flatpak deferred to release
- **Stage 5 (release gate):** `open` — product-complete criteria + final `pnpm smoke` when you choose to cut a release (not on a fixed calendar)

- **Stage 1 evidence:**
  - Tauri app scaffold: `apps/desktop/src-tauri/*`
  - Renderer transport bridge: `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`
  - `pnpm smoke` passed on 2026-04-29

- **Stage 2 evidence (2026-04-30):**
  - All remaining channels ported to Rust native:
    - `dh:metrics` — `/proc/meminfo`, `/proc/loadavg`, `/proc/cpuinfo`, `df`
    - `dh:host:exec` — `systemctl is-active`, `nvidia-smi`
    - `dh:docker:create` — docker CLI with ports/env/volumes/autoStart; returns `id` on success
    - `dh:ssh:list:dir` — native `ssh ls`
    - `dh:ssh:setup:remote:key` — native `ssh` + `sshpass`
    - `dh:docker:remap-port`, `dh:docker:install` — implemented in Rust (clone + remap host ports; `sudo` distro install steps — host-only, may fail under Flatpak / no root)
  - `invoke_node_bridge()` removed from `lib.rs`
  - `apps/desktop/scripts/tauri-ipc-bridge.mjs` deleted
  - Node.js no longer required at app runtime
  - `pnpm smoke` passed after changes

- **Stage 3 evidence (2026-04-29):**
  - All 63 `window.dh.*` call sites across 8 pages verified against bridge
  - Two bugs fixed: `isTauriRuntime()` guard, `DashboardLayoutFile` import
  - UX regression audit: polish batches 1–5 intact
  - `pnpm typecheck` + `pnpm smoke` passed

- **Stage 4 evidence (2026-04-30):**
  - CI: `agent-*` trigger removed; `feat/*`, `fix/*`, `chore/*` added
  - `quality-gate` job: trimmed to only `build-essential python3` (WebKit deps were unnecessary)
  - `native-linux-build`: Rust toolchain + cache present, Tauri build green in CI

- **Remaining before Stage 5 (when you declare product-ready):**
  - Run `pnpm smoke` on `main` before any tagged release
  - Flatpak offline build / Flathub — **last** (long CI); enable when ready

---

## Manual Test Checklist (B5)

Minimal flows to verify before declaring a build stable. Run on real Tauri build.

### App startup
- [ ] App launches without crash
- [ ] Wizard shows on first run; completes and dismisses on "Finish"
- [ ] Dashboard loads with correct layout

### Docker panel
- [ ] Container list loads (or shows "docker unavailable" if no daemon)
- [ ] Start / Stop / Restart / Remove actions work and refresh list
- [ ] Container logs load and scroll
- [ ] Images tab: list loads, remove image works
- [ ] Volumes tab: list loads, create/remove volume works
- [ ] Networks tab: list loads, create/remove network works
- [ ] Cleanup tab: prune preview shows counts; "Run Cleanup" executes
- [ ] Ports tab: shows current published ports; remap card shows "not available" notice
- [ ] Install / Setup button: opens modal, shows "not available" notice + docs link

### Terminal
- [ ] Terminal tab opens, shell prompt appears
- [ ] Input echoes, commands run
- [ ] "Open external terminal" button works or shows clear error

### SSH page
- [ ] Key generation completes
- [ ] Public key displays and can be copied
- [ ] GitHub SSH test runs and returns output

### Git Config page
- [ ] Git config list loads
- [ ] Set name/email saves without error

### Monitor / System page
- [ ] Metrics load (CPU, memory, disk, load avg)
- [ ] Top processes list appears
- [ ] System info loads

### Maintenance page
- [ ] Compose profiles list and launch
- [ ] Diagnostics bundle creates file

### Runtimes page
- [ ] Runtime status list loads (node, python, go, rust, java)

### Known limits (not test failures)
- `dh:docker:install` / `dh:docker:remap-port`: IPC supported in Tauri; UI may still show docs-first notices — real install needs `sudo` on host; remap clones a new container (old one unchanged).
- Flatpak-specific paths may differ from native install ✓
