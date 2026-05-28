# Dashboard-Widgets Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 15-line "Coming Soon" stub `DashboardWidgetsPage` with a full widget management surface: left column shows the widget catalog, right column shows active placements with reorder/remove controls.

**Architecture:** Two-column layout entirely in `DashboardWidgetsPage.tsx`. Loads current layout via `dh:layout:get` on mount. All mutations use optimistic update + `dh:layout:set`. No new IPC channels needed — existing `layoutGet`/`layoutSet` bridge methods are used. Widget catalog comes from `WIDGET_DEFINITIONS` in `@linux-dev-home/shared`.

**Tech Stack:** React/TypeScript, `WIDGET_DEFINITIONS` from `widgetRegistry.ts`, `dh:layout:get` + `dh:layout:set` IPC, HTML5 drag-and-drop, `theme-elevated.css`.

---

### Task 1: Create CSS file

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/DashboardWidgetsPage.css`

- [ ] **Step 1: Write the CSS**

```css
.widgets-page {
  padding: 32px;
  color: var(--text);
  max-width: 1200px;
}

.widgets-page-header {
  margin-bottom: 32px;
}

.widgets-page-header h1 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
}

.widgets-page-header p {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}

.widgets-page-header-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.widgets-reset-btn {
  padding: 7px 16px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.widgets-reset-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.widgets-columns {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 24px;
  align-items: start;
}

/* ── Catalog ── */
.widgets-catalog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.widgets-catalog-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 16px;
}

.widgets-catalog-group {
  margin-bottom: 20px;
}

.widgets-catalog-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 10px;
}

.widgets-catalog-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  margin-bottom: 6px;
  transition: background 0.1s, border-color 0.1s;
}

.widgets-catalog-item:hover {
  background: var(--bg-hover);
  border-color: var(--border);
}

.widgets-catalog-item-icon {
  font-size: 18px;
  color: var(--accent);
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.widgets-catalog-item-info {
  flex: 1;
  min-width: 0;
}

.widgets-catalog-item-name {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 2px;
}

.widgets-catalog-item-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widgets-add-btn {
  padding: 5px 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.widgets-add-btn:hover {
  opacity: 0.85;
}

/* ── Active Placements ── */
.widgets-placements {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.widgets-placements-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 16px;
}

.widgets-placements-empty {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 32px 0;
  border: 1.5px dashed var(--border);
  border-radius: 8px;
}

.widgets-placement-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  margin-bottom: 8px;
  cursor: grab;
  user-select: none;
}

.widgets-placement-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.widgets-placement-item.drag-over {
  border-color: var(--accent);
  background: rgba(124, 77, 255, 0.08);
}

.widgets-placement-drag {
  color: var(--text-muted);
  cursor: grab;
}

.widgets-placement-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.widgets-placement-typeid {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: monospace;
}

.widgets-placement-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
  transition: color 0.1s;
}

.widgets-placement-remove:hover {
  color: var(--red);
}

/* ── Toast ── */
.widgets-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  z-index: 1000;
}

