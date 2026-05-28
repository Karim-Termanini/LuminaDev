# Dashboard-Kernels Config Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `DashboardKernelsPage` to monitor and control Jupyter and PHP-FPM in addition to docker/ssh/nginx, with Start/Stop/Open-in-browser/Link-project actions per unit.

**Architecture:** Frontend: replaces `UNITS` const array with typed `KERNEL_DEFS` config. Three new Rust host_exec commands in `system_info.rs` (`systemctl_start`, `systemctl_stop`, `systemctl_is_active_fallback`). Link-project saves to store key `kernel_links`. All unit controls call `dh:host:exec`.

**Tech Stack:** React/TypeScript, Rust/system_info.rs, Tauri store, `dh:host:exec`, Polkit for system units.

---

### Task 1: Add Rust host_exec commands for systemctl control

**Files:**
- Modify: `apps/desktop/src-tauri/src/system_info.rs`

The `host_exec_handler` function at line ~316 dispatches to `host_exec_<name>` functions. You'll add three new arms and their corresponding functions.

- [ ] **Step 1: Add the three new arms to `host_exec_handler`**

In `system_info.rs`, find `host_exec_handler`'s match block:

```rust
match cmd {
    "nvidia_smi_short" => host_exec_nvidia_smi().await,
    "systemctl_is_active" => host_exec_systemctl_is_active(body).await,
    // ...
```

Add three new arms inside the match:

```rust
"systemctl_start" => host_exec_systemctl_start(body).await,
"systemctl_stop" => host_exec_systemctl_stop(body).await,
"systemctl_is_active_fallback" => host_exec_systemctl_is_active_fallback(body).await,
```

Place these after the `"systemctl_is_active"` arm.

- [ ] **Step 2: Add the three new async functions**

Add these after `host_exec_systemctl_is_active`:

```rust
async fn host_exec_systemctl_start(body: &Value) -> Value {
    let unit = body.get("unit").and_then(|v| v.as_str()).unwrap_or_default();
    let user_mode = body.get("user").and_then(|v| v.as_bool()).unwrap_or(false);
    if unit.is_empty() {
        return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing unit." });
    }
    let args: Vec<&str> = if user_mode {
        vec!["--user", "start", unit]
    } else {
        vec!["start", unit]
    };
    let cmd = if user_mode { "systemctl" } else { "pkexec" };
    let full_args: Vec<&str> = if user_mode {
        args
    } else {
        vec!["systemctl", "start", unit]
    };
    match exec_output_limit(cmd, &full_args, cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true, "result": "started" }),
        Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[SYSTEMCTL_START_FAILED] {}", e) }),
    }
}

async fn host_exec_systemctl_stop(body: &Value) -> Value {
    let unit = body.get("unit").and_then(|v| v.as_str()).unwrap_or_default();
    let user_mode = body.get("user").and_then(|v| v.as_bool()).unwrap_or(false);
    if unit.is_empty() {
        return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing unit." });
    }
    let cmd = if user_mode { "systemctl" } else { "pkexec" };
    let full_args: Vec<&str> = if user_mode {
        vec!["--user", "stop", unit]
    } else {
        vec!["systemctl", "stop", unit]
    };
    match exec_output_limit(cmd, &full_args, cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true, "result": "stopped" }),
        Err(e) => json!({ "ok": false, "result": Value::Null, "error": format!("[SYSTEMCTL_STOP_FAILED] {}", e) }),
    }
}

async fn host_exec_systemctl_is_active_fallback(body: &Value) -> Value {
    // Tries a list of unit names; returns status + actual unit name found
    let units_val = body.get("units").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let units: Vec<&str> = units_val.iter().filter_map(|v| v.as_str()).collect();
    if units.is_empty() {
        return json!({ "ok": false, "result": Value::Null, "error": "[HOST_EXEC_INVALID] Missing units array." });
    }
    for unit in &units {
        match exec_output_limit("systemctl", &["is-active", unit], cmd_timeout_short()).await {
            Ok(out) => {
                let status = out.trim();
                if status == "active" || status == "failed" || status == "inactive" {
                    return json!({ "ok": true, "result": status, "resolvedUnit": unit });
                }
            }
            Err(_) => continue,
        }
    }
    json!({ "ok": true, "result": "unknown", "resolvedUnit": Value::Null })
}
```

