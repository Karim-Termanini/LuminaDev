# Application Creation Playbook

This document is the reusable engineering guide learned from building LuminaDev.
Use it as the default process for the next application.
Update it whenever a new problem appears (see "Continuous Incident Log" section).

---

## 0) Purpose of this playbook

Build real software with:

- truthful scope
- stable architecture boundaries
- deterministic error handling
- test evidence
- release discipline

Avoid:

- overpromising docs
- feature creep before a stable vertical slice
- commit churn
- untested integration paths

---

## 1) Pre-build phase (before writing features)

### 1.1 Define the first vertical slice

Pick one narrow flow that proves user value end-to-end.

Example template:

- Input: user action from UI
- Core operation: one real system capability
- Error surface: expected failure classes
- Output: user-visible success/failure with deterministic message

Rule:

- Do not build phase-wide feature breadth first.
- Build one slice deeply (UI + logic + contracts + tests + docs).

### 1.2 Declare trust boundaries early

For desktop/system apps, define environments explicitly:

- sandboxed context
- host context
- privileged operations

For each operation, document:

- where it runs
- required permissions
- fallback behavior
- user-facing message on denial

### 1.3 Create a quality gate before roadmap expansion

Before adding more features, require:

- green smoke gate (typecheck + tests + lint)
- deterministic error contracts
- truthful status docs
- no open regressions in the vertical slice

---

## 2) Architecture lessons

### 2.1 Contracts first, implementation second

Define typed request/response contracts at boundaries:

- IPC
- API
- worker/background jobs

Use schema validation at boundaries (e.g. Zod).
Never trust raw payloads across process boundaries.

### 2.2 Prefer explicit result objects for operations

For high-risk flows, avoid ambiguous throws as the only channel.
Use stable operation result shape:

- success: `{ ok: true, ...data }`
- failure: `{ ok: false, error: "stable error string/code", ...safe fallback fields }`

Benefits:

- renderer logic remains deterministic
- no silent failures
- easier to test invalid/malformed responses

### 2.3 Error normalization strategy

Convert low-level runtime errors into stable codes:

- permission denied
- unavailable daemon/socket
- not found
- conflict
- timeout
- invalid request
- unknown

Then map codes to user-safe messages in UI layer.
Do not leak opaque stack/system text directly as UX.

### 2.4 Keep domain logic extractable and testable

If logic matters, move it to dedicated modules, not giant files.
Example pattern:

- parser/mapping helper module
- contract assert helper module
- tests directly against helper modules

This gives fast unit tests without booting full app runtime.

### 2.5 Avoid lib.rs Bloat (The "No-Monolith" Rule)

In Rust shells (Tauri), do not keep domain logic in `src-tauri/src/lib.rs`.

- Any logic exceeding 50 lines should move to a dedicated module (e.g., `runtime_jobs.rs`).
- `lib.rs` should only act as a clean entry point and router for IPC commands.
- This preserves compile times and mental model clarity.

### 2.6 Contract-Driven Development (Level 4 Probes)

For every new IPC domain, a dedicated `*_contract_tests.rs` (Rust) and `*.contract.test.ts` (TS) must exist.

- Rust side: Assert that the internal struct serializes to exactly what the TS Zod schema expects.
- TS side: Assert that the IPC response matches the Zod schema before it touches the UI.
- This prevents "Silent Failures" where the UI shows stale data because of a minor JSON key change.

### 2.7 Credential Storage Pattern (The "Machine-ID Shield")

Sensitive tokens (GitHub/GitLab) must never be stored in plain text.

- **Pattern:** Use a `CredentialStore` trait.
- **Implementation:** Encrypt tokens in the JSON store using a key derived from the host's `machine-id`.
- **Why:** Protects against casual filesystem access/leaks without the UX friction of OS-keyring popups in early alpha stages.
- **Transition:** Design for an easy migration path to system keychains (Option A) later.

---

## 3) Scope control lessons

### 3.1 Freeze scope while stabilizing

When quality concerns appear, freeze net-new features.
Only allow:

- bug fixes
- contract hardening
- tests
- docs truthfulness updates

### 3.2 Track what is "implemented" vs "partial" vs "planned"

Public docs must reflect real maturity.
Use only factual labels:

- Implemented (verified)
- Partial / evolving
- Planned

