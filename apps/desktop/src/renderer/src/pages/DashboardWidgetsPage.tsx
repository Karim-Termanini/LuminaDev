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
      if (res?.layout) {
        setLayout(res.layout)
      } else {
        setLayout({ version: 1, placements: [] })
      }
    }).catch(() => setLayout({ version: 1, placements: [] }))
  }, [])

  const addWidget = useCallback((def: WidgetDefinition) => {
    if (!layout) return
    const instanceId = `${def.typeId}-${Date.now()}`
    const placement: DashboardPlacement = { instanceId, widgetTypeId: def.typeId }
    const next: DashboardLayoutFile = { ...layout, placements: [...layout.placements, placement] }
    setLayout(next)
    void saveLayout(next)
    showToast(`"${def.title}" added to dashboard.`)
  }, [layout, saveLayout, showToast])

  const removeWidget = useCallback((instanceId: string) => {
    if (!layout) return
    const prev = layout
    const next: DashboardLayoutFile = { ...layout, placements: layout.placements.filter((p) => p.instanceId !== instanceId) }
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
    const nextPlacements = [...layout.placements]
    const [moved] = nextPlacements.splice(fromIdx, 1)
    nextPlacements.splice(toIdx, 0, moved)
    const next: DashboardLayoutFile = { ...layout, placements: nextPlacements }
    setLayout(next)
    void saveLayout(next)
  }, [layout, saveLayout])

  const resetLayout = useCallback(() => {
    if (!layout) return
    const prev = layout
    const next: DashboardLayoutFile = { ...layout, placements: [] }
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
        <div className="widgets-catalog">
          <p className="widgets-catalog-title">Widget Catalog</p>
          {CATALOG_GROUPS.map((group) => {
            const defs = (WIDGET_DEFINITIONS as readonly WidgetDefinition[]).filter(group.filter)
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
              const def = (WIDGET_DEFINITIONS as readonly WidgetDefinition[]).find((d) => d.typeId === placement.widgetTypeId)
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
                  <span className="widgets-placement-name">{def?.title ?? placement.widgetTypeId}</span>
                  <span className="widgets-placement-typeid">{placement.widgetTypeId}</span>
                  <button
                    type="button"
                    className="widgets-placement-remove"
                    aria-label={`Remove ${def?.title ?? placement.widgetTypeId}`}
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
