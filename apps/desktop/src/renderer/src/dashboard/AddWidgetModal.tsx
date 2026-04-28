import type { DashboardLayoutFile } from '@linux-dev-home/shared'
import { WIDGET_DEFINITIONS } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'

export function AddWidgetModal(props: {
  open: boolean
  layout: DashboardLayoutFile
  onClose: () => void
  onSaved: (next: DashboardLayoutFile) => void
}): ReactElement | null {
  if (!props.open) return null

  function add(typeId: string): void {
    const instanceId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `w-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const next: DashboardLayoutFile = {
      version: 1,
      placements: [...props.layout.placements, { instanceId, widgetTypeId: typeId }],
    }
    void (async () => {
      await window.dh.layoutSet(next)
      props.onSaved(next)
      props.onClose()
    })()
  }

  const used = new Set(props.layout.placements.map((p) => p.widgetTypeId))

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 24,
      }}
      onClick={props.onClose}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: 'var(--bg-widget)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Add widget</h2>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 18,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Built-in widgets (Phase 0 registry). Layout is stored under your app user data directory.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WIDGET_DEFINITIONS.map((w) => {
            const already = used.has(w.typeId)
            return (
              <li
                key={w.typeId}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  opacity: already ? 0.45 : 1,
                }}
              >
                <div style={{ fontWeight: 600 }}>{w.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{w.description}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {w.typeId} · minCols {w.minCols} · {w.ipcHints.length ? w.ipcHints.join(', ') : 'no IPC'}
                </div>
                <button
                  type="button"
                  disabled={already || props.layout.placements.length >= 24}
                  onClick={() => add(w.typeId)}
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 4,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-input)',
                    color: already ? 'var(--text-muted)' : 'var(--accent)',
                    borderRadius: 4,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: already || props.layout.placements.length >= 24 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {already ? 'Already on dashboard' : 'Add to dashboard'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