Never market future capabilities as done.

### 3.3 Split "historical walkthrough" from "release sign-off"

Any internal audit notes must explicitly say:

- historical implementation notes
- not a release approval by itself

Canonical status should live in one public source (e.g. README).

---

## 4) Testing strategy lessons

### 4.1 Test ladder

Minimum ladder per slice:

1. schema/contract tests
2. mapper/error helper tests
3. critical flow tests in renderer/controller logic
4. smoke gate for workspace (typecheck + tests + lint)

### 4.2 Test what usually breaks

Prioritize tests for:

- deterministic error code mapping
- malformed payload handling
- missing/invalid response contract fields
- destructive operation confirmations

### 4.3 Fail fast on invalid response payloads

Contract assertion helpers should throw if:

- payload is not object
- required contract fields missing (e.g. `ok`)

This prevents false-positive success behavior.

---

## 5) Documentation discipline lessons

### 5.1 Docs are part of product correctness

Treat inaccurate docs as a bug.

Update docs whenever:

- behavior changes
- quality gate changes
- scope freeze starts/ends
- known limits discovered

### 5.2 Keep a stabilization checklist

Maintain one checklist with:

- status per closure item
- acceptance criteria
- evidence links
- final exit rule

This avoids vague "almost done" states.

---

## 6) Commit and PR discipline lessons

### 6.1 One reviewable change per commit

Each commit should represent one coherent intent.
Avoid micro-churn standalone commits unless urgently required.

### 6.2 Commit message quality

A good message states:

- what changed
- why
- scope

Avoid generic messages that hide meaningful risk.

### 6.3 PR hygiene

Before merge:

- smoke gate green
- scope aligned to active checklist/gate
- no unrelated refactors in the same PR

---

### 6.4 Bundle Your Pushes

Avoid pushing every micro-commit. Bundle commits into logical "Vertical Slices" or functional blocks before pushing to the remote. This respects CI/CD resource limits and keeps the build history meaningful.

---

## 7) Platform-specific lessons (Desktop + Flatpak + Host tools)

### 7.1 Be explicit about host limitations

For sandboxed applications:

- some operations cannot run directly
- require host overrides / helper flow
- must be documented and reflected in UI copy

### 7.2 Native modules need operational notes

If using native modules (e.g. terminal/pty):

- document rebuild requirements
- include environment prerequisites
- include known runtime tuning limits

### 7.3 Safety over convenience for destructive actions

For delete/prune/remove operations:

- force confirmation
- show risk context ("in use by" when possible)
- handle conflict paths safely

### 7.4 Distro-Specific Packaging (Arch Linux vs Ubuntu/Fedora)

- Distros handle `/run` and `/var/run` differently (symlink vs directory).
- Flatpak `bwrap` (sandbox manager) will fail if a mount point conflicts with a host symlink.
- **Rule:** Always test Flatpak bundles on Arch Linux early, as its strictness catches packaging bugs missed by Ubuntu.
- **Rule:** Prefer mounting specific files (e.g. `/run/docker.sock`) over parent directories if symlink conflicts occur.

### 7.5 Multi-Distro CI Requirement

A "Hardened" app must pass a Multi-distro Smoke CI before any production release.

- **Minimum distros:** Arch Linux (for strict bwrap/symlink checks) and Fedora (for headless Xvfb/DRM checks).
- **Automation:** Use GitLab CI jobs with native containers for each distro.
- **Sandbox Probes:** Run automated tests *inside* the built bundle to verify Docker/D-Bus/FS access.

### 7.6 Secure Token Injection (GIT_ASKPASS)

When spawning child processes that need auth (like `git push`):

- Never pass tokens as command-line arguments (visible in `ps`).
- **Pattern:** Use `GIT_ASKPASS` environment variable pointing to a temporary executable script.
- **Security:** The script must have `chmod 700` and be deleted immediately after the command completes.

---

## 8) Reusable build sequence for the next app

1. Define one vertical slice and acceptance criteria.
2. Define trust boundaries and permissions matrix.
3. Define typed contracts and validation schemas.
4. Implement minimal UI + backend path for the slice.
5. Add deterministic error code normalization.
6. Add user-facing error humanization.
7. Add tests for contract + error mapper + invalid payload.
8. Wire workspace smoke gate.
9. Publish truthful status docs.
10. Freeze scope until slice quality gate passes.
11. Expand to next slice only after evidence is green.

