# Runtimes Page Performance — Status/Versions Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Runtimes page load from >60s to <10s by stripping allVersions detection from the status probe and fetching it lazily per-runtime on wizard open.

**Architecture:** `handle_runtime_status` removes all allVersions subprocess chains and returns only `installed/version/path`. A new `dh:runtime:installed-versions` channel fetches the full path list for exactly one runtime. The frontend caches status in localStorage (30s TTL) and lazy-fetches installed versions when the wizard opens.

**Tech Stack:** Rust/Tokio (runtime_jobs.rs), TypeScript/React (RuntimesPage.tsx), `@tauri-apps/api/core` invoke, localStorage cache.

---

### Task 1: Strip allVersions from `handle_runtime_status` in Rust

**Files:**
- Modify: `apps/desktop/src-tauri/src/runtime_jobs.rs` (lines ~1340–1575)

The `else { ... }` branch inside each spawned task currently runs a `match id.as_str()` block that scans for allVersions. This entire block must be removed. The task should return only `id`, `name`, `installed`, `version`, and `path` (detected from the primary version check command).

- [ ] **Step 1: Locate the allVersions match block**

Open `apps/desktop/src-tauri/src/runtime_jobs.rs`. Find `handle_runtime_status`. Inside the `else { ... }` branch (installed = true), there is:
```rust
let mut detected_path: Option<String> = None;
let mut all_versions: Vec<Value> = Vec::new();
match id.as_str() {
    "node" => { ... }
    "python" => { ... }
    // ... 8 more arms
    _ => {}
}
json!({
    "id": id, "name": name, "installed": true,
    "version": version, "path": detected_path,
    "allVersions": all_versions
})
```

- [ ] **Step 2: Replace the installed branch with a fast return**

Replace the entire `let mut detected_path ... allVersions: all_versions` block with:
```rust
json!({ "id": id, "name": name, "installed": true, "version": version })
```

The `detected_path` variable and all per-runtime path-detection exec calls are removed. The `all_versions` variable is removed. Keep only the primary version detection (the `bash -lc` check at the start of each spawned task) and the `version = lumina_probe_meaningful_line(...)` line.

- [ ] **Step 3: Verify Rust compiles**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1
```

Expected: no errors. If you see "unused variable" warnings for `all_versions` or `detected_path` that's the strip working — those are gone now.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/runtime_jobs.rs
git commit -m "perf(runtimes): strip allVersions detection from handle_runtime_status"
```

---

### Task 2: Add `handle_runtime_installed_versions` to Rust

