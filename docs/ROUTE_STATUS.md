# Route Status Matrix (Tauri)

This file is the operator-facing truth table for UI behavior while hardening continues.
Use it during manual verification to avoid treating placeholder behavior as regressions.

Status legend:
- `live` = real backend behavior expected
- `partial` = core behavior works, but one or more flows are simplified/limited
- `stub` = placeholder/demo/static behavior, not production-complete

| Route | Status | Notes |
| --- | --- | --- |
| `/dashboard` | partial | 9 preset environment cards; active profile highlighted; slim container count + metrics strip with links to Docker and Monitor. Sub-pages (widgets/kernels/logs) are static stubs. |
| `/dashboard/widgets` | stub | Static placeholder; no real widget management. |
| `/dashboard/kernels` | partial | GPU probe, service states, security audit; auto-refreshes every 30 seconds. |
| `/dashboard/logs` | partial | Jobs poll every 2 seconds; compose logs auto-load on profile change. |
| `/system` | partial | Metrics and monitor data are live; some sections still bounded snapshots. |
| `/docker` | live | Main Docker slice (list/actions/logs/images/volumes/networks/cleanup/remap) is functional with guardrails. |
| `/ssh` | partial | Core SSH key/test/setup flows work; advanced transfer/remote UX still evolving. |
| `/git-config` | partial | Identity/behavior/security/inspector sections work via IPC; Git Doctor and backup/restore not yet implemented. |
| `/registry` | partial | Search/tags/path actions work; broader registry/repo workflows remain minimal. |
| `/profiles` | partial | CRUD + duplicate + export/import work; **Set Active** writes `active_profile` as the entry's `baseTemplate` (`ComposeProfile`). On-login actions and deeper preset/dashboard unification (e.g. auto compose from active) still evolving. |
| `/terminal` | partial | Embedded terminal works; host/sandbox differences still affect behavior. |
| `/runtimes` | partial | Status/version/deps/uninstall preview are live; install/update/remove backend is in active hardening. |
| `/maintenance` | partial | Guardian scoring and diagnostics IPC are real; Integrity includes dismissible/auto-clearing status and **in-app** host probes (Docker df/ps, journalctl, cache `du`) via whitelisted `hostExec`—no clipboard-to-terminal runbook. Compose health, cleanup, bundles, tasks, and job runner work; no arbitrary host shell or full remediation. |

## Update Rule

When a route behavior changes from placeholder to real backend flow (or vice versa), update this table in the same PR.