- [ ] **Step 3: cargo check**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1
```

Expected: zero errors. Fix any lifetime or type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/system_info.rs
git commit -m "feat(kernels): add systemctl_start, systemctl_stop, systemctl_is_active_fallback host_exec commands"
```

---

### Task 2: Add `KernelLinks` type to shared

**Files:**
- Modify: `packages/shared/src/ipc.ts`

- [ ] **Step 1: Add the type**

In `packages/shared/src/ipc.ts`, after `RuntimeStatusResponse`, add:

```ts
/** Store key `kernel_links`: maps kernel ID to linked project path. */
export type KernelLinks = Record<string, string>
```

- [ ] **Step 2: Build and typecheck**

```bash
cd packages/shared && pnpm build 2>&1 && cd ../.. && cd apps/desktop && pnpm typecheck 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/ipc.ts
git commit -m "feat(kernels): add KernelLinks type to shared"
```

---

### Task 3: Update DashboardKernelsPage with KERNEL_DEFS and controls

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DashboardKernelsPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/DashboardKernelsPage.css`

- [ ] **Step 1: Replace UNITS const with KERNEL_DEFS**

At the top of `DashboardKernelsPage.tsx`, remove:

```ts
const UNITS = ['docker', 'ssh', 'nginx'] as const
```

Add:

```ts
type KernelDef = {
  id: string
  label: string
  icon: string
  systemdUnit: string
  altUnits?: string[]
  httpPort?: number
  category: 'system' | 'dev'
}

const KERNEL_DEFS: KernelDef[] = [
  { id: 'docker',  label: 'Docker',   icon: 'codicon-package', systemdUnit: 'docker',   category: 'system' },
  { id: 'ssh',     label: 'SSH',      icon: 'codicon-key',     systemdUnit: 'sshd',     altUnits: ['ssh'], category: 'system' },
  { id: 'nginx',   label: 'Nginx',    icon: 'codicon-server',  systemdUnit: 'nginx',    category: 'system' },
  { id: 'jupyter', label: 'Jupyter',  icon: 'codicon-graph',   systemdUnit: 'jupyter',  altUnits: ['jupyter-notebook', 'jupyter-lab'], httpPort: 8888, category: 'dev' },
  { id: 'phpfpm',  label: 'PHP-FPM',  icon: 'codicon-globe',   systemdUnit: 'php-fpm',  altUnits: ['php8.3-fpm', 'php8.2-fpm', 'php8.1-fpm', 'php-fpm8'], category: 'dev' },
]
```

- [ ] **Step 2: Update state declarations**

Find `const [units, setUnits] = useState<Record<string, string>>({})`. Keep it but also add:

```ts
const [kernelLinks, setKernelLinks] = useState<Record<string, string>>({})
const [unitBusy, setUnitBusy] = useState<Record<string, boolean>>({})
const [unitError, setUnitError] = useState<Record<string, string>>({})
```

- [ ] **Step 3: Load `kernel_links` from store on mount**

In the `refresh` callback or a new `useEffect`, load kernel links from the store:

```ts
useEffect(() => {
  window.dh.storeGet({ key: 'kernel_links' }).then((res: unknown) => {
    const bag = res as { ok?: boolean; data?: unknown }
    if (bag.ok && bag.data && typeof bag.data === 'object') {
      setKernelLinks(bag.data as Record<string, string>)
    }
  }).catch(() => {})
}, [])
```

- [ ] **Step 4: Update the `refresh` callback to use KERNEL_DEFS**

Replace the `UNITS.map(async (unit) => { ... })` block inside `refresh` with:

```ts
const nextUnits: Record<string, string> = {}
await Promise.all(
  KERNEL_DEFS.map(async (def) => {
    try {
      const allUnits = [def.systemdUnit, ...(def.altUnits ?? [])]
      if (allUnits.length > 1) {
        const s = await window.dh.hostExec({
          command: 'systemctl_is_active_fallback',
          units: allUnits,
        })
        const bag = s as { ok: boolean; result?: string }
        nextUnits[def.id] = bag.ok ? String(bag.result ?? 'unknown') : 'unknown'
      } else {
        const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit: def.systemdUnit })
        nextUnits[def.id] = s.ok ? String(s.result ?? 'unknown') : 'unknown'
      }
    } catch {
      nextUnits[def.id] = 'unknown'
    }
  })
)
setUnits(nextUnits)
```

- [ ] **Step 5: Add `startUnit` and `stopUnit` callbacks**

```ts
const startUnit = useCallback(async (def: KernelDef) => {
  setUnitBusy((prev) => ({ ...prev, [def.id]: true }))
  setUnitError((prev) => ({ ...prev, [def.id]: '' }))
  try {
    const res = await window.dh.hostExec({
      command: 'systemctl_start',
      unit: def.systemdUnit,
      user: def.category === 'dev',
    })
    const bag = res as { ok: boolean; error?: string }
    if (!bag.ok) {
      setUnitError((prev) => ({ ...prev, [def.id]: bag.error ?? 'Failed to start' }))
    }
    // Re-poll this unit
    const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit: def.systemdUnit })
    const status = (s as { ok: boolean; result?: string }).result ?? 'unknown'
    setUnits((prev) => ({ ...prev, [def.id]: String(status) }))
  } catch (e) {
    setUnitError((prev) => ({ ...prev, [def.id]: e instanceof Error ? e.message : String(e) }))
  } finally {
    setUnitBusy((prev) => ({ ...prev, [def.id]: false }))
  }
}, [])

