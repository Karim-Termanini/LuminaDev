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
  - Native Linux build (includes `node-pty` rebuild)
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