**Files:**
- Modify: `apps/desktop/src-tauri/src/runtime_jobs.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

This new function takes `runtimeId` and runs the per-runtime path/version scanning for exactly that one runtime, returning `Vec<{version, path}>`.

- [ ] **Step 1: Add the new public function**

In `apps/desktop/src-tauri/src/runtime_jobs.rs`, add after `handle_runtime_status`:

```rust
pub(crate) async fn handle_runtime_installed_versions(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    if runtime_id.is_empty() {
        return json!({ "ok": false, "error": "[RUNTIME_INSTALLED_VERSIONS_INVALID] Missing runtimeId." });
    }

    let mut versions: Vec<Value> = Vec::new();

    match runtime_id {
        "node" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", "if [ -d \"$HOME/.nvm/versions/node\" ]; then for d in \"$HOME/.nvm/versions/node\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); printf '%s\\t%s\\n' \"$b\" \"$d/bin/node\"; done; fi"],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines() {
                    let mut parts = line.splitn(2, '\t');
                    let v = parts.next().unwrap_or("").trim();
                    let p = parts.next().unwrap_or("").trim();
                    if !v.is_empty() && !p.is_empty() {
                        versions.push(json!({ "version": v, "path": p }));
                    }
                }
            }
        }
        "python" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", "if [ -d \"$HOME/.pyenv/versions\" ]; then for d in \"$HOME/.pyenv/versions\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); printf '%s\\t%s\\n' \"$b\" \"$d/bin/python\"; done; fi"],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines() {
                    let mut parts = line.splitn(2, '\t');
                    let v = parts.next().unwrap_or("").trim();
                    let p = parts.next().unwrap_or("").trim();
                    if !v.is_empty() && !p.is_empty() {
                        versions.push(json!({ "version": v, "path": p }));
                    }
                }
            }
        }
        "java" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", "if [ -d \"$HOME/.local/share/lumina/java\" ]; then for d in \"$HOME/.local/share/lumina/java\"/jdk-*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\" | sed 's/^jdk-//'); printf '%s\\t%s\\n' \"$b\" \"$d/bin/java\"; done; fi"],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines() {
                    let mut parts = line.splitn(2, '\t');
                    let v = parts.next().unwrap_or("").trim();
                    let p = parts.next().unwrap_or("").trim();
                    if !v.is_empty() && !p.is_empty() {
                        versions.push(json!({ "version": v, "path": p }));
                    }
                }
            }
        }
        "go" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", "if [ -d \"$HOME/.local/share/lumina/go\" ]; then for d in \"$HOME/.local/share/lumina/go\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue; [ -x \"$d/bin/go\" ] || continue; ver=$(\"$d/bin/go\" version 2>/dev/null | awk '{print $3}' | sed 's/^go//'); printf '%s\\t%s\\n' \"$ver\" \"$d/bin/go\"; done; fi"],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines() {
                    let mut parts = line.splitn(2, '\t');
                    let v = parts.next().unwrap_or("").trim().trim_start_matches("go");
                    let p = parts.next().unwrap_or("").trim();
                    if !v.is_empty() && !p.is_empty() {
                        versions.push(json!({ "version": v, "path": p }));
                    }
                }
            }
        }
        "zig" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", "if [ -d \"$HOME/.local/share/lumina/zig\" ]; then for d in \"$HOME/.local/share/lumina/zig\"/*; do [ -d \"$d\" ] || continue; b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue; [ -x \"$d/zig\" ] || continue; ver=$(\"$d/zig\" version 2>/dev/null); printf '%s\\t%s\\n' \"$ver\" \"$d/zig\"; done; fi"],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines() {
                    let mut parts = line.splitn(2, '\t');
                    let v = parts.next().unwrap_or("").trim();
                    let p = parts.next().unwrap_or("").trim();
                    if !v.is_empty() && !p.is_empty() {
                        versions.push(json!({ "version": v, "path": p }));
                    }
                }
            }
        }
        "bun" => {
            let bun_bin = format!("{}/.bun/bin/bun", std::env::var("HOME").unwrap_or_default());
            if std::path::Path::new(&bun_bin).exists() {
                versions.push(json!({ "version": "installed", "path": bun_bin }));
            }
        }
        "rust" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", "unset RUSTUP_TOOLCHAIN; [ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" toolchain list 2>/dev/null || true"],
                cmd_timeout_short(),
            ).await {
                let home = std::env::var("HOME").unwrap_or_default();
                for line in raw.lines() {
                    let tc = line.split_whitespace().next().unwrap_or("").trim();
                    if tc.is_empty() { continue; }
                    let rustc_bin = format!("{}/.rustup/toolchains/{}/bin/rustc", home, tc);
                    let path_to_use = if std::path::Path::new(&rustc_bin).exists() {
                        rustc_bin
                    } else {
                        format!("{}/.cargo/bin/rustc", home)
                    };
                    versions.push(json!({ "version": tc, "path": path_to_use }));
                }
            }
        }
        "dart" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", r#"FOUND=false; LDIR="$HOME/.local/share/lumina/dart"; if [ -d "$LDIR" ]; then for d in "$LDIR"/*; do [ -d "$d" ] || continue; b=$(basename "$d"); [ "$b" = "current" ] && continue; [ -x "$d/bin/dart" ] || continue; ver=$("$d/bin/dart" --version 2>&1 | awk '{print $4}'); printf '%s\t%s\n' "${ver:-$b}" "$d/bin/dart"; FOUND=true; done; fi; if ! $FOUND && [ -x "$HOME/.dart/dart-sdk/bin/dart" ]; then ver=$("$HOME/.dart/dart-sdk/bin/dart" --version 2>&1 | awk '{print $4}'); printf '%s\t%s\n' "${ver:-dart}" "$HOME/.dart/dart-sdk/bin/dart"; fi"#],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines() {
                    let mut parts = line.splitn(2, '\t');
                    let v = parts.next().unwrap_or("").trim();
                    let p = parts.next().unwrap_or("").trim();
                    if !v.is_empty() && !p.is_empty() {
                        versions.push(json!({ "version": v, "path": p }));
                    }
                }
            }
        }
        "flutter" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", r#"LDIR="$HOME/.local/share/lumina/flutter"; if [ -d "$LDIR" ]; then for d in "$LDIR"/*; do [ -d "$d" ] || continue; b=$(basename "$d"); [ "$b" = "current" ] && continue; [ -x "$d/bin/flutter" ] || continue; ver=$(cat "$d/version" 2>/dev/null | head -1); printf '%s\t%s\n' "${ver:-$b}" "$d/bin/flutter"; done; fi"#],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines() {
                    let mut parts = line.splitn(2, '\t');
                    let v = parts.next().unwrap_or("").trim();
                    let p = parts.next().unwrap_or("").trim();
                    if !v.is_empty() && !p.is_empty() {
                        versions.push(json!({ "version": v, "path": p }));
                    }
                }
            }
        }
        "julia" => {
            if let Ok(raw) = exec_output_limit(
                "bash",
                &["-lc", "export PATH=\"$HOME/.juliaup/bin:$PATH\"; juliaup list 2>/dev/null | tail -n +2 || true"],
                cmd_timeout_short(),
            ).await {
                for line in raw.lines().filter(|l| !l.trim().is_empty()) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    let tag = parts.first().copied().unwrap_or("").trim_start_matches('*').trim();
                    if tag.is_empty() { continue; }
                    let julia_bin = format!("{}/.juliaup/bin/julia", std::env::var("HOME").unwrap_or_default());
                    versions.push(json!({ "version": tag, "path": julia_bin }));
                }
            }
        }
        _ => {
            // Runtime not supported for version listing; return empty array
        }
    }

    json!({ "ok": true, "versions": versions })
}
```

- [ ] **Step 2: Register the channel in `lib.rs`**

In `apps/desktop/src-tauri/src/lib.rs`, inside `ipc_invoke`, find the `"dh:runtime:status"` arm and add immediately after it:

```rust
"dh:runtime:installed-versions" => runtime_jobs::handle_runtime_installed_versions(&payload).await,
```

- [ ] **Step 3: cargo check**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/runtime_jobs.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(runtimes): add dh:runtime:installed-versions on-demand channel"
```

---

### Task 3: Add IPC constant and bridge method

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`

- [ ] **Step 1: Add `runtimeInstalledVersions` to the IPC const**

In `packages/shared/src/ipc.ts`, find the line `runtimeStatus: 'dh:runtime:status',` and add after it:

```ts
runtimeInstalledVersions: 'dh:runtime:installed-versions',
```

- [ ] **Step 2: Add bridge method**

In `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`, find the line `runtimeStatus: () => tauriInvoke(IPC.runtimeStatus),` and add after it:

```ts
runtimeInstalledVersions: (runtimeId: string) =>
  tauriInvoke<{ ok: boolean; versions: Array<{ version: string; path: string }> }>(
    IPC.runtimeInstalledVersions, { runtimeId }
  ),
```

- [ ] **Step 3: Add type declaration to window.dh if needed**

Check if `window.dh` has a typed interface. Find it by searching for `interface DhApi` or `type DhApi` in the codebase:

```bash
grep -rn "interface DhApi\|type DhApi\|runtimeStatus" apps/desktop/src/renderer/src/ --include="*.ts" --include="*.d.ts" | head -10
```

If a typed interface exists (likely in a `.d.ts` file), add `runtimeInstalledVersions: (runtimeId: string) => Promise<{ ok: boolean; versions: Array<{ version: string; path: string }> }>` to it.

- [ ] **Step 4: Build shared package**

```bash
cd packages/shared && pnpm build 2>&1
```

Expected: exit 0.

- [ ] **Step 5: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ipc.ts apps/desktop/src/renderer/src/api/desktopApiBridge.ts
git commit -m "feat(runtimes): add runtimeInstalledVersions IPC constant and bridge method"
```

---

### Task 4: Frontend — localStorage status cache + lazy installed-versions fetch

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/RuntimesPage.tsx`

- [ ] **Step 1: Add status cache constants near the top of the component**

In `RuntimesPage.tsx`, just after the existing `VERSIONS_CACHE_KEY` and `VERSIONS_CACHE_TTL` constants (~line 85), add:

```ts
const STATUS_CACHE_KEY = 'dh:runtimes:status-cache:v1'
const STATUS_CACHE_TTL = 30 * 1000 // 30 seconds
```

- [ ] **Step 2: Add installedVersionsCache state**

In the component's state declarations, add:

```ts
const [installedVersionsCache, setInstalledVersionsCache] = useState<Record<string, Array<{ version: string; path: string }>>>({})
const [loadingInstalledVersions, setLoadingInstalledVersions] = useState(false)
```

- [ ] **Step 3: Modify `refreshStatus` to read/write the status cache**

Replace the existing `refreshStatus` callback with:

```ts
const refreshStatus = useCallback(async (background = false) => {
  if (!background) setIsRefreshing(true)
  setErrorMessage(null)
  try {
    const res = await window.dh.runtimeStatus() as { ok: boolean; runtimes: RuntimeStatus[]; error?: string }
    if (res.ok) {
      setRuntimes(res.runtimes)
      // Write to status cache
      try {
        localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ ts: Date.now(), runtimes: res.runtimes }))
      } catch { /* ignore */ }
    } else {
      if (!background) setErrorMessage(humanizeRuntimeError(res.error))
    }
    const jobs = await window.dh.jobsList() as JobSummary[]
    setActiveJobs(jobs.filter((j) => j.kind.startsWith('runtime_') || j.kind === 'install_deps'))
  } catch (e) {
    if (!background) setErrorMessage(e instanceof Error ? e.message : String(e))
  } finally {
    if (!background) setIsRefreshing(false)
  }
}, [])
```

- [ ] **Step 4: Load from cache on mount**

Find the `useEffect(() => { void refreshStatus() }, [refreshStatus, ...])` near line 203. Modify it to:

```ts
useEffect(() => {
  // Try cache first for instant render
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY)
    if (raw) {
      const cached = JSON.parse(raw) as { ts: number; runtimes: RuntimeStatus[] }
      if (Date.now() - cached.ts < STATUS_CACHE_TTL && Array.isArray(cached.runtimes)) {
        setRuntimes(cached.runtimes)
        void refreshStatus(true) // background refresh
        return
      }
    }
  } catch { /* ignore corrupt cache */ }
  void refreshStatus()
}, [refreshStatus])
```

- [ ] **Step 5: Add `loadInstalledVersions` callback**

Add a new callback after `refreshDeps`:

```ts
const loadInstalledVersions = useCallback(async (runtimeId: string) => {
  if (installedVersionsCache[runtimeId]) return // already loaded
  setLoadingInstalledVersions(true)
  try {
    const res = await window.dh.runtimeInstalledVersions(runtimeId)
    if (res.ok) {
      setInstalledVersionsCache((prev) => ({ ...prev, [runtimeId]: res.versions }))
    }
  } catch {
    // show no versions — user can still install with 'latest'
  } finally {
    setLoadingInstalledVersions(false)
  }
}, [installedVersionsCache])
```

- [ ] **Step 6: Call `loadInstalledVersions` when wizard opens**

Find the `setShowWizard(true)` call (or wherever the wizard step is first shown). After it, add:

```ts
void loadInstalledVersions(selectedId)
```

Also, if there is a `useEffect` that triggers when `showWizard` becomes true, add the call there.

- [ ] **Step 7: Thread `installedVersionsCache` into the allVersions display**

Find where `selectedRuntime.allVersions` is used in JSX (around line 563). Change it to use `installedVersionsCache[selectedId] ?? selectedRuntime.allVersions`:

```tsx
{(installedVersionsCache[selectedId] || selectedRuntime.allVersions) && (
  <div className="...">
    {loadingInstalledVersions ? (
      <span className="codicon codicon-loading codicon-modifier-spin" />
    ) : (
      (installedVersionsCache[selectedId] ?? selectedRuntime.allVersions ?? []).map((v, i) => (
        // existing version row JSX
      ))
    )}
  </div>
)}
```

- [ ] **Step 8: Typecheck and lint**

```bash
cd apps/desktop && pnpm typecheck 2>&1 && pnpm lint 2>&1
```

Expected: no new errors.

- [ ] **Step 9: Manual smoke test**

Start the app (`pnpm dev`). Navigate to `/runtimes`. Verify:
1. Page renders in <10s (no waiting for allVersions).
2. Click a runtime (e.g., Node). Open the install wizard. Verify a loading spinner appears briefly, then installed versions appear (if Node/nvm is installed).
3. Navigate away and back to `/runtimes`. Verify page renders instantly (from cache).

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/RuntimesPage.tsx
git commit -m "perf(runtimes): add status cache and lazy-load installed versions on wizard open"
```
