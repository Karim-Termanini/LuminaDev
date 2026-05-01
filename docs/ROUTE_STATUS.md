# Route Status Matrix (Tauri)

This file is the operator-facing truth table for UI behavior while hardening continues.
Use it during manual verification to avoid treating placeholder behavior as regressions.

Status legend:
- `live` = real backend behavior expected
- `partial` = core behavior works, but one or more flows are simplified/limited
- `stub` = placeholder/demo/static behavior, not production-complete

| Route | Status | Notes |
| --- | --- | --- |
| `/dashboard` | partial | Main cards and Docker/metrics panes work; several profile cards are explicitly `PLANNED`/disabled. |
| `/dashboard/widgets` | stub | Widget tips/placeholder page; not a full widget management surface yet. |
| `/dashboard/kernels` | partial | Live host probes (GPU/services/security) but still a lightweight snapshot page. |
| `/dashboard/logs` | partial | Reads job/compose log snippets; not a full observability/log platform. |
| `/system` | partial | Metrics and monitor data are live; some sections still bounded snapshots. |
| `/docker` | live | Main Docker slice (list/actions/logs/images/volumes/networks/cleanup/remap) is functional with guardrails. |
| `/ssh` | partial | Core SSH key/test/setup flows work; advanced transfer/remote UX still evolving. |
| `/git-config` | live | Global git config list/set/validate flow is operational. |
| `/registry` | partial | Search/tags/path actions work; broader registry/repo workflows remain minimal. |
| `/profiles` | stub | Profile productization flow is present but still mostly scaffolding/import-first UX. |
| `/terminal` | partial | Embedded terminal works; host/sandbox differences still affect behavior. |
| `/runtimes` | partial | Status/version/deps/uninstall preview are live; install/update/remove backend is in active hardening. |
| `/maintenance` | partial | Guardian scoring and diagnostics IPC are real; Integrity includes dismissible/auto-clearing status and **in-app** host probes (Docker df/ps, journalctl, cache `du`) via whitelisted `hostExec`—no clipboard-to-terminal runbook. Compose health, cleanup, bundles, tasks, and job runner work; no arbitrary host shell or full remediation. |

## Update Rule

When a route behavior changes from placeholder to real backend flow (or vice versa), update this table in the same PR.
