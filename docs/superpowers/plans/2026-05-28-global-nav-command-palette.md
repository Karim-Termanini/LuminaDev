# Global Nav Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dormant TopBar search input to a real Ctrl+K command palette that lets users fuzzy-search page routes, running containers, and installed runtimes.

**Architecture:** All changes are in `TopBar.tsx`. On input focus (or Ctrl+K which already focuses the `.hp-search-input` via AppShell), a panel drops below showing categorized results. No new IPC channels — containers are fetched from `window.dh.dockerList()` once on open; runtimes are read from the existing `dh:runtimes:status-cache:v1` localStorage key written by the Runtimes page. Keyboard navigation (↑/↓/Enter/Escape) is handled via `onKeyDown` on the input.

**Tech Stack:** React/TypeScript, `ContainerRow` type from shared, localStorage read (no new IPC), `react-router-dom` `useNavigate`.

---

### Task 1: Add command palette CSS

**Files:**
- Create: `apps/desktop/src/renderer/src/layout/TopBar.css` (or modify `AppShell.css` if no TopBar.css exists)

- [ ] **Step 1: Check if TopBar.css exists**

```bash
ls apps/desktop/src/renderer/src/layout/*.css 2>/dev/null
```

If `TopBar.css` does not exist, create it and import it in `TopBar.tsx`:
```ts
import './TopBar.css'
```

If `AppShell.css` exists and TopBar is not separately styled, add the styles there.

- [ ] **Step 2: Write palette CSS**

Add to the chosen CSS file:

```css
/* ── Command Palette ── */
.cmd-palette-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.cmd-palette-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(420px, calc(100vw - 40px));
  max-height: 360px;
  overflow-y: auto;
  background: var(--bg-elevated, var(--bg-panel));
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 2000;
  padding: 8px 0;
}

.cmd-palette-section {
  padding: 0;
}

.cmd-palette-section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  padding: 8px 14px 4px;
}

.cmd-palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 13px;
}

.cmd-palette-item:hover,
.cmd-palette-item.active {
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
}

.cmd-palette-item .codicon {
  font-size: 15px;
  color: var(--text-muted);
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.cmd-palette-item-label {
  flex: 1;
  font-weight: 500;
}

.cmd-palette-item-meta {
  font-size: 11px;
  color: var(--text-muted);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cmd-palette-item-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.cmd-palette-badge-running {
  background: rgba(0, 230, 118, 0.12);
  color: var(--green, #00e676);
}

.cmd-palette-badge-exited {
  background: rgba(128, 128, 128, 0.12);
  color: var(--text-muted);
}

.cmd-palette-empty {
  padding: 16px 14px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/layout/
git commit -m "style(nav): add command palette CSS"
```

---

### Task 2: Implement the command palette in TopBar.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/layout/TopBar.tsx`

- [ ] **Step 1: Add required imports and types**

At the top of `TopBar.tsx`, ensure these are present (add any missing):

```ts
import type { ContainerRow } from '@linux-dev-home/shared'
```

And for the CSS (if you created `TopBar.css`):
```ts
import './TopBar.css'
```

- [ ] **Step 2: Define the static PAGES list**

Inside `TopBar` (before the return), add:

```ts
const PAGES = [
  { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
  { label: 'Monitor', route: '/system', icon: 'pulse' },
  { label: 'Docker', route: '/docker', icon: 'package' },
  { label: 'SSH', route: '/ssh', icon: 'key' },
  { label: 'Git', route: '/git', icon: 'git-branch' },
  { label: 'Profiles', route: '/profiles', icon: 'account' },
  { label: 'Terminal', route: '/terminal', icon: 'terminal' },
  { label: 'Runtimes', route: '/runtimes', icon: 'zap' },
  { label: 'Maintenance', route: '/maintenance', icon: 'shield' },
  { label: 'Settings', route: '/settings', icon: 'settings' },
] as const
```

- [ ] **Step 3: Add palette state variables**

In the component, add these state variables (alongside the existing `q`, `showNotifications`, `jobs`):

