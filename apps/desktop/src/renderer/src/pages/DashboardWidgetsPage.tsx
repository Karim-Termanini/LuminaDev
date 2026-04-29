import type { ReactElement } from 'react'
import { useState } from 'react'

import { AddWidgetModal } from '../dashboard/AddWidgetModal'
import { DashboardWidgetDeck } from '../dashboard/DashboardWidgetDeck'
import { useWidgetLayout } from '../layout/WidgetLayoutContext'

export function DashboardWidgetsPage(): ReactElement {
  const { layout, setLayout, removePlacement } = useWidgetLayout()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function reorderWidgets(fromInstanceId: string, toInstanceId: string): Promise<void> {
    if (!layout) return
    const fromIndex = layout.placements.findIndex((p) => p.instanceId === fromInstanceId)
    const toIndex = layout.placements.findIndex((p) => p.instanceId === toInstanceId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const placements = [...layout.placements]
    const [moved] = placements.splice(fromIndex, 1)
    placements.splice(toIndex, 0, moved)
    const next = { ...layout, placements }
    try {
      const res = await window.dh.layoutSet(next)
      if (!res.ok) {
        setSaveError(res.error || 'Failed to save dashboard layout.')
        return
      }
      setLayout(next)
      setSaveError(null)
    } catch {
      setSaveError('Failed to save dashboard layout.')
      // Keep UX resilient; user can still refresh the page to recover.
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          DASHBOARD.WIDGETS
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Widgets</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, maxWidth: 720, fontSize: 15, lineHeight: 1.55 }}>
          This page is only for pinned dashboard widgets (tips, quick links, placeholders). Use{' '}
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>Main</span> in the top bar for compose profiles and
          host overview.{' '}
          <strong style={{ color: 'var(--text)' }}>Layout:</strong> drag a widget card and drop it on another card to
          reorder. Add and remove widgets from the grid below.
        </p>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          disabled={!layout}
          onClick={() => layout && setPickerOpen(true)}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            borderRadius: 8,
            padding: '10px 18px',
            fontWeight: 600,
            cursor: !layout ? 'wait' : 'pointer',
            fontSize: 14,
            opacity: !layout ? 0.6 : 1,
          }}
        >
          <span className="codicon codicon-add" style={{ marginRight: 8 }} aria-hidden />
          Add widget
        </button>
      </div>
      {saveError ? <div style={{ color: 'var(--orange)', fontSize: 13 }}>{saveError}</div> : null}

      {layout ? (
        <AddWidgetModal
          open={pickerOpen}
          layout={layout}
          onClose={() => setPickerOpen(false)}
          onSaved={(next) => setLayout(next)}
        />
      ) : null}

      {layout ? (
        <DashboardWidgetDeck
          layout={layout}
          onRemove={(id) => void removePlacement(id)}
          onReorder={(fromId, toId) => void reorderWidgets(fromId, toId)}
          density="comfortable"
          heading="Pinned widgets"
        />
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading layout…</div>
      )}
    </div>
  )
}
