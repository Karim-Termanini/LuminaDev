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
| `/git-vcs` | partial | **Local repo:** `dh:git:vcs:*` status, stage/unstage, diff (text + binary detection), commit, **fetch** (remote dropdown from remote-tracking refs, default `origin`, `--prune`) + pull/push (HTTPS via Cloud Git tokens + `GIT_ASKPASS`), branch list (locals + **remotes** via `for-each-ref`), checkout/create, **dirty-checkout modal** + **`dh:git:vcs:stash`** for stash-and-switch. **Provider rail:** GitHub vs GitLab columns (`dh:cloud:auth:status` + `dh:git:vcs:remotes` URLs) with the same scoped host accent token family used on `/cloud-git`. No merge/rebase UI; stash pop is terminal-only. |
| `/registry` | partial | Search/tags/path actions work; broader registry/repo workflows remain minimal. |
| `/profiles` | partial | CRUD + duplicate + export/import; **Set Active** writes `active_profile` as `baseTemplate` (`ComposeProfile`). **On launch**: optional `composeUp` for active profile + dashboard `layoutGet`/`layoutSet` refresh (store `on_login_automation`, runner after wizard). Deeper preset/dashboard unification still evolving. |
| `/terminal` | partial | Embedded terminal works; host/sandbox differences still affect behavior. |
| `/runtimes` | partial | Status/version/deps/uninstall preview are live; install/update/remove backend is in active hardening. |
| `/maintenance` | partial | Guardian + diagnostics + host probes as above. **Tasks**: user checklist on Overview + full editor on Schedule (inline rename). **Git backups** live on **Git Config → Backups**. No arbitrary host shell or full remediation. |
| `/settings` | partial | **Nav:** Personalization / SSH & remote / System / **Connected accounts** (rail + detail card). **Accent:** presets + custom color; `appearance` store; `applyAppearanceAccent` / `syncAppearanceFromStore` (incl. wizard complete). **SSH:** read-only bookmark table + “Manage on SSH page” (`ssh_bookmarks`). **Hosts / env:** as before. **Accounts:** summary of linked GitHub/GitLab (`dh:cloud:auth:status`) + link to `/cloud-git`. **Not yet:** hosts file editing, profile-scoped env files + diff-before-apply. |
| `/cloud-git` | partial | **Auth:** device flow + PAT for GitHub and GitLab via `dh:cloud:auth:*`; encrypted credential file. **UI:** provider **tabs** + scoped accent (GitHub blue / GitLab orange), **two-column layout** (Account & security + **Activity** placeholders with browser shortcuts), and **identity hero** per tab. Optional OAuth **client IDs** for device flow: **Advanced** (`store.json` `cloud_oauth_clients`) or `LUMINA_*_OAUTH_CLIENT_ID` at launch / compile. In-app PR/CI feeds and repo widgets are **not** implemented yet (Phase 12 follow-on). |

## Update Rule

When a route behavior changes from placeholder to real backend flow (or vice versa), update this table in the same PR.