```ts
const [paletteOpen, setPaletteOpen] = useState(false)
const [paletteIdx, setPaletteIdx] = useState(0)
const [paletteContainers, setPaletteContainers] = useState<ContainerRow[]>([])
const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 4: Add helper functions**

Inside the component (before the return):

```ts
// Read cached runtime names from localStorage (written by RuntimesPage after Spec 1 plan is applied)
const getCachedRuntimes = (): Array<{ name: string; version: string }> => {
  try {
    const raw = localStorage.getItem('dh:runtimes:status-cache:v1')
    if (!raw) return []
    const cached = JSON.parse(raw) as { ts: number; runtimes: Array<{ name: string; installed: boolean; version?: string }> }
    return cached.runtimes.filter((r) => r.installed).map((r) => ({ name: r.name, version: r.version ?? '' }))
  } catch {
    return []
  }
}

const match = (text: string, query: string): boolean =>
  text.toLowerCase().includes(query.toLowerCase())

type PaletteResult =
  | { kind: 'page'; label: string; route: string; icon: string }
  | { kind: 'container'; name: string; image: string; state: string }
  | { kind: 'runtime'; name: string; version: string }

const getPaletteResults = (query: string, containers: ContainerRow[]): PaletteResult[] => {
  const results: PaletteResult[] = []
  const pages = PAGES.filter((p) => query === '' || match(p.label, query))
  results.push(...pages.map((p) => ({ kind: 'page' as const, ...p })))
  if (query !== '') {
    containers
      .filter((c) => match(c.name, query) || match(c.image, query))
      .forEach((c) => results.push({ kind: 'container', name: c.name, image: c.image, state: c.state }))
    getCachedRuntimes()
      .filter((r) => match(r.name, query))
      .forEach((r) => results.push({ kind: 'runtime', name: r.name, version: r.version }))
  }
  return results
}
```

- [ ] **Step 5: Add `onPaletteOpen` handler**

```ts
const onPaletteOpen = useCallback(async () => {
  setPaletteOpen(true)
  setPaletteIdx(0)
  // Fetch containers once on open
  try {
    const res = await window.dh.dockerList()
    const bag = res as { ok?: boolean; rows?: ContainerRow[] }
    if (bag?.ok && Array.isArray(bag.rows)) {
      setPaletteContainers(bag.rows)
    }
  } catch {
    // palette still works without containers
  }
}, [])

const onPaletteClose = useCallback(() => {
  setPaletteOpen(false)
  setPaletteIdx(0)
}, [])
```

- [ ] **Step 6: Update the query change effect to reset paletteIdx**

Find the existing `useEffect(() => { setQ(''); setShowNotifications(false); ... }, [pathname])`. This already resets `q` on route change. After `setQ('')`, also add `setPaletteOpen(false)`.

Add a new effect for paletteIdx reset on query change:

```ts
useEffect(() => {
  setPaletteIdx(0)
}, [q])
```

- [ ] **Step 7: Add keyboard handler for palette navigation**

Replace or augment the `<input>` `onChange` and add an `onKeyDown`:

```ts
const results = paletteOpen ? getPaletteResults(q, paletteContainers) : []

const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (!paletteOpen) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setPaletteIdx((i) => Math.min(i + 1, results.length - 1))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    setPaletteIdx((i) => Math.max(i - 1, 0))
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = results[paletteIdx]
    if (!item) return
    if (item.kind === 'page') navigate(item.route)
    else if (item.kind === 'container') navigate('/docker')
    else if (item.kind === 'runtime') navigate('/runtimes')
    onPaletteClose()
    setQ('')
  } else if (e.key === 'Escape') {
    onPaletteClose()
    setQ('')
  }
}
```

- [ ] **Step 8: Update the search input JSX**

Find the existing `<input ... className="hp-search-input" ...>`. Wrap it and add the palette panel:

Replace:
```tsx
<input
  value={q}
  onChange={(e) => setQ(e.target.value)}
  placeholder={t('topbar.searchPlaceholder')}
  className="hp-search-input"
  style={{ ... }}
