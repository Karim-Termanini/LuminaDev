# Route Status Matrix (Tauri)

This file is the operator-facing truth table for UI behavior while hardening continues.
Use it during manual verification to avoid treating placeholder behavior as regressions.

Status legend:
- `live` = real backend behavior expected
- `partial` = core behavior works, but one or more flows are simplified/limited
- `stub` = placeholder/demo/static behavior, not production-complete

| Route | Status | Notes |
| --- | --- | --- |
| `/dashboard` | partial | Preset grid reads `active_profile` for highlight; slim container count + metrics strip with links to Docker and Monitor; several preset cards are `PLANNED`/disabled. |
| `/dashboard/widgets` | stub | Static placeholder; not a full widget management surface yet. |
| `/dashboard/kernels` | partial | GPU probe, service states, security audit; auto-refreshes every ~30s (lightweight snapshot, not a full device manager). |
| `/dashboard/logs` | partial | Jobs poll ~2s; compose logs load for selected profile; not a full observability platform. |
| `/system` | partial | Metrics and monitor data are live; some sections still bounded snapshots. |
| `/docker` | live | Main Docker slice (list/actions/logs/images/volumes/networks/cleanup/remap) is functional with guardrails. |
| `/ssh` | partial | Core SSH key/test/setup flows work; advanced transfer/remote UX still evolving. |
| `/git-config` | partial | Identity/behavior/security/inspector sections work via IPC; Git Doctor and backup/restore not yet implemented. |
| `/registry` | partial | Search/tags/path actions work; broader registry/repo workflows remain minimal. |
| `/profiles` | partial | CRUD + duplicate + export/import; **Set Active** writes `active_profile` as `baseTemplate` (`ComposeProfile`). **On launch**: optional `composeUp` for active profile + dashboard `layoutGet`/`layoutSet` refresh (store `on_login_automation`, runner after wizard). Deeper preset/dashboard unification still evolving. |
| `/terminal` | partial | Embedded terminal works; host/sandbox differences still affect behavior. |
| `/runtimes` | partial | Status/version/deps/uninstall preview are live; install/update/remove backend is in active hardening. |
| `/maintenance` | partial | Guardian + diagnostics + host probes as above. **Tasks**: user checklist on Overview + full editor on Schedule (inline rename). **Git backups** live on **Git Config → Backups**. No arbitrary host shell or full remediation. |
| `/settings` | partial | **SSH bookmarks:** read-only list + link to `/ssh` (same `ssh_bookmarks` store). **Hosts / env / theme:** placeholders only (Phase 8). |

## Update Rule

When a route behavior changes from placeholder to real backend flow (or vice versa), update this table in the same PR.