const stopUnit = useCallback(async (def: KernelDef) => {
  setUnitBusy((prev) => ({ ...prev, [def.id]: true }))
  setUnitError((prev) => ({ ...prev, [def.id]: '' }))
  try {
    const res = await window.dh.hostExec({
      command: 'systemctl_stop',
      unit: def.systemdUnit,
      user: def.category === 'dev',
    })
    const bag = res as { ok: boolean; error?: string }
    if (!bag.ok) {
      setUnitError((prev) => ({ ...prev, [def.id]: bag.error ?? 'Failed to stop' }))
    }
    const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit: def.systemdUnit })
    const status = (s as { ok: boolean; result?: string }).result ?? 'unknown'
    setUnits((prev) => ({ ...prev, [def.id]: String(status) }))
  } catch (e) {
    setUnitError((prev) => ({ ...prev, [def.id]: e instanceof Error ? e.message : String(e) }))
  } finally {
    setUnitBusy((prev) => ({ ...prev, [def.id]: false }))
  }
}, [])

const linkProject = useCallback(async (def: KernelDef) => {
  try {
    const path = await window.dh.selectFolder()
    if (!path || typeof path !== 'string') return
    const next = { ...kernelLinks, [def.id]: path }
    setKernelLinks(next)
    await window.dh.storeSet({ key: 'kernel_links', data: next })
  } catch { /* ignore */ }
}, [kernelLinks])
```

- [ ] **Step 6: Update JSX to render KERNEL_DEFS in two sections**

Replace the existing unit rendering JSX with a two-section grid. Find the part of the JSX that renders unit cards and replace it with:

```tsx
{/* System Services */}
<section>
  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 12px' }}>
    System Services
  </h3>
  <div className="kernels-grid">
    {KERNEL_DEFS.filter((d) => d.category === 'system').map((def) => (
      <KernelCard
        key={def.id}
        def={def}
        status={units[def.id] ?? 'unknown'}
        busy={unitBusy[def.id] ?? false}
        error={unitError[def.id] ?? ''}
        linkedPath={kernelLinks[def.id]}
        onStart={() => void startUnit(def)}
        onStop={() => void stopUnit(def)}
        onLink={() => void linkProject(def)}
      />
    ))}
  </div>
</section>

{/* Dev Kernels */}
<section style={{ marginTop: 24 }}>
  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 12px' }}>
    Development Kernels
  </h3>
  <div className="kernels-grid">
    {KERNEL_DEFS.filter((d) => d.category === 'dev').map((def) => (
      <KernelCard
        key={def.id}
        def={def}
        status={units[def.id] ?? 'unknown'}
        busy={unitBusy[def.id] ?? false}
        error={unitError[def.id] ?? ''}
        linkedPath={kernelLinks[def.id]}
        onStart={() => void startUnit(def)}
        onStop={() => void stopUnit(def)}
        onLink={() => void linkProject(def)}
      />
    ))}
  </div>
