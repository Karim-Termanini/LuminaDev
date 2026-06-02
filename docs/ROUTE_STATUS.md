# Route Status Matrix (Tauri)

This file is the operator-facing truth table for UI behavior while hardening continues.
Use it during manual verification to avoid treating placeholder behavior as regressions.

Status legend:
- `live` = real backend behavior expected
- `partial` = core behavior works, but one or more flows are simplified/limited
- `stub` = placeholder/demo/static behavior, not production-complete
- `redirect` = legacy route, automatically redirected to a primary route
- `removed` = route intentionally removed; redirect may still exist for bookmarks

| Route | Status | Notes |
| --- | --- | --- |
| `/dashboard` | partial | Custom profiles only; empty state until user creates one in Profiles. Slim container count + metrics strip. |
| `/dashboard/kernels` | partial | GPU probe, service states, security audit; auto-refreshes every ~30s (lightweight snapshot, not a full device manager). |
| `/dashboard/logs` | partial | Jobs poll ~2s; compose logs load for selected profile; not a full observability platform. |
| `/dashboard/monitor` | live | Host metrics dashboard — live CPU/RAM/storage/network, security posture, ports, Docker, processes, Git config score. |
| `/dashboard/widgets` | removed | **Deleted** 2026-05-29 — widget system out of scope; no route or redirect. |
| `/system` | redirect | → `/dashboard/monitor` (bookmark compat). |
| `/docker` | live | Main Docker slice (list/actions/logs/images/volumes/networks/cleanup/remap) is functional with guardrails. |
| `/ssh` | partial | Core SSH key/test/setup flows work; advanced transfer/remote UX still evolving. |
| `/git` | live | **Git Assistant** — Setup → Project → Save → Share; partial snapshot commit (checkbox exclude); push while dirty tree OK; in-app **Create PR** + existing-PR probe; post-push points to Create PR (not browser-only). Legacy tabbed UI removed. Auth: **Settings → Connected accounts**. |
| `/git-config` | redirect | → `/git` |
| `/git-vcs` | redirect | → `/git` |
| `/cloud-git` | redirect | → `/git` |
| `/registry` | redirect | → `/git` |
| `/profiles` | partial | Custom-named environments only (user picks base template + name). CRUD + duplicate + export/import; Set Active / switch syncs dashboard. On launch: optional composeUp for active profile. |
| `/terminal` | partial | xterm + host PTY (`portable_pty`); not a browser sandbox. Multiplexer behind beta flag. Vim/full-screen apps may still differ from a native terminal emulator. |
| `/runtimes` | partial | Seven runtimes (Node, Python, Java, Go, Rust, PHP, .NET); status/version/deps/uninstall preview live; install/update/remove backend hardened for Ubuntu/Fedora/Arch. |
| `/maintenance` | partial | Guardian + diagnostics + host probes. **Tasks**: user checklist on Overview + full editor on Schedule. **Git backups** on **Git Config → Backups**. No arbitrary host shell or full remediation. |
| `/settings` | partial | Dev Home layout: personalization, SSH overview, **Connected accounts** (GitHub/GitLab auth), **System** tab (`/etc/hosts` read/edit via pkexec + diff-before-apply, process env diagnostics, `~/.profile` export editor), general, update, notifications, shortcuts, help, datetime, languages, app engine, builder, beta flags. **Extension tab removed** — not in scope. |

## Update Rule

When a route behavior changes from placeholder to real backend flow (or vice versa), update this table in the same PR.
