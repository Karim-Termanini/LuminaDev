## Summary

- Hardened Docker IPC and renderer handling with deterministic `{ ok, error }` contracts, plus strict contract assertions and expanded error mapping tests.
- Extended shared schema validation coverage for non-Docker sensitive surfaces (`ssh`, `git config`, `runtime` requests) and aligned main handlers with shared runtime request schemas.
- Added stabilization governance artifacts and process controls: stabilization checklist, app creation playbook, privilege boundary matrix, commit quality rules, docs audit record, and PR template.

## Why

The goal is to close the “hype vs substance” gap by prioritizing reliability, safety boundaries, test evidence, and truthful documentation before any further feature expansion.

## Key Changes

### Code hardening
- Unified Docker IPC responses in main process to stable success/failure shapes.
- Extracted Docker error normalization into dedicated module with unit tests.
- Updated Docker renderer flows to fail fast on invalid/malformed response payloads.
- Added runtime request schemas in shared package and reused them in main IPC parsing.

### Test coverage
- Expanded shared schema tests to include:
  - `SshGenerateSchema`
  - `GitConfigSetSchema`
  - `RuntimeGetVersionsRequestSchema`
  - `RuntimeCheckDepsRequestSchema`
  - `RuntimeUninstallPreviewRequestSchema`
- Expanded renderer error-humanization tests for additional Docker error codes.
- Added strict contract tests for Docker operation response assertions.

### Documentation and governance
- Added:
  - `docs/STABILIZATION_CHECKLIST.md`
  - `docs/APP_CREATION_PLAYBOOK.md`
  - `docs/PRIVILEGE_BOUNDARY_MATRIX.md`
  - `docs/COMMIT_QUALITY_RULES.md`
  - `docs/DOCS_AUDIT_2026-04.md`
  - `.github/pull_request_template.md`
- Updated README links and quality gate wording.
- Clarified walkthrough wording to avoid implicit release sign-off.
- Improved smoke script log message clarity.

## Test Plan

- [x] `bash scripts/smoke-ci.sh`
- [x] Workspace typecheck passes
- [x] Shared tests pass
- [x] Desktop tests pass
- [x] Lint passes

## Scope / Risk

- Scope is stabilization-only (contracts, tests, docs, governance), with no new phase-expansion feature work.
- Primary risk is behavioral tightening around error handling paths; mitigated by added tests and smoke gate.