---

## 8.1) Vertical Slice Definition Template (copy/paste)

Use this template before starting any new slice.

### A) Slice identity

- **Slice name:**
- **User value (one sentence):**
- **In-scope capabilities:**
- **Out-of-scope capabilities (explicitly deferred):**

### B) Boundary and safety map

- **Execution context:** sandbox | host | mixed
- **Privilege needs:** none | user-level | elevated
- **Sensitive operations:** (delete/prune/write/system changes)
- **User confirmations required:** yes/no + where
- **Failure classes expected:** unavailable | permission | conflict | timeout | invalid | unknown

### C) Contract definition

- **Request schema(s):**
- **Response schema(s):**
- **Deterministic result shape:** `{ ok: true, ... }` | `{ ok: false, error, ...safe fallback }`
- **Invalid payload behavior:** reject at boundary with stable error

### D) UX definition

- **Success state shown to user:**
- **Failure message strategy:** technical code -> humanized message
- **Fallback behavior:** (when operation blocked in sandbox, etc.)
- **Help text/docs link shown in UI:**

### E) Test plan (minimum)

- **Schema validation tests:** valid + invalid payloads
- **Mapper/normalizer tests:** stable error code mapping
- **Contract assertion tests:** missing fields / malformed response
- **Flow test target:** one critical user path
- **Smoke gate target:** typecheck + tests + lint green

### F) Evidence required to mark slice "done"

- [ ] All tests above added and passing
- [ ] `bash scripts/smoke-ci.sh` green
- [ ] Docs updated with truthful status (`Implemented / Partial / Planned`)
- [ ] Known limits documented
- [ ] No net-new scope outside this slice in same PR

### G) Post-implementation review

- **What regressed?**
- **What surprised us technically?**
- **What should become a permanent rule in this playbook?**
- **Incident log entry added?** yes/no

---

## 9) Continuous Incident Log (update every new problem)

Use this template for every new issue discovered during development:

### Incident Entry Template

- **Date:**
- **Area:** (e.g. IPC / Docker / Git / UI / Build / Docs / CI)
- **Symptom:**
- **Root cause:**
- **Impact:**
- **Fix implemented:**
- **Preventive action:** (test/rule/checklist/doc)
- **Verification evidence:** (test output / smoke / manual check)
- **Status:** open | monitoring | resolved

### Incident Log

#### 2026-04 — Overpromising documentation risk

- **Area:** Docs / Product communication
- **Symptom:** Public description sounded more mature than validated implementation.
- **Root cause:** Roadmap language mixed with implemented status language.
- **Impact:** Trust risk for users and reviewers.
- **Fix implemented:** Reframed status into Implemented / Partial / Planned; added quality gate wording.
- **Preventive action:** Documentation truthfulness rule in quality gate.
- **Verification evidence:** README and phase policy updates.
- **Status:** resolved

#### 2026-04 — Docker IPC inconsistency risk

- **Area:** IPC contracts / error handling
- **Symptom:** Inconsistent mix of thrown errors and operation results.
- **Root cause:** Endpoint evolution without unified response contract.
- **Impact:** Non-deterministic UI error handling and weak regression confidence.
- **Fix implemented:** Standardized Docker response handling and strict contract assertions; expanded tests.
- **Preventive action:** Contract helper + tests for invalid payload/missing flags.
- **Verification evidence:** desktop tests + smoke gate passing.
- **Status:** resolved

#### 2026-04 — Contract drift after IPC typing hardening

- **Area:** UI contracts / Maintenance / Dashboard slices
- **Symptom:** Multiple pages assumed legacy payload shapes after IPC return types were tightened.
- **Root cause:** UI casts were not upgraded in the same pass as preload/renderer type definitions.
- **Impact:** Typecheck failures and potential silent UX regressions when operations failed.
- **Fix implemented:** Added slice-specific contract helpers (`dashboard/monitor/registry/runtime/terminal`) and replaced loose casts with explicit `ok/error` handling.
- **Preventive action:** Any IPC signature change must include same-PR updates for main + preload + renderer + page-level contract test.
- **Verification evidence:** desktop typecheck green and dedicated contract tests passing for each hardened slice.
- **Status:** resolved

