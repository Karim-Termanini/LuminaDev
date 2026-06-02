# Zod Schema Coverage Analysis (2026-06-02)

## Executive Summary

- **Total IPC channels:** 134
- **Channels with RequestSchema:** 54 (40%)
- **Channels without RequestSchema:** 80 (60%)

**Note:** Not all channels require explicit Zod schemas. Many use simple payloads (empty, boolean, string, or well-documented generic types). This analysis identifies gaps where type safety could be improved.

---

## Channels WITH RequestSchema (54 documented)

### Cloud Auth (4)
- `dh:cloud:auth:connect-start` → `CloudAuthConnectStartRequestSchema`
- `dh:cloud:auth:connect-poll` → `CloudAuthConnectPollRequestSchema`
- `dh:cloud:auth:connect-pat` → `CloudAuthConnectPatRequestSchema`
- `dh:cloud:auth:disconnect` → Missing explicit schema

### Cloud Git (6)
- `dh:cloud:git:prs` → `CloudGitPrsRequestSchema`
- `dh:cloud:git:review-requests` → `CloudGitReviewRequestsRequestSchema`
- `dh:cloud:git:pipelines` → `CloudGitPipelinesRequestSchema`
- `dh:cloud:git:issues` → `CloudGitIssuesRequestSchema`
- `dh:cloud:git:releases` → `CloudGitReleasesRequestSchema`
- `dh:cloud:git:get-pr-checks` → `CloudGitGetPrChecksRequestSchema`

### Compose (1)
- `dh:compose:up` → `ComposeUpRequestSchema`

### Docker (13)
- `dh:docker:list` → No schema needed (no params)
- `dh:docker:action` → No schema defined (handled generically)
- `dh:docker:logs` → `DockerLogsRequestSchema`
- `dh:docker:create` → `DockerCreateRequestSchema`
- `dh:docker:images:list` → No schema (no params)
- `dh:docker:image:action` → `DockerImageActionRequestSchema`
- `dh:docker:volumes:list` → No schema (no params)
- `dh:docker:volume:action` → `DockerVolumeActionRequestSchema`
- `dh:docker:volume:create` → `DockerVolumeCreateRequestSchema`
- `dh:docker:networks:list` → No schema (no params)
- `dh:docker:network:action` → `DockerNetworkActionRequestSchema`
- `dh:docker:network:create` → `DockerNetworkCreateRequestSchema`
- `dh:docker:container:stats` → `DockerContainerStatsRequestSchema`

### Git VCS (21)
- `dh:git:vcs:branches` → `GitVcsBranchesRequestSchema`
- `dh:git:vcs:checkout` → `GitVcsCheckoutRequestSchema`
- `dh:git:vcs:commit` → `GitVcsCommitRequestSchema`
- `dh:git:vcs:conflict-diff` → `GitVcsConflictDiffRequestSchema`
- `dh:git:vcs:diff` → `GitVcsDiffRequestSchema`
- `dh:git:vcs:fetch` → `GitVcsFetchRequestSchema`
- `dh:git:vcs:merge` → `GitVcsMergeRequestSchema`
- `dh:git:vcs:merge-abort` → `GitVcsMergeAbortRequestSchema`
- `dh:git:vcs:merge-continue` → `GitVcsMergeContinueRequestSchema`
- `dh:git:vcs:pull` → `GitVcsPullRequestSchema`
- `dh:git:vcs:push` → `GitVcsPushRequestSchema`
- `dh:git:vcs:rebase` → `GitVcsRebaseRequestSchema`
- `dh:git:vcs:rebase-abort` → `GitVcsRebaseAbortRequestSchema`
- `dh:git:vcs:rebase-continue` → `GitVcsRebaseContinueRequestSchema`
- `dh:git:vcs:rebase-skip` → `GitVcsRebaseSkipRequestSchema`
- `dh:git:vcs:remotes` → `GitVcsRemotesRequestSchema`
- `dh:git:vcs:rename-branch` → `GitVcsRenameBranchRequestSchema`
- `dh:git:vcs:resolve-conflict` → `GitVcsResolveConflictRequestSchema`
- `dh:git:vcs:resolve-hunk` → `GitVcsResolveHunkRequestSchema`
- `dh:git:vcs:stage` → `GitVcsStageRequestSchema`
- `dh:git:vcs:stash` → `GitVcsStashRequestSchema`