/>
```

With:
```tsx
<div className="cmd-palette-wrap" style={{ position: 'relative' }}>
  <input
    value={q}
    onChange={(e) => setQ(e.target.value)}
    onFocus={() => void onPaletteOpen()}
    onBlur={() => {
      blurTimerRef.current = setTimeout(() => onPaletteClose(), 150)
    }}
    onKeyDown={handleInputKeyDown}
    placeholder={t('topbar.searchPlaceholder')}
    className="hp-search-input"
    role="combobox"
    aria-expanded={paletteOpen}
    aria-controls="cmd-palette"
    aria-autocomplete="list"
    style={{
      width: 220,
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '6px 10px',
      color: 'var(--text)',
      fontSize: 13,
    }}
  />

  {paletteOpen && results.length > 0 && (
    <div
      id="cmd-palette"
      role="listbox"
      className="cmd-palette-panel"
      onMouseDown={(e) => {
        // Prevent blur before click registers
        e.preventDefault()
        if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      }}
    >
      {/* Pages section */}
      {results.filter((r) => r.kind === 'page').length > 0 && (
        <div className="cmd-palette-section">
          <div className="cmd-palette-section-label">Pages</div>
          {results.map((item, idx) => {
            if (item.kind !== 'page') return null
            return (
              <div
                key={`page-${item.route}`}
                role="option"
                aria-selected={idx === paletteIdx}
                className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                onClick={() => { navigate(item.route); onPaletteClose(); setQ('') }}
              >
                <span className={`codicon codicon-${item.icon}`} aria-hidden />
                <span className="cmd-palette-item-label">{item.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Containers section */}
      {results.filter((r) => r.kind === 'container').length > 0 && (
        <div className="cmd-palette-section">
          <div className="cmd-palette-section-label">Containers</div>
          {results.map((item, idx) => {
            if (item.kind !== 'container') return null
            const isRunning = item.state.toLowerCase() === 'running'
            return (
              <div
                key={`container-${item.name}`}
                role="option"
                aria-selected={idx === paletteIdx}
                className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                onClick={() => { navigate('/docker'); onPaletteClose(); setQ('') }}
              >
                <span className="codicon codicon-package" aria-hidden />
                <span className="cmd-palette-item-label">{item.name}</span>
                <span className="cmd-palette-item-meta">{item.image}</span>
                <span className={`cmd-palette-item-badge ${isRunning ? 'cmd-palette-badge-running' : 'cmd-palette-badge-exited'}`}>
                  {isRunning ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Runtimes section */}
      {results.filter((r) => r.kind === 'runtime').length > 0 && (
        <div className="cmd-palette-section">
          <div className="cmd-palette-section-label">Runtimes</div>
          {results.map((item, idx) => {
            if (item.kind !== 'runtime') return null
            return (
              <div
                key={`runtime-${item.name}`}
                role="option"
                aria-selected={idx === paletteIdx}
                className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                onClick={() => { navigate('/runtimes'); onPaletteClose(); setQ('') }}
              >
                <span className="codicon codicon-zap" aria-hidden />
                <span className="cmd-palette-item-label">{item.name}</span>
                {item.version && <span className="cmd-palette-item-meta">{item.version}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )}

  {paletteOpen && results.length === 0 && q !== '' && (
    <div id="cmd-palette" className="cmd-palette-panel">
      <div className="cmd-palette-empty">No results for "{q}"</div>
    </div>
  )}
</div>
```

- [ ] **Step 9: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1
```

Fix any missing `useCallback`, `useRef` imports (add to the `import { ... } from 'react'` line at top of TopBar.tsx).

- [ ] **Step 10: Manual smoke test**

Run `pnpm dev`. In any page:
1. Click the search bar. Verify all page routes appear in a dropdown.
2. Type "dock". Verify results filter to Docker page + any container with "dock" in the name.
3. Press ↓ to highlight the second result. Press Enter. Verify navigation.
4. Press Escape. Verify palette closes and query clears.
5. Press Ctrl+K (already handled by AppShell → focuses `.hp-search-input`). Verify palette opens.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/renderer/src/layout/TopBar.tsx apps/desktop/src/renderer/src/layout/
git commit -m "feat(nav): implement Ctrl+K command palette with route/container/runtime search"
```