#### 2026-04-29 — isTauriRuntime guard not called (desktopApiBridge)

- **Area:** Renderer / IPC bridge / Tauri migration
- **Symptom:** `ensureDesktopApi()` skipped its "are we in Tauri?" check, causing Tauri IPC to be injected in non-Tauri contexts (web-only dev build).
- **Root cause:** Guard was `if (!isTauriRuntime)` (function ref check) instead of `if (!isTauriRuntime())` (call).
- **Impact:** In pure web build context (`dev:web`), all `window.dh.*` calls would throw Tauri invoke errors instead of failing gracefully. No impact in Electron (preload sets `window.dh` before renderer runs) or production Tauri build.
- **Fix implemented:** Changed to `isTauriRuntime()` in `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`.
- **Preventive action:** Guard functions in bridge init paths must always be called with `()`.
- **Verification evidence:** typecheck and smoke gate green.
- **Status:** resolved

#### 2026-04-29 — Missing DashboardLayoutFile import in vite-env.d.ts

- **Area:** TypeScript types / renderer declarations
- **Symptom:** `DashboardLayoutFile` used in `Window.dh` interface definition without import.
- **Root cause:** Type added to `layoutGet` signature without adding the corresponding import from `@linux-dev-home/shared`.
- **Impact:** Ambient type resolution masked the missing import; TypeScript accepted it but the pattern is fragile and breaks explicitly typed builds.
- **Fix implemented:** Added `DashboardLayoutFile` to the import in `apps/desktop/src/renderer/src/vite-env.d.ts`.
- **Preventive action:** Any type used in `vite-env.d.ts` declarations must be explicitly imported.
- **Verification evidence:** typecheck green after fix.
- **Status:** resolved

#### 2026-04-29 — CI native-linux-build missing Rust toolchain

- **Area:** CI / Tauri build
- **Symptom:** `native-linux-build` job ran `pnpm --filter desktop build:tauri` without installing Rust, causing `cargo` not found error.
- **Root cause:** Rust toolchain setup was not added when the Tauri build job was created.
- **Impact:** `native-linux-build` CI job would fail on every run.
- **Fix implemented:** Added `dtolnay/rust-toolchain@stable` and `Swatinem/rust-cache@v2` steps to `native-linux-build` in `.github/workflows/ci.yml`.
- **Preventive action:** Any CI job that invokes `cargo` must include a Rust toolchain setup step.
- **Verification evidence:** CI workflow updated; Rust step confirmed present.
- **Status:** resolved

---

## 10) Maintenance rule for this file

Whenever a new issue appears:

1. Add a new Incident Log entry.
2. Add or update preventive rule/checklist item.
3. Link evidence of verification.
4. Keep language factual (no marketing terms).

This file is a living engineering memory, not static documentation.

---

## 11) Quality Pipeline Rollout (A/B/C)

### Phase A — Immediate Gate (implemented)

- Mandatory CI jobs:
  - Lint + typecheck + unit tests (`bash scripts/smoke-ci.sh`)
  - Production dependency audit (`pnpm audit --prod --audit-level=high`)
  - Native Linux build (`pnpm --filter desktop build:tauri`; WebKit + Rust in CI)
  - Flatpak offline build smoke (`flatpak-builder ...offline.yml`)
- SAST enabled through CodeQL workflow.
- Dependabot configured for npm and GitHub Actions updates.

### Phase B — Behavior Stability (implemented baseline)

- Integration tests added for IPC contract + error mapping path.
- E2E-lite critical scenarios added for:
  - Docker failure UX mapping
  - SSH Flatpak permission guidance
  - Terminal PTY fallback guidance
- Coverage baseline enabled for critical files (minimum 60% statements, with thresholds in `vitest.config.ts`).

### Phase C — Product Hardening (next)

- Performance:
  - measure startup latency, memory footprint, and polling overhead
- Accessibility:
  - keyboard navigation, focus order, labels, contrast
- Mutation testing (optional advanced):
  - apply only to sensitive logic modules (contracts/error mappers)

### Phase C baseline update (implemented)

- Added `perfSnapshot` IPC endpoint for deterministic runtime perf telemetry:
  - startup time (`startupMs`)
  - memory footprint (`rssMb`, `heapUsedMb`, `heapTotalMb`)
  - process uptime (`uptimeSec`)