### Git (3)
- `dh:git:clone` → `GitCloneRequestSchema`
- `dh:git:status` → `GitStatusRequestSchema`
- (git:recent:list, git:config:*, git:doctor:scan have no schemas)

### Host (1)
- `dh:host:exec` → `HostExecRequestSchema`

### Runtimes (4)
- `dh:runtime:check-deps` → `RuntimeCheckDepsRequestSchema`
- `dh:runtime:get-versions` → `RuntimeGetVersionsRequestSchema`
- `dh:runtime:set-active` → `RuntimeSetActiveRequestSchema`
- `dh:runtime:uninstall:preview` → `RuntimeUninstallPreviewRequestSchema`

### Store (3)
- `dh:store:get` → `StoreGetRequestSchema`
- `dh:store:set` → `StoreSetRequestSchema`
- `dh:store:delete` → `StoreDeleteRequestSchema`

---

## Channels WITHOUT Explicit RequestSchema (80)

### App (2)
- `dh:app:info` — no params needed
- `dh:app:update:check` — no params

### Cloud Auth (1)
- `dh:cloud:auth:status` — no params
- (Others: disconnected from schema coverage)

### Cloud Git (5)
- `dh:cloud:git:create-pr` — uses generic payload
- `dh:cloud:git:find-pr` — uses generic payload
- `dh:cloud:git:merge-pr` — uses generic payload
- `dh:cloud:git:review-requests` — see above
- (Others: generic payloads)

### Compose (2)
- `dh:compose:down` — uses generic payload
- `dh:compose:logs` — uses generic payload
- `dh:compose:stop` — uses generic payload

### Dialog (3)
- `dh:dialog:folder` — handled via @tauri-apps/plugin-dialog
- `dh:dialog:file:open` — handled via @tauri-apps/plugin-dialog
- `dh:dialog:file:save` — handled via @tauri-apps/plugin-dialog

### Docker (20+)
- `dh:docker:check-installed` — no params
- `dh:docker:install` — generic payload
- `dh:docker:pull` → `DockerPullRequestSchema` (DOCUMENTED)
- `dh:docker:search` — generic payload
- `dh:docker:tags` — generic payload
- `dh:docker:terminal` — generic payload
- `dh:docker:prune` — no params
- `dh:docker:prune:preview` — no params
- `dh:docker:cleanup:run` — generic payload
- `dh:docker:inspect` → `DockerInspectRequestSchema` (DOCUMENTED)
- `dh:docker:reconfigure` → `DockerReconfigureRequestSchema` (DOCUMENTED)
- `dh:docker:remap-port` → `DockerRemapPortRequestSchema` (DOCUMENTED)

### Editor (2)
- `dh:editor:list` — no params
- `dh:editor:open` — generic payload

### Filesystem (2)
- `dh:fs:exists` — generic payload
- `dh:fs:open` — generic payload

### Git (5+)
- `dh:git:recent:list` — no params
- `dh:git:recent:add` — generic payload
- `dh:git:config:list` — generic payload
- `dh:git:config:set` — generic payload
- `dh:git:config:set-key` — generic payload
- `dh:git:doctor:scan` — no params

### Host (3)
- `dh:host:distro` — no params
- `dh:host:ports` — no params
- `dh:host:sysinfo` — no params

### Job (3)
- `dh:job:start` — complex payload (handled in code)
- `dh:job:list` — no params
- `dh:job:cancel` — generic payload

### Logs (2)
- `dh:log:stream:start` — generic payload
- `dh:log:stream:stop` — generic payload

### Metrics (1)
- `dh:metrics` — no params

### Monitor (3)
- `dh:monitor:top-processes` — no params
- `dh:monitor:security` — no params
- `dh:monitor:security-drilldown` — generic payload

