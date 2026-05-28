# Spec: Runtimes Page Performance — Status/Versions Split

**Date:** 2026-05-28
**Status:** Approved

---

## Problem

`dh:runtime:status` calls `handle_runtime_status()` which, for every installed runtime, runs additional subprocess chains to discover `allVersions` (nvm directory scans, pyenv version lists, flutter SDK path walks, etc.). This runs on every page mount. With 17 runtimes and login-shell (`bash -lc`) overhead, this causes >1 minute load times.

`allVersions` is only needed when the user opens the install wizard for a specific runtime. It is never needed for the sidebar list view.

---

## Design

### Rust — `runtime_jobs.rs`

**Modify `handle_runtime_status()`:**
- Remove all `allVersions` detection blocks (nvm, pyenv, juliaup, flutter SDK walks, etc.) from the status handler.
- Return only: `id`, `name`, `installed`, `version`, `path`.
- Expected time reduction: from >60s to ~3–6s (17 parallel login-shell `--version` checks only).

**New handler `handle_runtime_installed_versions(body: &Value) -> Value`:**
- Input: `{ "runtimeId": "node" }`
- Runs the allVersions detection logic for exactly one runtime (extracted from the existing handler).
- Returns `{ "ok": true, "versions": [{ "version": "v20.0.0", "path": "/home/user/.nvm/..." }] }`

**New IPC channel in `lib.rs` dispatcher:**
```rust
"dh:runtime:installed-versions" => runtime_jobs::handle_runtime_installed_versions(&payload).await,
```

### Shared — `ipc.ts`

Add `IPC.RUNTIME_INSTALLED_VERSIONS = 'dh:runtime:installed-versions'`.

`RuntimeStatus.allVersions` field: keep as optional (`allVersions?: Array<...>`) — it will now always be absent from status responses but can still be set manually in component state for the selected runtime.

### Frontend — `RuntimesPage.tsx`

**On mount:** call `dh:runtime:status` (now fast). Render sidebar list immediately.

**Status cache (localStorage, 30s TTL):**
- Key: `dh:runtimes:status-cache:v1`
- On mount: if cache entry exists and is <30s old, render it instantly and trigger background refresh.
- On refresh complete: update cache.
- This makes re-navigating to the page feel instant.

**On runtime select (wizard open):**
- If `allVersions` not yet loaded for this runtimeId: call `dh:runtime:installed-versions { runtimeId }`.
- Show spinner in wizard version section while loading.
- Cache result in component state: `Map<runtimeId, versions>`. Persists across wizard open/close within the same page session.

### Shared — `desktopApiBridge.ts`

Add bridge method:
```ts
runtimeInstalledVersions: (runtimeId: string) => invoke<...>(IPC.RUNTIME_INSTALLED_VERSIONS, { runtimeId })
```

---

## Data Flow

```
Mount
  ├─ Check localStorage status cache
  │    ├─ Hit (<30s): render immediately → background fetch → update cache
  │    └─ Miss: fetch → render → write cache
  └─ dh:runtime:status → 17 parallel bash probes (version only) → ~4s

User selects runtime
  └─ allVersions loaded? → No → dh:runtime:installed-versions → ~500ms → cache in state
```

---

## Error Handling

- If `dh:runtime:installed-versions` fails: show "Could not load installed versions" in wizard. Allow install with `latest` fallback.
- If status cache is corrupt: silently ignore, fetch fresh.

---

## Testing

- Unit test: `handle_runtime_installed_versions` with mock body for `node` returns array or empty.
- Frontend: existing `runtimeContract.test.ts` — add contract shape test for new response.
- Manual: navigate to Runtimes page, verify list renders in <10s. Open Node wizard, verify versions appear within 2s.

---

## Files Changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/src/runtime_jobs.rs` | Strip allVersions from `handle_runtime_status`; add `handle_runtime_installed_versions` |
| `apps/desktop/src-tauri/src/lib.rs` | Add `dh:runtime:installed-versions` dispatcher arm |
| `packages/shared/src/ipc.ts` | Add `IPC.RUNTIME_INSTALLED_VERSIONS` |
| `apps/desktop/src/renderer/src/api/desktopApiBridge.ts` | Add `runtimeInstalledVersions` bridge method |
| `apps/desktop/src/renderer/src/pages/RuntimesPage.tsx` | Status cache + lazy installed-versions fetch on wizard open |