- Wired perf baseline into Maintenance diagnostics wizard with explicit pass/fail thresholding.
- Added accessibility baseline audit in Maintenance diagnostics:
  - unlabeled inputs/buttons
  - images missing `alt`
  - focusable elements count
  - semantic landmarks presence

### Phase 13 — Environment Hardening (implemented)

- **Multi-distro Smoke CI:** Integrated Arch Linux and Fedora test jobs in `.gitlab-ci.yml`.
- **Sandbox Permission Probes:** Added automated Rust tests to verify Docker/D-Bus/PTY/FS access in restricted environments.
- **Static Analysis Gate:** Enabled `clippy -D warnings` and `cargo-audit` in the `smoke` script.
- **IPC Contract Parity:** Implemented Level 4 contract probes (`ipc_contract_tests.rs`) for runtime parity verification.

### Documentation discipline reinforcement

- Every hardening step must update this file in the same change set:
  - what changed
  - why it matters
  - verification evidence
- Treat missing playbook updates as a process bug.

### Phase 7 UI hardening (batch approach)

- Apply UI polish in controlled batches, not all at once:
  1. layout and spacing rhythm
  2. visual hierarchy (titles, accents, emphasis)
  3. button states and feedback clarity
  4. responsive behavior and overflow sanity
- Each batch must preserve existing behavior and pass typecheck/tests before the next batch.

### Batch 2 delivered

- Improved visual hierarchy and feedback clarity in:
  - `GitConfigPage`
  - `RegistryPage`
  - `ProfilesPage`
- Changes include:
  - clearer status surfaces (dedicated success/warning alert blocks)
  - stronger heading/body spacing rhythm
  - more consistent button emphasis and readability for primary vs secondary actions

### Batch 3 delivered

- Responsive refinement and overflow hardening for:
  - `DashboardKernelsPage`
  - `DashboardLogsPage`
  - `DockerPage`
- Changes include:
  - centered content with safe horizontal page padding
  - horizontal overflow safety for long logs/terminal-style text blocks
  - tab strip overflow handling for Docker sections on smaller widths
  - denser, more consistent card spacing without changing runtime behavior

### Batch 4 delivered

- Interaction state hardening:
  - stronger hover/active/disabled states for `.hp-btn`
  - visible keyboard focus rings for buttons/inputs/selects/textareas
  - improved focus feedback for `.hp-input`
- Applied to active dashboard surfaces with no behavior changes:
  - `DashboardKernelsPage`
  - `DashboardLogsPage`
  - `DockerPage` (alert action alignment + interaction consistency)

### Batch 5 delivered

- Contrast and typography polish:
  - introduced reusable card heading primitives in `global.css`:
    - `.hp-card-header`
    - `.hp-card-title`
    - `.hp-card-subtitle`
  - tuned common title/muted/section styles for clearer hierarchy and better readability in dark theme
- Applied card-header polish to:
  - `DashboardKernelsPage` (GPU snapshot + Service states cards)
  - `DashboardLogsPage` (Compose output + Background jobs cards)
  - `DockerPage` (create-flow cards + section titles + container table headings)
- Evidence:
  - no behavioral logic changed; UI-only refinements on existing flows
  - typography and contrast updates localized to renderer theme/page components

### Phase 7 Docker & Terminal Hardening (2026-04-30)

- **Docker Terminal Stabilization (PTY Implementation):**
  - Replaced legacy `tokio::process::Command` pipes with `portable-pty` for authentic TTY support.
  - **Memory Safety:** Implemented `Arc<StdMutex<TerminalSession>>` pattern to ensure thread-safe access between the background reader thread and the IPC writer handler.
  - **Input Reliability:** Added a dedicated `writer` handle to `TerminalSession` to ensure deterministic `stdin` writing with explicit `flush()`, resolving "character swallowing" and input lag.
  - **Error Fixes:** Resolved "Not a tty" and "no job control" shell warnings by providing a real pseudo-terminal environment.
- **Docker UX & Lifecycle Hardening:**
  - **Keep-alive Logic:** Utility containers (e.g. `bash`, `alpine`) now default to a background sleep loop (`while true; do sleep 3600; done`) if no command is provided, preventing immediate container exit after creation.
  - **Network Detection:** Implemented fallback logic for containers on the default `bridge` network where `docker ps --format {{.Networks}}` occasionally returns empty strings.
  - **Network Customization:** Added `--network` support to the `docker:create` IPC flow.