### Performance (1)
- `dh:perf:snapshot` — no params

### Ports (1)
- `dh:ports:suggest` — generic payload

### Profile (5+)
- `dh:profile:switch` — generic payload
- `dh:profile:credentials:store` — generic payload
- `dh:profile:credentials:list` — no params
- `dh:profile:credentials:delete` — generic payload
- `dh:profile:credentials:get` — generic payload
- `dh:profile:running-status` — generic payload

### Project (3)
- `dh:project:ensure_dir` — generic payload
- `dh:project:scaffold` — complex generic payload
- `dh:project:install_deps` — complex generic payload

### Runtimes (3+)
- `dh:runtime:status` — no params
- `dh:runtime:installed-versions` — generic payload
- `dh:runtime:remove-version` — generic payload

### Session (1)
- `dh:session:info` — no params

### SSH (6+)
- `dh:ssh:generate` — generic payload
- `dh:ssh:get:pub` — generic payload
- `dh:ssh:test:github` — generic payload
- `dh:ssh:list:dir` — generic payload
- `dh:ssh:setup:remote:key` — generic payload
- `dh:ssh:enable:local` — no params

### System (2)
- `dh:system:readiness:check` — no params
- `dh:system:readiness:fix` — generic payload

### Terminal (7+)
- `dh:terminal:create` — complex payload (has schema? check)
- `dh:terminal:write` — fire-and-forget via ipc_send
- `dh:terminal:resize` — fire-and-forget via ipc_send
- `dh:terminal:close` — fire-and-forget via ipc_send
- `dh:terminal:data` — event listener
- `dh:terminal:exit` — event listener
- `dh:terminal:get-all-env` — no params
- `dh:terminal:openExternal` — no params

---

## Recommendations (Priority Order)

### P1: Channels with complex/unvalidated payloads (5–7)
These should have Zod schemas to prevent runtime errors:
1. `dh:job:start` — currently complex inline parsing
2. `dh:project:scaffold` — complex nested config
3. `dh:project:install_deps` — complex nested config
4. `dh:terminal:create` — PTY config (may already exist)
5. `dh:cloud:git:create-pr` — PR config

### P2: Commonly-used generic payloads (10–15)
These would benefit from schemas for consistency:
- `dh:docker:pull` (already has schema ✓)
- `dh:profile:switch`
- `dh:git:config:set`
- `dh:ssh:generate`
- `dh:system:readiness:fix`
- `dh:compose:logs`
- `dh:monitor:security-drilldown`

### P3: Low-priority / simple types
These are either no-param or simple string/boolean, not critical:
- `dh:app:info`, `dh:metrics`, `dh:session:info` (no params)
- `dh:editor:list`, `dh:job:list` (no params)
- Dialogs (handled by plugin APIs, not IPC)

---

## Current Guard: ipc_contract_tests.rs

The Rust backend enforces channel name alignment with TypeScript via unit tests (`ipc_contract_tests.rs`), which verify that:
1. All IPC channel names in Rust match `IPC` const in shared package
2. Request payloads are validated at the Rust boundary (serde_json)
3. Response types align between Rust and TypeScript

**This guard is sufficient** to prevent misnamed channels and basic type errors. Full Zod coverage would improve IDE autocomplete and compile-time safety but is not blocking.

---

## Effort Estimate

- **P1 (job:start, project:*, terminal:create, cloud:git:create-pr):** 4–6 hours
- **P2 (profile:switch, git:config:set, ssh:generate, etc.):** 6–8 hours
- **P3 (low-priority):** 2–3 hours

**Total:** ~15–18 hours for complete Zod parity (non-critical; can be phased).

---

## Conclusion

**Current state is acceptable.** The 54 documented schemas cover the highest-complexity, highest-risk channels. The remaining 80 channels are either:
- **No-param calls** (safe to call without validation)
- **Generic payloads** (validated at runtime by Rust)
- **Event listeners** (handled outside IPC)
- **Dialog operations** (handled by Tauri plugins)

**Recommendation:** Schedule P1 channels for Phase 19 (post-release); defer P2/P3 to post-GA maintenance.