.widgets-toast-undo {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/DashboardWidgetsPage.css
git commit -m "style(dashboard-widgets): add widget management page CSS"
```

---

### Task 2: Build the widget management page

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DashboardWidgetsPage.tsx`

- [ ] **Step 1: Replace the 15-line stub with the full implementation**

Replace the entire contents of `apps/desktop/src/renderer/src/pages/DashboardWidgetsPage.tsx` with:

```tsx
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WIDGET_DEFINITIONS, type WidgetDefinition } from '@linux-dev-home/shared'
import type { DashboardLayoutFile, DashboardPlacement } from '@linux-dev-home/shared'
import './DashboardWidgetsPage.css'

function widgetIcon(typeId: string): string {
  if (typeId.startsWith('live.git')) return 'codicon-git-branch'
  if (typeId.startsWith('live.cloud')) return 'codicon-bell'
  if (typeId.startsWith('link.')) return 'codicon-link-external'
  if (typeId.startsWith('guardian')) return 'codicon-shield'
  if (typeId.startsWith('static.')) return 'codicon-info'
  return 'codicon-layout'
}

type Toast = { message: string; onUndo?: () => void }

const CATALOG_GROUPS: Array<{ label: string; filter: (w: WidgetDefinition) => boolean }> = [
  { label: 'Live Data', filter: (w) => w.typeId.startsWith('live.') },
  { label: 'Links', filter: (w) => w.typeId.startsWith('link.') },
  { label: 'Guardian', filter: (w) => w.typeId.startsWith('guardian.') },
  { label: 'Static', filter: (w) => w.typeId.startsWith('static.') },
]

export function DashboardWidgetsPage(): ReactElement {
  const { t } = useTranslation('dashboard')
  const [layout, setLayout] = useState<DashboardLayoutFile | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragItemRef = useRef<string | null>(null)

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, onUndo })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const saveLayout = useCallback(async (next: DashboardLayoutFile) => {
    try {
      await window.dh.layoutSet({ profile: 'web-dev', layout: next })
    } catch {
      showToast('Failed to save layout.')
    }
  }, [showToast])

  useEffect(() => {
    window.dh.layoutGet({ profile: 'web-dev' }).then((res) => {
      if (res && (res as any).ok !== false) {
        setLayout(res as DashboardLayoutFile)
      } else {
        setLayout({ placements: [] })
      }
    }).catch(() => setLayout({ placements: [] }))
  }, [])

  const addWidget = useCallback((def: WidgetDefinition) => {
    if (!layout) return
    const instanceId = `${def.typeId}-${Date.now()}`
    const placement: DashboardPlacement = { instanceId, typeId: def.typeId }
    const next = { ...layout, placements: [...layout.placements, placement] }
    setLayout(next)
    void saveLayout(next)
    showToast(`"${def.title}" added to dashboard.`)
  }, [layout, saveLayout, showToast])

  const removeWidget = useCallback((instanceId: string) => {
    if (!layout) return
    const prev = layout
    const next = { ...layout, placements: layout.placements.filter((p) => p.instanceId !== instanceId) }
    setLayout(next)
    void saveLayout(next)
    showToast('Widget removed.', () => {
      setLayout(prev)
      void saveLayout(prev)
    })
  }, [layout, saveLayout, showToast])

  const reorderWidget = useCallback((fromId: string, toId: string) => {
    if (!layout || fromId === toId) return
    const fromIdx = layout.placements.findIndex((p) => p.instanceId === fromId)
    const toIdx = layout.placements.findIndex((p) => p.instanceId === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const next_placements = [...layout.placements]
    const [moved] = next_placements.splice(fromIdx, 1)
    next_placements.splice(toIdx, 0, moved)
    const next = { ...layout, placements: next_placements }
    setLayout(next)
    void saveLayout(next)
  }, [layout, saveLayout])

  const resetLayout = useCallback(() => {
    if (!layout) return
    const prev = layout
    const next = { ...layout, placements: [] }
    setLayout(next)
    void saveLayout(next)
    showToast('Layout reset.', () => {
      setLayout(prev)
      void saveLayout(prev)
    })
  }, [layout, saveLayout, showToast])

  return (
    <div className="widgets-page">
      <div className="widgets-page-header">
        <div className="widgets-page-header-row">
          <div>
            <h1>{t('widgets.title')}</h1>
            <p>Configure your dashboard widgets.</p>
          </div>
          <button type="button" className="widgets-reset-btn" onClick={resetLayout}>
            Reset to empty
          </button>
        </div>
      </div>

      <div className="widgets-columns">
        {/* ── Left: Catalog ── */}
        <div className="widgets-catalog">
          <p className="widgets-catalog-title">Widget Catalog</p>
          {CATALOG_GROUPS.map((group) => {
            const defs = WIDGET_DEFINITIONS.filter(group.filter)
            if (defs.length === 0) return null
            return (
              <div key={group.label} className="widgets-catalog-group">
                <p className="widgets-catalog-group-label">{group.label}</p>
                {defs.map((def) => (
                  <div key={def.typeId} className="widgets-catalog-item">
                    <span className={`codicon ${widgetIcon(def.typeId)} widgets-catalog-item-icon`} aria-hidden />
                    <div className="widgets-catalog-item-info">
                      <p className="widgets-catalog-item-name">{def.title}</p>
                      <p className="widgets-catalog-item-desc">{def.description}</p>
                    </div>
                    <button
                      type="button"
                      className="widgets-add-btn"
                      onClick={() => addWidget(def)}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* ── Right: Active Placements ── */}
        <div className="widgets-placements">
          <p className="widgets-placements-title">
            Dashboard Layout
            {layout && layout.placements.length > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 8 }}>
                ({layout.placements.length} widget{layout.placements.length !== 1 ? 's' : ''})
              </span>
            )}
          </p>
          {!layout || layout.placements.length === 0 ? (
            <div className="widgets-placements-empty">
              No widgets added yet. Pick some from the catalog.
            </div>
          ) : (
            layout.placements.map((placement) => {
              const def = WIDGET_DEFINITIONS.find((d) => d.typeId === placement.typeId)
              return (
                <div
                  key={placement.instanceId}
                  className="widgets-placement-item"
                  draggable
                  onDragStart={() => { dragItemRef.current = placement.instanceId }}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over') }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('drag-over')
                    if (dragItemRef.current && dragItemRef.current !== placement.instanceId) {
                      reorderWidget(dragItemRef.current, placement.instanceId)
                    }
                    dragItemRef.current = null
                  }}
                >
                  <span className="codicon codicon-gripper widgets-placement-drag" aria-hidden />
                  <span className="widgets-placement-name">{def?.title ?? placement.typeId}</span>
                  <span className="widgets-placement-typeid">{placement.typeId}</span>
                  <button
                    type="button"
                    className="widgets-placement-remove"
                    aria-label={`Remove ${def?.title ?? placement.typeId}`}
                    onClick={() => removeWidget(placement.instanceId)}
                  >
                    <span className="codicon codicon-trash" aria-hidden />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {toast && (
        <div className="widgets-toast" role="status">
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              className="widgets-toast-undo"
              onClick={() => {
                toast.onUndo?.()
                setToast(null)
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

> **Note:** The `layoutGet` and `layoutSet` calls use `profile: 'web-dev'` as a placeholder. In a follow-up, thread the active profile from a context or store. For now this gets the page functional.

- [ ] **Step 2: Verify `DashboardPlacement` and `DashboardLayoutFile` are exported from shared**

Both types are defined in `packages/shared/src/foundation.ts`. `DashboardPlacement` is `z.infer<typeof DashboardPlacementSchema>` and `DashboardLayoutFile` is `z.infer<typeof DashboardLayoutFileSchema>`. Both are exported. No changes needed.

- [ ] **Step 3: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1
```

Fix any import path errors.

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`. Navigate to `/dashboard/widgets` (or via Dashboard → top tab if it exists). Verify:
1. Two-column layout renders with catalog on the left.
2. Clicking "Add" on a widget appends it to the right column and shows a toast.
3. Dragging a placement card reorders it.
4. Clicking the trash icon removes it with a 3s undo toast.
5. "Reset to empty" clears all placements.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/DashboardWidgetsPage.tsx
git commit -m "feat(dashboard-widgets): implement widget catalog and placement management"
```

---

### Task 3: Wire the Widgets tab in TopBar

**Files:**
- Modify: `apps/desktop/src/renderer/src/layout/TopBar.tsx`

The TopBar already renders dashboard tabs (`/dashboard`, `/dashboard/kernels`, `/dashboard/logs`). Add a Widgets tab.

- [ ] **Step 1: Add the Widgets tab**

In `TopBar.tsx`, find the dashboard tab section:

```tsx
<DashTab to="/dashboard" end label={t('topbar.main')} />
<DashTab to="/dashboard/kernels" label={t('topbar.kernels')} />
<DashTab to="/dashboard/logs" label={t('topbar.logs')} />
```

Add after the logs tab:

```tsx
<DashTab to="/dashboard/widgets" label={t('topbar.widgets')} />
```

- [ ] **Step 2: Add i18n key**

In `apps/desktop/src/renderer/src/i18n/locales/en-US/nav.json`, add `"widgets": "Widgets"` in the `topbar` section.

Do the same for `de-DE/nav.json` and `ar-SA/nav.json` (use same value — will be translated later).

- [ ] **Step 3: Typecheck and commit**

```bash
cd apps/desktop && pnpm typecheck 2>&1
git add apps/desktop/src/renderer/src/layout/TopBar.tsx apps/desktop/src/renderer/src/i18n/
git commit -m "feat(dashboard-widgets): add Widgets tab to dashboard top bar"
```
