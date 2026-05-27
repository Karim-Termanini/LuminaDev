import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('git')
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

  const title = creatingNewBranch ? t('dirtyCheckout.createBlocked') : t('dirtyCheckout.switchBlocked')

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
            aria-label={t('dirtyCheckout.closeAriaLabel')}
          >
            ×
          </button>
        </div>

        <div className="git-vcs-dirty-modal-body">
          <p className="git-vcs-dirty-modal-text">
            {t('dirtyCheckout.body', { action: creatingNewBranch ? t('dirtyCheckout.createAndCheckout') : t('dirtyCheckout.checkout') })}{' '}
            <span className="git-vcs-dirty-modal-branch">
              {targetBranch}
            </span>{' '}
            {t('dirtyCheckout.bodyReason')}
          </p>

          {files.length > 0 ? (
            <div>
              <div className="git-vcs-dirty-modal-files-label">
                {t('dirtyCheckout.affectedPaths', { count: files.length })}
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
              {t('dirtyCheckout.cannotParseFiles')}
            </p>
          )}

          <label className="git-vcs-dirty-modal-checkbox-label">
            <input
              type="checkbox"
              checked={includeUntracked}
              disabled={busy}
              onChange={(e) => onIncludeUntrackedChange(e.target.checked)}
            />
            {t('dirtyCheckout.includeUntracked.before')}<span className="mono">git stash push -u</span>{t('dirtyCheckout.includeUntracked.after')}
          </label>

          <p className="git-vcs-dirty-modal-help-text mono">
            {t('dirtyCheckout.helpText.before')}<span>git stash pop</span>{' '}
            {t('dirtyCheckout.helpText.or')}<span>git stash apply</span>{t('dirtyCheckout.helpText.after')}
          </p>
        </div>

        <div className="git-vcs-dirty-modal-footer">
          <button type="button" className="hp-btn" disabled={busy} onClick={() => onCancel()}>
            {t('dirtyCheckout.cancel')}
          </button>
          <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void onStashAndSwitch()}>
            {t('dirtyCheckout.stashAndSwitch')}
          </button>
        </div>
      </div>
    </div>
  )
}