- **SSH Integration Expansion:**
  - Added `dh:ssh:list:dir` for remote file exploration.
  - Added `dh:ssh:setup:remote:key` with `sshpass` fallback support for automated remote key deployment.
- **UI/UX Refinements (Batch 6):**
  - **Terminal Fallback:** Restored "Open External Terminal" button to provide native shell interaction as a backup to the embedded PTY.
  - **Theming Fixes:** Applied `appearance: none` and explicit dark backgrounds to `select` elements in `DockerPage.tsx` to fix white-on-white text in the Port Remapping UI.
  - **Responsive Layout:** Increased grid `minmax` to `340px` for container cards to prevent overflow and layout breaking on narrower viewports.
- **Verification Evidence:**
  - `pnpm typecheck` green.
  - Docker terminal confirmed interactive with working prompts and echo (no duplicate characters).
  - Alpine/Bash containers confirmed staying active after creation.

### Monitor & SSH Infrastructure Hardening (2026-04-30)

- **Monitor Backend Hardening:**
  - **Accurate CPU Metrics:** Replaced delayed "load average" with real-time CPU usage calculation using `/proc/stat` ticks delta across update intervals.
  - **Truthful App Performance:** Replaced static 0 values in `dh:perf:snapshot` with real RSS memory usage (from `/proc/self/statm`) and true process uptime.
  - **Enhanced GPU Detection:** Expanded hardware probes to detect Intel and AMD GPUs via `lspci` fallbacks when `nvidia-smi` is unavailable.
  - **Security Logic Hardening:** Updated "Risky Ports" detection to distinguish between local-only (`127.0.0.1`) and exposed (`0.0.0.0`) ports, reducing false positives for local dev servers.
- **SSH Stability & UX:**
  - **Metadata Accuracy:** Refined `dh:ssh:list:dir` to use `ls -aF1` for precise directory/file/link differentiation.
  - **Idempotent Key Setup:** Hardened `dh:ssh:setup:remote:key` to prevent duplicate entries in the remote `authorized_keys` file.
- **Frontend Optimization & UX:**
  - **API Rate-Limit Protection:** Implemented 5-minute `localStorage` caching for GitHub event fetching in `MonitorPage.tsx` to prevent temporary IP bans.
  - **Terminal Aesthetics (Batch 7):** Standardized 16px padding for all embedded terminals (Main Terminal, Docker Modal, SSH Session) for improved readability.
- **Verification Evidence:**
  - Verified real-time CPU spikes during heavy workloads.
  - Support bundle confirms real RSS/Uptime metrics.
  - GitHub dashboard remains functional after multiple refreshes (cached).
  - Terminal text no longer touches the container edges.

---

## 12) Continuous Incident Log (Batch 2)

#### 2026-04-30 — Terminal Input "Staircase" and "No Echo"

- **Area:** IPC / Terminal / PTY
- **Symptom:** User typed but saw nothing (no echo), or output was shifted horizontally (missing CRLF).
- **Root cause:** Use of standard pipes instead of a real PTY. Shells (bash/sh) disable interactive features when not connected to a TTY.
- **Impact:** Embedded terminal was functionally unusable for interactive sessions.
- **Fix implemented:** Migrated backend to `portable-pty` and enabled `convertEol: true` in xterm.js.
- **Preventive action:** Never use raw pipes for interactive shells in the future. Always use a PTY crate.
- **Status:** resolved

#### 2026-04-30 — Rust Memory Corruption (segfault) in Terminal

- **Area:** Backend / Rust / Threads
- **Symptom:** App crashed with `free(): corrupted unsorted chunks` when opening a terminal.
- **Root cause:** Race condition between the PTY reader thread and the IPC handler thread accessing the same PTY Master without safe synchronization (Arc/Mutex).
- **Impact:** Immediate app crash.
- **Fix implemented:** Wrapped `MasterPty` and `Child` in `Arc<StdMutex<...>>` in the `TerminalSession` struct.
- **Preventive action:** Any native resource shared between threads in Rust must use `Arc<Mutex>` or equivalent sync primitives.
- **Status:** resolved

