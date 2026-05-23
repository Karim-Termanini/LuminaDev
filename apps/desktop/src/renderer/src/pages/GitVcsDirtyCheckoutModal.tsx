import type { ReactElement } from 'react'
import { useEffect } from 'react'
import './GitVcsDirtyCheckoutModal.css'

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
      className="git-vcs-dirty-modal-overlay"
      role="dialog"
      aria-modal
      aria-labelledby="git-vcs-dirty-checkout-title"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className="git-vcs-dirty-modal elevated-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-vcs-dirty-modal-header-wrap">
          <h2 id="git-vcs-dirty-checkout-title" className="git-vcs-dirty-modal-header">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!busy) onCancel()
            }}
            disabled={busy}
            className="git-vcs-dirty-modal-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="git-vcs-dirty-modal-body">
          <p className="git-vcs-dirty-modal-text">
            Git cannot {creatingNewBranch ? `create and check out` : `check out`}{' '}
            <span className="git-vcs-dirty-modal-branch">
              {targetBranch}
            </span>{' '}
            because local changes would be overwritten. Choose how to proceed.
          </p>

          {files.length > 0 ? (
            <div>
              <div className="git-vcs-dirty-modal-files-label">
                Affected paths ({files.length})
              </div>
              <ul className="git-vcs-dirty-modal-files mono">
                {files.map((f) => (
                  <li key={f} className="git-vcs-dirty-modal-file-item">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="git-vcs-dirty-modal-text mono">
              (Could not parse file list from Git output — stash still includes tracked changes and, if enabled,
              untracked files.)
            </p>
          )}

          <label className="git-vcs-dirty-modal-checkbox-label">
            <input
              type="checkbox"
              checked={includeUntracked}
              disabled={busy}
              onChange={(e) => onIncludeUntrackedChange(e.target.checked)}
            />
            Include untracked files in stash (<span className="mono">git stash push -u</span>)
          </label>

          <p className="git-vcs-dirty-modal-help-text mono">
            After switching, restore your shelved work with <span>git stash pop</span>{' '}
            or <span>git stash apply</span> in a terminal.
          </p>
        </div>

        <div className="git-vcs-dirty-modal-footer">
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