</section>
```

- [ ] **Step 7: Add the `KernelCard` component**

Add this above the `DashboardKernelsPage` export:

```tsx
function KernelCard({
  def, status, busy, error, linkedPath, onStart, onStop, onLink,
}: {
  def: KernelDef
  status: string
  busy: boolean
  error: string
  linkedPath?: string
  onStart: () => void
  onStop: () => void
  onLink: () => void
}): ReactElement {
  const isActive = status === 'active'
  const isInstalled = status !== 'unknown'

  return (
    <div className="kernel-card">
      <div className="kernel-card-header">
        <span className={`codicon ${def.icon}`} aria-hidden style={{ fontSize: 18, color: isActive ? 'var(--green)' : 'var(--text-muted)' }} />
        <span className="kernel-card-label">{def.label}</span>
        <span className={`kernel-status-badge kernel-status-${status}`}>
          {status.toUpperCase()}
        </span>
      </div>
      <div className="kernel-card-unit">systemd: {def.systemdUnit}</div>
      {linkedPath && (
        <div className="kernel-card-link-badge" title={linkedPath}>
          <span className="codicon codicon-link" style={{ fontSize: 10 }} /> {linkedPath.split('/').slice(-2).join('/')}
        </div>
      )}
      {error && <div className="kernel-card-error">{error}</div>}
      <div className="kernel-card-actions">
        {isInstalled && (
          <>
            <button
              type="button"
              className="kernel-btn kernel-btn-start"
              disabled={busy || isActive}
              onClick={onStart}
            >
              {busy ? <span className="codicon codicon-loading codicon-modifier-spin" /> : 'Start'}
            </button>
            <button
              type="button"
              className="kernel-btn kernel-btn-stop"
              disabled={busy || !isActive}
              onClick={onStop}
            >
              Stop
            </button>
          </>
        )}
        {def.httpPort && isActive && (
          <button
            type="button"
            className="kernel-btn kernel-btn-open"
            onClick={() => void window.dh.openExternal(`http://localhost:${def.httpPort}`)}
          >
            Open ↗
          </button>
        )}
        <button type="button" className="kernel-btn kernel-btn-link" onClick={onLink}>
          {linkedPath ? 'Relink' : 'Link Project'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Add kernel card CSS**

In `DashboardKernelsPage.css`, add:

```css
.kernels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.kernel-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kernel-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kernel-card-label {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
}

.kernel-status-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.kernel-status-active { background: rgba(0,230,118,0.12); color: var(--green); }
.kernel-status-inactive { background: rgba(255,193,7,0.12); color: var(--yellow); }
.kernel-status-failed { background: rgba(248,81,73,0.12); color: var(--red); }
.kernel-status-unknown { background: rgba(128,128,128,0.12); color: var(--text-muted); }

.kernel-card-unit {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
}

.kernel-card-link-badge {
  font-size: 11px;
  color: var(--accent);
  background: rgba(124,77,255,0.08);
  border-radius: 4px;
  padding: 2px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kernel-card-error {
  font-size: 11px;
  color: var(--red);
  background: rgba(248,81,73,0.08);
  border-radius: 4px;
  padding: 4px 8px;
}

.kernel-card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.kernel-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: var(--bg-input);
  color: var(--text);
  transition: opacity 0.15s;
}

.kernel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.kernel-btn-start { border-color: var(--green); color: var(--green); }
.kernel-btn-start:hover:not(:disabled) { background: rgba(0,230,118,0.1); }
.kernel-btn-stop:hover:not(:disabled) { background: rgba(248,81,73,0.1); color: var(--red); }
.kernel-btn-open { border-color: var(--accent); color: var(--accent); }
.kernel-btn-open:hover { background: rgba(124,77,255,0.1); }
.kernel-btn-link { color: var(--text-muted); }
.kernel-btn-link:hover { color: var(--text); }
```

- [ ] **Step 9: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1
```

Fix any `ReactElement` import or missing type issues.

- [ ] **Step 10: Manual smoke test**

Run `pnpm dev`. Navigate to `/dashboard/kernels`. Verify:
1. Five kernel cards render in two sections (System / Development Kernels).
2. Status badges show correct colors.
3. Start/Stop buttons are enabled/disabled correctly based on status.
4. "Link Project" opens a folder picker and shows the linked path as a badge.
5. Jupyter card shows "Open ↗" button when active.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/DashboardKernelsPage.tsx apps/desktop/src/renderer/src/pages/DashboardKernelsPage.css
git commit -m "feat(kernels): add Jupyter/PHP-FPM with start/stop/link controls"
```