#### 2026-04-30 — Duplicate characters ("llss") in Terminal

- **Area:** Terminal / IO
- **Symptom:** Typing one character resulted in two being displayed.
- **Root cause:** Over-engineering the shell startup with `script` command to fake a TTY. `script` echos input back to stdout while the shell also echos, leading to double characters.
- **Impact:** Visual corruption and confusing interaction.
- **Fix implemented:** Removed `script` hack after implementing real PTY backend.
- **Status:** resolved

#### 2026-04-30 — UI Card Overflow in Docker Dashboard

- **Area:** CSS / Responsive UI
- **Symptom:** Container cards were too small for their content, causing text overlap and layout breaking.
- **Root cause:** `grid-template-columns` used a `minmax(300px, 1fr)` which was too narrow for the container metadata.
- **Impact:** Poor readability and broken "Premium" aesthetic.
- **Fix implemented:** Updated to `minmax(340px, 1fr)` in `DockerPage.tsx`.
- **Status:** resolved

#### 2026-04-30 — GitHub API Rate Limiting in Monitor

- **Area:** Frontend / External API
- **Symptom:** Monitor dashboard failed to show GitHub news after several app restarts.
- **Root cause:** Excessive polling of the public GitHub API without authentication or caching.
- **Impact:** User-facing news section broke with 403 Forbidden errors.
- **Fix implemented:** Added 5-minute client-side caching in `localStorage`.
- **Preventive action:** All external API integrations must implement TTL-based caching by default.
- **Status:** resolved

#### 2026-04-30 — Inaccurate CPU usage in Dashboard

- **Area:** Backend / Metrics
- **Symptom:** CPU usage showed 0% or static "Load Average" which didn't reflect real-time spikes.
- **Root cause:** Relying on `loadavg` (which is a 1/5/15 minute average) instead of calculating the delta of CPU ticks.
- **Impact:** Misleading system health reports.
- **Fix implemented:** Implemented tick-delta calculation using `/proc/stat`.
- **Status:** resolved

### Tauri migration kickoff (pre-release freeze)

- Decision:
  - before first public release, migrate runtime shell from Electron to Tauri
  - prioritize lower RAM footprint and faster startup while preserving all current product surfaces
- Freeze rule (active):
  - no new feature expansion during migration
  - only migration, parity fixes, tests, CI, packaging, and docs evidence updates
- Baseline reference (source of truth to preserve behavior):
  - `apps/desktop/src/main/index.ts`
  - `apps/desktop/src/preload/index.ts`
  - `packages/shared/src/ipc.ts`
- Initial implementation completed:
  - added `src-tauri` shell scaffold (Rust entrypoint + Tauri config + capabilities)
  - added renderer `desktopApiBridge` to keep `window.dh` API stable under Tauri runtime
  - added command dispatcher (`ipc_invoke` / `ipc_send`) with deterministic error fallback for not-yet-ported channels
- Migration evidence rule:
  - each channel/slice moved from `TAURI_NOT_IMPLEMENTED` to active implementation must include test or smoke evidence and playbook update in the same batch
- Evidence snapshot (this batch):
  - `pnpm smoke` passed after adding Tauri bridge + renderer transport wiring
  - `vite build --config apps/desktop/vite.renderer.config.ts` passed and produced `apps/desktop/out/renderer`
  - `apps/desktop/scripts/tauri-ipc-bridge.mjs dh:runtime:status` executed successfully and returned structured runtime payload
- Environment blocker captured:
  - local `cargo check` for `src-tauri` failed on missing system packages:
    - `webkit2gtk-4.1`
    - `javascriptcoregtk-4.1`
    - `libsoup-3.0`
  - mitigation applied:
    - CI workflow updated to install required Tauri Linux dependencies before Tauri build job

### renderer parity pass (2026-04-29)

- Renderer parity audit completed across all 8 target pages:
  - `DockerPage`, `TerminalPage`, `MaintenancePage`, `MonitorPage`, `RegistryPage`, `RuntimesPage`, `SshPage`, `GitConfigPage`
  - all 63 `window.dh.*` call sites verified against bridge coverage — no missing methods
