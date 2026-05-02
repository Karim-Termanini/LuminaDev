import type { ReactElement } from 'react'
import { useEffect } from 'react'

export type GitVcsDirtyCheckoutModalProps = {
  open: boolean
  targetBranch: string
  creatingNewBranch: boolean
  files: string[]
  includeUntracked: boolean
  onIncludeUntrackedChange: (v: boolean) => void
  busy: boolean
  onCancel: () => void
  onStashAndSwitch: () => void
}

export function GitVcsDirtyCheckoutModal(props: GitVcsDirtyCheckoutModalProps): ReactElement | null {
  const {
    open,
    targetBranch,
    creatingNewBranch,
    files,
    includeUntracked,
    onIncludeUntrackedChange,
    busy,
    onCancel,
    onStashAndSwitch,
  } = props

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!busy) onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const title = creatingNewBranch ? 'Create branch blocked' : 'Switch branch blocked'

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="git-vcs-dirty-checkout-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        padding: 24,
      }}
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          maxHeight: 'min(88vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-widget)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2 id="git-vcs-dirty-checkout-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!busy) onCancel()
            }}
            disabled={busy}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--text-muted)',
              cursor: busy ? 'default' : 'pointer',
              fontSize: 22,
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.55 }}>
            Git cannot {creatingNewBranch ? `create and check out` : `check out`}{' '}
            <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {targetBranch}
            </span>{' '}
            because local changes would be overwritten. Choose how to proceed.
          </p>

          {files.length > 0 ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>
                Affected paths ({files.length})
              </div>
              <ul
                className="mono"
                style={{
                  margin: 0,
                  padding: '10px 12px',
                  maxHeight: 220,
                  overflow: 'auto',
                  listStyle: 'none',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {files.map((f) => (
                  <li key={f} style={{ padding: '3px 0', wordBreak: 'break-all' }}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mono" style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              (Could not parse file list from Git output — stash still includes tracked changes and, if enabled,
              untracked files.)
            </p>
          )}

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: busy ? 'default' : 'pointer',
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            <input
              type="checkbox"
              checked={includeUntracked}
              disabled={busy}
              onChange={(e) => onIncludeUntrackedChange(e.target.checked)}
            />
            Include untracked files in stash (<span className="mono">git stash push -u</span>)
          </label>

          <p className="mono" style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            After switching, restore your shelved work with <span style={{ color: 'var(--text)' }}>git stash pop</span>{' '}
            or <span style={{ color: 'var(--text)' }}>git stash apply</span> in a terminal.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          <button type="button" className="hp-btn" disabled={busy} onClick={() => onCancel()}>
            Cancel
          </button>
          <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void onStashAndSwitch()}>
            Stash all and switch
          </button>
        </div>
      </div>
    </div>
  )
}