- Two bugs found and fixed:
  1. `ensureDesktopApi()` guard used `isTauriRuntime` (function ref, not a call) — guard never fired in non-Tauri context; fixed to `isTauriRuntime()`
  2. `DashboardLayoutFile` used in `vite-env.d.ts` type declarations without import from `@linux-dev-home/shared` — import added
- UX regression audit: polish batches 1–5 verified intact
  - `.hp-btn`, `.hp-btn-primary`, `.hp-btn-danger`, `.hp-input`, `.hp-status-alert`, `.hp-card-header` all present in global.css
  - focus-visible rings, hover/active transitions, overflow handling confirmed intact
- CI workflow hardened:
  - added `dtolnay/rust-toolchain@stable` to `native-linux-build` job (was missing; build would have failed)
  - added `Swatinem/rust-cache@v2` to avoid redundant Rust recompiles in CI
  - added `stabilization/*` and `agent-*` branch patterns to CI push trigger
- Verification evidence:
  - `pnpm typecheck` passed (workspace-wide)
  - `pnpm smoke` passed

#### 2026-05-01 — Flatpak `bwrap` launch failure on Arch Linux

- **Area:** Packaging / Flatpak / Arch Linux
- **Symptom:** App fails to start with `bwrap: Can't make symlink at /var/run`.
- **Root cause:** Conflicting filesystem overrides in the Flatpak manifest/user-settings when `/var/run` is a host symlink to `/run`.
- **Impact:** App unusable on Arch Linux under default Docker-access instructions.
- **Fix implemented:** Documented in README; plan created for Phase 13 (Environment Hardening) to use multi-distro smoke CI.
- **Preventive action:** Add Arch Linux container smoke-test to the CI pipeline; Playbook rule 7.4.
- **Status:** monitoring (workaround documented)

#### 2026-05-01 — Wizard/Dashboard ID mismatch (active_profile)

- **Area:** State / UI / Shared Schema
- **Symptom:** Selecting a profile in the wizard didn't highlight the same profile on the dashboard.
- **Root cause:** Wizard used legacy strings (`desktop-qt`, `minimal`) while Schema/Dashboard used canonical enum values (`desktop-gui`, `empty`).
- **Impact:** Broken "Active" badge feedback loop; user confusion.
- **Fix implemented:** Unified IDs in `WizardFlow.tsx` and added `parseStoredActiveProfile` helper to `shared/schemas.ts` to map legacy values.
- **Preventive action:** Use Shared Enums for all cross-component state keys; add parse helpers with legacy mapping early.
- **Status:** resolved

#### 2026-05-01 — lib.rs Monolith bloat

- **Area:** Architecture / Rust
- **Symptom:** `lib.rs` exceeded 4000 lines, making it hard to navigate and review.
- **Root cause:** Appending all new IPC handlers to the same file during rapid prototyping.
- **Impact:** High maintainability risk and slow review cycles.
- **Fix implemented:** Extracted `runtime_jobs.rs` and `runtime_verify.rs` modules; added `No lib.rs Bloat` rule to `CONTRIBUTING.md`.
- **Preventive action:** Playbook rule 2.5: Extract logic exceeding 50 lines to dedicated modules immediately.
- **Status:** resolved

#### 2026-05-02 — Clippy "Technical Debt" Overload

- **Area:** Static Analysis / Maintenance
- **Symptom:** Enforcing `clippy -D warnings` revealed 30+ non-compliant patterns in `lib.rs` and `compose_profiles.rs`.
- **Root cause:** Rapid prototyping without active linting during Phases 1-12.
- **Impact:** Failed CI build; delayed stabilization pass.
- **Fix implemented:** Applied `cargo clippy --fix` followed by manual remediation of `manual_clamp`, `manual_split_once`, and `if_same_then_else` patterns.
- **Preventive action:** Run `npx pnpm smoke` (which includes clippy) locally before every major commit.
- **Status:** resolved

#### 2026-05-02 — Flatpak `bwrap` symlink conflict (Arch Linux)

- **Area:** Packaging / Sandbox
- **Symptom:** App failed on Arch because `/var/run` is a symlink, and bwrap cannot mount over symlinks.
- **Root cause:** Legacy `/var/run/docker.sock` mount in the manifest.
- **Impact:** App crash on start for Arch users.
- **Fix implemented:** Changed mount point to `/run/docker.sock` and verified with a dedicated Arch Linux CI job.
- **Status:** resolved
